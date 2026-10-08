/**
 * Phí thuê bao chủ sân (mặc định 50.000đ / 30 ngày), thanh toán VietQR, tự kích hoạt qua webhook SePay.
 *
 * Collection "subscriptions":
 *   { subscription_id: "SUB001", owner_id: "U007", amount: 50000,
 *     period_start: "2026-10-01", period_end: "2026-10-30",
 *     status: "pending" | "paid" | "cancelled",
 *     transfer_note: "SanZone SUB001",
 *     created_at, paid_at, bank_tx_id }
 *
 * Collection "bank_transactions": log mọi giao dịch tiền vào (chống xử lý trùng + tra soát)
 *   { tx_id, amount, content, subscription_id, result, received_at, raw }
 *
 * .env (backend):
 *   BANK_ID=BIDV
 *   BANK_ACCOUNT_NO=<so-VA>             # số in lên mã QR (BIDV: dùng số VA trong SePay)
 *   BANK_ACCOUNT_NAME=NGUYEN VAN A
 *   SEPAY_ACCEPT_ACCOUNTS=<so-VA>,<so-TK-chinh>   # (tuỳ chọn) các số TK webhook được chấp nhận
 *   SUBSCRIPTION_FEE=50000
 *   SUBSCRIPTION_DAYS=30
 *   SEPAY_API_KEY=xxxxxxxx              # tự đặt, khai báo y hệt trong cấu hình webhook SePay
 */
const mongoose = require("mongoose");

const col = (name) => mongoose.connection.collection(name);
const subs = () => col("subscriptions");
const txs = () => col("bank_transactions");

const FEE = () => Number(process.env.SUBSCRIPTION_FEE) || 50000;
const DAYS = () => Number(process.env.SUBSCRIPTION_DAYS) || 30;
const RENEW_BEFORE_DAYS = 5;

const today = () => new Date().toLocaleDateString("sv-SE");
const addDays = (s, n) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString("sv-SE");
};
const daysBetween = (a, b) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
};

function bankInfo() {
  return {
    bank_id: process.env.BANK_ID || "",
    account_no: process.env.BANK_ACCOUNT_NO || "",
    account_name: process.env.BANK_ACCOUNT_NAME || "",
  };
}

// Các số tài khoản mà webhook được chấp nhận.
// BIDV qua SePay: accountNumber = TK chính, subAccount = số VA -> phải chấp nhận cả hai.
function acceptedAccounts() {
  const list = [process.env.BANK_ACCOUNT_NO, ...String(process.env.SEPAY_ACCEPT_ACCOUNTS || "").split(",")]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return [...new Set(list)];
}

function qrUrl(sub) {
  const b = bankInfo();
  if (!b.bank_id || !b.account_no) return null;
  const q = new URLSearchParams({ amount: String(sub.amount), addInfo: sub.transfer_note, accountName: b.account_name });
  return `https://img.vietqr.io/image/${encodeURIComponent(b.bank_id)}-${encodeURIComponent(b.account_no)}-compact2.png?${q}`;
}

async function nextSubId() {
  const docs = await subs().find({ subscription_id: /^SUB\d+$/ }).project({ subscription_id: 1 }).toArray();
  const max = docs.reduce((m, d) => Math.max(m, Number(d.subscription_id.slice(3)) || 0), 0);
  await col("counters").updateOne({ _id: "SUB" }, { $max: { seq: max } }, { upsert: true });
  const r = await col("counters").findOneAndUpdate({ _id: "SUB" }, { $inc: { seq: 1 } }, { returnDocument: "after" });
  const seq = (r && r.value !== undefined ? r.value : r).seq;
  return `SUB${String(seq).padStart(3, "0")}`;
}

const publicSub = (s) => (s ? { ...s, _id: undefined, qr_url: s.status === "pending" ? qrUrl(s) : null } : null);

async function getOwnerSubscription(ownerId) {
  const t = today();
  const all = await subs().find({ owner_id: ownerId, status: { $ne: "cancelled" } }).sort({ period_start: 1 }).toArray();
  const paid = all.filter((s) => s.status === "paid");
  const current = paid.find((s) => s.period_start <= t && t <= s.period_end) || null;
  const lastPaidEnd = paid.reduce((m, s) => (s.period_end > m ? s.period_end : m), "");
  let pending = all.find((s) => s.status === "pending") || null;

  const needInvoice = !current || daysBetween(t, current.period_end) < RENEW_BEFORE_DAYS;
  if (!pending && needInvoice) {
    const start = lastPaidEnd && lastPaidEnd >= t ? addDays(lastPaidEnd, 1) : t;
    const subscription_id = await nextSubId();
    pending = {
      subscription_id,
      owner_id: ownerId,
      amount: FEE(),
      period_start: start,
      period_end: addDays(start, DAYS() - 1),
      status: "pending",
      transfer_note: `SanZone ${subscription_id}`,
      created_at: new Date().toISOString(),
      paid_at: null,
    };
    await subs().insertOne({ ...pending });
  }

  const activeUntil = current ? lastPaidEnd : null;
  return {
    active: Boolean(current),
    active_until: activeUntil,
    days_left: activeUntil ? daysBetween(t, activeUntil) + 1 : 0,
    fee: FEE(),
    period_days: DAYS(),
    bank: bankInfo(),
    pending: publicSub(pending),
    history: paid.sort((a, b) => b.period_start.localeCompare(a.period_start)).map(publicSub),
  };
}

// Kích hoạt 1 hoá đơn. Trả trễ (kỳ đã qua ngày bắt đầu) -> tính lại từ hôm nay.
async function activate(s, txId) {
  const t = today();
  const set = { status: "paid", paid_at: new Date().toISOString(), bank_tx_id: txId };
  if (s.period_start < t) {
    set.period_start = t;
    set.period_end = addDays(t, daysBetween(s.period_start, s.period_end));
  }
  // điều kiện status: "pending" để 2 webhook trùng không kích hoạt 2 lần
  const r = await subs().updateOne({ _id: s._id, status: "pending" }, { $set: set });
  const ok = r.modifiedCount > 0;
  // Đếm lượt dùng mã khuyến mãi khi hoá đơn thật sự được kích hoạt
  if (ok && s.promo_code) await col("promotions").updateOne({ code: s.promo_code }, { $inc: { used_count: 1 } });
  return ok;
}

/**
 * Webhook SePay. Body mẫu:
 *  { id, gateway, transactionDate, accountNumber, subAccount, content, transferType: "in"|"out",
 *    transferAmount, referenceCode, description }
 * Trả về chuỗi result để ghi log.
 */
async function handleSepayWebhook(body) {
  const { id, accountNumber, subAccount, content = "", transferType, transferAmount } = body || {};
  if (transferType !== "in") return "ignored_out";

  // Chỉ nhận tiền vào đúng tài khoản của mình (TK chính hoặc VA)
  const accepted = acceptedAccounts();
  const incoming = [accountNumber, subAccount].map((s) => String(s || "").trim()).filter(Boolean);
  if (accepted.length && incoming.length && !incoming.some((a) => accepted.includes(a))) {
    console.warn("[sepay] ignored_account", { accountNumber, subAccount, accepted });
    return "ignored_account";
  }

  const txId = String(id);
  // Chống trùng: SePay có thể gửi lại cùng giao dịch
  const log = { tx_id: txId, amount: Number(transferAmount) || 0, content, received_at: new Date().toISOString(), raw: body };
  const ins = await txs().updateOne({ tx_id: txId }, { $setOnInsert: { ...log, result: "processing" } }, { upsert: true });
  if (!ins.upsertedCount) return "duplicate";

  const finish = async (result, subscription_id = null) => {
    await txs().updateOne({ tx_id: txId }, { $set: { result, subscription_id } });
    return result;
  };

  // Ngân hàng hay bỏ dấu cách / đổi hoa thường: "SANZONESUB001", "sanzone sub001"
  const m = /SANZONE\s*SUB(\d+)/i.exec(content);
  if (!m) return finish("no_code");
  const subscriptionId = `SUB${m[1]}`;

  const s = await subs().findOne({ subscription_id: subscriptionId });
  if (!s) return finish("sub_not_found", subscriptionId);
  if (s.status !== "pending") return finish("already_" + s.status, subscriptionId);
  if (log.amount < s.amount) return finish("underpaid", subscriptionId);

  const ok = await activate(s, txId);
  return finish(ok ? "activated" : "race_skipped", subscriptionId);
}

/* ---------- Mã khuyến mãi cho phí gói ---------- */
const promos = () => col("promotions");
const PROMO_SOURCE = (code) => `PROMO:${code}`;

// Kiểm tra mã + tính tiền giảm. -> { promo, discount } | { error }
async function checkPromo(ownerId, rawCode, baseAmount) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { error: "Vui lòng nhập mã khuyến mãi." };
  const p = await promos().findOne({ code });
  const t = today();
  if (!p || !p.is_active) return { error: "Mã khuyến mãi không tồn tại hoặc đã tắt." };
  if (!["subscription", "all", undefined].includes(p.apply_to)) return { error: "Mã này không áp dụng cho phí gói dịch vụ." };
  if (p.start_date && t < p.start_date) return { error: "Mã khuyến mãi chưa đến ngày áp dụng." };
  if (p.end_date && t > p.end_date) return { error: "Mã khuyến mãi đã hết hạn." };
  if (p.usage_limit && (p.used_count || 0) >= p.usage_limit) return { error: "Mã khuyến mãi đã hết lượt dùng." };
  if (p.min_order && baseAmount < p.min_order) return { error: "Hoá đơn chưa đủ giá trị tối thiểu để dùng mã này." };

  const paidCount = await subs().countDocuments({ owner_id: ownerId, status: "paid" });
  if (p.new_owner_only && paidCount > 0) return { error: "Mã này chỉ dành cho tài khoản chủ sân mới." };
  if (await subs().findOne({ owner_id: ownerId, status: "paid", promo_code: code })) {
    return { error: "Bạn đã dùng mã này rồi." };
  }

  let discount = p.discount_type === "percent" ? Math.round((baseAmount * p.discount_value) / 100) : Number(p.discount_value) || 0;
  if (p.discount_type === "percent" && p.max_discount) discount = Math.min(discount, p.max_discount);
  discount = Math.min(discount, baseAmount);
  return { promo: p, discount };
}

/**
 * Áp mã vào hoá đơn đang chờ. Giảm 100% -> kích hoạt gói luôn, không cần chuyển khoản.
 * -> { ok, activated, amount, discount } | { error }
 */
async function applyPromo(ownerId, subscriptionId, rawCode) {
  const s = await subs().findOne({ owner_id: ownerId, subscription_id: subscriptionId, status: "pending" });
  if (!s) return { error: "Không tìm thấy hoá đơn đang chờ thanh toán." };
  const base = s.base_amount ?? s.amount;
  const r = await checkPromo(ownerId, rawCode, base);
  if (r.error) return r;

  const amount = Math.max(0, base - r.discount);
  await subs().updateOne(
    { _id: s._id, status: "pending" },
    { $set: { base_amount: base, amount, discount: r.discount, promo_code: r.promo.code } }
  );

  if (amount === 0) {
    const ok = await activate({ ...s, base_amount: base, amount, promo_code: r.promo.code }, PROMO_SOURCE(r.promo.code));
    return { ok, activated: ok, amount, discount: r.discount };
  }
  return { ok: true, activated: false, amount, discount: r.discount };
}

/**
 * Danh sách voucher hiện cho chủ sân chọn (giống ví voucher Shopee).
 * Chỉ lấy mã đang chạy, áp dụng cho phí gói và được admin bật "hiện trong danh sách".
 * -> [{ code, description, discount_type, discount_value, max_discount, min_order, end_date,
 *       remaining, discount, final_amount, usable, reason }]
 */
async function listVouchers(ownerId, subscriptionId) {
  const s = await subs().findOne({ owner_id: ownerId, subscription_id: subscriptionId, status: "pending" });
  const base = s ? s.base_amount ?? s.amount : FEE();
  const t = today();
  const list = await promos()
    .find({
      is_active: true,
      is_public: { $ne: false },
      apply_to: { $in: ["subscription", "all", null] },
      start_date: { $lte: t },
      end_date: { $gte: t },
    })
    .project({ _id: 0 })
    .toArray();

  const out = [];
  for (const p of list) {
    const remaining = p.usage_limit ? Math.max(0, p.usage_limit - (p.used_count || 0)) : null; // null = không giới hạn
    const r = await checkPromo(ownerId, p.code, base);
    out.push({
      code: p.code,
      description: p.description || "",
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      max_discount: p.max_discount ?? null,
      min_order: p.min_order || 0,
      end_date: p.end_date,
      new_owner_only: Boolean(p.new_owner_only),
      remaining,
      usage_limit: p.usage_limit ?? null,
      discount: r.discount ?? 0,
      final_amount: r.error ? base : Math.max(0, base - r.discount),
      usable: !r.error,
      reason: r.error || "",
    });
  }
  // Dùng được + giảm nhiều nhất lên đầu, hết lượt / không đủ điều kiện xuống cuối
  return out.sort((a, b) => Number(b.usable) - Number(a.usable) || b.discount - a.discount);
}

// Bỏ mã -> trả về giá gốc
async function removePromo(ownerId, subscriptionId) {
  const s = await subs().findOne({ owner_id: ownerId, subscription_id: subscriptionId, status: "pending" });
  if (!s || !s.promo_code) return false;
  await subs().updateOne(
    { _id: s._id, status: "pending" },
    { $set: { amount: s.base_amount ?? s.amount }, $unset: { promo_code: "", discount: "", base_amount: "" } }
  );
  return true;
}

module.exports = { getOwnerSubscription, handleSepayWebhook, qrUrl, today, applyPromo, removePromo, listVouchers };
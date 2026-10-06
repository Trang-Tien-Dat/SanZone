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
  return r.modifiedCount > 0;
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

module.exports = { getOwnerSubscription, handleSepayWebhook, qrUrl, today };
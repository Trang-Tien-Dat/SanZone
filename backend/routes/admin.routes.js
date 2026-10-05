/**
 * API ADMIN — server.js:  app.use("/api/admin", require("./routes/admin.routes"));
 *
 *   GET    /stats                         Dashboard: 4 con số tổng + booking 14 ngày + lượt đặt mới nhất
 *   GET    /users?role=2|3&q=&status=&page=   Tài khoản chủ sân / khách hàng
 *   PATCH  /users/:userID/status          { status: "active" | "locked" }
 *   GET    /revenue?from=&to=&group=day|month   Tiền admin thu (phí thuê bao chủ sân, collection "subscriptions")
 *   GET    /promotions                    Danh sách mã khuyến mãi
 *   POST   /promotions                    Thêm
 *   PUT    /promotions/:promo_id          Sửa
 *   DELETE /promotions/:promo_id          Xoá
 *   PATCH  /promotions/:promo_id/active   { is_active: true | false }
 *   GET    /bookings?from=&to=&status=&payment_status=&q=&page=
 *   PATCH  /bookings/:booking_id/status   { status }
 *   PATCH  /bookings/:booking_id/payment  { payment_status }
 *   GET    /subscriptions?status=reported|pending|paid   Phí thuê bao chủ sân
 *   PATCH  /subscriptions/:id/confirm     Xác nhận đã nhận tiền
 *   PATCH  /subscriptions/:id/reject      Chưa thấy tiền -> chủ sân báo lại
 */
const router = require("express").Router();
const mongoose = require("mongoose");
const { verifyToken } = require("../middlewares/authMiddleware");
const User = require("../models/User");
const Booking = require("../models/Booking");
const BookingDetail = require("../models/BookingDetail");
const subscription = require("../services/subscriptionService");

const col = (name) => mongoose.connection.collection(name);
const users = () => User.collection; // đúng collection của model User
const bookingsCol = () => Booking.collection;
const detailsCol = () => BookingDetail.collection;

const ROLE = { ADMIN: 1, OWNER: 2, CUSTOMER: 3 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];
const REVENUE_STATUSES = ["confirmed", "completed"];

const today = () => new Date().toLocaleDateString("sv-SE");
const addDays = (s, n) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString("sv-SE");
};
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pageOf = (q) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 15));
  return { page, limit, skip: (page - 1) * limit };
};
const fail = (res, err) => {
  console.error("[admin]", err);
  res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
};

// ---------- Chỉ admin ----------
router.use(verifyToken, (req, res, next) => {
  const auth = req.auth ?? req.user;
  if (Number(auth?.role_id) !== ROLE.ADMIN) return res.status(403).json({ message: "Chỉ admin mới được truy cập." });
  next();
});

// Mã tiếp theo, không dùng lại mã cũ (giống auth.js)
async function nextCode(collectionName, field, prefix) {
  const docs = await col(collectionName)
    .find({ [field]: new RegExp(`^${prefix}\\d+$`) })
    .project({ [field]: 1 })
    .toArray();
  const max = docs.reduce((m, d) => Math.max(m, Number(d[field].slice(prefix.length)) || 0), 0);
  await col("counters").updateOne({ _id: prefix }, { $max: { seq: max } }, { upsert: true });
  const r = await col("counters").findOneAndUpdate({ _id: prefix }, { $inc: { seq: 1 } }, { returnDocument: "after" });
  const doc = r && r.value !== undefined ? r.value : r;
  return `${prefix}${String(doc.seq).padStart(3, "0")}`;
}

// Ghép booking + booking_details + sân + cụm sân + khách -> 1 dòng / 1 booking
async function expandBookings(bookings) {
  if (!bookings.length) return [];
  const ids = bookings.map((b) => b.booking_id);
  const details = await detailsCol().find({ booking_id: { $in: ids } }).toArray();
  const courts = await col("courts")
    .find({ court_id: { $in: [...new Set(details.map((d) => d.court_id))] } })
    .toArray();
  const venues = await col("venues")
    .find({ venue_id: { $in: [...new Set(courts.map((c) => c.venue_id))] } })
    .toArray();
  const people = await users()
    .find({ userID: { $in: [...new Set([...bookings.map((b) => b.user_id), ...venues.map((v) => v.owner_id)])] } })
    .project({ userID: 1, fullName: 1, phone: 1, email: 1 })
    .toArray();
  const courtById = Object.fromEntries(courts.map((c) => [c.court_id, c]));
  const venueById = Object.fromEntries(venues.map((v) => [v.venue_id, v]));
  const userById = Object.fromEntries(people.map((u) => [u.userID, u]));

  return bookings.map((b) => {
    const ds = details.filter((d) => d.booking_id === b.booking_id);
    const d = ds[0] || {};
    const court = courtById[d.court_id] || {};
    const venue = venueById[court.venue_id] || {};
    const customer = userById[b.user_id];
    const byOwner = b.source === "owner";
    return {
      booking_id: b.booking_id,
      created_at: b.created_at,
      booking_date: d.booking_date ?? b.booking_date,
      start_time: d.start_time,
      end_time: d.end_time,
      booking_type: d.booking_type || "full",
      court_id: d.court_id,
      court_name: court.court_name ?? d.court_id,
      venue_name: venue.venue_name ?? "",
      owner_id: venue.owner_id,
      owner_name: userById[venue.owner_id]?.fullName ?? venue.owner_id ?? "",
      customer_name: byOwner ? b.customer_name || "Khách vãng lai" : customer?.fullName ?? b.user_id,
      customer_phone: byOwner ? b.customer_phone || "" : customer?.phone ?? "",
      source: b.source ?? "online",
      amount: ds.reduce((s, x) => s + Number(x.price || 0), 0),
      discount: Number(b.discount || 0),
      promo_code: b.promo_code ?? null,
      status: b.status ?? "pending",
      payment_status: b.payment_status ?? "unpaid",
      payment_method: b.payment_method ?? null,
      paid_at: b.paid_at ?? null,
    };
  });
}

/* =============================== DASHBOARD =============================== */
router.get("/stats", async (req, res) => {
  try {
    const [revenueAgg, bookingCount, customers, owners, venues, courts] = await Promise.all([
      col("subscriptions").aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, sum: { $sum: "$amount" } } }]).toArray(),
      bookingsCol().countDocuments({ status: { $ne: "cancelled" } }),
      users().countDocuments({ role_id: ROLE.CUSTOMER }),
      users().countDocuments({ role_id: ROLE.OWNER }),
      col("venues").countDocuments(),
      col("courts").countDocuments(),
    ]);

    // Lượt đặt 14 ngày gần nhất (theo ngày đá)
    const from = addDays(today(), -13);
    const recentDetails = await detailsCol().find({ booking_date: { $gte: from, $lte: today() } }).toArray();
    const cancelled = new Set(
      (
        await bookingsCol()
          .find({ booking_id: { $in: recentDetails.map((d) => d.booking_id) }, status: "cancelled" })
          .project({ booking_id: 1 })
          .toArray()
      ).map((b) => b.booking_id)
    );
    const perDay = {};
    for (const d of recentDetails) {
      if (cancelled.has(d.booking_id)) continue;
      perDay[d.booking_date] = (perDay[d.booking_date] || 0) + 1;
    }
    const series = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(from, i);
      return { date: day, count: perDay[day] || 0 };
    });

    const latest = await bookingsCol().find({}).sort({ created_at: -1 }).limit(6).toArray();

    res.json({
      totals: {
        revenue: revenueAgg[0]?.sum ?? 0,
        bookings: bookingCount,
        customers,
        owners,
        venues,
        courts,
      },
      series,
      latest: await expandBookings(latest),
    });
  } catch (err) {
    fail(res, err);
  }
});

/* =============================== TÀI KHOẢN =============================== */
router.get("/users", async (req, res) => {
  try {
    const role = Number(req.query.role);
    if (![ROLE.OWNER, ROLE.CUSTOMER].includes(role)) return res.status(400).json({ message: "role phải là 2 hoặc 3" });
    const { page, limit, skip } = pageOf(req.query);

    const match = { role_id: role };
    if (req.query.status === "locked") match.status = "locked";
    if (req.query.status === "active") match.status = { $ne: "locked" };
    const q = String(req.query.q || "").trim();
    if (q) {
      const re = new RegExp(escapeRe(q), "i");
      match.$or = [{ fullName: re }, { email: re }, { phone: re }, { userID: re }];
    }

    const [total, list] = await Promise.all([
      users().countDocuments(match),
      users()
        .find(match)
        .project({ password: 0 })
        .sort({ userID: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    ]);
    const ids = list.map((u) => u.userID);

    let extra = {};
    if (role === ROLE.OWNER) {
      const vs = await col("venues").find({ owner_id: { $in: ids } }).toArray();
      const cs = await col("courts").find({ venue_id: { $in: vs.map((v) => v.venue_id) } }).project({ venue_id: 1 }).toArray();
      for (const id of ids) {
        const mine = vs.filter((v) => v.owner_id === id);
        const vIds = new Set(mine.map((v) => v.venue_id));
        extra[id] = {
          venues: mine.map((v) => v.venue_name),
          address: mine[0]?.address ?? "",
          court_count: cs.filter((c) => vIds.has(c.venue_id)).length,
        };
      }
    } else {
      const counts = await bookingsCol()
        .aggregate([{ $match: { user_id: { $in: ids } } }, { $group: { _id: "$user_id", n: { $sum: 1 } } }])
        .toArray();
      extra = Object.fromEntries(counts.map((c) => [c._id, { booking_count: c.n }]));
    }

    res.json({
      total,
      page,
      items: list.map((u) => ({
        userID: u.userID,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        role_id: u.role_id,
        status: u.status === "locked" ? "locked" : "active",
        created_at: u.createdAt ?? u.created_at ?? (u._id?.getTimestamp ? u._id.getTimestamp() : null),
        booking_count: 0,
        court_count: 0,
        ...extra[u.userID],
      })),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.patch("/users/:userID/status", async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["active", "locked"].includes(status)) return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    const user = await users().findOne({ userID: req.params.userID });
    if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    if (Number(user.role_id) === ROLE.ADMIN) return res.status(400).json({ message: "Không thể khoá tài khoản admin" });
    await users().updateOne({ _id: user._id }, { $set: { status } });
    res.json({ userID: user.userID, status });
  } catch (err) {
    fail(res, err);
  }
});

/* =============================== DOANH THU (tiền admin thu) ===============================
 * Collection "subscriptions" (xem services/subscriptionService.js), tính theo ngày admin xác nhận (paid_at)
 */
router.get("/revenue", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) return res.status(400).json({ message: "from/to dạng YYYY-MM-DD" });
    const group = req.query.group === "month" ? "month" : "day";

    const rows = await col("subscriptions").find({ status: "paid" }).toArray();
    const inRange = rows.filter((r) => {
      const day = String(r.paid_at || "").slice(0, 10);
      return day >= from && day <= to;
    });

    const byKey = {};
    const byOwner = {};
    for (const r of inRange) {
      const key = String(r.paid_at).slice(0, group === "month" ? 7 : 10);
      byKey[key] = byKey[key] || { key, amount: 0, count: 0 };
      byKey[key].amount += Number(r.amount || 0);
      byKey[key].count++;
      byOwner[r.owner_id] = byOwner[r.owner_id] || { owner_id: r.owner_id, amount: 0, count: 0 };
      byOwner[r.owner_id].amount += Number(r.amount || 0);
      byOwner[r.owner_id].count++;
    }
    const ownerIds = Object.keys(byOwner);
    const owners = ownerIds.length
      ? await users().find({ userID: { $in: ownerIds } }).project({ userID: 1, fullName: 1, email: 1 }).toArray()
      : [];
    const nameById = Object.fromEntries(owners.map((o) => [o.userID, o]));

    res.json({
      group,
      total: inRange.reduce((s, r) => s + Number(r.amount || 0), 0),
      count: inRange.length,
      pending: await col("subscriptions").countDocuments({ status: "pending" }),
      series: Object.values(byKey).sort((a, b) => a.key.localeCompare(b.key)),
      byOwner: Object.values(byOwner)
        .map((o) => ({ ...o, fullName: nameById[o.owner_id]?.fullName ?? o.owner_id, email: nameById[o.owner_id]?.email ?? "" }))
        .sort((a, b) => b.amount - a.amount),
    });
  } catch (err) {
    fail(res, err);
  }
});

/* =============================== KHUYẾN MÃI ===============================
 * Collection "promotions":
 *   { promo_id, code, description, discount_type: "percent"|"fixed", discount_value, max_discount,
 *     min_order, start_date, end_date, usage_limit, used_count, is_active, created_at }
 */
function parsePromo(body) {
  const code = String(body.code || "").trim().toUpperCase();
  const discount_type = body.discount_type === "fixed" ? "fixed" : "percent";
  const discount_value = Number(body.discount_value);
  const num = (v) => (v === "" || v == null ? null : Number(v));
  const p = {
    code,
    description: String(body.description || "").trim().slice(0, 200),
    discount_type,
    discount_value,
    max_discount: discount_type === "percent" ? num(body.max_discount) : null,
    min_order: num(body.min_order) ?? 0,
    start_date: String(body.start_date || ""),
    end_date: String(body.end_date || ""),
    usage_limit: num(body.usage_limit),
    is_active: body.is_active !== false,
  };
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return { error: "Mã gồm 3–20 ký tự: chữ, số, - hoặc _." };
  if (!Number.isFinite(discount_value) || discount_value <= 0) return { error: "Giá trị giảm phải lớn hơn 0." };
  if (discount_type === "percent" && discount_value > 100) return { error: "Giảm theo % tối đa 100%." };
  if (!DATE_RE.test(p.start_date) || !DATE_RE.test(p.end_date)) return { error: "Chọn ngày bắt đầu và kết thúc." };
  if (p.start_date > p.end_date) return { error: "Ngày kết thúc phải sau ngày bắt đầu." };
  for (const k of ["max_discount", "min_order", "usage_limit"]) {
    if (p[k] != null && (!Number.isFinite(p[k]) || p[k] < 0)) return { error: "Các giá trị số không được âm." };
  }
  return { promo: p };
}

router.get("/promotions", async (req, res) => {
  try {
    const list = await col("promotions").find({}).project({ _id: 0 }).sort({ created_at: -1 }).toArray();
    res.json(list.map((p) => ({ used_count: 0, ...p })));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/promotions", async (req, res) => {
  try {
    const { promo, error } = parsePromo(req.body || {});
    if (error) return res.status(400).json({ message: error });
    if (await col("promotions").findOne({ code: promo.code })) return res.status(409).json({ message: "Mã này đã tồn tại." });
    const doc = { promo_id: await nextCode("promotions", "promo_id", "KM"), ...promo, used_count: 0, created_at: new Date().toISOString() };
    await col("promotions").insertOne(doc);
    delete doc._id;
    res.status(201).json(doc);
  } catch (err) {
    fail(res, err);
  }
});

router.put("/promotions/:promo_id", async (req, res) => {
  try {
    const { promo, error } = parsePromo(req.body || {});
    if (error) return res.status(400).json({ message: error });
    const dup = await col("promotions").findOne({ code: promo.code, promo_id: { $ne: req.params.promo_id } });
    if (dup) return res.status(409).json({ message: "Mã này đã tồn tại." });
    const r = await col("promotions").findOneAndUpdate(
      { promo_id: req.params.promo_id },
      { $set: promo },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    const doc = r && r.value !== undefined ? r.value : r;
    if (!doc) return res.status(404).json({ message: "Không tìm thấy khuyến mãi" });
    res.json(doc);
  } catch (err) {
    fail(res, err);
  }
});

router.delete("/promotions/:promo_id", async (req, res) => {
  try {
    const r = await col("promotions").deleteOne({ promo_id: req.params.promo_id });
    if (!r.deletedCount) return res.status(404).json({ message: "Không tìm thấy khuyến mãi" });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.patch("/promotions/:promo_id/active", async (req, res) => {
  try {
    const is_active = Boolean(req.body?.is_active);
    const r = await col("promotions").updateOne({ promo_id: req.params.promo_id }, { $set: { is_active } });
    if (!r.matchedCount) return res.status(404).json({ message: "Không tìm thấy khuyến mãi" });
    res.json({ promo_id: req.params.promo_id, is_active });
  } catch (err) {
    fail(res, err);
  }
});

/* =============================== BOOKING =============================== */
router.get("/bookings", async (req, res) => {
  try {
    const { from, to, status, payment_status } = req.query;
    const { page, limit, skip } = pageOf(req.query);

    // Lọc theo ngày đá (booking_details) -> danh sách booking_id
    const detailMatch = {};
    if (DATE_RE.test(from || "") && DATE_RE.test(to || "")) detailMatch.booking_date = { $gte: from, $lte: to };
    const detailIds = Object.keys(detailMatch).length
      ? await detailsCol().distinct("booking_id", detailMatch)
      : null;

    const match = {};
    if (detailIds) match.booking_id = { $in: detailIds };
    if (BOOKING_STATUSES.includes(status)) match.status = status;
    if (payment_status === "unpaid") match.payment_status = { $nin: ["paid", "refunded"] };
    else if (PAYMENT_STATUSES.includes(payment_status)) match.payment_status = payment_status;

    // Tìm theo mã đặt, tên / SĐT khách
    const q = String(req.query.q || "").trim();
    if (q) {
      const re = new RegExp(escapeRe(q), "i");
      const people = await users().find({ $or: [{ fullName: re }, { phone: re }, { email: re }] }).project({ userID: 1 }).toArray();
      match.$or = [
        { booking_id: re },
        { customer_name: re },
        { customer_phone: re },
        { user_id: { $in: people.map((p) => p.userID) } },
      ];
    }

    const [total, list, sumAgg] = await Promise.all([
      bookingsCol().countDocuments(match),
      bookingsCol().find(match).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      bookingsCol().distinct("booking_id", { ...match, status: { $in: REVENUE_STATUSES } }),
    ]);
    const sumDetails = sumAgg.length
      ? await detailsCol()
          .aggregate([{ $match: { booking_id: { $in: sumAgg } } }, { $group: { _id: null, sum: { $sum: "$price" } } }])
          .toArray()
      : [];

    res.json({ total, page, value: sumDetails[0]?.sum ?? 0, items: await expandBookings(list) });
  } catch (err) {
    fail(res, err);
  }
});

router.patch("/bookings/:booking_id/status", async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!BOOKING_STATUSES.includes(status)) return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    const r = await bookingsCol().updateOne({ booking_id: req.params.booking_id }, { $set: { status } });
    if (!r.matchedCount) return res.status(404).json({ message: "Không tìm thấy lượt đặt" });
    res.json({ booking_id: req.params.booking_id, status });
  } catch (err) {
    fail(res, err);
  }
});

router.patch("/bookings/:booking_id/payment", async (req, res) => {
  try {
    const { payment_status } = req.body || {};
    if (!PAYMENT_STATUSES.includes(payment_status)) return res.status(400).json({ message: "Trạng thái thanh toán không hợp lệ" });
    const set = { payment_status };
    if (payment_status === "paid") set.paid_at = new Date().toISOString();
    const r = await bookingsCol().updateOne({ booking_id: req.params.booking_id }, { $set: set });
    if (!r.matchedCount) return res.status(404).json({ message: "Không tìm thấy lượt đặt" });
    res.json({ booking_id: req.params.booking_id, ...set });
  } catch (err) {
    fail(res, err);
  }
});

/* =============================== PHÍ THUÊ BAO =============================== */
router.get("/subscriptions", async (req, res) => {
  try {
    const list = await subscription.listSubscriptions({ status: req.query.status });
    const ids = [...new Set(list.map((s) => s.owner_id))];
    const owners = ids.length
      ? await users().find({ userID: { $in: ids } }).project({ userID: 1, fullName: 1, email: 1, phone: 1 }).toArray()
      : [];
    const venues = ids.length ? await col("venues").find({ owner_id: { $in: ids } }).project({ owner_id: 1, venue_name: 1 }).toArray() : [];
    const byId = Object.fromEntries(owners.map((o) => [o.userID, o]));
    res.json(
      list.map((s) => ({
        ...s,
        owner_name: byId[s.owner_id]?.fullName ?? s.owner_id,
        owner_email: byId[s.owner_id]?.email ?? "",
        owner_phone: byId[s.owner_id]?.phone ?? "",
        venue_name: venues.filter((v) => v.owner_id === s.owner_id).map((v) => v.venue_name).join(", "),
      }))
    );
  } catch (err) {
    fail(res, err);
  }
});

router.patch("/subscriptions/:id/confirm", async (req, res) => {
  try {
    const done = await subscription.confirmPaid(req.params.id, (req.auth ?? req.user).userID);
    if (!done) return res.status(404).json({ message: "Không tìm thấy hoá đơn đang chờ" });
    res.json(done);
  } catch (err) {
    fail(res, err);
  }
});

router.patch("/subscriptions/:id/reject", async (req, res) => {
  try {
    if (!(await subscription.rejectReport(req.params.id))) return res.status(404).json({ message: "Không tìm thấy hoá đơn đang chờ" });
    res.json({ subscription_id: req.params.id, reported_at: null });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
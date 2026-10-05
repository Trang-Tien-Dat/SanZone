
const router = require("express").Router();
const mongoose = require("mongoose");
const { verifyToken } = require("../middlewares/authMiddleware");
const { requireRole, ROLES } = require("../middlewares/requireRole");
const User = require("../models/User");
const Booking = require("../models/Booking");
const BookingDetail = require("../models/BookingDetail");
const subscription = require("../services/subscriptionService");
const { syncRevenueForBooking } = require("../services/ownerRevenueService");
const col = (name) => mongoose.connection.collection(name);
const getOwnerId = (req) => (req.auth ?? req.user).userID; // "U002"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["pending", "confirmed", "completed", "cancelled"];
const toMin = (t) => {
  const [h, m] = String(t || "0:0").split(":").map(Number);
  return h * 60 + m;
};

const fail = (res, err) => {
  console.error("[owner]", err);
  res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
};

router.use(verifyToken, requireRole(ROLES.OWNER));

// Sân của chủ sân: venues.owner_id = userID  ->  courts.venue_id
async function findMyCourts(ownerId) {
  const venues = await col("venues")
    .find({ owner_id: ownerId })
    .project({ _id: 0, venue_id: 1, venue_name: 1, sport_id: 1, address: 1 })
    .toArray();
  if (!venues.length) return [];
  const byId = Object.fromEntries(venues.map((v) => [v.venue_id, v]));
  const courts = await col("courts")
    .find({ venue_id: { $in: venues.map((v) => v.venue_id) } })
    .project({ _id: 0 })
    .sort({ court_id: 1 })
    .toArray();
  return courts.map((c) => ({
    ...c,
    venue_name: byId[c.venue_id]?.venue_name,
    address: byId[c.venue_id]?.address,
    sport_id: c.sport_id ?? byId[c.venue_id]?.sport_id,
  }));
}

/** GET /api/owner/courts */
router.get("/courts", async (req, res) => {
  try {
    res.json(await findMyCourts(getOwnerId(req)));
  } catch (err) {
    fail(res, err);
  }
});

/** GET /api/owner/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&court_id=&status= */
router.get("/bookings", async (req, res) => {
  try {
    const { from, to, court_id, status } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
      return res.status(400).json({ message: "from/to phải có dạng YYYY-MM-DD" });
    }
    const courts = await findMyCourts(getOwnerId(req));
    const courtName = Object.fromEntries(courts.map((c) => [c.court_id, c.court_name]));
    let ids = courts.map((c) => c.court_id);
    if (court_id) ids = ids.filter((id) => id === court_id); // chỉ xem sân của mình
    if (!ids.length) return res.json([]);

    // 1) Giờ đã đặt: booking_details (có court_id, booking_date, start_time, end_time, price)
    const details = await BookingDetail.find({
      court_id: { $in: ids },
      booking_date: { $gte: from, $lte: to },
    }).lean();
    if (!details.length) return res.json([]);

    // 2) Người đặt + trạng thái: bookings
    const bookings = await Booking.find({ booking_id: { $in: [...new Set(details.map((d) => d.booking_id))] } }).lean();
    const bookingById = Object.fromEntries(bookings.map((b) => [b.booking_id, b]));

    // 3) Tên + SĐT khách đặt online: user
    const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))];
    const users = userIds.length
      ? await User.collection.find({ userID: { $in: userIds } }).project({ _id: 0, userID: 1, fullName: 1, phone: 1 }).toArray()
      : [];
    const userById = Object.fromEntries(users.map((u) => [u.userID, u]));

    const rows = details
      .map((d) => {
        const b = bookingById[d.booking_id] || {};
        const u = userById[b.user_id];
        const byOwner = b.source === "owner";
        return {
          booking_id: d.booking_id,
          detail_id: d.detail_id,
          court_id: d.court_id,
          court_name: courtName[d.court_id] ?? d.court_id,
          booking_date: d.booking_date,
          start_time: d.start_time,
          end_time: d.end_time,
          booking_type: d.booking_type || "full",
          wanted_level: d.booking_type === "half" && !d.joined_detail_id ? d.wanted_level ?? null : null,
          joined_detail_id: d.joined_detail_id ?? null,
          // Chủ sân đặt hộ -> tên khách chủ sân nhập; khách tự đặt -> tên tài khoản
          customer_name: byOwner ? b.customer_name || "Khách vãng lai" : u?.fullName ?? b.user_id ?? "Khách",
          customer_phone: byOwner ? b.customer_phone || "" : u?.phone ?? "",
          total_price: d.price ?? 0,
          status: b.status ?? "pending",
          source: b.source ?? "online",
          note: b.note ?? "",
        };
      })
      .filter((r) => !status || r.status === status)
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || toMin(a.start_time) - toMin(b.start_time));

    res.json(rows);
  } catch (err) {
    fail(res, err);
  }
});

/** PATCH /api/owner/bookings/:booking_id/status  { status } */
router.patch("/bookings/:booking_id/status", async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ message: "Trạng thái không hợp lệ" });

    const booking = await Booking.findOne({ booking_id: req.params.booking_id }).lean();
    if (!booking) return res.status(404).json({ message: "Không tìm thấy lượt đặt" });

    // Sân nằm ở booking_details, kiểm tra lượt đặt này có thuộc sân của mình không
    const details = await BookingDetail.find({ booking_id: booking.booking_id }).lean();
    const myIds = new Set((await findMyCourts(getOwnerId(req))).map((c) => c.court_id));
    if (!details.some((d) => myIds.has(d.court_id))) return res.status(403).json({ message: "Không phải sân của bạn" });

    await Booking.updateOne({ booking_id: booking.booking_id }, { $set: { status } });
    await syncRevenueForBooking(booking.booking_id);
    res.json({ status });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------- Phí thuê bao (QR chuyển khoản) ---------- */

/** GET /api/owner/subscription -> tình trạng gói + hoá đơn đang chờ (kèm ảnh QR) */
router.get("/subscription", async (req, res) => {
  try {
    res.json(await subscription.getOwnerSubscription(getOwnerId(req)));
  } catch (err) {
    fail(res, err);
  }
});

/** POST /api/owner/subscription/:id/report -> chủ sân báo "đã chuyển khoản" */
router.post("/subscription/:id/report", async (req, res) => {
  try {
    const ok = await subscription.reportPaid(getOwnerId(req), req.params.id);
    if (!ok) return res.status(404).json({ message: "Không tìm thấy hoá đơn đang chờ thanh toán" });
    res.json(await subscription.getOwnerSubscription(getOwnerId(req)));
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
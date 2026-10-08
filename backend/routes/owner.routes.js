
const router = require("express").Router();
const mongoose = require("mongoose");
const { verifyToken } = require("../middlewares/authMiddleware");
const { requireRole, ROLES } = require("../middlewares/requireRole");
const User = require("../models/User");
const Booking = require("../models/Booking");
const BookingDetail = require("../models/BookingDetail");
const subscription = require("../services/subscriptionService");
const { syncRevenueForBooking } = require("../services/ownerRevenueService");
const { teamNameOf } = require("../services/teamName");
const { resolveMapInput } = require("../services/googleMap");
const { blacklistCol, DURATIONS, activeFilter } = require("../services/blacklist");
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
      ? await User.collection.find({ userID: { $in: userIds } }).project({ _id: 0, userID: 1, fullName: 1, phone: 1, team_name: 1 }).toArray()
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
          team_name: byOwner ? b.customer_name || "Khách vãng lai" : b.team_name || teamNameOf(u) || "",
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

/** POST /api/owner/subscription/:id/promo  { code } -> áp mã khuyến mãi (giảm 100% thì kích hoạt luôn) */
router.post("/subscription/:id/promo", async (req, res) => {
  try {
    const r = await subscription.applyPromo(getOwnerId(req), req.params.id, req.body?.code);
    if (r.error) return res.status(400).json({ message: r.error });
    res.json({ ...(await subscription.getOwnerSubscription(getOwnerId(req))), promo_result: r });
  } catch (err) {
    fail(res, err);
  }
});

/** GET /api/owner/subscription/:id/vouchers -> voucher chủ sân có thể chọn cho hoá đơn này */
router.get("/subscription/:id/vouchers", async (req, res) => {
  try {
    res.json(await subscription.listVouchers(getOwnerId(req), req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

/** DELETE /api/owner/subscription/:id/promo -> bỏ mã, trả về giá gốc */
router.delete("/subscription/:id/promo", async (req, res) => {
  try {
    await subscription.removePromo(getOwnerId(req), req.params.id);
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

/* ---------- Khách hàng đã đặt sân của mình ---------- */

/**
 * GET /api/owner/customers
 * Gom theo người đặt: khách tự đặt online -> theo tài khoản; chủ sân đặt hộ -> theo SĐT (không có SĐT thì theo tên).
 * -> [{ key, name, phone, email, team_name, source, bookings, cancelled, spent, first_date, last_date,
 *       upcoming, top_court, recent: [{ booking_id, date, start_time, end_time, court_name, price, status, booking_type }] }]
 */
router.get("/customers", async (req, res) => {
  try {
    const courts = await findMyCourts(getOwnerId(req));
    if (!courts.length) return res.json([]);
    const courtName = Object.fromEntries(courts.map((c) => [c.court_id, c.court_name]));

    const details = await BookingDetail.find({ court_id: { $in: courts.map((c) => c.court_id) } }).lean();
    if (!details.length) return res.json([]);
    const bookings = await Booking.find({ booking_id: { $in: [...new Set(details.map((d) => d.booking_id))] } }).lean();
    const bookingById = Object.fromEntries(bookings.map((b) => [b.booking_id, b]));

    const userIds = [...new Set(bookings.filter((b) => b.source !== "owner").map((b) => b.user_id).filter(Boolean))];
    const users = userIds.length
      ? await User.collection
          .find({ userID: { $in: userIds } })
          .project({ _id: 0, userID: 1, fullName: 1, phone: 1, email: 1, team_name: 1 })
          .toArray()
      : [];
    const userById = Object.fromEntries(users.map((u) => [u.userID, u]));

    const today = new Date().toLocaleDateString("sv-SE");
    const map = new Map();
    for (const d of details) {
      const b = bookingById[d.booking_id];
      if (!b) continue;
      const byOwner = b.source === "owner";
      const u = byOwner ? null : userById[b.user_id];
      const phone = byOwner ? b.customer_phone || "" : u?.phone || "";
      const name = byOwner ? b.customer_name || "Khách vãng lai" : u?.fullName || b.user_id || "Khách";
      const key = byOwner ? (phone ? `p:${phone}` : `n:${name.toLowerCase()}`) : `u:${b.user_id}`;

      const c =
        map.get(key) ??
        {
          key,
          name,
          phone,
          email: u?.email || "",
          team_name: byOwner ? "" : teamNameOf(u),
          user_id: byOwner ? null : b.user_id,
          source: byOwner ? "owner" : "online",
          bookings: 0,
          cancelled: 0,
          spent: 0,
          first_date: d.booking_date,
          last_date: d.booking_date,
          upcoming: 0,
          courts: {},
          recent: [],
          _seen: new Set(),
        };
      // 1 booking có thể nhiều detail -> chỉ đếm lượt đặt 1 lần
      if (!c._seen.has(b.booking_id)) {
        c._seen.add(b.booking_id);
        if (b.status === "cancelled") c.cancelled += 1;
        else c.bookings += 1;
      }
      if (b.status !== "cancelled") {
        c.spent += Number(d.price || 0);
        c.courts[d.court_id] = (c.courts[d.court_id] || 0) + 1;
        if (d.booking_date >= today) c.upcoming += 1;
      }
      if (d.booking_date < c.first_date) c.first_date = d.booking_date;
      if (d.booking_date > c.last_date) c.last_date = d.booking_date;
      c.recent.push({
        booking_id: d.booking_id,
        date: d.booking_date,
        start_time: d.start_time,
        end_time: d.end_time,
        court_name: courtName[d.court_id] ?? d.court_id,
        price: d.price ?? 0,
        status: b.status ?? "pending",
        booking_type: d.booking_type || "full",
      });
      map.set(key, c);
    }

    const list = [...map.values()].map(({ _seen, courts: cc, recent, ...c }) => {
      const top = Object.entries(cc).sort((a, b) => b[1] - a[1])[0];
      return {
        ...c,
        top_court: top ? courtName[top[0]] ?? top[0] : "",
        recent: recent
          .sort((a, b) => b.date.localeCompare(a.date) || String(b.start_time).localeCompare(String(a.start_time)))
          .slice(0, 8),
      };
    });
    list.sort((a, b) => b.last_date.localeCompare(a.last_date));
    res.json(list);
  } catch (err) {
    fail(res, err);
  }
});

/* ---------- Thông tin cụm sân + tài khoản chủ sân ---------- */

const TIME_RE = /^(([01]\d|2[0-3]):(00|30)|24:00)$/;
const PHONE_RE = /^0\d{9}$/;
const myVenue = (req) => col("venues").findOne({ owner_id: getOwnerId(req) }, { projection: { _id: 0 } });

/** GET /api/owner/venue -> cụm sân + tài khoản + các sân */
router.get("/venue", async (req, res) => {
  try {
    const venue = await myVenue(req);
    if (!venue) return res.status(404).json({ message: "Bạn chưa có cụm sân." });
    const user = await User.collection.findOne({ userID: getOwnerId(req) }, { projection: { _id: 0, password: 0 } });
    const courts = await col("courts").find({ venue_id: venue.venue_id }).project({ _id: 0 }).sort({ court_id: 1 }).toArray();
    res.json({
      venue: { description: "", map_url: "", lat: null, lng: null, images: [], ...venue },
      account: { fullName: user?.fullName || "", phone: user?.phone || "", email: user?.email || "" },
      courts,
    });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * PUT /api/owner/venue
 * body: { venue_name, address, phone, open_time, close_time, description, map_url }
 * Đổi giờ mở cửa -> cập nhật luôn court_schedules (mỗi sân 1 dòng giờ mở -> giờ đóng).
 */
router.put("/venue", async (req, res) => {
  try {
    const venue = await myVenue(req);
    if (!venue) return res.status(404).json({ message: "Bạn chưa có cụm sân." });
    const b = req.body || {};
    const set = {};

    if (b.venue_name !== undefined) {
      const v = String(b.venue_name).trim().slice(0, 100);
      if (!v) return res.status(400).json({ message: "Tên cụm sân không được trống." });
      set.venue_name = v;
    }
    if (b.address !== undefined) {
      const v = String(b.address).trim().slice(0, 200);
      if (v.length < 5) return res.status(400).json({ message: "Vui lòng nhập địa chỉ sân." });
      set.address = v;
    }
    if (b.phone !== undefined) {
      const v = String(b.phone).trim();
      if (!PHONE_RE.test(v)) return res.status(400).json({ message: "Số điện thoại sân gồm 10 số, bắt đầu bằng 0." });
      set.phone = v;
    }
    if (b.description !== undefined) set.description = String(b.description).trim().slice(0, 1000);

    const open = b.open_time ?? venue.open_time;
    const close = b.close_time ?? venue.close_time;
    const hoursChanged = (b.open_time !== undefined && b.open_time !== venue.open_time) || (b.close_time !== undefined && b.close_time !== venue.close_time);
    if (hoursChanged) {
      if (!TIME_RE.test(open || "") || !TIME_RE.test(close || "")) return res.status(400).json({ message: "Giờ hoạt động không hợp lệ." });
      if (toMin(close) - toMin(open) < 60) return res.status(400).json({ message: "Giờ đóng cửa phải sau giờ mở cửa ít nhất 1 giờ." });
      set.open_time = open;
      set.close_time = close;
    }

    if (b.map_url !== undefined) {
      const m = await resolveMapInput(b.map_url);
      if (m.error) return res.status(400).json({ message: m.error });
      Object.assign(set, m);
    }

    if (Object.keys(set).length) await col("venues").updateOne({ venue_id: venue.venue_id }, { $set: set });
    if (hoursChanged) {
      const ids = (await col("courts").find({ venue_id: venue.venue_id }).project({ court_id: 1 }).toArray()).map((c) => c.court_id);
      await col("court_schedules").updateMany({ court_id: { $in: ids } }, { $set: { start_time: open, end_time: close } });
    }
    res.json({ venue: await myVenue(req) });
  } catch (err) {
    fail(res, err);
  }
});

/** PUT /api/owner/courts/:court_id  { court_name, price_per_hour } -> đổi tên / giá 1 sân */
router.put("/courts/:court_id", async (req, res) => {
  try {
    const venue = await myVenue(req);
    const court = venue && (await col("courts").findOne({ court_id: req.params.court_id, venue_id: venue.venue_id }));
    if (!court) return res.status(404).json({ message: "Không tìm thấy sân." });
    const set = {};
    if (req.body?.court_name !== undefined) {
      const v = String(req.body.court_name).trim().slice(0, 60);
      if (!v) return res.status(400).json({ message: "Tên sân không được trống." });
      set.court_name = v;
    }
    if (req.body?.price_per_hour !== undefined) {
      const v = Number(String(req.body.price_per_hour).replace(/\D/g, ""));
      if (!(v >= 50000 && v <= 10000000)) return res.status(400).json({ message: "Giá thuê mỗi giờ từ 50.000đ đến 10.000.000đ." });
      set.price_per_hour = v;
      await col("court_schedules").updateMany({ court_id: court.court_id }, { $set: { price: v } });
    }
    if (Object.keys(set).length) await col("courts").updateOne({ court_id: court.court_id }, { $set: set });
    res.json(await col("courts").findOne({ court_id: court.court_id }, { projection: { _id: 0 } }));
  } catch (err) {
    fail(res, err);
  }
});

/** PUT /api/owner/account  { fullName, phone } -> thông tin tài khoản chủ sân */
router.put("/account", async (req, res) => {
  try {
    const set = {};
    if (req.body?.fullName !== undefined) {
      const v = String(req.body.fullName).trim().slice(0, 80);
      if (!v) return res.status(400).json({ message: "Họ tên không được trống." });
      set.fullName = v;
    }
    if (req.body?.phone !== undefined) {
      const v = String(req.body.phone).trim();
      if (!PHONE_RE.test(v)) return res.status(400).json({ message: "Số điện thoại gồm 10 số, bắt đầu bằng 0." });
      if (await User.collection.findOne({ phone: v, userID: { $ne: getOwnerId(req) } })) {
        return res.status(409).json({ message: "Số điện thoại đã được tài khoản khác sử dụng." });
      }
      set.phone = v;
    }
    if (Object.keys(set).length) await User.collection.updateOne({ userID: getOwnerId(req) }, { $set: set });
    const u = await User.collection.findOne({ userID: getOwnerId(req) }, { projection: { _id: 0, fullName: 1, phone: 1, email: 1 } });
    res.json(u);
  } catch (err) {
    fail(res, err);
  }
});

/* ---------- Danh sách chặn (blacklist) ---------- */

/** GET /api/owner/blacklist -> các khách đang bị chặn ở cụm sân của mình */
router.get("/blacklist", async (req, res) => {
  try {
    const venue = await myVenue(req);
    if (!venue) return res.json([]);
    const list = await blacklistCol()
      .find({ venue_id: venue.venue_id, ...activeFilter() }, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .toArray();
    res.json(list);
  } catch (err) {
    fail(res, err);
  }
});

/**
 * POST /api/owner/blacklist
 * body: { user_id: "U020", duration: "1w" | "1m" | "forever", reason, cancel_upcoming: true|false }
 * Chỉ chặn được khách có tài khoản (khách tự đặt online).
 */
router.post("/blacklist", async (req, res) => {
  try {
    const venue = await myVenue(req);
    if (!venue) return res.status(404).json({ message: "Bạn chưa có cụm sân." });
    const { user_id, duration, reason, cancel_upcoming } = req.body || {};
    const d = DURATIONS[duration];
    if (!d) return res.status(400).json({ message: "Thời gian chặn không hợp lệ." });

    const user = await User.collection.findOne({ userID: String(user_id || "") }, { projection: { _id: 0, userID: 1, fullName: 1, phone: 1, role_id: 1 } });
    if (!user) return res.status(404).json({ message: "Không tìm thấy khách hàng." });
    if (user.userID === getOwnerId(req)) return res.status(400).json({ message: "Không thể tự chặn chính mình." });

    // Chỉ chặn khách từng đặt sân của mình
    const courts = await findMyCourts(getOwnerId(req));
    const myCourtIds = courts.map((c) => c.court_id);
    const myDetails = await BookingDetail.find({ court_id: { $in: myCourtIds } }, { booking_id: 1, booking_date: 1 }).lean();
    const theirBookings = await Booking.find({ booking_id: { $in: [...new Set(myDetails.map((x) => x.booking_id))] }, user_id: user.userID }).lean();
    if (!theirBookings.length) return res.status(400).json({ message: "Khách này chưa từng đặt sân của bạn." });

    const now = new Date();
    const until = d.days ? new Date(now.getTime() + d.days * 86400000).toISOString() : null;
    const doc = {
      block_id: `BL${now.getTime()}`,
      venue_id: venue.venue_id,
      owner_id: getOwnerId(req),
      user_id: user.userID,
      name: user.fullName || user.userID,
      phone: user.phone || "",
      reason: String(reason || "").trim().slice(0, 200),
      duration,
      until,
      created_at: now.toISOString(),
    };
    // Chặn lại người đang bị chặn -> thay bằng lần chặn mới
    await blacklistCol().deleteMany({ venue_id: venue.venue_id, user_id: user.userID });
    await blacklistCol().insertOne({ ...doc });

    // Tuỳ chọn: huỷ luôn các lượt sắp tới của khách này ở sân mình
    let cancelled = 0;
    if (cancel_upcoming) {
      const today = now.toLocaleDateString("sv-SE");
      const upcomingIds = new Set(myDetails.filter((x) => x.booking_date >= today).map((x) => x.booking_id));
      const toCancel = theirBookings.filter((b) => upcomingIds.has(b.booking_id) && !["cancelled", "completed"].includes(b.status));
      for (const b of toCancel) {
        await Booking.updateOne({ booking_id: b.booking_id }, { $set: { status: "cancelled" } });
        syncRevenueForBooking(b.booking_id).catch((e) => console.error("[owner_revenue]", e));
      }
      cancelled = toCancel.length;
    }

    res.status(201).json({ block: doc, cancelled });
  } catch (err) {
    fail(res, err);
  }
});

/** DELETE /api/owner/blacklist/:user_id -> bỏ chặn */
router.delete("/blacklist/:user_id", async (req, res) => {
  try {
    const venue = await myVenue(req);
    if (!venue) return res.status(404).json({ message: "Bạn chưa có cụm sân." });
    await blacklistCol().deleteMany({ venue_id: venue.venue_id, user_id: req.params.user_id });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
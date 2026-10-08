const express = require("express");
const mongoose = require("mongoose");
const CourtSchedule = require("../models/CourtSchedule");
const Booking = require("../models/Booking");
const BookingDetail = require("../models/BookingDetail");
const { verifyToken } = require("../middlewares/authMiddleware");
const { syncRevenueForBooking } = require("../services/ownerRevenueService");
const { linkedCourts } = require("../services/courtLinks");
const User = require("../models/User");
const { teamNameOf, teamsOf } = require("../services/teamName");
const { findActiveBlock, blockMessage } = require("../services/blacklist");
const router = express.Router();

// Tên collection sân & cụm sân trong MongoDB (sửa nếu tên thật khác)
const COURTS_COLLECTION = "courts";
const VENUES_COLLECTION = "venues";

const LEVELS = ["manh", "trung_binh_manh", "trung_binh", "trung_binh_yeu", "yeu"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

// ---------- helpers ----------
const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const today = () => new Date().toLocaleDateString("sv-SE"); // "2026-09-25"
const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const roundK = (n) => Math.round(n / 1000) * 1000; // làm tròn nghìn đồng
const range = (d) => `${d.start_time}–${d.end_time}`;

// Tính giá theo phút dựa trên các khung giá trong court_schedules.
// Trả về null nếu có đoạn thời gian không thuộc khung nào (ngoài giờ hoạt động).
// price trong court_schedules = giá MỖI GIỜ. Trả về null nếu có đoạn ngoài giờ hoạt động.
function calcPrice(schedules, start, end) {
  let total = 0;
  let covered = 0;
  for (const s of schedules) {
    const a = Math.max(start, toMin(s.start_time));
    const b = Math.min(end, toMin(s.end_time));
    if (b > a) {
      total += (s.price * (b - a)) / 60;
      covered += b - a;
    }
  }
  return covered < end - start ? null : roundK(total);
}

// Sinh mã tiếp theo: B001 -> B002, BD009 -> BD010
async function nextId(Model, field, prefix) {
  const docs = await Model.find({ [field]: new RegExp(`^${prefix}\\d+$`) }, { [field]: 1 }).lean();
  const max = docs.reduce((m, d) => Math.max(m, parseInt(d[field].slice(prefix.length), 10)), 0);
  return prefix + String(max + 1).padStart(3, "0");
}

// Các booking_detail còn hiệu lực (bỏ booking đã huỷ) của 1 sân trong 1 ngày
async function getActiveDetails(courtId, date) {
  const details = await BookingDetail.find({ court_id: courtId, booking_date: date }).lean();
  if (details.length === 0) return [];
  const ids = [...new Set(details.map((d) => d.booking_id))];
  const cancelled = await Booking.find(
    { booking_id: { $in: ids }, status: "cancelled" },
    { booking_id: 1 }
  ).lean();
  const cancelledIds = new Set(cancelled.map((b) => b.booking_id));
  return details.filter((d) => !cancelledIds.has(d.booking_id));
}

// Gộp booking_detail thành các "khối giờ đã đặt":
//  full = kín (nguyên sân, hoặc nửa sân đã ghép đủ 2 đội)
//  half = 1 đội đặt nửa sân, đang chờ ghép
function toBlocks(details) {
  const byId = new Set(details.map((d) => d.detail_id));
  const joinedHosts = new Set(
    details.filter((d) => d.joined_detail_id && byId.has(d.joined_detail_id)).map((d) => d.joined_detail_id)
  );
  const blocks = [];
  for (const d of details) {
    const type = d.booking_type || "full";
    if (type === "full") {
      blocks.push({ detail: d, status: "full" });
    } else if (d.joined_detail_id && byId.has(d.joined_detail_id)) {
      continue; // đội vào ghép: đã tính chung với đội mở kèo
    } else {
      blocks.push({ detail: d, status: joinedHosts.has(d.detail_id) ? "full" : "half" });
    }
  }
  return blocks.sort((a, b) => toMin(a.detail.start_time) - toMin(b.detail.start_time));
}

// Giờ bị chiếm bởi sân dùng chung mặt sân (vd: Sân 7 ghép từ Sân 5 số 1 + 2).
// Đặt sân ghép (dù nguyên hay nửa sân) là chiếm cả mặt sân -> luôn coi là kín.
async function getLinkedBlocks(courtId, date) {
  const out = [];
  for (const c of await linkedCourts(courtId)) {
    for (const d of await getActiveDetails(c.court_id, date)) {
      out.push({ detail: d, status: "full", linked: c.court_name });
    }
  }
  return out;
}

// Kiểm tra khoảng giờ [start, end) có đặt được không
function analyze(blocks, start, end, type) {
  const overlapping = blocks.filter(
    (b) => start < toMin(b.detail.end_time) && toMin(b.detail.start_time) < end
  );
  if (overlapping.length === 0) return { ok: true, mode: type === "half" ? "host" : "full" };

  const linkedHit = overlapping.find((b) => b.linked);
  if (linkedHit) {
    return {
      ok: false,
      message: `Giờ này mặt sân đang được dùng cho ${linkedHit.linked} (${range(linkedHit.detail)}). Vui lòng chọn giờ hoặc sân khác.`,
    };
  }

  const list = overlapping.map((b) => range(b.detail)).join(", ");
  const single = overlapping.length === 1 ? overlapping[0] : null;
  const sameRange =
    single && toMin(single.detail.start_time) === start && toMin(single.detail.end_time) === end;

  if (type === "half" && single && single.status === "half") {
    if (sameRange) return { ok: true, mode: "join", host: single.detail };
    return {
      ok: false,
      message: `Trùng với kèo nửa sân ${range(single.detail)}. Muốn ghép đội, hãy chọn đúng giờ ${range(single.detail)}.`,
    };
  }
  if (type === "full" && single && single.status === "half" && sameRange) {
    return {
      ok: false,
      message: `Giờ này đã có đội đặt nửa sân. Chọn kiểu "Nửa sân" nếu muốn vào ghép với họ.`,
    };
  }
  return { ok: false, message: `Giờ này đã được đặt (trùng với ${list}). Vui lòng chọn giờ khác.` };
}

// Sau khi ghi: kiểm tra có bị đặt chồng không (trường hợp 2 người bấm cùng lúc)
function hasConflict(details, start, end) {
  const over = details.filter((d) => start < toMin(d.end_time) && toMin(d.start_time) < end);
  const fulls = over.filter((d) => (d.booking_type || "full") === "full").length;
  const hosts = over.filter((d) => d.booking_type === "half" && !d.joined_detail_id).length;
  const joinCount = {};
  for (const d of over) {
    if (d.joined_detail_id) joinCount[d.joined_detail_id] = (joinCount[d.joined_detail_id] || 0) + 1;
  }
  return (
    fulls > 1 ||
    (fulls === 1 && over.length > 1) ||
    hosts > 1 ||
    Object.values(joinCount).some((n) => n > 1)
  );
}

// Tên đội của các lượt đặt: { detail_id: "FC Đạt" }.
// Khách tự đặt -> tên đội trong tài khoản; chủ sân đặt hộ -> tên khách chủ sân nhập.
async function teamNamesFor(details) {
  if (!details.length) return {};
  const bookings = await Booking.find({ booking_id: { $in: [...new Set(details.map((d) => d.booking_id))] } }).lean();
  const users = await User.find({ userID: { $in: [...new Set(bookings.map((b) => b.user_id))] } }, { userID: 1, fullName: 1, team_name: 1 }).lean();
  // Đội khách chọn lúc đặt được ưu tiên hơn đội mặc định
  const userById = Object.fromEntries(users.map((u) => [u.userID, u]));
  const teamByBooking = Object.fromEntries(
    bookings.map((b) => [
      b.booking_id,
      b.source === "owner" ? b.customer_name || "Khách vãng lai" : b.team_name || teamNameOf(userById[b.user_id]) || "Đội bí ẩn",
    ])
  );
  return Object.fromEntries(details.map((d) => [d.detail_id, teamByBooking[d.booking_id] || ""]));
}

// ---------- GET /api/court-booking/day?court_id=C001&date=2026-09-26 ----------
// Trả về khung giá (giờ hoạt động) và các khoảng giờ đã được đặt trong ngày
router.get("/day", async (req, res) => {
  try {
    const { court_id, date } = req.query;
    if (!court_id || !DATE_RE.test(date || "")) {
      return res.status(400).json({ message: "Thiếu sân hoặc ngày không hợp lệ." });
    }
    const schedules = await CourtSchedule.find({ court_id }).sort({ start_time: 1 }).lean();
    const own = await getActiveDetails(court_id, date);
    const teams = await teamNamesFor(own.filter((d) => d.booking_type === "half"));
    const blocks = [...toBlocks(own), ...(await getLinkedBlocks(court_id, date))].sort(
      (a, b) => toMin(a.detail.start_time) - toMin(b.detail.start_time)
    );

    res.json({
      schedules: schedules.map((s) => ({
        start_time: s.start_time,
        end_time: s.end_time,
        price: s.price,
      })),
      blocks: blocks.map((b) => ({
        start_time: b.detail.start_time,
        end_time: b.detail.end_time,
        status: b.status,
        wanted_level: b.status === "half" ? b.detail.wanted_level : null,
        team_name: b.status === "half" && !b.linked ? teams[b.detail.detail_id] || null : null, // đội đang chờ ghép
        linked_court: b.linked || null, // bận vì sân ghép dùng chung mặt sân
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});

// ---------- GET /api/court-booking/free?date=2026-10-06&start=19:00&end=20:30&venue_ids=V001,V002 ----------
// Tìm sân còn trống NGUYÊN SÂN trong khung giờ (ô tìm kiếm trang chủ).
// -> { V001: [{ court_id, court_name, court_type, price }], V002: [] }
router.get("/free", async (req, res) => {
  try {
    const { date, start: startStr, end: endStr } = req.query;
    if (!DATE_RE.test(date || "") || !TIME_RE.test(startStr || "") || !TIME_RE.test(endStr || "")) {
      return res.status(400).json({ message: "Ngày/giờ không hợp lệ." });
    }
    const start = toMin(startStr);
    const end = toMin(endStr);
    if (end <= start) return res.status(400).json({ message: "Giờ kết thúc phải sau giờ bắt đầu." });

    const venueIds = String(req.query.venue_ids || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 100);
    if (!venueIds.length) return res.json({});

    const courts = await mongoose.connection
      .collection(COURTS_COLLECTION)
      .find({ venue_id: { $in: venueIds }, status: { $ne: "inactive" } })
      .toArray();
    const allSchedules = await CourtSchedule.find({ court_id: { $in: courts.map((c) => c.court_id) } }).lean();
    const past = date < today() || (date === today() && start <= nowMin());

    const result = Object.fromEntries(venueIds.map((id) => [id, []]));
    await Promise.all(
      courts.map(async (c) => {
        if (past) return;
        const price = calcPrice(allSchedules.filter((sc) => sc.court_id === c.court_id), start, end);
        if (price === null) return; // ngoài giờ mở cửa
        const blocks = [...toBlocks(await getActiveDetails(c.court_id, date)), ...(await getLinkedBlocks(c.court_id, date))];
        if (!analyze(blocks, start, end, "full").ok) return;
        result[c.venue_id].push({ court_id: c.court_id, court_name: c.court_name, court_type: c.court_type || "", price });
      })
    );
    for (const id in result) result[id].sort((a, b) => a.court_name.localeCompare(b.court_name));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});

// ---------- GET /api/court-booking/blocked?venue_id=V015  (cần đăng nhập) ----------
// Khách có đang bị chủ sân chặn không -> { blocked, until, message }
router.get("/blocked", verifyToken, async (req, res) => {
  try {
    const b = await findActiveBlock(String(req.query.venue_id || ""), req.auth.userID);
    res.json(b ? { blocked: true, until: b.until, message: blockMessage(b) } : { blocked: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
});

// ---------- GET /api/court-booking/open-matches?days=7&sport_id=SP01 ----------
// Kèo nửa sân đang chờ ghép của MỌI cụm sân (cho trang chủ). Không lộ tên/SĐT khách, chỉ tên đội.
router.get("/open-matches", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 14);
    const from = today();
    const [y, m, d] = from.split("-").map(Number);
    const to = new Date(y, m - 1, d + days - 1).toLocaleDateString("sv-SE");

    // 1) Đội mở kèo nửa sân trong khoảng ngày
    let hosts = await BookingDetail.find({
      booking_type: "half",
      $or: [{ joined_detail_id: null }, { joined_detail_id: { $exists: false } }],
      booking_date: { $gte: from, $lte: to },
    }).lean();
    hosts = hosts.filter((h) => h.booking_date > from || toMin(h.start_time) > nowMin());
    if (!hosts.length) return res.json([]);

    // 2) Bỏ kèo đã huỷ + kèo đã có đội vào ghép (đội ghép chưa huỷ)
    const joiners = await BookingDetail.find({ joined_detail_id: { $in: hosts.map((h) => h.detail_id) } }).lean();
    const all = [...hosts, ...joiners];
    const cancelled = new Set(
      (await Booking.find({ booking_id: { $in: [...new Set(all.map((x) => x.booking_id))] }, status: "cancelled" }, { booking_id: 1 }).lean()).map(
        (b) => b.booking_id
      )
    );
    const matched = new Set(joiners.filter((j) => !cancelled.has(j.booking_id)).map((j) => j.joined_detail_id));
    hosts = hosts.filter((h) => !cancelled.has(h.booking_id) && !matched.has(h.detail_id));
    if (!hosts.length) return res.json([]);

    // 3) Thông tin sân + cụm sân (lọc theo môn nếu có)
    const db = mongoose.connection;
    const courts = await db.collection(COURTS_COLLECTION).find({ court_id: { $in: [...new Set(hosts.map((h) => h.court_id))] } }).toArray();
    const courtById = Object.fromEntries(courts.map((c) => [c.court_id, c]));
    const venues = await db.collection(VENUES_COLLECTION).find({ venue_id: { $in: [...new Set(courts.map((c) => c.venue_id))] } }).toArray();
    const venueById = Object.fromEntries(venues.map((v) => [v.venue_id, v]));
    const teams = await teamNamesFor(hosts);

    const list = hosts
      .map((h) => {
        const c = courtById[h.court_id];
        const v = c && venueById[c.venue_id];
        if (!c || !v || c.status === "inactive") return null;
        if (req.query.sport_id && v.sport_id !== req.query.sport_id) return null;
        return {
          detail_id: h.detail_id,
          date: h.booking_date,
          start_time: h.start_time,
          end_time: h.end_time,
          price: h.price, // tiền nửa sân
          wanted_level: h.wanted_level || null,
          team_name: teams[h.detail_id] || "Đội bí ẩn",
          court_id: c.court_id,
          court_name: c.court_name,
          court_type: c.court_type || "",
          venue_id: v.venue_id,
          venue_name: v.venue_name,
          address: v.address || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date) || toMin(a.start_time) - toMin(b.start_time))
      .slice(0, 40);

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});

// ---------- POST /api/court-booking  (cần đăng nhập) ----------
// body: { court_id, date, start_time, end_time, booking_type: "full"|"half", wanted_level }
router.post("/", verifyToken, async (req, res) => {
  let createdBookingId = null;
  try {
    const { court_id, date, start_time, end_time, booking_type, wanted_level } = req.body || {};
    const userId = req.auth.userID;

    if (!court_id || !DATE_RE.test(date || "")) {
      return res.status(400).json({ message: "Thiếu sân hoặc ngày không hợp lệ." });
    }
    if (!TIME_RE.test(start_time || "") || !TIME_RE.test(end_time || "")) {
      return res.status(400).json({ message: "Giờ không hợp lệ." });
    }
    const start = toMin(start_time);
    const end = toMin(end_time);
    if (end <= start) {
      return res.status(400).json({ message: "Giờ kết thúc phải sau giờ bắt đầu." });
    }
    if (!["full", "half"].includes(booking_type)) {
      return res.status(400).json({ message: "Kiểu đặt sân không hợp lệ." });
    }
    if (date < today() || (date === today() && start <= nowMin())) {
      return res.status(400).json({ message: "Giờ bắt đầu đã qua, vui lòng chọn giờ khác." });
    }

    // Khách bị chủ sân chặn -> không cho đặt sân của cụm sân đó
    const courtDoc = await mongoose.connection.collection(COURTS_COLLECTION).findOne({ court_id });
    if (courtDoc && req.body.source !== "owner") {
      const block = await findActiveBlock(courtDoc.venue_id, userId);
      if (block) return res.status(403).json({ message: blockMessage(block), blocked: true });
    }

    const schedules = await CourtSchedule.find({ court_id }).lean();
    const fullPrice = calcPrice(schedules, start, end);
    
    if (fullPrice === null) {
      return res.status(400).json({ message: "Khung giờ này nằm ngoài giờ hoạt động của sân." });
    }

    const details = await getActiveDetails(court_id, date);
    const result = analyze([...toBlocks(details), ...(await getLinkedBlocks(court_id, date))], start, end, booking_type);
    if (!result.ok) return res.status(409).json({ message: result.message });

    if (result.mode === "join") {
      const hostBooking = await Booking.findOne({ booking_id: result.host.booking_id }).lean();
      // (chủ sân đặt hộ 2 khách khác nhau thì được phép)
      if (hostBooking && hostBooking.user_id === userId && req.body.source !== "owner") {
        return res.status(400).json({ message: "Bạn không thể tự ghép với kèo của chính mình." });
      }
    }
    if (result.mode === "host" && !LEVELS.includes(wanted_level)) {
      return res.status(400).json({ message: "Vui lòng chọn trình độ đội muốn tìm." });
    }

    // --- Ghi vào bookings + booking_details ---
    // Chủ sân đặt hộ khách (chỉ khi đúng là chủ của sân này) -> lưu tên/SĐT khách
    let ownerFields = {};
    if (req.body.source === "owner") {
      const db = mongoose.connection;
      const court = await db.collection(COURTS_COLLECTION).findOne({ court_id });
      const venue = court && (await db.collection(VENUES_COLLECTION).findOne({ venue_id: court.venue_id }));
      if (venue && venue.owner_id === userId) {
        ownerFields = {
          source: "owner",
          customer_name: String(req.body.customer_name || "").trim().slice(0, 60) || "Khách vãng lai",
          customer_phone: String(req.body.customer_phone || "").trim().slice(0, 15),
          note: String(req.body.note || "").trim().slice(0, 200),
        };
      }
    }

    // Đội khách chọn để hiện cho đối thủ (chỉ nhận đội có trong tài khoản)
    let teamField = {};
    if (!ownerFields.source && req.body.team_name) {
      const me = await User.findOne({ userID: userId }, { userID: 1, fullName: 1, team_name: 1, teams: 1 }).lean();
      const chosen = String(req.body.team_name).trim();
      if (teamsOf(me).includes(chosen)) teamField = { team_name: chosen };
    }

    const booking = await Booking.create({
      booking_id: await nextId(Booking, "booking_id", "B"),
      user_id: userId,
      booking_date: date,
      status: "confirmed",
      created_at: new Date().toISOString(),
      ...ownerFields,
      ...teamField,
    });
    createdBookingId = booking.booking_id;

    const detail = await BookingDetail.create({
      detail_id: await nextId(BookingDetail, "detail_id", "BD"),
      booking_id: booking.booking_id,
      court_id,
      booking_date: date,
      start_time,
      end_time,
      price: booking_type === "half" ? roundK(fullPrice / 2) : fullPrice,
      booking_type,
      wanted_level: result.mode === "host" ? wanted_level : null,
      joined_detail_id: result.mode === "join" ? result.host.detail_id : null,
    });

    // Kiểm tra lại, nếu vừa có người đặt chồng thì huỷ bản vừa ghi
    const linkedNow = await getLinkedBlocks(court_id, date);
    const linkedClash = linkedNow.some((b) => start < toMin(b.detail.end_time) && toMin(b.detail.start_time) < end);
    if (linkedClash || hasConflict(await getActiveDetails(court_id, date), start, end)) {
      await BookingDetail.deleteMany({ booking_id: booking.booking_id });
      await Booking.deleteOne({ booking_id: booking.booking_id });
      return res.status(409).json({ message: "Vừa có người đặt trùng giờ này, vui lòng chọn lại." });
    }
  
    syncRevenueForBooking(booking.booking_id).catch((e) => console.error("[owner_revenue]", e));
    res.status(201).json({ booking, detail, mode: result.mode });
  } catch (err) {
    console.error(err);
    if (createdBookingId) {
      await BookingDetail.deleteMany({ booking_id: createdBookingId }).catch(() => {});
      await Booking.deleteOne({ booking_id: createdBookingId }).catch(() => {});
    }
    if (err.code === 11000) {
      return res.status(409).json({ message: "Hệ thống đang bận, vui lòng bấm đặt lại." });
    }
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});

// ---------- GET /api/court-booking/mine  (cần đăng nhập) ----------
// Danh sách sân người dùng đã đặt, kèm tên sân, cụm sân và trạng thái ghép đội
router.get("/mine", verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ user_id: req.auth.userID }).lean();
    if (bookings.length === 0) return res.json([]);

    const details = await BookingDetail.find({
      booking_id: { $in: bookings.map((b) => b.booking_id) },
    }).lean();

    // Tên sân + cụm sân
    const db = mongoose.connection;
    const courts = await db
      .collection(COURTS_COLLECTION)
      .find({ court_id: { $in: [...new Set(details.map((d) => d.court_id))] } })
      .toArray();
    const venues = await db
      .collection(VENUES_COLLECTION)
      .find({ venue_id: { $in: [...new Set(courts.map((c) => c.venue_id))] } })
      .toArray();
    const courtById = Object.fromEntries(courts.map((c) => [c.court_id, c]));
    const venueById = Object.fromEntries(venues.map((v) => [v.venue_id, v]));

    // Kèo nửa sân mình mở: đã có đội vào ghép chưa (bỏ qua đội ghép đã huỷ)
    const hostIds = details
      .filter((d) => d.booking_type === "half" && !d.joined_detail_id)
      .map((d) => d.detail_id);
    let matchedHosts = new Set();
    if (hostIds.length > 0) {
      const joiners = await BookingDetail.find({ joined_detail_id: { $in: hostIds } }).lean();
      const activeJoinerBookings = await Booking.find(
        { booking_id: { $in: joiners.map((j) => j.booking_id) }, status: { $ne: "cancelled" } },
        { booking_id: 1 }
      ).lean();
      const activeIds = new Set(activeJoinerBookings.map((b) => b.booking_id));
      matchedHosts = new Set(
        joiners.filter((j) => activeIds.has(j.booking_id)).map((j) => j.joined_detail_id)
      );
    }

    function matchStatus(d) {
      if ((d.booking_type || "full") === "full") return "full";
      if (d.joined_detail_id) return "joined";      // mình vào ghép kèo người khác
      return matchedHosts.has(d.detail_id) ? "matched" : "waiting"; // kèo mình mở
    }

    const result = bookings.map((b) => ({
      booking_id: b.booking_id,
      booking_date: b.booking_date,
      status: b.status,
      created_at: b.created_at,
      details: details
        .filter((d) => d.booking_id === b.booking_id)
        .sort((x, y) => toMin(x.start_time) - toMin(y.start_time))
        .map((d) => {
          const court = courtById[d.court_id] || {};
          const venue = venueById[court.venue_id] || {};
          return {
            detail_id: d.detail_id,
            court_id: d.court_id,
            court_name: court.court_name || d.court_id,
            court_type: court.court_type || "",
            venue_name: venue.venue_name || "",
            venue_address: venue.address || "",
            booking_date: d.booking_date,
            start_time: d.start_time,
            end_time: d.end_time,
            price: d.price,
            booking_type: d.booking_type || "full",
            wanted_level: d.wanted_level || null,
            match_status: matchStatus(d),
          };
        }),
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});

// ---------- PATCH /api/court-booking/:booking_id/cancel  (khách tự huỷ) ----------
const CANCEL_WITHIN_MIN = 60; // chỉ được tự huỷ trong 60 phút sau khi đặt

router.patch("/:booking_id/cancel", verifyToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({ booking_id: req.params.booking_id }).lean();
    if (!booking || booking.user_id !== req.auth.userID) {
      return res.status(404).json({ message: "Không tìm thấy lượt đặt." });
    }
    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Lượt đặt này đã được huỷ trước đó." });
    }
    if (booking.status === "completed") {
      return res.status(400).json({ message: "Lượt đặt đã hoàn thành, không thể huỷ." });
    }

    const details = await BookingDetail.find({ booking_id: booking.booking_id }).lean();
    if (details.length === 0) return res.status(404).json({ message: "Không tìm thấy lượt đặt." });

    const first = details.reduce((a, b) => (toMin(a.start_time) <= toMin(b.start_time) ? a : b));
    const startAt = new Date(`${first.booking_date}T${first.start_time}:00+07:00`);
    if (startAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: "Đã quá giờ đá, không thể huỷ." });
    }
    // Chỉ được huỷ trong 1 giờ kể từ lúc đặt (vd đặt lúc 15:00 -> sau 16:00 không huỷ online được nữa)
    const createdAt = new Date(booking.created_at || 0).getTime();
    if (!createdAt || Date.now() - createdAt > CANCEL_WITHIN_MIN * 60000) {
      return res.status(400).json({
        message: `Chỉ được huỷ trong ${CANCEL_WITHIN_MIN} phút sau khi đặt sân. Vui lòng liên hệ chủ sân nếu cần huỷ.`,
      });
    }

    await Booking.updateOne({ booking_id: booking.booking_id }, { $set: { status: "cancelled" } });
    syncRevenueForBooking(booking.booking_id).catch((e) => console.error("[owner_revenue]", e));

    res.json({ booking_id: booking.booking_id, status: "cancelled" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});


module.exports = router;
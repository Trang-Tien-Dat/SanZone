const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Role = require("../models/Role");

const { verifyToken } = require("../middlewares/authMiddleware");
const { uniqueTeamName, cleanTeamName, teamNameOf, teamsOf, MAX_TEAMS } = require("../services/teamName");
const { cloudinary, uploadImages, uploadBuffer } = require("../config/cloudinary");

const router = express.Router();

// Thông tin user trả về cho frontend (không bao giờ kèm password)
async function toPublicUser(user) {
  const role = await Role.findOne({ role_id: user.role_id }).lean();
  return {
    userID: user.userID,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role_id: user.role_id,
    role_name: role ? role.role_name : null,
    team_name: teamNameOf(user),
    teams: teamsOf(user),
    avatar_url: user.avatar?.url || "",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{9}$/;

// Chuẩn hoá giống frontend: email -> chữ thường, SĐT -> chỉ số, +84/84 -> 0
function parseIdentifier(raw) {
  const s = String(raw || "").trim();
  if (s.includes("@")) {
    const email = s.toLowerCase();
    return EMAIL_RE.test(email) ? { email } : null;
  }
  let phone = s.replace(/\D/g, "");
  if (phone.startsWith("84") && phone.length === 11) phone = "0" + phone.slice(2);
  return PHONE_RE.test(phone) ? { phone } : null;
}

// POST /api/auth/login   body: { identifier, password }  (vẫn nhận { email, password } kiểu cũ)
router.post("/login", async (req, res) => {
  try {
    const { identifier, email, password } = req.body || {};
    const raw = identifier ?? email;
    if (!raw || !password) {
      return res.status(400).json({ message: "Vui lòng nhập email/số điện thoại và mật khẩu." });
    }

    const query = parseIdentifier(raw);
    if (!query) {
      return res.status(400).json({ message: "Email hoặc số điện thoại không hợp lệ." });
    }

    const user = await User.findOne(query).select("+password");
    // Cùng một thông báo cho mọi trường hợp sai, để không lộ email/SĐT nào đã tồn tại
    const ok = user && user.password && (await bcrypt.compare(String(password), user.password));
    if (!ok) {
      return res.status(401).json({ message: "Email/số điện thoại hoặc mật khẩu không đúng." });
    }
    // Tài khoản bị admin khoá (đọc thẳng collection vì model User có thể chưa khai báo field status)
    if (await User.collection.findOne({ _id: user._id, status: "locked" })) {
      return res.status(403).json({ message: "Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên." });
    }

    const token = jwt.sign(
      { id: user._id, userID: user.userID, role_id: user.role_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({ token, user: await toPublicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});

// ---------------- ĐĂNG KÝ ----------------
const col = (name) => mongoose.connection.collection(name);

const ALLOWED_ROLES = [2, 3]; // 2 = chủ sân, 3 = khách hàng. KHÔNG cho tự đăng ký admin (1)
const FOOTBALL = "SP01"; // hiện chỉ mở đăng ký chủ sân bóng đá
const COURT_TYPES = { "5 người": 5, "7 người": 7, "11 người": 11 };
// Sân 7 / sân 11 có thể ghép từ các sân 5 (0 = sân riêng, không ghép)
const MERGE_OPTIONS = { "7 người": [0, 2, 3], "11 người": [0, 4, 6] };
// Giờ hoạt động: chủ sân tự chọn khi đăng ký (mặc định 05:00 -> 24:00), bước 30 phút
const DEFAULT_OPEN = "05:00";
const DEFAULT_CLOSE = "24:00";
const TIME_RE = /^(([01]\d|2[0-3]):(00|30)|24:00)$/;
const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Mã lớn nhất hiện có (vd V012 -> 12) trong 1 collection
// collection: tên bảng (chuỗi) hoặc đối tượng collection (vd User.collection)
async function maxId(collection, field, prefix) {
  const c = typeof collection === "string" ? col(collection) : collection;
  const docs = await c
    .find({ [field]: new RegExp(`^${prefix}\\d+$`) })
    .project({ _id: 0, [field]: 1 })
    .toArray();
  return docs.reduce((m, d) => Math.max(m, Number(d[field].slice(prefix.length)) || 0), 0);
}
const makeId = (prefix, n) => `${prefix}${String(n).padStart(3, "0")}`;

// Cấp `count` số thứ tự liên tiếp, KHÔNG BAO GIỜ dùng lại số cũ (kể cả khi bản ghi đã bị xoá).
// Trước đây dùng "mã lớn nhất + 1": xoá user U010 rồi đăng ký lại -> user mới lại là U010
// và "thừa kế" luôn cụm sân + các sân cũ còn sót trong DB của U010.
// Bộ đếm lưu ở collection "counters": { _id: "U", seq: 10 }
async function nextSeq(collection, field, prefix, count = 1) {
  const counters = col("counters");
  // Không để bộ đếm thấp hơn mã lớn nhất đang có (lần chạy đầu, hoặc có ai thêm tay vào DB)
  await counters.updateOne({ _id: prefix }, { $max: { seq: await maxId(collection, field, prefix) } }, { upsert: true });
  const r = await counters.findOneAndUpdate({ _id: prefix }, { $inc: { seq: count } }, { returnDocument: "after" });
  const doc = r && r.value !== undefined ? r.value : r; // driver cũ trả { value }, driver mới trả thẳng document
  return doc.seq - count + 1; // số đầu tiên trong dãy vừa cấp
}

// Kiểm tra phần thông tin sân của chủ sân, trả về lỗi (chuỗi) hoặc dữ liệu đã làm sạch
function parseOwnerVenue(body) {
  const v = body.venue || {};
  const venue_name = String(v.venue_name || "").trim();
  const address = String(v.address || "").trim();
  const phone = String(v.phone || body.phone || "").trim();
  const open_time = String(v.open_time || DEFAULT_OPEN).trim();
  const close_time = String(v.close_time || DEFAULT_CLOSE).trim();

  if (!venue_name) return { error: "Vui lòng nhập tên cụm sân." };
  if (address.length < 5) return { error: "Vui lòng nhập địa chỉ sân." };
  if (!/^0\d{9}$/.test(phone)) return { error: "Số điện thoại sân gồm 10 số, bắt đầu bằng 0." };
  if (!TIME_RE.test(open_time) || !TIME_RE.test(close_time)) return { error: "Giờ hoạt động không hợp lệ." };
  if (toMin(close_time) - toMin(open_time) < 60) return { error: "Giờ đóng cửa phải sau giờ mở cửa ít nhất 1 giờ." };

  const groups = (Array.isArray(body.courts) ? body.courts : [])
    .slice()
    .sort((a, b) => (COURT_TYPES[a.court_type] || 99) - (COURT_TYPES[b.court_type] || 99)); // sân 5 trước để ghép
  const courts = [];
  const fiveCount = groups
    .filter((g) => g.court_type === "5 người")
    .reduce((n, g) => n + (Number(g.quantity) || 0), 0);
  for (const g of groups) {
    const size = COURT_TYPES[g.court_type];
    const quantity = Number(g.quantity);
    const price = Number(String(g.price_per_hour ?? "").replace(/\D/g, "")); // "350.000" -> 350000
    if (!size) return { error: "Loại sân không hợp lệ." };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return { error: "Số lượng sân mỗi loại từ 1 đến 20." };
    if (!Number.isFinite(price) || price < 50000 || price > 10000000) return { error: "Giá thuê mỗi giờ từ 50.000đ đến 10.000.000đ." };
    const merge = Number(g.merge_from) || 0;
    if (merge) {
      if (!(MERGE_OPTIONS[g.court_type] || []).includes(merge)) return { error: `Sân ${g.court_type} không ghép được từ ${merge} sân 5.` };
      if (quantity * merge > fiveCount) {
        return { error: `${quantity} sân ${g.court_type} ghép từ ${merge} sân 5 cần ít nhất ${quantity * merge} sân 5 (bạn đang có ${fiveCount}).` };
      }
    }
    for (let i = 1; i <= quantity; i++) {
      courts.push({ court_name: `Sân ${size} số ${i}`, court_type: g.court_type, price_per_hour: Math.round(price), merge_from: merge, seq: i });
    }
  }
  if (!courts.length) return { error: "Vui lòng thêm ít nhất 1 sân." };
  if (courts.length > 50) return { error: "Tối đa 50 sân." };

  return { venue: { venue_name, address, phone, open_time, close_time }, courts };
}

// POST /api/auth/register
// body khách hàng: { fullName, email, phone, password, role_id: 3 }
// body chủ sân:    { ...như trên, role_id: 2,
//                    venue: { venue_name, address, phone },
//                    courts: [{ court_type: "7 người", quantity: 2, price_per_hour: 350000 }] }
router.post("/register", async (req, res) => {
  const created = { user: null, venue: null, courts: [], schedules: [] }; // để xoá lại nếu lỗi giữa chừng
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");
    const role_id = Number(body.role_id);

    if (!fullName) return res.status(400).json({ message: "Vui lòng nhập họ tên." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Email không hợp lệ." });
    if (!/^0\d{9}$/.test(phone)) return res.status(400).json({ message: "Số điện thoại gồm 10 số, bắt đầu bằng 0." });
    if (password.length < 6) return res.status(400).json({ message: "Mật khẩu tối thiểu 6 ký tự." });
    if (!ALLOWED_ROLES.includes(role_id)) return res.status(400).json({ message: "Loại tài khoản không hợp lệ." });

    let owner = null;
    if (role_id === 2) {
      owner = parseOwnerVenue(body);
      if (owner.error) return res.status(400).json({ message: owner.error });
    }

    if (await User.exists({ email })) return res.status(409).json({ message: "Email này đã được đăng ký." });
    if (await User.exists({ phone })) {
      return res.status(409).json({ message: "Số điện thoại đã được sử dụng." });
    }

    // 1) user — mọi tài khoản đều mã "U###" (venues.owner_id đang dùng mã này, vd "U002")
    // Dùng đúng bảng của model User (bảng của bạn tên "user", không phải "users")
    const userID = makeId("U", await nextSeq(User.collection, "userID", "U"));
    const user = await User.create({
      userID,
      fullName,
      email,
      phone,
      role_id,
      // Tên đội: không nhập -> tự đặt "Đội K4821"
      team_name: cleanTeamName(body.team_name) || (await uniqueTeamName(User)),
      password: await bcrypt.hash(password, 10),
    });
    created.user = user;

    if (owner) {
      // 2) venues
      const venue_id = makeId("V", await nextSeq("venues", "venue_id", "V"));
      await col("venues").insertOne({ venue_id, owner_id: userID, sport_id: FOOTBALL, ...owner.venue });
      created.venue = venue_id;

      // 3) courts
      let next = await nextSeq("courts", "court_id", "C", owner.courts.length);
      const ids = owner.courts.map(() => makeId("C", next++));
      // Sân ghép: Sân 7 số k = các sân 5 thứ (k-1)*n+1 .. k*n  (vd 2 sân 5: số 1 = sân 5 số 1+2, số 2 = số 3+4)
      const fiveIds = owner.courts.map((c, i) => (c.court_type === "5 người" ? ids[i] : null)).filter(Boolean);
      const courtDocs = owner.courts.map(({ merge_from, seq, ...c }, i) => ({
        court_id: ids[i],
        venue_id,
        ...c,
        parts: merge_from ? fiveIds.slice((seq - 1) * merge_from, seq * merge_from) : [],
        status: "active",
      }));
      await col("courts").insertMany(courtDocs);
      created.courts = courtDocs.map((c) => c.court_id);

      // 4) court_schedules: MỖI SÂN 1 DÒNG = giờ mở cửa -> giờ đóng cửa, price = giá mỗi giờ.
      //    Người chơi tự chọn giờ bắt đầu/kết thúc bất kỳ trong khoảng này.
      let nextSch = await nextSeq("court_schedules", "schedule_id", "SCH", owner.courts.length);
      const scheduleDocs = courtDocs.map((c) => ({
        schedule_id: makeId("SCH", nextSch++),
        court_id: c.court_id,
        start_time: owner.venue.open_time,
        end_time: owner.venue.close_time,
        price: c.price_per_hour, // giá / 1 giờ
      }));
      const inserted = await col("court_schedules").insertMany(scheduleDocs);
      created.schedules = scheduleDocs.map((d) => d.schedule_id);
      if (inserted.insertedCount !== scheduleDocs.length) throw new Error("Không lưu đủ court_schedules");
      console.log(
        `[register] ${userID} ${venue_id}: mở cửa ${owner.venue.open_time}-${owner.venue.close_time} · ` +
        courtDocs.map((c) => `${c.court_id} ${c.court_name} ${c.price_per_hour}đ${c.parts.length ? ` (ghép ${c.parts.join("+")})` : ""}`).join(", ")
      );
    }

    res.status(201).json({
      message: "Đăng ký thành công.",
      user: await toPublicUser(user),
      ...(owner && { venue_id: created.venue, courts: created.courts, schedules: created.schedules.length }),
    });
  } catch (err) {
    // Lỗi giữa chừng -> xoá những gì đã tạo để không bị dữ liệu dở dang
    try {
      if (created.schedules.length) await col("court_schedules").deleteMany({ schedule_id: { $in: created.schedules } });
      if (created.courts.length) await col("courts").deleteMany({ court_id: { $in: created.courts } });
      if (created.venue) await col("venues").deleteOne({ venue_id: created.venue });
      if (created.user) await User.deleteOne({ _id: created.user._id });
    } catch (cleanupErr) {
      console.error("[register] cleanup", cleanupErr);
    }
    if (err.code === 11000) {
      // Trùng khoá duy nhất (unique index) — in rõ bảng + field bị trùng để dễ sửa
      const where = err.message.match(/collection: (\S+)/)?.[1] ?? "?";
      const keys = JSON.stringify(err.keyValue ?? err.keyPattern ?? {});
      console.error(`[register] Trùng dữ liệu ở ${where}: ${keys}`);
      return res.status(409).json({ message: `Dữ liệu bị trùng ở ${where}: ${keys}` });
    }
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});

// ---------- Tài khoản người dùng: hồ sơ, ảnh đại diện, đội ----------
const findUser = (req) => User.collection.findOne({ userID: req.auth.userID });
const sendMe = async (req, res) => res.json({ user: await toPublicUser(await findUser(req)) });

// PUT /api/auth/profile  { fullName, phone }
router.put("/profile", verifyToken, async (req, res) => {
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
      if (await User.collection.findOne({ phone: v, userID: { $ne: req.auth.userID } })) {
        return res.status(409).json({ message: "Số điện thoại đã được tài khoản khác sử dụng." });
      }
      set.phone = v;
    }
    if (Object.keys(set).length) await User.collection.updateOne({ userID: req.auth.userID }, { $set: set });
    await sendMe(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
});

// PUT /api/auth/password  { current_password, new_password }  (mọi loại tài khoản)
router.put("/password", verifyToken, async (req, res) => {
  try {
    const current = String(req.body?.current_password || "");
    const next = String(req.body?.new_password || "");
    if (next.length < 6) return res.status(400).json({ message: "Mật khẩu mới tối thiểu 6 ký tự." });
    if (next === current) return res.status(400).json({ message: "Mật khẩu mới phải khác mật khẩu hiện tại." });

    const user = await User.findOne({ userID: req.auth.userID }).select("+password");
    if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    if (!user.password || !(await bcrypt.compare(current, user.password))) {
      return res.status(400).json({ message: "Mật khẩu hiện tại không đúng." });
    }
    await User.updateOne({ userID: req.auth.userID }, { $set: { password: await bcrypt.hash(next, 10) } });
    res.json({ message: "Đã đổi mật khẩu." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
});

// PUT /api/auth/teams  { teams: ["FC Ninh Kiều", "Đội K4821"], default: "FC Ninh Kiều" }
router.put("/teams", verifyToken, async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.teams) ? req.body.teams : [];
    const teams = [];
    for (const t of raw.map(cleanTeamName).filter(Boolean)) {
      if (!teams.some((x) => x.toLowerCase() === t.toLowerCase())) teams.push(t);
    }
    if (!teams.length) return res.status(400).json({ message: "Cần ít nhất 1 đội." });
    if (teams.length > MAX_TEAMS) return res.status(400).json({ message: `Tối đa ${MAX_TEAMS} đội.` });
    const main = teams.includes(cleanTeamName(req.body?.default)) ? cleanTeamName(req.body.default) : teams[0];
    await User.collection.updateOne(
      { userID: req.auth.userID },
      { $set: { team_name: main, teams: [main, ...teams.filter((t) => t !== main)] } }
    );
    await sendMe(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
});

// POST /api/auth/avatar  (form-data, field "avatar")
router.post(
  "/avatar",
  verifyToken,
  (req, res, next) =>
    uploadImages.single("avatar")(req, res, (err) =>
      err ? res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "Ảnh tối đa 5MB." : err.message }) : next()
    ),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Chưa chọn ảnh." });
      const user = await findUser(req);
      const r = await uploadBuffer(req.file.buffer, `sanzone/avatars/${req.auth.userID}`);
      await User.collection.updateOne({ userID: req.auth.userID }, { $set: { avatar: { url: r.secure_url, public_id: r.public_id } } });
      if (user?.avatar?.public_id) cloudinary.uploader.destroy(user.avatar.public_id).catch(() => {});
      await sendMe(req, res);
    } catch (err) {
      console.error("[avatar]", err);
      res.status(500).json({ message: "Tải ảnh thất bại, vui lòng thử lại." });
    }
  }
);

// DELETE /api/auth/avatar
router.delete("/avatar", verifyToken, async (req, res) => {
  try {
    const user = await findUser(req);
    if (user?.avatar?.public_id) await cloudinary.uploader.destroy(user.avatar.public_id).catch(() => {});
    await User.collection.updateOne({ userID: req.auth.userID }, { $unset: { avatar: "" } });
    await sendMe(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
});

// ---------- Sân yêu thích (wishlist) ----------
// GET  /api/auth/favorites                 -> ["V001", "V015"]
// POST /api/auth/favorites/:venue_id       -> bật/tắt yêu thích 1 cụm sân
// POST /api/auth/favorites/merge { venue_ids } -> gộp danh sách lưu tạm lúc chưa đăng nhập
const favOf = async (userID) => (await User.collection.findOne({ userID }, { projection: { favorite_venues: 1 } }))?.favorite_venues || [];

router.get("/favorites", verifyToken, async (req, res) => {
  try {
    res.json(await favOf(req.auth.userID));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
});

router.post("/favorites/merge", verifyToken, async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.venue_ids) ? req.body.venue_ids : []).map(String).filter((s) => /^V\d+$/.test(s)).slice(0, 100);
    if (ids.length) await User.collection.updateOne({ userID: req.auth.userID }, { $addToSet: { favorite_venues: { $each: ids } } });
    res.json(await favOf(req.auth.userID));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
});

router.post("/favorites/:venue_id", verifyToken, async (req, res) => {
  try {
    const id = String(req.params.venue_id);
    if (!(await col("venues").findOne({ venue_id: id }))) return res.status(404).json({ message: "Không tìm thấy sân." });
    const has = (await favOf(req.auth.userID)).includes(id);
    await User.collection.updateOne({ userID: req.auth.userID }, has ? { $pull: { favorite_venues: id } } : { $addToSet: { favorite_venues: id } });
    res.json(await favOf(req.auth.userID));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
});

// GET /api/auth/me  -> người đang đăng nhập (frontend gọi khi tải lại trang)
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.auth.id);
    if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    res.json({ user: await toPublicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi máy chủ, vui lòng thử lại." });
  }
});

module.exports = router;
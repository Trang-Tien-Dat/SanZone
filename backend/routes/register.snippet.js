

const ALLOWED_ROLES = [2, 3]; 

const ID_PREFIX = { 2: "OWN", 3: "U" };

async function nextUserId(prefix) {
  // Lấy mã lớn nhất hiện có với prefix này, +1
  const last = await User.find({ userID: new RegExp(`^${prefix}\\d+$`) })
    .select("userID")
    .lean();
  const max = last.reduce((m, u) => Math.max(m, Number(u.userID.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

router.post("/register", async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    const role_id = Number(req.body.role_id);

    // Kiểm tra dữ liệu 
    if (!fullName) return res.status(400).json({ message: "Vui lòng nhập họ tên" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Email không hợp lệ" });
    if (!/^0\d{9}$/.test(phone)) return res.status(400).json({ message: "Số điện thoại gồm 10 số, bắt đầu bằng 0" });
    if (password.length < 6) return res.status(400).json({ message: "Mật khẩu tối thiểu 6 ký tự" });
    if (!ALLOWED_ROLES.includes(role_id)) return res.status(400).json({ message: "Loại tài khoản không hợp lệ" });

    if (await User.exists({ email })) return res.status(409).json({ message: "Email này đã được đăng ký" });
    if (await User.exists({ phone })) return res.status(409).json({ message: "Số điện thoại này đã được đăng ký" });

    // ---- Tạo tài khoản ----
    const user = await User.create({
      userID: await nextUserId(ID_PREFIX[role_id]),
      fullName,
      email,
      phone,
      role_id,
      password: await bcrypt.hash(password, 10),
    });

    res.status(201).json({
      message: "Đăng ký thành công",
      user: { userID: user.userID, fullName: user.fullName, email: user.email, phone: user.phone, role_id: user.role_id },
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Email hoặc số điện thoại đã tồn tại" });
    console.error("[register]", err);
    res.status(500).json({ message: "Không đăng ký được, vui lòng thử lại" });
  }
});
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userID: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: String,
    // Mật khẩu đã mã hoá bằng bcrypt. select:false -> mặc định không trả về khi query
    password: { type: String, select: false },
    role_id: { type: Number, default: 3 },
    // Tên đội (khách hàng). Trống -> tự đặt "Đội K4821" (services/teamName.js)
    team_name: { type: String, default: "" }, // đội mặc định
    // Các đội của khách (tối đa 5). Lúc đặt sân chọn 1 đội để hiện cho đối thủ.
    teams: { type: [String], default: [] },
    avatar: { url: { type: String, default: "" }, public_id: { type: String, default: "" } },
  },
  { collection: "user" }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
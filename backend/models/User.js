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
  },
  { collection: "user" }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
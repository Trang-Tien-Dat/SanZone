// Đặt mật khẩu (đã mã hoá) cho user có sẵn trong DB.
// Cách dùng, trong thư mục backend:
//   node scripts/setPassword.js levanc@gmail.com 123456
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.log("Cách dùng: node scripts/setPassword.js <email> <mật khẩu>");
    process.exit(1);
  }

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.log("Chưa có MONGO_URI trong file .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const hash = await bcrypt.hash(password, 10);
  const result = await User.updateOne(
    { email: email.toLowerCase().trim() },
    { $set: { password: hash } }
  );

  console.log(
    result.matchedCount
      ? `Đã đặt mật khẩu cho ${email}`
      : `Không tìm thấy user có email ${email}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
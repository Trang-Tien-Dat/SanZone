
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const [email = "admin@sanzone.vn", password = "123456", fullName = "Quản trị viên", phone = "0981223396"] = process.argv.slice(2);

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = User.collection;
  const hash = await bcrypt.hash(password, 10);

  const existing = await users.findOne({ email: email.toLowerCase() });
  if (existing) {
    await users.updateOne({ _id: existing._id }, { $set: { password: hash, role_id: 1, status: "active" } });
    console.log(`Đã cập nhật ${existing.userID} <${email}> thành admin, mật khẩu mới: ${password}`);
  } else {
    if (await users.findOne({ phone })) throw new Error(`SĐT ${phone} đã được dùng, truyền SĐT khác ở tham số thứ 4.`);
    // Mã U### không dùng lại mã cũ (cùng bộ đếm với auth.js)
    const docs = await users.find({ userID: /^U\d+$/ }).project({ userID: 1 }).toArray();
    const max = docs.reduce((m, d) => Math.max(m, Number(d.userID.slice(1)) || 0), 0);
    const counters = mongoose.connection.collection("counters");
    await counters.updateOne({ _id: "U" }, { $max: { seq: max } }, { upsert: true });
    const r = await counters.findOneAndUpdate({ _id: "U" }, { $inc: { seq: 1 } }, { returnDocument: "after" });
    const seq = (r && r.value !== undefined ? r.value : r).seq;
    const userID = `U${String(seq).padStart(3, "0")}`;

    await User.create({ userID, fullName, email: email.toLowerCase(), phone, role_id: 1, password: hash });
    console.log(`Đã tạo admin ${userID} <${email}> mật khẩu: ${password}`);
  }

  // Bảo đảm có vai trò admin trong bảng roles
  const Role = require("../models/Role");
  if (!(await Role.collection.findOne({ role_id: 1 }))) {
    await Role.collection.insertOne({ role_id: 1, role_name: "admin" });
    console.log("Đã thêm role_id 1 = admin vào bảng roles.");
  }
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
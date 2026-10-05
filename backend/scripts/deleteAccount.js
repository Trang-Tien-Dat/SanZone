
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Booking = require("../models/Booking");
const BookingDetail = require("../models/BookingDetail");

const email = (process.argv[2] || "").toLowerCase().trim();
const DELETE = process.argv.includes("--delete");

(async () => {
  if (!email || email.startsWith("--")) throw new Error("Thiếu email. Ví dụ: node scripts/deleteAccount.js a@gmail.com");
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;

  const user = await User.collection.findOne({ email });
  if (!user) throw new Error(`Không tìm thấy tài khoản ${email}`);
  if (Number(user.role_id) === 1) throw new Error("Không xoá tài khoản admin bằng script này.");

  const venues = await db.collection("venues").find({ owner_id: user.userID }).toArray();
  const venueIds = venues.map((v) => v.venue_id);
  const courts = await db.collection("courts").find({ venue_id: { $in: venueIds } }).toArray();
  const courtIds = courts.map((c) => c.court_id);

  // Lượt đặt: trên sân của tài khoản này + do tài khoản này đặt
  const detailsOnCourts = await BookingDetail.find({ court_id: { $in: courtIds } }).lean();
  const ownBookings = await Booking.find({ user_id: user.userID }).lean();
  const bookingIds = [...new Set([...detailsOnCourts.map((d) => d.booking_id), ...ownBookings.map((b) => b.booking_id)])];
  const schedulesCount = await db.collection("court_schedules").countDocuments({ court_id: { $in: courtIds } });

  console.log(`Tài khoản: ${user.userID} ${user.fullName} <${email}>`);
  console.log(`Cụm sân:   ${venueIds.join(", ") || "không có"}`);
  console.log(`Sân:       ${courtIds.join(", ") || "không có"}`);
  console.log(`court_schedules: ${schedulesCount} dòng · Lượt đặt: ${bookingIds.length}`);

  if (!DELETE) {
    console.log("\nChưa xoá gì. Chạy lại với --delete để xoá thật.");
  } else {
    await BookingDetail.deleteMany({ booking_id: { $in: bookingIds } });
    await Booking.deleteMany({ booking_id: { $in: bookingIds } });
    await db.collection("court_schedules").deleteMany({ court_id: { $in: courtIds } });
    await db.collection("courts").deleteMany({ court_id: { $in: courtIds } });
    await db.collection("venues").deleteMany({ venue_id: { $in: venueIds } });
    await User.collection.deleteOne({ _id: user._id });
    console.log("\nĐã xoá xong.");
  }
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
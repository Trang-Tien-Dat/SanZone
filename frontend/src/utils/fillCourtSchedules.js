/**
 * Tạo court_schedules 05:00 -> 24:00 (khung 1 giờ) cho các sân CHƯA có lịch nào.
 * Sân đã có lịch thì giữ nguyên. Chạy lại nhiều lần vẫn an toàn.
 *   node scripts/fillCourtSchedules.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const OPEN_HOUR = 5;
const CLOSE_HOUR = 24;
const hhmm = (h) => `${String(h).padStart(2, "0")}:00`;

(async () => {
  await mongoose.connect(process.env.MONGO_URI); // đổi tên biến nếu .env đặt khác (xem config/db.js)
  const db = mongoose.connection;

  const courts = await db.collection("courts").find({}).toArray();
  const hasSchedule = new Set(await db.collection("court_schedules").distinct("court_id"));

  const ids = await db.collection("court_schedules").find({ schedule_id: /^SCH\d+$/ }).project({ schedule_id: 1 }).toArray();
  let next = ids.reduce((m, d) => Math.max(m, Number(d.schedule_id.slice(3)) || 0), 0) + 1;

  const docs = [];
  for (const c of courts) {
    if (hasSchedule.has(c.court_id)) continue;
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
      docs.push({
        schedule_id: `SCH${String(next++).padStart(3, "0")}`,
        court_id: c.court_id,
        start_time: hhmm(h),
        end_time: hhmm(h + 1),
        price: c.price_per_hour,
      });
    }
  }

  if (docs.length) await db.collection("court_schedules").insertMany(docs);
  console.log(`Đã tạo ${docs.length} khung giờ cho ${docs.length / (CLOSE_HOUR - OPEN_HOUR)} sân.`);
  await mongoose.disconnect();
})();
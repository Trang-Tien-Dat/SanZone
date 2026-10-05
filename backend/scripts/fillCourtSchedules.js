/**
 * Sửa court_schedules cho các sân ĐÃ có trong DB:
 *  - Sân chưa có khung giờ nào -> tạo khung 1 giờ theo giờ mở cửa của cụm sân (venues.open_time/close_time),
 *    không có thì dùng 05:00 -> 24:00. Giá = courts.price_per_hour của đúng sân đó.
 *  - Thêm --sync-price: đặt lại giá mọi khung giờ theo courts.price_per_hour (sửa sân bị lệch giá).
 *
 * Chạy trong thư mục backend:
 *   node scripts/fillCourtSchedules.js
 *   node scripts/fillCourtSchedules.js --sync-price
 * Chạy lại nhiều lần vẫn an toàn.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const SYNC_PRICE = process.argv.includes("--sync-price");
const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;
  const schedules = db.collection("court_schedules");

  const courts = await db.collection("courts").find({}).toArray();
  const venues = await db.collection("venues").find({}).toArray();
  const venueById = Object.fromEntries(venues.map((v) => [v.venue_id, v]));
  const hasSchedule = new Set(await schedules.distinct("court_id"));

  const ids = await schedules.find({ schedule_id: /^SCH\d+$/ }).project({ schedule_id: 1 }).toArray();
  let next = ids.reduce((m, d) => Math.max(m, Number(d.schedule_id.slice(3)) || 0), 0) + 1;

  const docs = [];
  const filled = [];
  for (const c of courts) {
    if (hasSchedule.has(c.court_id)) continue;
    const v = venueById[c.venue_id] || {};
    const open = toMin(v.open_time || "05:00");
    const close = toMin(v.close_time || "24:00");
    for (let m = open; m < close; m += 60) {
      const end = Math.min(m + 60, close);
      docs.push({
        schedule_id: `SCH${String(next++).padStart(3, "0")}`,
        court_id: c.court_id,
        start_time: toHM(m),
        end_time: toHM(end),
        price: Math.round((Number(c.price_per_hour) * (end - m)) / 60),
      });
    }
    filled.push(c.court_id);
  }
  if (docs.length) await schedules.insertMany(docs);
  console.log(`Tạo ${docs.length} khung giờ cho ${filled.length} sân chưa có lịch: ${filled.join(", ") || "(không có)"}`);

  if (SYNC_PRICE) {
    let changed = 0;
    for (const c of courts) {
      const list = await schedules.find({ court_id: c.court_id }).toArray();
      for (const s of list) {
        const price = Math.round((Number(c.price_per_hour) * (toMin(s.end_time) - toMin(s.start_time))) / 60);
        if (s.price !== price) {
          await schedules.updateOne({ _id: s._id }, { $set: { price } });
          changed++;
        }
      }
    }
    console.log(`Đã chỉnh giá ${changed} khung giờ cho khớp courts.price_per_hour.`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
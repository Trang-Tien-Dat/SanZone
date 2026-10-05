
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const BookingDetail = require("../models/BookingDetail");

const DELETE = process.argv.includes("--delete");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;

  const users = await User.collection.find({}).project({ userID: 1, email: 1, role_id: 1 }).toArray();
  const userIds = new Set(users.map((u) => u.userID));
  const venues = await db.collection("venues").find({}).toArray();
  const courts = await db.collection("courts").find({}).toArray();
  const schedules = await db.collection("court_schedules").find({}).toArray();

  // --- Tổng quan từng chủ sân ---
  console.log("=== Sân của từng chủ sân ===");
  for (const v of venues) {
    const u = users.find((x) => x.userID === v.owner_id);
    const list = courts.filter((c) => c.venue_id === v.venue_id);
    console.log(
      `${v.venue_id} "${v.venue_name}" · chủ ${v.owner_id} ${u ? u.email : "(KHÔNG CÒN USER)"} · ${list.length} sân`
    );
    for (const c of list) console.log(`    ${c.court_id} ${c.court_name} ${c.price_per_hour}đ`);
  }

  // --- Mồ côi ---
  const orphanVenues = venues.filter((v) => !userIds.has(v.owner_id));
  const liveVenueIds = new Set(venues.filter((v) => userIds.has(v.owner_id)).map((v) => v.venue_id));
  const orphanCourts = courts.filter((c) => !liveVenueIds.has(c.venue_id));
  const liveCourtIds = new Set(courts.filter((c) => liveVenueIds.has(c.venue_id)).map((c) => c.court_id));
  const orphanSchedules = schedules.filter((s) => !liveCourtIds.has(s.court_id));

  console.log("\n=== Dữ liệu mồ côi ===");
  console.log(`venues:          ${orphanVenues.map((v) => `${v.venue_id}(${v.owner_id})`).join(", ") || "không có"}`);
  console.log(`courts:          ${orphanCourts.map((c) => c.court_id).join(", ") || "không có"}`);
  console.log(`court_schedules: ${orphanSchedules.length} dòng`);

  if (DELETE) {
    const booked = new Set(await BookingDetail.distinct("court_id", { court_id: { $in: orphanCourts.map((c) => c.court_id) } }));
    const courtIds = orphanCourts.map((c) => c.court_id).filter((id) => !booked.has(id));
    const keepVenues = new Set(orphanCourts.filter((c) => booked.has(c.court_id)).map((c) => c.venue_id));
    const venueIds = orphanVenues.map((v) => v.venue_id).filter((id) => !keepVenues.has(id));

    const s = await db.collection("court_schedules").deleteMany({ court_id: { $in: [...courtIds, ...orphanSchedules.map((x) => x.court_id)] } });
    const c = await db.collection("courts").deleteMany({ court_id: { $in: courtIds } });
    const v = await db.collection("venues").deleteMany({ venue_id: { $in: venueIds } });
    console.log(`\nĐã xoá: ${v.deletedCount} venues, ${c.deletedCount} courts, ${s.deletedCount} court_schedules.`);
    if (booked.size) console.log(`Giữ lại (đã có người đặt): ${[...booked].join(", ")}`);
  } else if (orphanVenues.length || orphanCourts.length || orphanSchedules.length) {
    console.log("\nChạy lại với --delete để xoá.");
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
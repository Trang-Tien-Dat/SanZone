/**
 * Khai báo sân ghép cho sân ĐÃ CÓ (tạo trước khi có tính năng ghép sân).
 *
 *   node scripts/setCourtParts.js <sân_ghép> <sân_con_1> <sân_con_2> ...
 *   node scripts/setCourtParts.js C060 C052 C053        # Sân 7 = Sân 5 C052 + C053
 *   node scripts/setCourtParts.js C060                  # bỏ ghép, thành sân riêng
 *   node scripts/setCourtParts.js --list V015           # xem các sân của cụm V015
 */
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const courts = mongoose.connection.collection("courts");
  const [first, ...rest] = process.argv.slice(2);

  if (!first) {
    console.log("Cách dùng: node scripts/setCourtParts.js <court_id> [court_id con ...]  |  --list <venue_id>");
  } else if (first === "--list") {
    const list = await courts.find({ venue_id: rest[0] }).sort({ court_id: 1 }).toArray();
    for (const c of list) console.log(c.court_id, "|", c.court_name, "|", c.court_type, "|", (c.parts || []).join("+") || "sân riêng");
  } else {
    const me = await courts.findOne({ court_id: first });
    if (!me) throw new Error(`Không thấy sân ${first}`);
    const kids = await courts.find({ court_id: { $in: rest } }).toArray();
    if (kids.length !== rest.length) throw new Error("Có court_id con không tồn tại.");
    if (kids.some((k) => k.venue_id !== me.venue_id)) throw new Error("Sân con phải cùng cụm sân.");
    if (rest.includes(first)) throw new Error("Sân không thể ghép từ chính nó.");
    await courts.updateOne({ court_id: first }, { $set: { parts: rest } });
    console.log(`✅ ${first} ${me.court_name}: ${rest.length ? "ghép từ " + kids.map((k) => k.court_name).join(" + ") : "sân riêng"}`);
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

/**
 * Sân ghép: sân 7 / sân 11 được ghép từ các sân 5 (hoặc sân 11 ghép từ sân 7).
 *
 * courts: { court_id: "C060", court_name: "Sân 7 số 1", court_type: "7 người", parts: ["C052", "C053"] }
 *   - parts rỗng / không có  -> sân riêng, chiếm 1 "mặt sân" của chính nó
 *   - parts có giá trị       -> chiếm toàn bộ mặt sân của các sân trong parts (bóc nhiều tầng)
 *
 * Luật: 2 sân dùng chung ít nhất 1 mặt sân thì không được đặt trùng giờ.
 */
const mongoose = require("mongoose");

const courtsCol = () => mongoose.connection.collection("courts");

// Các mặt sân thật mà 1 sân chiếm
function unitsOf(court, byId, seen = new Set()) {
  if (!court) return [];
  if (!Array.isArray(court.parts) || !court.parts.length || seen.has(court.court_id)) return [court.court_id];
  seen.add(court.court_id);
  return [...new Set(court.parts.flatMap((id) => unitsOf(byId[id] || { court_id: id }, byId, seen)))];
}

// Mọi sân KHÁC (cùng cụm) dùng chung ít nhất 1 mặt sân với courtId
async function linkedCourts(courtId) {
  const me = await courtsCol().findOne({ court_id: courtId }, { projection: { _id: 0 } });
  if (!me) return [];
  const all = await courtsCol().find({ venue_id: me.venue_id }, { projection: { _id: 0 } }).toArray();
  const byId = Object.fromEntries(all.map((c) => [c.court_id, c]));
  const mine = new Set(unitsOf(me, byId));
  return all
    .filter((c) => c.court_id !== courtId && unitsOf(c, byId).some((u) => mine.has(u)))
    .map((c) => ({ court_id: c.court_id, court_name: c.court_name }));
}

module.exports = { unitsOf, linkedCourts };

// Sân ghép: sân 7 / sân 11 ghép từ các sân 5 (court.parts). Logic giống backend/services/courtLinks.js

// Các mặt sân thật mà 1 sân chiếm
export function unitsOf(court, byId, seen = new Set()) {
  if (!court) return [];
  if (!Array.isArray(court.parts) || !court.parts.length || seen.has(court.court_id)) return [court.court_id];
  seen.add(court.court_id);
  return [...new Set(court.parts.flatMap((id) => unitsOf(byId[id] || { court_id: id }, byId, seen)))];
}

// { court_id: [court_id KHÁC dùng chung mặt sân] }
export function linkedMap(courts) {
  const byId = Object.fromEntries(courts.map((c) => [c.court_id, c]));
  const units = Object.fromEntries(courts.map((c) => [c.court_id, new Set(unitsOf(c, byId))]));
  const map = {};
  for (const a of courts) {
    map[a.court_id] = courts
      .filter((b) => b.court_id !== a.court_id && [...units[b.court_id]].some((u) => units[a.court_id].has(u)))
      .map((b) => b.court_id);
  }
  return map;
}

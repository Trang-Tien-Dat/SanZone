// API chung cho trang khách hàng (FRONTEND — chạy trong trình duyệt, KHÔNG dùng express/mongoose ở đây)
const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Lỗi ${res.status} khi gọi ${path}`);
  // Chấp nhận cả dạng trả về [..] lẫn { data: [..] }
  return Array.isArray(data) ? data : data.data ?? data;
}

// GET /api/sports
export function getSports() {
  return get("/sports");
}

// GET /api/venues?sport_id=SP01&area=Ninh Kiều
export function getVenues({ sportId, area } = {}) {
  const params = new URLSearchParams();
  if (sportId) params.set("sport_id", sportId);
  if (area?.trim()) params.set("area", area.trim());
  const q = params.toString();
  return get(`/venues${q ? `?${q}` : ""}`);
}

// GET /api/courts?venue_id=V001,V002
export function getCourts(venueIds = []) {
  const ids = Array.isArray(venueIds) ? venueIds : [venueIds];
  return get(`/courts${ids.length ? `?venue_id=${encodeURIComponent(ids.join(","))}` : ""}`);
}
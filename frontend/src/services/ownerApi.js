import { getToken } from "../utils/tokenStorage";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Có lỗi xảy ra, vui lòng thử lại.");
  return data.data ?? data;
}

const qs = (params) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null);
  return p.length ? `?${new URLSearchParams(p)}` : "";
};

/* ------------------------------ SÂN & BOOKING ------------------------------ */
export function getMyCourts() {
  return request("/owner/courts");
}

export function getBookings({ from, to, court_id, status } = {}) {
  return request(`/owner/bookings${qs({ from, to, court_id, status })}`);
}

export function updateBookingStatus(booking_id, status) {
  return request(`/owner/bookings/${booking_id}/status`, { method: "PATCH", body: { status } });
}

/**
 * Gộp các booking trong ngày thành "khối" giống lịch bên khách hàng:
 * - nguyên sân, hoặc đủ 2 đội nửa sân  -> status "full"  (đã kín)
 * - mới 1 đội nửa sân                   -> status "half"  (còn nửa sân)
 */
export function toBlocks(bookings) {
  const map = new Map();
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const key = `${b.start_time}-${b.end_time}`;
    const g = map.get(key) ?? { start_time: b.start_time, end_time: b.end_time, full: 0, half: 0, list: [] };
    if (b.booking_type === "half") g.half += 1;
    else g.full += 1;
    g.list.push(b);
    map.set(key, g);
  }
  return [...map.values()]
    .map((g) => ({
      start_time: g.start_time,
      end_time: g.end_time,
      status: g.full > 0 || g.half >= 2 ? "full" : "half",
      bookings: g.list,
      title: `${g.start_time}–${g.end_time}: ${g.list.map((b) => b.customer_name).join(" vs ")}`,
    }))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

/* ------------------------------ DOANH THU (owner_revenue) ------------------------------ */
export function getRevenue({ from, to, court_id } = {}) {
  return request(`/owner/revenue${qs({ from, to, court_id })}`);
}

export function getRevenueTransactions({ from, to, court_id, status, page = 1, limit = 10 } = {}) {
  return request(`/owner/revenue/transactions${qs({ from, to, court_id, status, page, limit })}`);
}

/* ------------------------------ GÓI DỊCH VỤ (phí thuê bao, QR) ------------------------------ */
// -> { active, active_until, days_left, fee, period_days, bank, pending: { ...hoá đơn, qr_url }, history }
export function getSubscription() {
  return request("/owner/subscription");
}

// Chủ sân bấm "Tôi đã chuyển khoản"
export function reportSubscriptionPaid(subscription_id) {
  return request(`/owner/subscription/${subscription_id}/report`, { method: "POST" });
}

// Tên cũ, giữ lại để file nào chưa đổi vẫn chạy
export const getMyPitches = getMyCourts;
/* ------------------------------ KHÁCH HÀNG ------------------------------ */
export function getCustomers() {
  return request("/owner/customers");
}

/* ------------------------------ THÔNG TIN SÂN & TÀI KHOẢN ------------------------------ */
// -> { venue, account, courts }
export function getMyVenue() {
  return request("/owner/venue");
}
// patch: { venue_name, address, phone, open_time, close_time, description, map_url }
export function updateMyVenue(patch) {
  return request("/owner/venue", { method: "PUT", body: patch });
}
export function updateCourt(court_id, patch) {
  return request(`/owner/courts/${encodeURIComponent(court_id)}`, { method: "PUT", body: patch });
}
export function updateAccount(patch) {
  return request("/owner/account", { method: "PUT", body: patch });
}

/* ------------------------------ DANH SÁCH CHẶN ------------------------------ */
export function getBlacklist() {
  return request("/owner/blacklist");
}
// payload: { user_id, duration: "1w" | "1m" | "forever", reason, cancel_upcoming }
export function blockCustomer(payload) {
  return request("/owner/blacklist", { method: "POST", body: payload });
}
export function unblockCustomer(user_id) {
  return request(`/owner/blacklist/${encodeURIComponent(user_id)}`, { method: "DELETE" });
}

import { getToken } from "../utils/tokenStorage";
// Đổi cho khớp với địa chỉ backend (giống authApi.js)
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Có lỗi xảy ra, vui lòng thử lại.");
  return data;
}

// Khung giá (giờ hoạt động) + các khoảng giờ đã đặt của 1 sân trong 1 ngày
// -> { schedules: [{start_time, end_time, price}], blocks: [{start_time, end_time, status, wanted_level}] }
export function getDaySchedule(courtId, date) {
  const q = new URLSearchParams({ court_id: courtId, date });
  return request(`/court-booking/day?${q}`);
}

// payload: { court_id, date, start_time, end_time, booking_type, wanted_level }
export function createBooking(token, payload) {
  return request("/court-booking", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// Các lượt đặt sân của người đang đăng nhập
export function getMyBookings(token) {
  return request("/court-booking/mine", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

const CANCEL_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// Khách tự huỷ lượt đặt
export async function cancelBooking(booking_id) {
  const res = await fetch(`${CANCEL_BASE}/court-booking/${booking_id}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Huỷ đặt sân thất bại.");
  return data;
}
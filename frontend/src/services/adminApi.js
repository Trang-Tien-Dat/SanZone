import { getToken } from "../utils/tokenStorage";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/admin${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Có lỗi xảy ra, vui lòng thử lại.");
  return data;
}

const qs = (params) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null);
  return p.length ? `?${new URLSearchParams(p)}` : "";
};

// Dashboard
export const getStats = () => request("/stats");

// Tài khoản: role 2 = chủ sân, 3 = khách hàng
export const getUsers = (params) => request(`/users${qs(params)}`);
export const setUserStatus = (userID, status) => request(`/users/${userID}/status`, { method: "PATCH", body: { status } });

// Doanh thu admin (phí thuê bao chủ sân)
export const getAdminRevenue = (params) => request(`/revenue${qs(params)}`);

// Khuyến mãi
export const getPromotions = () => request("/promotions");
export const createPromotion = (data) => request("/promotions", { method: "POST", body: data });
export const updatePromotion = (id, data) => request(`/promotions/${id}`, { method: "PUT", body: data });
export const deletePromotion = (id) => request(`/promotions/${id}`, { method: "DELETE" });
export const setPromotionActive = (id, is_active) => request(`/promotions/${id}/active`, { method: "PATCH", body: { is_active } });

// Booking
export const getAdminBookings = (params) => request(`/bookings${qs(params)}`);
export const setBookingStatus = (id, status) => request(`/bookings/${id}/status`, { method: "PATCH", body: { status } });
export const setPaymentStatus = (id, payment_status) => request(`/bookings/${id}/payment`, { method: "PATCH", body: { payment_status } });

// Phí thuê bao chủ sân
export const getSubscriptions = (params) => request(`/subscriptions${qs(params)}`);
export const confirmSubscription = (id) => request(`/subscriptions/${id}/confirm`, { method: "PATCH" });
export const rejectSubscription = (id) => request(`/subscriptions/${id}/reject`, { method: "PATCH" });
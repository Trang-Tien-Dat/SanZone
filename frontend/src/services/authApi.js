// Đổi cho khớp với địa chỉ backend đang dùng trong services/api.js
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

export async function loginRequest(identifier, password) {
  // gửi trường chung; giữ cả email để backend cũ vẫn chạy khi nhập email
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export function getMe(token) {
  return request("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  }).then((data) => data.user);
}
export async function registerRequest(payload) {
     const res = await fetch(`${API_URL}/auth/register`, {   
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(payload),
     });
     const data = await res.json().catch(() => ({}));
     if (!res.ok) throw new Error(data.message || "Đăng ký thất bại");
     return data;
   }
// ---------- Sân yêu thích (wishlist) ----------
const authHeader = (token) => ({ Authorization: `Bearer ${token}` });
export const getFavorites = (token) => request("/auth/favorites", { headers: authHeader(token) });
export const toggleFavorite = (token, venueId) =>
  request(`/auth/favorites/${encodeURIComponent(venueId)}`, { method: "POST", headers: authHeader(token) });
export const mergeFavorites = (token, venueIds) =>
  request("/auth/favorites/merge", { method: "POST", headers: authHeader(token), body: JSON.stringify({ venue_ids: venueIds }) });

// ---------- Tài khoản người dùng ----------
// Các hàm dưới trả về { user } (user mới nhất sau khi sửa)
export const updateProfile = (token, patch) =>
  request("/auth/profile", { method: "PUT", headers: authHeader(token), body: JSON.stringify(patch) });
export const updateTeams = (token, teams, defaultTeam) =>
  request("/auth/teams", { method: "PUT", headers: authHeader(token), body: JSON.stringify({ teams, default: defaultTeam }) });
export const deleteAvatar = (token) => request("/auth/avatar", { method: "DELETE", headers: authHeader(token) });
export async function uploadAvatar(token, file) {
  const fd = new FormData();
  fd.append("avatar", file);
  // Không đặt Content-Type: trình duyệt tự thêm boundary cho FormData
  const res = await fetch(`${API_URL}/auth/avatar`, { method: "POST", headers: authHeader(token), body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Tải ảnh thất bại.");
  return data;
}

// Đổi mật khẩu (khách, chủ sân, admin đều dùng)
export const changePassword = (token, currentPassword, newPassword) =>
  request("/auth/password", {
    method: "PUT",
    headers: authHeader(token),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });

// Gửi mã OTP xác minh email khi đăng ký -> { message, resend_after, ttl_minutes }
export const sendRegisterOtp = (email, phone) =>
  request("/auth/register/send-otp", { method: "POST", body: JSON.stringify({ email, phone }) });

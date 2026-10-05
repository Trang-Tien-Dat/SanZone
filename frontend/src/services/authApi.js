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
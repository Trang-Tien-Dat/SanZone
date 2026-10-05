import { getToken } from "../utils/tokenStorage";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// Không tự đặt Content-Type: trình duyệt tự thêm boundary cho FormData
export async function uploadVenueImages(files) {
  const fd = new FormData();
  files.forEach((f) => fd.append("images", f));
  const res = await fetch(`${BASE_URL}/owner/venue/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Tải ảnh thất bại.");
  return data.images;
}
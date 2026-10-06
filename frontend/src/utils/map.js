// Bản đồ Google cho 1 cụm sân (không cần API key)
const hasCoords = (v) => Number.isFinite(v?.lat) && Number.isFinite(v?.lng);
const placeQuery = (v) => [v?.venue_name, v?.address].filter(Boolean).join(", ");

// Có link Google Maps hoặc toạ độ do chủ sân nhập
export const hasMap = (v) => Boolean(v?.map_url) || hasCoords(v);

// Khung bản đồ nhúng (iframe)
export function mapEmbedUrl(v) {
  const q = hasCoords(v) ? `${v.lat},${v.lng}` : placeQuery(v);
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&hl=vi&output=embed`;
}

// Mở Google Maps (app trên điện thoại / tab mới trên máy tính)
export function mapOpenUrl(v) {
  if (v?.map_url) return v.map_url;
  const q = hasCoords(v) ? `${v.lat},${v.lng}` : placeQuery(v);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// Chỉ đường từ vị trí hiện tại tới sân
export function mapDirectionsUrl(v) {
  const q = hasCoords(v) ? `${v.lat},${v.lng}` : placeQuery(v);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export const formatVND = (n) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(
    Number(n) || 0
  );

// Rút gọn: 1.250.000 -> "1,3tr", 850.000 -> "850k"
export function formatShortVND(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(".", ",")}tr`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

// Ngày dạng YYYY-MM-DD theo giờ máy (không dùng toISOString để tránh lệch múi giờ)
export function toDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayStr = () => toDateStr(new Date());

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
}

export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDateVN(dateStr, opts = { weekday: "short", day: "2-digit", month: "2-digit" }) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("vi-VN", opts).format(new Date(y, m - 1, d));
}

export const hourOf = (time) => Number(String(time).slice(0, 2));
export const toTime = (h) => `${String(h).padStart(2, "0")}:00`;

export const BOOKING_STATUS = {
  pending: { label: "Chờ xác nhận", cls: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  confirmed: { label: "Đã xác nhận", cls: "bg-pitch-100 text-pitch-700 ring-pitch-600/25" },
  completed: { label: "Hoàn thành", cls: "bg-sky-50 text-sky-800 ring-sky-600/25" },
  cancelled: { label: "Đã huỷ", cls: "bg-red-50 text-red-700 ring-red-600/25" },
};

// Trạng thái được tính vào doanh thu
export const REVENUE_STATUSES = ["confirmed", "completed"];

// Trạng thái dòng doanh thu (collection owner_revenue)
export const REVENUE_STATUS = {
  paid: { label: "Đã thanh toán", cls: "bg-pitch-100 text-pitch-700 ring-pitch-600/25" },
  pending: { label: "Chờ thanh toán", cls: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  refunded: { label: "Đã hoàn tiền", cls: "bg-red-50 text-red-700 ring-red-600/25" },
};

// "2026-09-26T08:30:00Z" -> "26/09/2026 15:30" (giờ Việt Nam)
export function formatDateTimeVN(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}
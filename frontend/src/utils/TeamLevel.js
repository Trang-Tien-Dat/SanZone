// Trình độ đội – value lưu trong DB, label hiển thị
export const TEAM_LEVELS = [
  { value: "manh", label: "Mạnh" },
  { value: "trung_binh_manh", label: "Trung bình mạnh" },
  { value: "trung_binh", label: "Trung bình" },
  { value: "trung_binh_yeu", label: "Trung bình yếu" },
  { value: "yeu", label: "Yếu" },
];

export function levelLabel(value) {
  const found = TEAM_LEVELS.find((l) => l.value === value);
  return found ? found.label : "";
}
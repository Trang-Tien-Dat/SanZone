// Các hàm xử lý giờ dùng cho trang đặt sân (logic giống backend)

export const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const toHM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const roundK = (n) => Math.round(n / 1000) * 1000;

export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} giờ ${m} phút`;
  if (h) return `${h} giờ`;
  return `${m} phút`;
}

// Giá theo phút dựa trên khung giá; null nếu có đoạn ngoài giờ hoạt động
export function calcPrice(schedules, start, end) {
  let total = 0;
  let covered = 0;
  for (const s of schedules) {
    const a = Math.max(start, toMin(s.start_time));
    const b = Math.min(end, toMin(s.end_time));
    if (b > a) {
      total += (s.price * (b - a)) / 60;
      covered += b - a;
    }
  }
  return covered < end - start ? null : roundK(total);
}

const range = (b) => `${b.start_time}–${b.end_time}`;

// Kiểm tra khoảng giờ [start, end) với các khối đã đặt trong ngày
// -> { ok, mode: "full" | "host" | "join", host?, message? }
export function analyzeRange(blocks, start, end, type) {
  const overlapping = blocks.filter(
    (b) => start < toMin(b.end_time) && toMin(b.start_time) < end
  );
  if (overlapping.length === 0) return { ok: true, mode: type === "half" ? "host" : "full" };

  const linkedHit = overlapping.find((b) => b.linked_court);
  if (linkedHit) {
    return {
      ok: false,
      message: `Giờ này mặt sân đang được dùng cho ${linkedHit.linked_court} (${range(linkedHit)}). Vui lòng chọn giờ hoặc sân khác.`,
    };
  }

  const list = overlapping.map(range).join(", ");
  const single = overlapping.length === 1 ? overlapping[0] : null;
  const sameRange =
    single && toMin(single.start_time) === start && toMin(single.end_time) === end;

  if (type === "half" && single && single.status === "half") {
    if (sameRange) return { ok: true, mode: "join", host: single };
    return {
      ok: false,
      message: `Trùng với kèo nửa sân ${range(single)}. Muốn ghép đội, hãy chọn đúng giờ ${range(single)}.`,
    };
  }
  if (type === "full" && single && single.status === "half" && sameRange) {
    return {
      ok: false,
      message: `Giờ này đã có đội đặt nửa sân. Chọn kiểu "Nửa sân" nếu muốn vào ghép với họ.`,
    };
  }
  return { ok: false, message: `Giờ này đã được đặt (trùng với ${list}). Vui lòng chọn giờ khác.` };
}
import { toMin } from "../utils/bookingTime";

/**
 * Thanh lịch trong ngày: các giờ đã đặt + khoảng đang chọn.
 * Tách ra từ CourtBookingPage để trang khách hàng và trang chủ sân dùng chung.
 *
 * blocks: [{ start_time: "18:00", end_time: "19:30", status: "full" | "half", title? }]
 */
export default function DayTimeline({ open, close, blocks, selStart, selEnd, conflict, onBlockClick }) {
  const span = close - open;
  const pct = (m) => ((m - open) / span) * 100;
  const stepH = span > 10 * 60 ? 2 : 1;
  const ticks = [];
  for (let h = Math.ceil(open / 60); h * 60 <= close; h += stepH) ticks.push(h);

  return (
    <div>
      <div className="relative h-11 overflow-hidden rounded-lg bg-pitch-100">
        {blocks.map((b, i) => (
          <div
            key={i}
            title={b.title ?? `${b.start_time}–${b.end_time}`}
            onClick={onBlockClick ? () => onBlockClick(b) : undefined}
            className={`absolute inset-y-0 border-x border-white/60 ${
              b.status === "full" ? "bg-pitch-700" : "bg-amber-400"
            } ${onBlockClick ? "cursor-pointer hover:brightness-110" : ""}`}
            style={{
              left: `${pct(toMin(b.start_time))}%`,
              width: `${pct(toMin(b.end_time)) - pct(toMin(b.start_time))}%`,
            }}
          />
        ))}
        {selStart != null && selEnd != null && selEnd > selStart && (
          <div
            className={`absolute inset-y-1 rounded-md border-2 ${
              conflict ? "border-red-600 bg-red-500/30" : "border-whistle bg-whistle/40"
            }`}
            style={{ left: `${pct(selStart)}%`, width: `${pct(selEnd) - pct(selStart)}%` }}
          />
        )}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-ink-soft">
        {ticks.map((h) => (
          <span key={h} className="absolute -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>
            {h}h
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-pitch-100 ring-1 ring-edge" /> Trống
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-pitch-700" /> Đã kín
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-amber-400" /> Còn nửa sân
        </span>
        {selStart != null && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-whistle" /> Giờ đang chọn
          </span>
        )}
      </div>
    </div>
  );
}
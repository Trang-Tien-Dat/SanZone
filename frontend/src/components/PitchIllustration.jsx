// Hình minh hoạ mặt sân (bóng đá hoặc cầu lông).
// - Chỉ truyền sport -> hình tĩnh (dùng trong thẻ chọn sân)
// - Truyền thêm mode + onSelect -> bấm nửa sân để đặt nửa sân, bấm "Cả sân" để đặt nguyên sân

const LINE = "rgba(255,255,255,0.85)";

function FootballLines() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <rect key={i} x={i * 30} y="0" width="30" height="180" fill={i % 2 ? "#1c7342" : "#218049"} />
      ))}
      <g fill="none" stroke={LINE} strokeWidth="2">
        <rect x="12" y="12" width="276" height="156" />
        <line x1="150" y1="12" x2="150" y2="168" />
        <circle cx="150" cy="90" r="24" />
        <rect x="12" y="52" width="42" height="76" />
        <rect x="12" y="72" width="16" height="36" />
        <rect x="246" y="52" width="42" height="76" />
        <rect x="272" y="72" width="16" height="36" />
        <rect x="5" y="78" width="7" height="24" />
        <rect x="288" y="78" width="7" height="24" />
      </g>
      <circle cx="150" cy="90" r="2.5" fill={LINE} />
    </>
  );
}

function BadmintonLines() {
  return (
    <>
      <rect x="0" y="0" width="300" height="180" fill="#1c7342" />
      <g fill="none" stroke={LINE} strokeWidth="2">
        <rect x="20" y="20" width="260" height="140" />
        <line x1="20" y1="32" x2="280" y2="32" />
        <line x1="20" y1="148" x2="280" y2="148" />
        <line x1="36" y1="20" x2="36" y2="160" />
        <line x1="264" y1="20" x2="264" y2="160" />
        <line x1="110" y1="20" x2="110" y2="160" />
        <line x1="190" y1="20" x2="190" y2="160" />
        <line x1="20" y1="90" x2="110" y2="90" />
        <line x1="190" y1="90" x2="280" y2="90" />
      </g>
      {/* lưới */}
      <line x1="150" y1="12" x2="150" y2="168" stroke="#f5c542" strokeWidth="3" />
    </>
  );
}

const hatch = {
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0, rgba(255,255,255,0.22) 6px, transparent 6px, transparent 12px)",
};

export default function PitchIllustration({ sport = "SP01", mode, onSelect, opponentText }) {
  const interactive = typeof onSelect === "function";

  return (
    <div className="relative overflow-hidden rounded-xl">
      <svg viewBox="0 0 300 180" className="block h-auto w-full" aria-hidden="true">
        {sport === "SP02" ? <BadmintonLines /> : <FootballLines />}
      </svg>

      {interactive && (
        <>
          {/* Vùng đang chọn */}
          {mode === "full" && (
            <div className="pointer-events-none absolute inset-[5%] flex items-end justify-center rounded-lg bg-whistle/25 pb-3 ring-2 ring-whistle">
              <span className="rounded-full bg-pitch-900/85 px-3 py-1 text-sm font-bold text-white">
                Đội bạn · Nguyên sân
              </span>
            </div>
          )}
          {mode === "half" && (
            <>
              <div className="pointer-events-none absolute top-[5%] bottom-[5%] left-[5%] flex w-[44%] items-center justify-center rounded-lg bg-whistle/25 ring-2 ring-whistle">
                <span className="rounded-full bg-pitch-900/85 px-3 py-1 text-sm font-bold text-white">
                  Đội bạn
                </span>
              </div>
              <div
                className="pointer-events-none absolute top-[5%] right-[5%] bottom-[5%] flex w-[44%] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-white/70"
                style={hatch}
              >
                <span className="rounded-full bg-pitch-900/85 px-3 py-1 text-center text-sm font-bold text-white">
                  Đội ghép
                  {opponentText && (
                    <span className="block text-xs font-medium text-whistle">{opponentText}</span>
                  )}
                </span>
              </div>
            </>
          )}

          {/* Vùng bấm: mỗi nửa sân -> nửa sân */}
          <button
            type="button"
            onClick={() => onSelect("half")}
            aria-label="Chọn nửa sân"
            className="absolute inset-y-0 left-0 w-1/2 transition hover:bg-white/10"
          />
          <button
            type="button"
            onClick={() => onSelect("half")}
            aria-label="Chọn nửa sân"
            className="absolute inset-y-0 right-0 w-1/2 transition hover:bg-white/10"
          />
          {/* Nút giữa sân -> nguyên sân */}
          <button
            type="button"
            onClick={() => onSelect("full")}
            className={`absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-3.5 py-1.5 text-xs font-extrabold shadow-md transition sm:text-sm ${
              mode === "full"
                ? "bg-whistle text-pitch-900"
                : "bg-white text-pitch-700 hover:bg-whistle hover:text-pitch-900"
            }`}
          >
            Cả sân
          </button>
        </>
      )}
    </div>
  );
}
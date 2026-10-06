import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  CalendarDays,
  CheckCircle2,
  Users,
  Swords,
  Clock,
  AlertCircle,
  Shield,
} from "lucide-react";
import { getCourts } from "../../services/api";
import { getDaySchedule, createBooking, getBlockStatus } from "../../services/BookingApi";
import { TEAM_LEVELS, levelLabel } from "../../utils/TeamLevel";
import { toMin, toHM, calcPrice, analyzeRange, formatDuration, roundK } from "../../utils/bookingTime";
import { useAuth } from "../../context/AuthContext";
import PitchIllustration from "../../components/PitchIllustration";
import { mapOpenUrl } from "../../utils/map";

// ---------- helpers ----------
const toDateStr = (d) => d.toLocaleDateString("sv-SE"); // "2026-09-25"
const formatMoney = (n) => `${Number(n).toLocaleString("vi-VN")}đ`;
const STEP = 30; // bước chọn giờ: 30 phút
const MATCH_DAYS = 7; // hiện kèo chờ ghép trong bao nhiêu ngày tới

function formatDateVN(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// "Hôm nay" / "Ngày mai" / "T5 08/10"
function shortDay(str, today, tomorrow) {
  if (str === today) return "Hôm nay";
  if (str === tomorrow) return "Ngày mai";
  const [y, m, d] = str.split("-").map(Number);
  const wd = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][new Date(y, m - 1, d).getDay()];
  return `${wd} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

const selectClass =
  "h-11 w-full rounded-lg border-[1.5px] border-edge bg-white px-3 text-[0.95rem] outline-none transition focus:border-pitch-600 focus:ring-3 focus:ring-pitch-600/15 disabled:bg-pitch-50";

// ---------- small UI pieces ----------
function Step({ number, title, children, right }) {
  return (
    <section className="rounded-2xl border border-edge bg-white p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-full bg-pitch-700 text-sm font-extrabold text-white">
            {number}
          </span>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function SummaryRow({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-ink-soft">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

// Thanh lịch trong ngày: các giờ đã đặt + khoảng đang chọn
function DayTimeline({ open, close, blocks, selStart, selEnd, conflict }) {
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
            title={b.linked_court ? `Bận · ${b.linked_court} (dùng chung mặt sân) ${b.start_time}–${b.end_time}` : `${b.start_time}–${b.end_time}`}
            className={`absolute inset-y-0 border-x border-white/60 ${
              b.linked_court ? "bg-slate-400" : b.status === "full" ? "bg-pitch-700" : "bg-amber-400"
            }`}
            style={{
              ...(b.linked_court && { backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,.35) 0 4px, transparent 4px 9px)" }),
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
          <span
            key={h}
            className="absolute -translate-x-1/2"
            style={{ left: `${pct(h * 60)}%` }}
          >
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
        {blocks.some((b) => b.linked_court) && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-slate-400" /> Bận do sân ghép
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-whistle" /> Giờ bạn chọn
        </span>
      </div>
    </div>
  );
}

// ---------- page ----------
export default function CourtBookingPage({ venue, onBack }) {
  const { user, token } = useAuth();
  const today = toDateStr(new Date());
  const tomorrow = addDays(1);
  const sport = venue.sport_id;

  const [courts, setCourts] = useState([]);
  const [loadingCourts, setLoadingCourts] = useState(true);
  const [courtsError, setCourtsError] = useState("");
  const [courtId, setCourtId] = useState(null);

  const [bookingType, setBookingType] = useState("full"); // full | half
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(""); // "18:00"
  const [end, setEnd] = useState("");     // "19:30"
  const [level, setLevel] = useState(null);
  const [myTeam, setMyTeam] = useState(""); // đội hiện cho đối thủ khi đặt nửa sân ("" = đội mặc định)

  const [day, setDay] = useState({ schedules: [], blocks: [] });
  const [loadingDay, setLoadingDay] = useState(false);
  const [dayError, setDayError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [matchBlocks, setMatchBlocks] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState(null);

  const timeStepRef = useRef(null);

  // Khách bị chủ sân chặn -> báo ngay, khoá nút đặt
  const [blockInfo, setBlockInfo] = useState(null);
  useEffect(() => {
    if (!user || !token) return setBlockInfo(null);
    getBlockStatus(token, venue.venue_id)
      .then((r) => setBlockInfo(r.blocked ? r : null))
      .catch(() => setBlockInfo(null));
  }, [user, token, venue.venue_id]);

  // ----- Các sân con của cụm sân -----
  useEffect(() => {
    getCourts([venue.venue_id])
      .then((list) => {
        const mine = list.filter((c) => c.venue_id === venue.venue_id && c.status !== "inactive");
        setCourts(mine);
        if (mine.length > 0) setCourtId(mine[0].court_id);
      })
      .catch((err) => setCourtsError(err.message))
      .finally(() => setLoadingCourts(false));
  }, [venue.venue_id]);

  // ----- Kèo nửa sân chờ ghép của MỌI sân trong cụm, 7 ngày tới -----
  useEffect(() => {
    if (!courts.length) {
      setLoadingMatches(false);
      return;
    }
    setLoadingMatches(true);
    const days = Array.from({ length: MATCH_DAYS }, (_, i) => addDays(i));
    Promise.all(
      courts.flatMap((c) =>
        days.map((d) =>
          getDaySchedule(c.court_id, d)
            .then((r) =>
              (r.blocks || [])
                .filter((b) => b.status === "half")
                .map((b) => ({ ...b, date: d, court_id: c.court_id, court_name: c.court_name }))
            )
            .catch(() => [])
        )
      )
    )
      .then((list) => setMatchBlocks(list.flat()))
      .finally(() => setLoadingMatches(false));
  }, [courts, reloadKey]);

  // ----- Giờ hoạt động + lịch đã đặt của sân trong ngày -----
  useEffect(() => {
    if (!courtId || !date) return;
    setLoadingDay(true);
    setDayError("");
    getDaySchedule(courtId, date)
      .then(setDay)
      .catch((err) => setDayError(err.message))
      .finally(() => setLoadingDay(false));
  }, [courtId, date, reloadKey]);

  const nowAll = new Date().getHours() * 60 + new Date().getMinutes();
  const openMatches = useMemo(
    () =>
      matchBlocks
        // giờ hiện tại tính lại mỗi lần lọc (không đưa vào deps để khỏi tính lại mỗi giây)
        .filter((b) => b.date > today || toMin(b.start_time) > new Date().getHours() * 60 + new Date().getMinutes())
        .map((b) => ({ ...b, key: `${b.date}|${b.court_id}|${b.start_time}-${b.end_time}` }))
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.start_time).localeCompare(String(b.start_time))),
    [matchBlocks, today]
  );

  // ----- Giờ hoạt động -> danh sách giờ để chọn -----
  const hasSchedule = day.schedules.length > 0;
  const open = hasSchedule ? Math.min(...day.schedules.map((s) => toMin(s.start_time))) : 0;
  const close = hasSchedule ? Math.max(...day.schedules.map((s) => toMin(s.end_time))) : 0;
  const nowMin = date === today ? nowAll : -1;

  const startOptions = [];
  // Chỉ hiện giờ chưa qua (hôm nay thì bỏ các giờ đã qua)
  for (let m = open; m + STEP <= close; m += STEP) if (m > nowMin) startOptions.push(m);
  const startMin = start ? toMin(start) : null;
  const endOptions = [];
  if (startMin != null) for (let m = startMin + STEP; m <= close; m += STEP) endOptions.push(m);

  function pickStart(value) {
    setStart(value);
    // giữ nguyên thời lượng nếu được, không thì mặc định 1 giờ
    const s = toMin(value);
    const oldLen = start && end ? toMin(end) - toMin(start) : 60;
    const e = Math.min(s + oldLen, close);
    setEnd(e > s ? toHM(e) : "");
  }

  function pickDuration(len) {
    if (startMin == null) return;
    const e = startMin + len;
    if (e <= close) setEnd(toHM(e));
  }

  // Bấm 1 kèo ở đầu trang -> chọn sẵn sân, ngày, giờ, nửa sân
  function joinMatch(m) {
    setCourtId(m.court_id);
    setDate(m.date);
    setBookingType("half");
    setStart(m.start_time);
    setEnd(m.end_time);
    setTimeout(() => timeStepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // Bấm "Ghép kèo" ở trang chủ -> mở trang này với kèo đã chọn sẵn
  const preselectDone = useRef(false);
  useEffect(() => {
    const m = venue.preselect;
    if (!m || preselectDone.current || !courts.some((c) => c.court_id === m.court_id)) return;
    preselectDone.current = true;
    setCourtId(m.court_id);
    setDate(m.date);
    setBookingType("half");
    setStart(m.start_time);
    setEnd(m.end_time);
    setTimeout(() => timeStepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [courts, venue.preselect]);

  // Tìm "sân trống giờ X" ở trang chủ rồi bấm Đặt sân -> chọn sẵn sân, ngày, giờ
  const prefillDone = useRef(false);
  useEffect(() => {
    const p = venue.prefill;
    if (!p || prefillDone.current || !courts.length) return;
    prefillDone.current = true;
    if (courts.some((c) => c.court_id === p.court_id)) setCourtId(p.court_id);
    setDate(p.date);
    setBookingType("full");
    setStart(p.start);
    setEnd(p.end);
    setTimeout(() => timeStepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [courts, venue.prefill]);

  function changeCourt(id) {
    setCourtId(id);
    setStart("");
    setEnd("");
  }

  // ----- Kiểm tra giờ đã chọn -----
  const endMin = end ? toMin(end) : null;
  const hasRange = startMin != null && endMin != null && endMin > startMin;
  const basePrice = hasRange ? calcPrice(day.schedules, startMin, endMin) : null;
  const outOfHours = hasRange && basePrice === null;
  const isPastStart = hasRange && startMin <= nowMin;
  const analysis = hasRange && !outOfHours ? analyzeRange(day.blocks, startMin, endMin, bookingType) : null;
  const rangeOk = hasRange && !outOfHours && !isPastStart && analysis?.ok;

  const price = basePrice == null ? 0 : bookingType === "half" ? roundK(basePrice / 2) : basePrice;
  const hostingHalf = rangeOk && analysis.mode === "host";
  const joining = rangeOk && analysis.mode === "join";
  const selectedMatchKey = bookingType === "half" && hasRange ? `${date}|${courtId}|${start}-${end}` : null;

  const court = courts.find((c) => c.court_id === courtId);
  const canSubmit = Boolean(user) && !blockInfo && rangeOk && (!hostingHalf || level) && !submitting;

  let statusBox = null;
  if (!hasRange) {
    statusBox = { tone: "muted", text: "Chọn giờ bắt đầu và giờ kết thúc để kiểm tra sân trống." };
  } else if (outOfHours) {
    statusBox = { tone: "error", text: "Khung giờ này nằm ngoài giờ hoạt động của sân." };
  } else if (isPastStart) {
    statusBox = { tone: "error", text: "Giờ bắt đầu đã qua, vui lòng chọn giờ khác." };
  } else if (!analysis.ok) {
    statusBox = { tone: "error", text: analysis.message };
  } else if (joining) {
    statusBox = {
      tone: "ok",
      text: `${analysis.host.team_name ? `Đội ${analysis.host.team_name}` : "Có đội"} đang chờ ghép giờ này${
        analysis.host.wanted_level ? `, tìm đội ${levelLabel(analysis.host.wanted_level).toLowerCase()}` : ""
      }. Bạn sẽ vào ghép với họ.`,
    };
  } else {
    statusBox = {
      tone: "ok",
      text: `Khung ${start}–${end} (${formatDuration(endMin - startMin)}) còn trống${
        hostingHalf ? ", bạn sẽ mở kèo nửa sân và chờ đội khác vào ghép" : ", có thể đặt"
      }.`,
    };
  }

  async function handleSubmit() {
    setSubmitError("");
    setSubmitting(true);
    try {
      const data = await createBooking(token, {
        court_id: courtId,
        date,
        start_time: start,
        end_time: end,
        booking_type: bookingType,
        wanted_level: hostingHalf ? level : null,
        team_name: bookingType === "half" ? myTeam || user?.team_name || "" : "",
      });
      setResult({
        bookingId: data.booking.booking_id,
        courtName: court?.court_name,
        date,
        start,
        end,
        bookingType,
        mode: data.mode,
        level: hostingHalf ? level : null,
        price: data.detail?.price ?? price,
      });
    } catch (err) {
      setSubmitError(err.message);
      setReloadKey((k) => k + 1); // tải lại lịch để thấy ai vừa đặt
    } finally {
      setSubmitting(false);
    }
  }

  function bookAgain() {
    setResult(null);
    setStart("");
    setEnd("");
    setLevel(null);
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-pitch-50 font-sans leading-relaxed text-ink">
      {/* Top bar */}
      <header className="bg-pitch-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <button
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white/75 transition hover:text-white"
          >
            <ArrowLeft size={16} /> Quay lại trang chủ
          </button>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{venue.venue_name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
            <MapPin size={14} className="text-whistle" /> {venue.address}
            <a
              href={mapOpenUrl(venue)}
              target="_blank"
              rel="noreferrer"
              className="ml-2 font-semibold text-whistle underline-offset-4 hover:underline"
            >
              Xem bản đồ
            </a>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {result ? (
          /* ---------- Đặt thành công ---------- */
          <div className="mx-auto max-w-lg rounded-2xl border border-edge bg-white p-7 text-center">
            <CheckCircle2 size={52} className="mx-auto mb-3 text-pitch-600" />
            <h2 className="mb-1 text-2xl font-extrabold">Đặt sân thành công</h2>
            <p className="mb-5 text-ink-soft">
              Mã đặt sân <span className="font-bold text-pitch-700">{result.bookingId}</span>
            </p>
            <div className="mb-6 divide-y divide-edge rounded-xl bg-pitch-50 px-4 text-left">
              <SummaryRow label="Sân">{result.courtName}</SummaryRow>
              <SummaryRow label="Ngày">{formatDateVN(result.date)}</SummaryRow>
              <SummaryRow label="Giờ">
                {result.start}–{result.end}
              </SummaryRow>
              <SummaryRow label="Kiểu đặt">
                {result.bookingType === "full"
                  ? "Nguyên sân"
                  : result.mode === "join"
                  ? "Nửa sân · vào ghép"
                  : "Nửa sân · chờ ghép"}
              </SummaryRow>
              {result.level && <SummaryRow label="Tìm đội">{levelLabel(result.level)}</SummaryRow>}
              <SummaryRow label="Tiền sân">
                <span className="text-pitch-700">{formatMoney(result.price)}</span>
              </SummaryRow>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                onClick={bookAgain}
                className="h-11 flex-1 rounded-lg border-[1.5px] border-pitch-700 font-bold text-pitch-700 transition hover:bg-pitch-100"
              >
                Đặt thêm giờ khác
              </button>
              <button
                onClick={onBack}
                className="h-11 flex-1 rounded-lg bg-pitch-700 font-bold text-white transition hover:bg-pitch-600"
              >
                Về trang chủ
              </button>
            </div>
          </div>
        ) : (
          <>
            {blockInfo && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
                <AlertCircle size={22} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Bạn không thể đặt sân tại đây</p>
                  <p className="text-sm">{blockInfo.message} Vui lòng liên hệ chủ sân nếu có nhầm lẫn.</p>
                </div>
              </div>
            )}

            {/* ---------- Kèo nửa sân đang chờ ghép (mọi sân trong cụm) ---------- */}
            <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-bold text-amber-950">
                  <Swords size={18} className="text-amber-600" />
                  Kèo nửa sân đang tìm đối
                  {!loadingMatches && openMatches.length > 0 && (
                    <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-sm font-bold text-amber-950">
                      {openMatches.length}
                    </span>
                  )}
                </h2>
               
              </div>

              {loadingMatches ? (
                <p className="text-sm text-amber-800">Đang tìm kèo...</p>
              ) : openMatches.length === 0 ? (
                <p className="text-sm text-amber-800">
                  Chưa có kèo nào trong {MATCH_DAYS} ngày tới. Đặt nửa sân để mở kèo cho đội khác vào ghép nhé!
                </p>
              ) : (
                <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
                  {openMatches.map((m) => {
                    const active = selectedMatchKey === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => joinMatch(m)}
                        aria-pressed={active}
                        className={`w-52 shrink-0 snap-start rounded-xl border-[1.5px] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                          active ? "border-pitch-700 ring-3 ring-pitch-600/20" : "border-amber-300 hover:border-amber-500"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className={m.date === today ? "text-red-600" : "text-amber-800"}>
                            {shortDay(m.date, today, tomorrow)}
                          </span>
                          <span className="truncate pl-2 text-ink-soft">{m.court_name}</span>
                        </div>
                        <div className="mt-1 text-xl font-extrabold text-ink tabular-nums">
                          {m.start_time}–{m.end_time}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 truncate text-sm font-bold text-pitch-700">
                          <Shield size={14} className="shrink-0" /> {m.team_name || "Đội bí ẩn"}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            {m.wanted_level ? `Tìm đội ${levelLabel(m.wanted_level).toLowerCase()}` : "Trình độ bất kỳ"}
                          </span>
                          <span className={`shrink-0 text-xs font-bold ${active ? "text-pitch-700" : "text-amber-700"}`}>
                            {active ? "✓ Đã chọn" : "Ghép →"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
              <div className="flex flex-col gap-6">
                {/* ---------- 1. Chọn sân ---------- */}
                <Step
                  number="1"
                  title="Chọn sân"
                  right={
                    !loadingCourts && (
                      <span className="rounded-full bg-pitch-100 px-3 py-1 text-sm font-semibold text-pitch-700">
                        {courts.length} sân
                      </span>
                    )
                  }
                >
                  {loadingCourts && <p className="text-sm text-ink-soft">Đang tải danh sách sân...</p>}
                  {courtsError && <p className="text-sm font-medium text-red-700">Lỗi: {courtsError}</p>}
                  {!loadingCourts && !courtsError && courts.length === 0 && (
                    <p className="text-sm text-ink-soft">Cụm sân này chưa có sân nào.</p>
                  )}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                    {courts.map((c) => {
                      const active = c.court_id === courtId;
                      const waiting = openMatches.filter((m) => m.court_id === c.court_id).length;
                      return (
                        <button
                          key={c.court_id}
                          onClick={() => changeCourt(c.court_id)}
                          aria-pressed={active}
                          className={`relative overflow-hidden rounded-xl border-[1.5px] text-left transition ${
                            active
                              ? "border-pitch-700 ring-3 ring-pitch-600/20"
                              : "border-edge hover:border-pitch-600"
                          }`}
                        >
                          {waiting > 0 && (
                            <span className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950 shadow">
                              <Swords size={12} /> {waiting} kèo
                            </span>
                          )}
                          {c.image ? (
                            <img
                              src={c.image}
                              alt={c.court_name}
                              className="block aspect-[5/3] w-full object-cover"
                            />
                          ) : (
                            <PitchIllustration sport={sport} />
                          )}
                          <div className={`p-3 ${active ? "bg-pitch-100" : "bg-white"}`}>
                            <div className="font-bold">{c.court_name}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
                              <Users size={13} /> {c.court_type}
                            </div>
                            {c.parts?.length > 0 && (
                              <div className="mt-0.5 text-xs text-ink-soft">
                                Ghép từ {c.parts.map((id) => courts.find((x) => x.court_id === id)?.court_name ?? id).join(" + ")}
                              </div>
                            )}
                            <div className="mt-1 text-sm font-semibold text-pitch-700">
                              Từ {formatMoney(c.price_per_hour)}/giờ
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Step>

                {/* ---------- 2. Kiểu đặt: bấm trên hình sân ---------- */}
                <Step number="2" title="Kiểu đặt sân">
                  <p className="mb-3 text-sm text-ink-soft">
                    Bấm vào <b>một nửa sân</b> để đặt nửa sân, hoặc bấm <b>Cả sân</b> ở giữa để đặt nguyên sân.
                  </p>
                  <div className="mx-auto max-w-xl">
                    <PitchIllustration
                      sport={sport}
                      mode={bookingType}
                      onSelect={setBookingType}
                      opponentText={
                        joining && (analysis.host.team_name || analysis.host.wanted_level)
                          ? [analysis.host.team_name, analysis.host.wanted_level && `Trình độ ${levelLabel(analysis.host.wanted_level).toLowerCase()}`]
                              .filter(Boolean)
                              .join(" · ")
                          : level && bookingType === "half"
                          ? `Tìm đội ${levelLabel(level).toLowerCase()}`
                          : ""
                      }
                    />
                  </div>
                  <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                    {[
                      { value: "full", title: "Nguyên sân", desc: "Đội bạn dùng cả sân, trả đủ tiền." },
                      { value: "half", title: "Nửa sân", desc: "Chia đôi tiền, ghép với một đội khác." },
                    ].map((opt) => {
                      const active = bookingType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setBookingType(opt.value)}
                          aria-pressed={active}
                          className={`flex items-start gap-3 rounded-xl border-[1.5px] p-3.5 text-left transition ${
                            active ? "border-pitch-700 bg-pitch-100" : "border-edge hover:border-pitch-600"
                          }`}
                        >
                          <span
                            className={`mt-1 grid size-4.5 shrink-0 place-items-center rounded-full border-2 ${
                              active ? "border-pitch-700" : "border-edge"
                            }`}
                          >
                            {active && <span className="size-2 rounded-full bg-pitch-700" />}
                          </span>
                          <span>
                            <span className="block font-bold">{opt.title}</span>
                            <span className="block text-sm text-ink-soft">{opt.desc}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Step>

                {/* ---------- 3. Ngày & giờ ---------- */}
                <div ref={timeStepRef} className="scroll-mt-6">
                  <Step number="3" title="Chọn ngày & giờ đá">
                    <div className="mb-5 flex flex-wrap items-center gap-2.5">
                      <label className="flex h-11 items-center gap-2.5 rounded-lg border-[1.5px] border-edge bg-white px-3.5 transition focus-within:border-pitch-600 focus-within:ring-3 focus-within:ring-pitch-600/15">
                        <CalendarDays size={16} className="shrink-0 text-pitch-600" />
                        <input
                          type="date"
                          value={date}
                          min={today}
                          onChange={(e) => e.target.value && setDate(e.target.value)}
                          className="bg-transparent text-[0.95rem] outline-none"
                          aria-label="Ngày đá"
                        />
                      </label>
                      {[
                        { label: "Hôm nay", value: today },
                        { label: "Ngày mai", value: tomorrow },
                        { label: "Ngày kia", value: addDays(2) },
                      ].map((q) => (
                        <button
                          key={q.label}
                          onClick={() => setDate(q.value)}
                          className={`h-9 rounded-full px-3.5 text-sm font-semibold transition ${
                            date === q.value
                              ? "bg-pitch-700 text-white"
                              : "bg-pitch-100 text-pitch-700 hover:bg-pitch-100/70"
                          }`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>

                    {loadingDay && <p className="text-sm text-ink-soft">Đang tải lịch sân...</p>}
                    {dayError && <p className="text-sm font-medium text-red-700">Lỗi: {dayError}</p>}
                    {!loadingDay && !dayError && courtId && !hasSchedule && (
                      <p className="text-sm text-ink-soft">
                        Sân này chưa có giờ hoạt động. Thêm dữ liệu vào bảng court_schedules.
                      </p>
                    )}

                    {!loadingDay && !dayError && hasSchedule && (
                      <>
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
                          <Clock size={14} /> Lịch sân · {formatDateVN(date)} · mở cửa {toHM(open)}–{toHM(close)}
                        </p>
                        <DayTimeline
                          open={open}
                          close={close}
                          blocks={day.blocks}
                          selStart={hasRange ? startMin : null}
                          selEnd={hasRange ? endMin : null}
                          conflict={hasRange && !rangeOk}
                        />

                        {/* Ô chọn giờ */}
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor="start-time" className="mb-1.5 block text-sm font-semibold text-ink-soft">
                              Giờ bắt đầu
                            </label>
                            <select
                              id="start-time"
                              value={start}
                              onChange={(e) => pickStart(e.target.value)}
                              className={selectClass}
                            >
                              <option value="">{startOptions.length ? "-- Chọn giờ --" : "Hôm nay đã hết giờ, chọn ngày khác"}</option>
                              {startOptions.map((m) => (
                                <option key={m} value={toHM(m)}>
                                  {toHM(m)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="end-time" className="mb-1.5 block text-sm font-semibold text-ink-soft">
                              Giờ kết thúc
                            </label>
                            <select
                              id="end-time"
                              value={end}
                              onChange={(e) => setEnd(e.target.value)}
                              disabled={!start}
                              className={selectClass}
                            >
                              <option value="">-- Chọn giờ --</option>
                              {endOptions.map((m) => (
                                <option key={m} value={toHM(m)}>
                                  {toHM(m)} ({formatDuration(m - startMin)})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {start && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-sm text-ink-soft">Đá trong:</span>
                            {[60, 90, 120].map((len) => (
                              <button
                                key={len}
                                onClick={() => pickDuration(len)}
                                disabled={startMin + len > close}
                                className={`h-8 rounded-full px-3 text-sm font-semibold transition disabled:opacity-40 ${
                                  hasRange && endMin - startMin === len
                                    ? "bg-pitch-700 text-white"
                                    : "bg-pitch-100 text-pitch-700 hover:bg-pitch-100/70"
                                }`}
                              >
                                {formatDuration(len)}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Kết quả kiểm tra */}
                        <div
                          role="status"
                          className={`mt-4 flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm font-medium ${
                            statusBox.tone === "error"
                              ? "bg-red-50 text-red-700"
                              : statusBox.tone === "ok"
                              ? "bg-pitch-100 text-pitch-700"
                              : "bg-pitch-50 text-ink-soft"
                          }`}
                        >
                          {statusBox.tone === "error" ? (
                            <AlertCircle size={17} className="mt-0.5 shrink-0" />
                          ) : statusBox.tone === "ok" ? (
                            <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                          ) : (
                            <Clock size={17} className="mt-0.5 shrink-0" />
                          )}
                          {statusBox.text}
                        </div>
                      </>
                    )}
                  </Step>
                </div>

                {/* ---------- 4. Trình độ đội muốn tìm ---------- */}
                {bookingType === "half" && !joining && (
                  <Step number="4" title="Trình độ đội muốn tìm">
                    <div className="flex flex-wrap gap-2.5">
                      {TEAM_LEVELS.map((l) => (
                        <button
                          key={l.value}
                          onClick={() => setLevel(l.value)}
                          aria-pressed={level === l.value}
                          className={`h-10 rounded-full border-[1.5px] px-4 text-sm font-semibold transition ${
                            level === l.value
                              ? "border-pitch-700 bg-pitch-700 text-white"
                              : "border-edge text-ink hover:border-pitch-600"
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-ink-soft">
                      Đội khác sẽ thấy giờ của bạn là "Còn nửa sân" kèm trình độ này để vào ghép.
                    </p>
                  </Step>
                )}

                {/* ---------- Đá dưới tên đội nào (nửa sân) ---------- */}
                {bookingType === "half" && user?.teams?.length > 0 && (
                  <Step number={joining ? "4" : "5"} title="Đá dưới tên đội">
                    <div className="flex flex-wrap gap-2.5">
                      {user.teams.map((t) => {
                        const active = (myTeam || user.team_name) === t;
                        return (
                          <button
                            key={t}
                            onClick={() => setMyTeam(t)}
                            aria-pressed={active}
                            className={`flex h-11 items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-semibold transition ${
                              active ? "border-pitch-700 bg-pitch-700 text-white" : "border-edge text-ink hover:border-pitch-600"
                            }`}
                          >
                            <Shield size={15} /> {t}
                            {t === user.team_name && <span className={`text-xs font-normal ${active ? "text-white/70" : "text-ink-soft"}`}>mặc định</span>}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-sm text-ink-soft">
                      {joining
                        ? "Đội đang chờ sẽ thấy tên này là đối thủ của họ."
                        : "Đội khác thấy tên này trên kèo ghép ở trang chủ."}{" "}
                      Thêm / đổi tên đội trong{" "}
                      <Link to="/account" target="_blank" className="font-semibold text-pitch-700 hover:underline">
                        Tài khoản
                      </Link>
                      .
                    </p>
                  </Step>
                )}
              </div>

              {/* ---------- Tóm tắt ---------- */}
              <aside className="rounded-2xl border border-edge bg-white p-5 lg:sticky lg:top-6">
                <h2 className="mb-2 text-lg font-bold">Thông tin đặt sân</h2>
                <div className="divide-y divide-edge">
                  <SummaryRow label="Sân">{court ? court.court_name : "—"}</SummaryRow>
                  <SummaryRow label="Ngày">{formatDateVN(date)}</SummaryRow>
                  <SummaryRow label="Giờ">
                    {hasRange ? `${start}–${end} (${formatDuration(endMin - startMin)})` : "Chưa chọn"}
                  </SummaryRow>
                  <SummaryRow label="Kiểu đặt">
                    {bookingType === "full" ? "Nguyên sân" : joining ? "Nửa sân · vào ghép" : "Nửa sân"}
                  </SummaryRow>
                  {joining && analysis.host?.team_name && (
                    <SummaryRow label="Ghép với đội">{analysis.host.team_name}</SummaryRow>
                  )}
                  {joining && analysis.host?.wanted_level && (
                    <SummaryRow label="Đối thủ tìm">{levelLabel(analysis.host.wanted_level)}</SummaryRow>
                  )}
                  {bookingType === "half" && user?.team_name && (
                    <SummaryRow label="Đội của bạn">{myTeam || user.team_name}</SummaryRow>
                  )}
                  {hostingHalf && (
                    <SummaryRow label="Tìm đội">{level ? levelLabel(level) : "Chưa chọn"}</SummaryRow>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between border-t-2 border-pitch-700 pt-3">
                  <span className="font-semibold">Tiền sân</span>
                  <span className="text-2xl font-extrabold text-pitch-700">
                    {rangeOk ? formatMoney(price) : "—"}
                  </span>
                </div>

                {submitError && (
                  <p className="mt-4 rounded-r-lg border-l-4 border-red-700 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                    {submitError}
                  </p>
                )}
                {!user && <p className="mt-4 text-sm text-ink-soft">Bạn cần đăng nhập để đặt sân.</p>}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-pitch-700 font-bold text-white transition hover:bg-pitch-600 active:bg-pitch-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Đang đặt sân..." : "Xác nhận đặt sân"}
                </button>
                {hostingHalf && !level && (
                  <p className="mt-2 text-center text-xs text-ink-soft">
                    Chọn trình độ đội muốn tìm để tiếp tục.
                  </p>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
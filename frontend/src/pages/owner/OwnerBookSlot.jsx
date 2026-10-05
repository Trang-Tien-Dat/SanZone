import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Users, Swords, Clock, AlertCircle, User, Phone, StickyNote } from "lucide-react";
import { getMyCourts } from "../../services/ownerApi";
import { getDaySchedule, createBooking } from "../../services/BookingApi";
import { TEAM_LEVELS, levelLabel } from "../../utils/TeamLevel";
import { toMin, toHM, calcPrice, analyzeRange, formatDuration, roundK } from "../../utils/bookingTime";
import { useAuth } from "../../context/AuthContext";
import PitchIllustration from "../../components/PitchIllustration";
import DayTimeline from "../../components/DayTimeline";
import { PageHeader } from "./components";



// ---------- helpers ----------
const toDateStr = (d) => d.toLocaleDateString("sv-SE");
const formatMoney = (n) => `${Number(n).toLocaleString("vi-VN")}đ`;
const STEP = 30;

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

const selectClass =
  "h-11 w-full rounded-lg border-[1.5px] border-edge bg-white px-3 text-[0.95rem] outline-none transition focus:border-pitch-600 focus:ring-3 focus:ring-pitch-600/15 disabled:bg-pitch-50";
const fieldClass =
  "flex h-11 items-center gap-2.5 rounded-lg border-[1.5px] border-edge bg-white px-3.5 transition focus-within:border-pitch-600 focus-within:ring-3 focus-within:ring-pitch-600/15";

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

const EMPTY_CUSTOMER = { customer_name: "", customer_phone: "", note: "" };

export default function OwnerBookSlot() {
  const { token } = useAuth();
  const today = toDateStr(new Date());

  const [courts, setCourts] = useState([]);
  const [loadingCourts, setLoadingCourts] = useState(true);
  const [courtsError, setCourtsError] = useState("");
  const [courtId, setCourtId] = useState(null);

  const [bookingType, setBookingType] = useState("full"); // full | half
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [level, setLevel] = useState(null);
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);

  const [day, setDay] = useState({ schedules: [], blocks: [] });
  const [loadingDay, setLoadingDay] = useState(false);
  const [dayError, setDayError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState(null);

  // ----- Các sân của chủ sân -----
  useEffect(() => {
    getMyCourts()
      .then((list) => {
        const active = list.filter((c) => c.status !== "inactive");
        setCourts(active);
        if (active.length > 0) setCourtId(active[0].court_id);
      })
      .catch((err) => setCourtsError(err.message))
      .finally(() => setLoadingCourts(false));
  }, []);

  // ----- Giờ hoạt động + lịch đã đặt trong ngày (API chung với khách hàng) -----
  useEffect(() => {
    if (!courtId || !date) return;
    setLoadingDay(true);
    setDayError("");
    getDaySchedule(courtId, date)
      .then(setDay)
      .catch((err) => setDayError(err.message))
      .finally(() => setLoadingDay(false));
  }, [courtId, date, reloadKey]);

  const court = courts.find((c) => c.court_id === courtId);
  const sport = court?.sport_id;

  // ----- Giờ hoạt động -> danh sách giờ -----
  const hasSchedule = day.schedules.length > 0;
  const open = hasSchedule ? Math.min(...day.schedules.map((s) => toMin(s.start_time))) : 0;
  const close = hasSchedule ? Math.max(...day.schedules.map((s) => toMin(s.end_time))) : 0;
  const nowMin = date === today ? new Date().getHours() * 60 + new Date().getMinutes() : -1;

  const startOptions = [];
  for (let m = open; m + STEP <= close; m += STEP) startOptions.push(m);
  const startMin = start ? toMin(start) : null;
  const endOptions = [];
  if (startMin != null) for (let m = startMin + STEP; m <= close; m += STEP) endOptions.push(m);

  function pickStart(value) {
    setStart(value);
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

  function joinMatch(b) {
    setBookingType("half");
    setStart(b.start_time);
    setEnd(b.end_time);
  }

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
  const openMatches = day.blocks.filter((b) => b.status === "half" && toMin(b.start_time) > nowMin);

  const phoneOk = !customer.customer_phone || /^0\d{9}$/.test(customer.customer_phone.trim());
  const canSubmit = rangeOk && (!hostingHalf || level) && phoneOk && !submitting;

  let statusBox;
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
      text: `Giờ này đang có đội chờ ghép${
        analysis.host.wanted_level ? ` (tìm đội ${levelLabel(analysis.host.wanted_level).toLowerCase()})` : ""
      }. Khách của bạn sẽ vào ghép với họ.`,
    };
  } else {
    statusBox = {
      tone: "ok",
      text: `Khung ${start}–${end} (${formatDuration(endMin - startMin)}) còn trống${
        hostingHalf ? ", sẽ mở kèo nửa sân chờ đội khác vào ghép" : ", có thể đặt"
      }.`,
    };
  }

  async function handleSubmit() {
    setSubmitError("");
    setSubmitting(true);
    try {
      const customerName = customer.customer_name.trim() || "Khách vãng lai";
      const data = await createBooking(token, {
        court_id: courtId,
        date,
        start_time: start,
        end_time: end,
        booking_type: bookingType,
        wanted_level: hostingHalf ? level : null,
        // thông tin thêm khi chủ sân đặt hộ (backend cần lưu các field này)
        source: "owner",
        customer_name: customerName,
        customer_phone: customer.customer_phone.trim(),
        note: customer.note.trim(),
      });
      setResult({
        bookingId: data.booking?.booking_id,
        courtName: court?.court_name,
        date,
        start,
        end,
        bookingType,
        mode: data.mode,
        level: hostingHalf ? level : null,
        price: data.detail?.price ?? price,
        customerName,
        customerPhone: customer.customer_phone.trim(),
      });
    } catch (err) {
      setSubmitError(err.message);
      setReloadKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  function bookAgain() {
    setResult(null);
    setStart("");
    setEnd("");
    setLevel(null);
    setCustomer(EMPTY_CUSTOMER);
    setReloadKey((k) => k + 1);
  }

  /* ---------- Đặt thành công ---------- */
  if (result) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-edge bg-white p-7 text-center">
        <CheckCircle2 size={52} className="mx-auto mb-3 text-pitch-600" />
        <h2 className="mb-1 text-2xl font-extrabold">Đặt sân thành công</h2>
        {result.bookingId && (
          <p className="mb-5 text-ink-soft">
            Mã đặt sân <span className="font-bold text-pitch-700">{result.bookingId}</span>
          </p>
        )}
        <div className="mb-6 divide-y divide-edge rounded-xl bg-pitch-50 px-4 text-left">
          <SummaryRow label="Khách">
            {result.customerName}
            {result.customerPhone && <span className="block text-xs font-normal text-ink-soft">{result.customerPhone}</span>}
          </SummaryRow>
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
            Đặt thêm
          </button>
          <Link
            to="/owner/bookings"
            className="grid h-11 flex-1 place-items-center rounded-lg bg-pitch-700 font-bold text-white transition hover:bg-pitch-600"
          >
            Xem lịch đặt sân
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Đặt sân" subtitle="Đặt hộ khách gọi điện, khách vãng lai hoặc giữ sân — nguyên sân hay nửa sân đều được." />

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
              <p className="text-sm text-ink-soft">Bạn chưa có sân nào.</p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {courts.map((c) => {
                const active = c.court_id === courtId;
                return (
                  <button
                    key={c.court_id}
                    onClick={() => changeCourt(c.court_id)}
                    aria-pressed={active}
                    className={`overflow-hidden rounded-xl border-[1.5px] text-left transition ${
                      active ? "border-pitch-700 ring-3 ring-pitch-600/20" : "border-edge hover:border-pitch-600"
                    }`}
                  >
                    {c.image ? (
                      <img src={c.image} alt={c.court_name} className="block aspect-[5/3] w-full object-cover" />
                    ) : (
                      <PitchIllustration sport={c.sport_id} />
                    )}
                    <div className={`p-3 ${active ? "bg-pitch-100" : "bg-white"}`}>
                      <div className="font-bold">{c.court_name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
                        <Users size={13} /> {c.court_type}
                        {c.venue_name && <span className="truncate">· {c.venue_name}</span>}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-pitch-700">
                        Từ {formatMoney(c.price_per_hour)}/giờ
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Step>

          {/* ---------- 2. Kiểu đặt ---------- */}
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
                  joining && analysis.host.wanted_level
                    ? `Trình độ ${levelLabel(analysis.host.wanted_level).toLowerCase()}`
                    : level && bookingType === "half"
                    ? `Tìm đội ${levelLabel(level).toLowerCase()}`
                    : ""
                }
              />
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {[
                { value: "full", title: "Nguyên sân", desc: "Khách dùng cả sân, trả đủ tiền." },
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
          <Step number="3" title="Chọn ngày & giờ">
            <div className="mb-5 flex flex-wrap items-center gap-2.5">
              <label className={fieldClass}>
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
                { label: "Ngày mai", value: addDays(1) },
                { label: "Ngày kia", value: addDays(2) },
              ].map((q) => (
                <button
                  key={q.label}
                  onClick={() => setDate(q.value)}
                  className={`h-9 rounded-full px-3.5 text-sm font-semibold transition ${
                    date === q.value ? "bg-pitch-700 text-white" : "bg-pitch-100 text-pitch-700 hover:bg-pitch-100/70"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {loadingDay && <p className="text-sm text-ink-soft">Đang tải lịch sân...</p>}
            {dayError && <p className="text-sm font-medium text-red-700">Lỗi: {dayError}</p>}
            {!loadingDay && !dayError && courtId && !hasSchedule && (
              <p className="text-sm text-ink-soft">Sân này chưa có giờ hoạt động. Thêm dữ liệu vào bảng court_schedules.</p>
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

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="start-time" className="mb-1.5 block text-sm font-semibold text-ink-soft">
                      Giờ bắt đầu
                    </label>
                    <select id="start-time" value={start} onChange={(e) => pickStart(e.target.value)} className={selectClass}>
                      <option value="">-- Chọn giờ --</option>
                      {startOptions.map((m) => (
                        <option key={m} value={toHM(m)} disabled={m <= nowMin}>
                          {toHM(m)}
                          {m <= nowMin ? " (đã qua)" : ""}
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

                {openMatches.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
                      <Swords size={14} /> Kèo nửa sân đang chờ ghép
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {openMatches.map((b, i) => (
                        <button
                          key={i}
                          onClick={() => joinMatch(b)}
                          className="rounded-lg border-[1.5px] border-amber-400 bg-amber-50 px-3 py-2 text-left text-sm transition hover:bg-amber-100"
                        >
                          <span className="block font-bold">
                            {b.start_time}–{b.end_time}
                          </span>
                          <span className="block text-xs text-amber-800">
                            {b.wanted_level ? `Tìm đội ${levelLabel(b.wanted_level).toLowerCase()}` : "Đang chờ ghép"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Step>

          {/* ---------- 4. Trình độ (chỉ khi mở kèo nửa sân) ---------- */}
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
                Khách hàng khác sẽ thấy giờ này là "Còn nửa sân" kèm trình độ để vào ghép.
              </p>
            </Step>
          )}

          {/* ---------- 5. Thông tin khách ---------- */}
          <Step number={bookingType === "half" && !joining ? "5" : "4"} title="Thông tin khách">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={fieldClass}>
                <User size={16} className="shrink-0 text-pitch-600" />
                <input
                  value={customer.customer_name}
                  onChange={(e) => setCustomer({ ...customer, customer_name: e.target.value })}
                  placeholder="Tên khách (trống = Khách vãng lai)"
                  className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none"
                />
              </label>
              <label className={`${fieldClass} ${phoneOk ? "" : "border-red-600"}`}>
                <Phone size={16} className="shrink-0 text-pitch-600" />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={customer.customer_phone}
                  onChange={(e) => setCustomer({ ...customer, customer_phone: e.target.value })}
                  placeholder="Số điện thoại"
                  className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none"
                />
              </label>
              <label className={`${fieldClass} sm:col-span-2`}>
                <StickyNote size={16} className="shrink-0 text-pitch-600" />
                <input
                  value={customer.note}
                  onChange={(e) => setCustomer({ ...customer, note: e.target.value })}
                  placeholder="Ghi chú (đã cọc, thuê áo bib...)"
                  className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none"
                />
              </label>
            </div>
            {!phoneOk && <p className="mt-2 text-sm text-red-700">Số điện thoại gồm 10 số, bắt đầu bằng 0.</p>}
          </Step>
        </div>

        {/* ---------- Tóm tắt ---------- */}
        <aside className="rounded-2xl border border-edge bg-white p-5 lg:sticky lg:top-6">
          <h2 className="mb-2 text-lg font-bold">Thông tin đặt sân</h2>
          <div className="divide-y divide-edge">
            <SummaryRow label="Khách">{customer.customer_name.trim() || "Khách vãng lai"}</SummaryRow>
            <SummaryRow label="Sân">{court ? court.court_name : "—"}</SummaryRow>
            <SummaryRow label="Ngày">{formatDateVN(date)}</SummaryRow>
            <SummaryRow label="Giờ">
              {hasRange ? `${start}–${end} (${formatDuration(endMin - startMin)})` : "Chưa chọn"}
            </SummaryRow>
            <SummaryRow label="Kiểu đặt">
              {bookingType === "full" ? "Nguyên sân" : joining ? "Nửa sân · vào ghép" : "Nửa sân"}
            </SummaryRow>
            {hostingHalf && <SummaryRow label="Tìm đội">{level ? levelLabel(level) : "Chưa chọn"}</SummaryRow>}
          </div>

          <div className="mt-3 flex items-baseline justify-between border-t-2 border-pitch-700 pt-3">
            <span className="font-semibold">Tiền sân</span>
            <span className="text-2xl font-extrabold text-pitch-700">{rangeOk ? formatMoney(price) : "—"}</span>
          </div>

          {submitError && (
            <p className="mt-4 rounded-r-lg border-l-4 border-red-700 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
              {submitError}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-pitch-700 font-bold text-white transition hover:bg-pitch-600 active:bg-pitch-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Đang đặt sân..." : "Xác nhận đặt sân"}
          </button>
          {hostingHalf && !level && (
            <p className="mt-2 text-center text-xs text-ink-soft">Chọn trình độ đội muốn tìm để tiếp tục.</p>
          )}
        </aside>
      </div>
    </>
  );
}
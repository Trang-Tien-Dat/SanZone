import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Clock, Users, Swords, CalendarX2, ReceiptText, Ban } from "lucide-react";
import { getMyBookings, cancelBooking } from "../../services/BookingApi";
import { levelLabel } from "../../utils/TeamLevel";
import { toMin, formatDuration } from "../../utils/bookingTime";
import { useAuth } from "../../context/AuthContext";

const formatMoney = (n) => `${Number(n).toLocaleString("vi-VN")}đ`;
const toDateStr = (d) => d.toLocaleDateString("sv-SE");

function dateParts(str) {
  const [y, m, d] = str.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    day: String(d).padStart(2, "0"),
    month: `Th ${m}`,
    weekday: date.toLocaleDateString("vi-VN", { weekday: "short" }),
    full: date.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }),
  };
}

// Nhãn kiểu đặt + trạng thái ghép đội
function typeBadge(item) {
  switch (item.match_status) {
    case "waiting":
      return {
        text: `Nửa sân · chờ ghép${item.wanted_level ? ` (tìm đội ${levelLabel(item.wanted_level).toLowerCase()})` : ""}`,
        cls: "bg-amber-100 text-amber-800",
      };
    case "matched":
      return { text: "Nửa sân · đã có đội ghép", cls: "bg-pitch-100 text-pitch-700" };
    case "joined":
      return { text: "Nửa sân · vào ghép", cls: "bg-pitch-100 text-pitch-700" };
    default:
      return { text: "Nguyên sân", cls: "bg-pitch-100 text-pitch-700" };
  }
}

// Chỉ được huỷ trong 60 phút sau khi đặt và trước giờ đá (khớp với backend)
const CANCEL_WITHIN_MIN = 60;

// Số phút còn được huỷ (0 = hết hạn huỷ)
function cancelMinutesLeft(item, now = Date.now()) {
  if (item.status === "cancelled" || item.status === "completed" || !item.created_at) return 0;
  const startAt = new Date(`${item.booking_date}T${item.start_time}:00+07:00`).getTime();
  if (startAt <= now) return 0;
  const deadline = Math.min(new Date(item.created_at).getTime() + CANCEL_WITHIN_MIN * 60000, startAt);
  return Math.max(0, Math.ceil((deadline - now) / 60000));
}
const canCancel = (item) => cancelMinutesLeft(item) > 0;

function BookingCard({ item, past, onCancel, cancelling }) {
  const d = dateParts(item.booking_date);
  const badge = typeBadge(item);
  const cancelled = item.status === "cancelled";
  const duration = toMin(item.end_time) - toMin(item.start_time);
  const cancellable = !past && canCancel(item);
  const minutesLeft = cancellable ? cancelMinutesLeft(item) : 0;

  return (
    <article
      className={`flex overflow-hidden rounded-2xl border border-edge bg-white ${
        past || cancelled ? "opacity-75" : ""
      }`}
    >
      {/* Khối ngày */}
      <div
        className={`flex w-20 shrink-0 flex-col items-center justify-center py-4 text-white sm:w-24 ${
          cancelled ? "bg-ink-soft" : past ? "bg-pitch-600" : "bg-pitch-700"
        }`}
      >
        <span className="text-xs font-semibold uppercase text-white/75">{d.weekday}</span>
        <span className="text-3xl leading-none font-extrabold">{d.day}</span>
        <span className="mt-0.5 text-xs font-semibold text-whistle">{d.month}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold leading-snug">{item.venue_name || "Sân"}</h3>
            {item.venue_address && (
              <p className="flex items-center gap-1 text-sm text-ink-soft">
                <MapPin size={13} className="shrink-0 text-pitch-600" />
                <span className="truncate">{item.venue_address}</span>
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              cancelled ? "bg-red-50 text-red-700" : past ? "bg-pitch-50 text-ink-soft" : "bg-pitch-700 text-white"
            }`}
          >
            {cancelled ? "Đã huỷ" : past ? "Đã đá" : "Đã xác nhận"}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <Clock size={14} className="text-pitch-600" />
            {item.start_time}–{item.end_time}
            <span className="font-normal text-ink-soft">({formatDuration(duration)})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={14} className="text-pitch-600" />
            {item.court_name}
            {item.court_type && <span className="text-ink-soft">· {item.court_type}</span>}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-edge pt-2.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>
            {item.booking_type === "half" && <Swords size={12} />}
            {badge.text}
          </span>
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-ink-soft">
              <ReceiptText size={13} /> {item.booking_id}
            </span>
            <span className="font-extrabold text-pitch-700">{formatMoney(item.price)}</span>
            {cancellable && (
              <button
                type="button"
                onClick={() => onCancel(item)}
                disabled={cancelling}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-bold text-red-700 ring-1 ring-red-700/30 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Ban size={13} /> {cancelling ? "Đang huỷ..." : `Huỷ đặt sân · còn ${minutesLeft} phút`}
              </button>
            )}
          </span>
        </div>

        {!past && !cancelled && !cancellable && (
          <p className="text-xs text-ink-soft">
            Đã hết thời gian huỷ online (chỉ được huỷ trong 1 giờ sau khi đặt). Liên hệ chủ sân nếu cần huỷ.
          </p>
        )}
      </div>
    </article>
  );
}

export default function MyBookingsPage({ onBack }) {
  const { user, token } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("upcoming"); // upcoming | past
  const [cancellingId, setCancellingId] = useState(null);
  // Vẽ lại mỗi 30 giây để số phút "còn được huỷ" tự giảm, hết giờ thì nút huỷ tự ẩn
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    getMyBookings(token)
      .then(setBookings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCancel(item) {
    const warn = item.match_status === "matched" ? "\nĐội đã ghép với bạn vẫn giữ nửa sân của họ." : "";
    const ok = window.confirm(
      `Huỷ đặt ${item.court_name}, ${item.start_time}–${item.end_time} ${dateParts(item.booking_date).full}?${warn}`
    );
    if (!ok) return;

    setCancellingId(item.booking_id);
    setError("");
    try {
      await cancelBooking(item.booking_id);
      // Cập nhật ngay trên màn hình: thẻ chuyển sang tab "Đã qua" với nhãn "Đã huỷ"
      setBookings((list) =>
        list.map((b) => (b.booking_id === item.booking_id ? { ...b, status: "cancelled" } : b))
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setCancellingId(null);
    }
  }

  // Mỗi booking_detail là một thẻ
  const items = bookings.flatMap((b) =>
    b.details.map((d) => ({ ...d, booking_id: b.booking_id, status: b.status, created_at: b.created_at }))
  );

  const today = toDateStr(new Date());
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isUpcoming = (it) =>
    it.status !== "cancelled" &&
    (it.booking_date > today || (it.booking_date === today && toMin(it.end_time) > nowMin));

  const key = (it) => `${it.booking_date} ${it.start_time}`;
  const upcoming = items.filter(isUpcoming).sort((a, b) => key(a).localeCompare(key(b)));
  const past = items.filter((it) => !isUpcoming(it)).sort((a, b) => key(b).localeCompare(key(a)));
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="min-h-screen bg-pitch-50 font-sans leading-relaxed text-ink">
      <header className="bg-pitch-900 text-white">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <button
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white/75 transition hover:text-white"
          >
            <ArrowLeft size={16} /> Quay lại trang chủ
          </button>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Sân đã đặt</h1>
          {user && <p className="mt-1 text-sm text-white/75">Lịch đặt sân của {user.fullName}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Tabs */}
        <div className="mb-6 inline-flex rounded-xl bg-pitch-100 p-1.5" role="tablist">
          {[
            { value: "upcoming", label: "Sắp tới", count: upcoming.length },
            { value: "past", label: "Đã qua", count: past.length },
          ].map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={`flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition ${
                tab === t.value ? "bg-pitch-700 text-white" : "text-pitch-700 hover:bg-white/60"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  tab === t.value ? "bg-white/20" : "bg-white text-pitch-700"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {!token && <p className="text-ink-soft">Bạn cần đăng nhập để xem sân đã đặt.</p>}
        {loading && <p className="text-ink-soft">Đang tải lịch đặt sân...</p>}
        {error && (
          <p className="mb-4 rounded-r-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 font-medium text-red-700">
            Lỗi: {error}
          </p>
        )}

        {!loading && token && list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-edge bg-white px-6 py-12 text-center">
            <CalendarX2 size={40} className="mx-auto mb-3 text-pitch-600" />
            <p className="mb-1 font-bold">
              {tab === "upcoming" ? "Chưa có lịch đá sắp tới" : "Chưa có lịch sử đặt sân"}
            </p>
            <p className="mb-5 text-sm text-ink-soft">Tìm một sân trống và đặt chỉ trong một phút.</p>
            <button
              onClick={onBack}
              className="h-11 rounded-lg bg-pitch-700 px-5 font-bold text-white transition hover:bg-pitch-600"
            >
              Đặt sân ngay
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {list.map((it) => (
            <BookingCard
              key={it.detail_id}
              item={it}
              past={tab === "past"}
              onCancel={handleCancel}
              cancelling={cancellingId === it.booking_id}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search, Check, X, Flag, Clock, CalendarDays, CalendarPlus, Swords } from "lucide-react";
import { getBookings, getMyCourts, updateBookingStatus, toBlocks } from "../../services/ownerApi";
import { getDaySchedule } from "../../services/BookingApi";
import { toMin, toHM } from "../../utils/bookingTime";
import { levelLabel } from "../../utils/TeamLevel";
import { BOOKING_STATUS, addDays, formatDateVN, formatVND, todayStr } from "../../utils/format";
import DayTimeline from "../../components/DayTimeline";
import { Card, PageHeader, StatusBadge, SourceBadge, EmptyState, ErrorBox, selectCls, btnPrimary } from "./components";

const DEFAULT_OPEN = 6 * 60;
const DEFAULT_CLOSE = 23 * 60;

export default function OwnerBookings() {
  const today = todayStr();
  const [courts, setCourts] = useState([]);
  const [hours, setHours] = useState({}); // court_id -> { open, close }
  const [date, setDate] = useState(today);
  const [courtId, setCourtId] = useState(""); // "" = tất cả sân
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [focusSlot, setFocusSlot] = useState(null); // "COURT001|18:00-19:00"
  const [error, setError] = useState("");

  useEffect(() => {
    getMyCourts()
      .then((list) => setCourts(list.filter((c) => c.status !== "inactive")))
      .catch((e) => setError(e.message));
  }, []);

  // Giờ mở cửa từng sân trong ngày (API chung với khách hàng). Lỗi thì dùng 6h–23h.
  useEffect(() => {
    if (!courts.length) return;
    Promise.all(
      courts.map((c) =>
        getDaySchedule(c.court_id, date)
          .then((d) =>
            d.schedules?.length
              ? {
                  open: Math.min(...d.schedules.map((s) => toMin(s.start_time))),
                  close: Math.max(...d.schedules.map((s) => toMin(s.end_time))),
                }
              : null
          )
          .catch(() => null)
      )
    ).then((list) => {
      const map = {};
      courts.forEach((c, i) => (map[c.court_id] = list[i] ?? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE }));
      setHours(map);
    });
  }, [courts, date]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    setFocusSlot(null);
    getBookings({ from: date, to: date, court_id: courtId })
      .then(setBookings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [date, courtId]);

  useEffect(() => {
    load();
  }, [load]);

  const shownCourts = courtId ? courts.filter((c) => c.court_id === courtId) : courts;

  // Lọc theo trạng thái + từ khoá, rồi gom theo sân + khung giờ (1 khung = nguyên sân hoặc 2 nửa sân)
  const slots = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const match = (b) =>
      (!status || b.status === status) &&
      (!k || b.customer_name?.toLowerCase().includes(k) || b.customer_phone?.includes(k) || b.booking_id?.toLowerCase().includes(k));

    const map = new Map();
    for (const b of bookings) {
      const key = `${b.court_id}|${b.start_time}-${b.end_time}`;
      const g = map.get(key) ?? { key, court_id: b.court_id, court_name: b.court_name, start_time: b.start_time, end_time: b.end_time, all: [] };
      g.all.push(b);
      map.set(key, g);
    }
    return [...map.values()]
      .map((g) => {
        const active = g.all.filter((b) => b.status !== "cancelled");
        const halves = active.filter((b) => b.booking_type === "half");
        const kind = active.some((b) => b.booking_type !== "half")
          ? "full"
          : halves.length >= 2
          ? "half-full"
          : halves.length === 1
          ? "half-open"
          : "cancelled";
        return { ...g, kind, shown: g.all.filter(match) };
      })
      .filter((g) => g.shown.length > 0)
      .sort((a, b) => String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")) || String(a.court_name ?? "").localeCompare(String(b.court_name ?? "")));
  }, [bookings, status, keyword]);

  const blocksByCourt = useMemo(() => {
    const map = {};
    for (const c of shownCourts) map[c.court_id] = toBlocks(bookings.filter((b) => b.court_id === c.court_id));
    return map;
  }, [bookings, shownCourts]);

  const counts = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "cancelled");
    return {
      total: active.length,
      pending: active.filter((b) => b.status === "pending").length,
      openHalf: slots.filter((s) => s.kind === "half-open").length,
      money: active.reduce((s, b) => s + Number(b.total_price || 0), 0),
    };
  }, [bookings, slots]);

  async function changeStatus(b, next) {
    if (next === "cancelled" && !window.confirm(`Huỷ lượt đặt của ${b.customer_name} (${b.start_time}–${b.end_time})?`)) return;
    setBusyId(b.booking_id);
    setError("");
    try {
      const updated = await updateBookingStatus(b.booking_id, next);
      setBookings((list) => list.map((x) => (x.booking_id === b.booking_id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function focusBlock(court_id, block) {
    const key = `${court_id}|${block.start_time}-${block.end_time}`;
    setFocusSlot(key);
    document.getElementById(`slot-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <>
      <PageHeader title="Lịch đặt sân" subtitle="Xem ai đã đặt sân của bạn — nguyên sân hay nửa sân — và xác nhận / huỷ lượt đặt.">
        <Link to="/owner/book" className={btnPrimary}>
          <CalendarPlus size={16} /> Đặt sân
        </Link>
      </PageHeader>

      {/* ---------- Chọn sân ---------- */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ court_id: "", court_name: "Tất cả sân" }, ...courts].map((c) => {
          const active = courtId === c.court_id;
          return (
            <button
              key={c.court_id || "all"}
              onClick={() => setCourtId(c.court_id)}
              aria-pressed={active}
              className={`h-10 rounded-full border-[1.5px] px-4 text-sm font-semibold transition ${
                active ? "border-pitch-700 bg-pitch-700 text-white" : "border-edge bg-white text-ink hover:border-pitch-600"
              }`}
            >
              {c.court_name}
              {c.court_type && <span className={`ml-1.5 font-normal ${active ? "text-white/75" : "text-ink-soft"}`}>· {c.court_type}</span>}
            </button>
          );
        })}
      </div>

      {/* ---------- Ngày ---------- */}
      <Card className="mb-4 flex flex-wrap items-center gap-2.5 p-4">
        <button
          className="grid size-10 place-items-center rounded-lg border-[1.5px] border-edge bg-white text-ink-soft transition hover:border-pitch-600 hover:text-pitch-700"
          onClick={() => setDate((d) => addDays(d, -1))}
          aria-label="Ngày trước"
        >
          <ChevronLeft size={16} />
        </button>
        <label className="flex h-10 items-center gap-2.5 rounded-lg border-[1.5px] border-edge bg-white px-3.5 transition focus-within:border-pitch-600 focus-within:ring-3 focus-within:ring-pitch-600/15">
          <CalendarDays size={16} className="shrink-0 text-pitch-600" />
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="bg-transparent text-[0.95rem] outline-none"
            aria-label="Ngày"
          />
        </label>
        <button
          className="grid size-10 place-items-center rounded-lg border-[1.5px] border-edge bg-white text-ink-soft transition hover:border-pitch-600 hover:text-pitch-700"
          onClick={() => setDate((d) => addDays(d, 1))}
          aria-label="Ngày sau"
        >
          <ChevronRight size={16} />
        </button>
        {[
          { label: "Hôm nay", value: today },
          { label: "Ngày mai", value: addDays(today, 1) },
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
        <p className="ml-auto text-sm text-ink-soft">
          <b className="text-ink">{counts.total}</b> lượt · <b className="text-ink">{counts.pending}</b> chờ xác nhận ·{" "}
          <b className="text-ink">{counts.openHalf}</b> kèo chờ ghép · <b className="text-ink">{formatVND(counts.money)}</b>
        </p>
      </Card>

      <ErrorBox>{error}</ErrorBox>

      {/* ---------- Lịch sân (giống bên khách hàng) ---------- */}
      <Card className="mb-4">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
          <Clock size={14} /> Lịch sân · {formatDateVN(date, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
          <span className="font-normal">· bấm vào khối giờ để xem ai đặt</span>
        </p>
        {loading ? (
          <EmptyState>Đang tải...</EmptyState>
        ) : shownCourts.length === 0 ? (
          <EmptyState>Bạn chưa có sân nào.</EmptyState>
        ) : (
          <div className="space-y-5">
            {shownCourts.map((c) => {
              const h = hours[c.court_id] ?? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
              return (
                <div key={c.court_id}>
                  {shownCourts.length > 1 && (
                    <p className="mb-1.5 text-sm font-bold text-ink">
                      {c.court_name} <span className="font-normal text-ink-soft">· mở cửa {toHM(h.open)}–{toHM(h.close)}</span>
                    </p>
                  )}
                  <DayTimeline
                    open={h.open}
                    close={h.close}
                    blocks={blocksByCourt[c.court_id] ?? []}
                    onBlockClick={(b) => focusBlock(c.court_id, b)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ---------- Bộ lọc danh sách ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(BOOKING_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <label className={`${selectCls} flex min-w-52 flex-1 items-center gap-2`}>
          <Search size={15} className="text-ink-soft" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm tên, SĐT hoặc mã đặt sân"
            className="h-full min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
      </div>

      {/* ---------- Danh sách theo khung giờ ---------- */}
      {!loading && slots.length === 0 ? (
        <Card>
          <EmptyState>Không có lượt đặt nào.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {slots.map((s) => (
            <SlotCard
              key={s.key}
              slot={s}
              focused={focusSlot === s.key}
              busyId={busyId}
              onChangeStatus={changeStatus}
            />
          ))}
        </div>
      )}
    </>
  );
}

const KIND = {
  full: { label: "Nguyên sân", cls: "bg-pitch-700 text-white" },
  "half-full": { label: "Nửa sân · đã đủ 2 đội", cls: "bg-pitch-700 text-white" },
  "half-open": { label: "Nửa sân · chờ ghép", cls: "bg-amber-400 text-amber-950" },
  cancelled: { label: "Đã huỷ", cls: "bg-red-50 text-red-700" },
};

function SlotCard({ slot, focused, busyId, onChangeStatus }) {
  const kind = KIND[slot.kind];
  return (
    <div
      id={`slot-${slot.key}`}
      className={`overflow-hidden rounded-2xl border bg-white transition ${
        focused ? "border-pitch-700 ring-3 ring-pitch-600/20" : "border-edge"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-edge bg-pitch-50 px-5 py-3">
        <span className="text-lg font-extrabold text-pitch-700 tabular-nums">
          {slot.start_time} – {slot.end_time}
        </span>
        <span className="font-semibold text-ink">{slot.court_name}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${kind.cls}`}>{kind.label}</span>
      </div>

      <ul className="divide-y divide-edge">
        {slot.shown.map((b) => (
          <li key={b.booking_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 ${b.status === "cancelled" ? "opacity-55" : ""}`}>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                b.booking_type === "half" ? "bg-amber-100 text-amber-900" : "bg-pitch-100 text-pitch-700"
              }`}
            >
              {b.booking_type === "half" ? "½ sân" : "Cả sân"}
            </span>
            <div className="min-w-40 flex-1">
              <p className="font-semibold text-ink">
                {b.customer_name} <SourceBadge source={b.source} />
              </p>
              <p className="text-sm text-ink-soft">
                {b.customer_phone && (
                  <a href={`tel:${b.customer_phone}`} className="hover:text-pitch-700">
                    {b.customer_phone}
                  </a>
                )}
                {b.booking_id && <span className="font-mono text-xs"> · {b.booking_id}</span>}
                {b.wanted_level && <span> · tìm đội {levelLabel(b.wanted_level).toLowerCase()}</span>}
              </p>
              {b.note && <p className="text-xs text-ink-soft italic">{b.note}</p>}
            </div>
            <span className="font-semibold text-ink tabular-nums">{formatVND(b.total_price)}</span>
            <StatusBadge status={b.status} />
            <div className="flex gap-1.5">
              {b.status === "pending" && (
                <ActionBtn onClick={() => onChangeStatus(b, "confirmed")} disabled={busyId === b.booking_id} icon={Check} tone="green">
                  Xác nhận
                </ActionBtn>
              )}
              {b.status === "confirmed" && (
                <ActionBtn onClick={() => onChangeStatus(b, "completed")} disabled={busyId === b.booking_id} icon={Flag} tone="blue">
                  Hoàn thành
                </ActionBtn>
              )}
              {(b.status === "pending" || b.status === "confirmed") && (
                <ActionBtn onClick={() => onChangeStatus(b, "cancelled")} disabled={busyId === b.booking_id} icon={X} tone="red">
                  Huỷ
                </ActionBtn>
              )}
            </div>
          </li>
        ))}

        {slot.kind === "half-open" && (
          <li className="flex items-center gap-2 px-5 py-3 text-sm text-amber-800">
            <Swords size={15} /> Còn trống nửa sân — đang chờ đội khác vào ghép.
          </li>
        )}
      </ul>
    </div>
  );
}

const TONES = {
  green: "bg-pitch-700 text-white hover:bg-pitch-600",
  blue: "bg-sky-700 text-white hover:bg-sky-600",
  red: "text-red-700 ring-1 ring-red-700/30 hover:bg-red-50",
};

function ActionBtn({ tone, icon: Icon, children, ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-bold whitespace-nowrap transition disabled:opacity-50 ${TONES[tone]}`}
    >
      <Icon size={14} /> {children}
    </button>
  );
}
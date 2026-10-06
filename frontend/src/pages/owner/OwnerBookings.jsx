import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search, Check, X, Flag, Clock, CalendarDays, CalendarPlus, Swords } from "lucide-react";
import { getBookings, getMyCourts, updateBookingStatus, toBlocks } from "../../services/ownerApi";
import { getDaySchedule } from "../../services/BookingApi";
import { toMin, toHM } from "../../utils/bookingTime";
import { levelLabel } from "../../utils/TeamLevel";
import { BOOKING_STATUS, addDays, formatDateVN, formatVND, todayStr } from "../../utils/format";
import DayTimeline from "../../components/DayTimeline";
import { linkedMap } from "../../utils/courtLinks";
import { Card, PageHeader, StatusBadge, SourceBadge, EmptyState, ErrorBox, selectCls, btnPrimary } from "./components";

const DEFAULT_OPEN = 6 * 60;
const DEFAULT_CLOSE = 23 * 60;

const parseDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const mondayOf = (s) => addDays(s, -((parseDate(s).getDay() + 6) % 7));
const ddmm = (s) => {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
};
// Ngày của lượt đặt. Nếu API dùng tên trường khác thì sửa ở đây.
const dayOf = (b, fallback) => String(b.booking_date ?? b.date ?? fallback ?? "").slice(0, 10);

// Gom lượt đặt theo ngày + sân + khung giờ (1 khung = nguyên sân hoặc 2 nửa sân)
function groupSlots(bookings, fallbackDate) {
  const map = new Map();
  for (const b of bookings) {
    const date = dayOf(b, fallbackDate);
    const key = `${date}|${b.court_id}|${b.start_time}-${b.end_time}`;
    const g = map.get(key) ?? { key, date, court_id: b.court_id, court_name: b.court_name, start_time: b.start_time, end_time: b.end_time, all: [] };
    g.all.push(b);
    map.set(key, g);
  }
  return [...map.values()].map((g) => {
    const active = g.all.filter((b) => b.status !== "cancelled");
    const halves = active.filter((b) => b.booking_type === "half");
    const kind = active.some((b) => b.booking_type !== "half")
      ? "full"
      : halves.length >= 2
      ? "half-full"
      : halves.length === 1
      ? "half-open"
      : "cancelled";
    return { ...g, kind, pending: active.some((b) => b.status === "pending") };
  });
}

export default function OwnerBookings() {
  const today = todayStr();
  const [view, setView] = useState("week"); // "day" | "week"
  const [courts, setCourts] = useState([]);
  const [hours, setHours] = useState({}); // court_id -> { open, close }
  const [date, setDate] = useState(today);
  const [courtId, setCourtId] = useState(""); // "" = tất cả sân
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [focusSlot, setFocusSlot] = useState(null);
  const [error, setError] = useState("");

  const weekStart = mondayOf(date);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = view === "week" ? weekStart : date;
  const to = view === "week" ? days[6] : date;

  useEffect(() => {
    getMyCourts()
      .then((list) => setCourts(list.filter((c) => c.status !== "inactive")))
      .catch((e) => setError(e.message));
  }, []);

  // Giờ mở cửa từng sân (API chung với khách hàng). Lỗi thì dùng 6h–23h.
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
    // Luôn tải mọi sân: cần lịch của sân ghép để biết sân đang xem có bị chiếm không
    getBookings({ from, to, court_id: "" })
      .then(setBookings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const shownCourts = courtId ? courts.filter((c) => c.court_id === courtId) : courts;

  const linked = useMemo(() => linkedMap(courts), [courts]);
  const shownBookings = useMemo(() => (courtId ? bookings.filter((b) => b.court_id === courtId) : bookings), [bookings, courtId]);
  const allGroups = useMemo(() => groupSlots(bookings, view === "day" ? date : null), [bookings, view, date]);
  const groups = useMemo(() => (courtId ? allGroups.filter((g) => g.court_id === courtId) : allGroups), [allGroups, courtId]);

  // Khung giờ một sân bị chiếm vì sân ghép dùng chung mặt sân: { "ngày|court_id": [khung của sân kia] }
  const linkedBusy = useMemo(() => {
    const nameOf = Object.fromEntries(courts.map((c) => [c.court_id, c.court_name]));
    const m = {};
    for (const g of allGroups) {
      if (g.kind === "cancelled") continue;
      for (const [cid, others] of Object.entries(linked)) {
        if (others.includes(g.court_id)) (m[`${g.date}|${cid}`] ??= []).push({ ...g, by: nameOf[g.court_id] ?? g.court_name });
      }
    }
    for (const k in m) m[k].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    return m;
  }, [allGroups, linked, courts]);

  // Lọc theo trạng thái + từ khoá cho danh sách bên dưới
  const slots = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const match = (b) =>
      (!status || b.status === status) &&
      (!k || b.customer_name?.toLowerCase().includes(k) || b.customer_phone?.includes(k) || b.booking_id?.toLowerCase().includes(k));
    return groups
      .map((g) => ({ ...g, shown: g.all.filter(match) }))
      .filter((g) => g.shown.length > 0)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")) ||
          String(a.court_name ?? "").localeCompare(String(b.court_name ?? ""))
      );
  }, [groups, status, keyword]);

  const blocksByCourt = useMemo(() => {
    const map = {};
    for (const c of shownCourts) {
      map[c.court_id] = [
        ...toBlocks(bookings.filter((b) => b.court_id === c.court_id)),
        ...(linkedBusy[`${date}|${c.court_id}`] ?? []).map((g) => ({
          start_time: g.start_time,
          end_time: g.end_time,
          status: "full",
          linked_court: g.by,
        })),
      ];
    }
    return map;
  }, [bookings, shownCourts, linkedBusy, date]);

  const counts = useMemo(() => {
    const active = shownBookings.filter((b) => b.status !== "cancelled");
    return {
      total: active.length,
      pending: active.filter((b) => b.status === "pending").length,
      openHalf: groups.filter((s) => s.kind === "half-open").length,
      money: active.reduce((s, b) => s + Number(b.total_price || 0), 0),
    };
  }, [shownBookings, groups]);

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

  function focusKey(key) {
    setFocusSlot(key);
    document.getElementById(`slot-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const step = view === "week" ? 7 : 1;
  const quick =
    view === "week"
      ? [
          { label: "Tuần này", value: today },
          { label: "Tuần sau", value: addDays(today, 7) },
        ]
      : [
          { label: "Hôm nay", value: today },
          { label: "Ngày mai", value: addDays(today, 1) },
        ];
  const isQuickActive = (v) => (view === "week" ? mondayOf(v) === weekStart : v === date);
  const weekLabel = `${ddmm(days[0])} – ${ddmm(days[6])}/${days[6].slice(0, 4)}`;

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

      {/* ---------- Ngày / tuần ---------- */}
      <Card className="mb-4 flex flex-wrap items-center gap-2.5 p-4">
        <div className="flex h-10 rounded-lg bg-pitch-100 p-1" role="tablist" aria-label="Kiểu xem">
          {[
            { k: "day", label: "Ngày" },
            { k: "week", label: "Tuần" },
          ].map((v) => (
            <button
              key={v.k}
              role="tab"
              aria-selected={view === v.k}
              onClick={() => setView(v.k)}
              className={`rounded-md px-3.5 text-sm font-semibold transition ${
                view === v.k ? "bg-white text-pitch-700 shadow-sm" : "text-pitch-700/70 hover:text-pitch-700"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button
          className="grid size-10 place-items-center rounded-lg border-[1.5px] border-edge bg-white text-ink-soft transition hover:border-pitch-600 hover:text-pitch-700"
          onClick={() => setDate((d) => addDays(d, -step))}
          aria-label={view === "week" ? "Tuần trước" : "Ngày trước"}
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
          onClick={() => setDate((d) => addDays(d, step))}
          aria-label={view === "week" ? "Tuần sau" : "Ngày sau"}
        >
          <ChevronRight size={16} />
        </button>
        {quick.map((q) => (
          <button
            key={q.label}
            onClick={() => setDate(q.value)}
            className={`h-9 rounded-full px-3.5 text-sm font-semibold transition ${
              isQuickActive(q.value) ? "bg-pitch-700 text-white" : "bg-pitch-100 text-pitch-700 hover:bg-pitch-100/70"
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

      {/* ---------- Lịch sân ---------- */}
      <Card className="mb-4">
        <p className="mb-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-soft">
          <Clock size={14} />
          {view === "week" ? (
            <>
              Lịch tuần · {weekLabel}
              <span className="font-normal">· bấm vào khung giờ để xác nhận / huỷ</span>
            </>
          ) : (
            <>
              Lịch sân · {formatDateVN(date, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
              <span className="font-normal">· bấm vào khối giờ để xem ai đặt</span>
            </>
          )}
        </p>
        {loading ? (
          <EmptyState>Đang tải...</EmptyState>
        ) : shownCourts.length === 0 ? (
          <EmptyState>Bạn chưa có sân nào.</EmptyState>
        ) : view === "week" ? (
          <WeekGrid
            days={days}
            courts={shownCourts}
            hours={hours}
            groups={groups}
            linkedBusy={linkedBusy}
            today={today}
            focusSlot={focusSlot}
            onBlockClick={focusKey}
            onDayClick={(d) => {
              setDate(d);
              setView("day");
            }}
          />
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
                    onBlockClick={(b) => !b.linked_court && focusKey(`${date}|${c.court_id}|${b.start_time}-${b.end_time}`)}
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
          <EmptyState>{view === "week" ? "Tuần này chưa có lượt đặt nào." : "Không có lượt đặt nào."}</EmptyState>
        </Card>
      ) : view === "week" ? (
        <div className="space-y-6">
          {days.map((d) => {
            const list = slots.filter((s) => s.date === d);
            if (!list.length) return null;
            return (
              <section key={d}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                  <span className={`rounded-md px-2 py-0.5 ${d === today ? "bg-pitch-700 text-white" : "bg-pitch-100 text-pitch-700"}`}>
                    {formatDateVN(d, { weekday: "long", day: "2-digit", month: "2-digit" })}
                  </span>
                  <span className="font-normal text-ink-soft">{list.length} khung giờ</span>
                </h3>
                <div className="space-y-3">
                  {list.map((s) => (
                    <SlotCard key={s.key} slot={s} focused={focusSlot === s.key} busyId={busyId} onChangeStatus={changeStatus} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map((s) => (
            <SlotCard key={s.key} slot={s} focused={focusSlot === s.key} busyId={busyId} onChangeStatus={changeStatus} />
          ))}
        </div>
      )}
    </>
  );
}

/* ================= Bảng tuần: hàng = sân, cột = ngày ================= */

// Trạng thái hiển thị của 1 khung giờ — ưu tiên việc chủ sân cần xử lý
function slotLook(g) {
  const active = g.all.filter((b) => b.status !== "cancelled");
  if (g.pending) return { key: "pending", label: "Chờ xác nhận", card: "border-l-amber-500 bg-amber-50", text: "text-amber-800" };
  if (g.kind === "half-open") return { key: "half", label: "Chờ ghép đội", card: "border-l-amber-400 bg-white border-dashed", text: "text-amber-700" };
  if (active.length && active.every((b) => b.status === "completed"))
    return { key: "done", label: "Đã đá xong", card: "border-l-slate-300 bg-slate-50", text: "text-slate-500" };
  return { key: "ok", label: "Đã xác nhận", card: "border-l-pitch-700 bg-white", text: "text-pitch-700" };
}

const BAR = { pending: "bg-amber-500", half: "bg-amber-300", done: "bg-slate-300", ok: "bg-pitch-600" };

function WeekGrid({ days, courts, hours, groups, linkedBusy = {}, today, focusSlot, onBlockClick, onDayClick }) {
  const hOf = (id) => hours[id] ?? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };

  const byCell = useMemo(() => {
    const m = {};
    for (const g of groups) {
      if (g.kind === "cancelled") continue;
      (m[`${g.date}|${g.court_id}`] ??= []).push(g);
    }
    for (const k in m) m[k].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    return m;
  }, [groups]);

  // Gom sân theo loại (Sân 5 / Sân 7 / ...)
  const sections = useMemo(() => {
    const map = new Map();
    for (const c of courts) {
      const t = c.court_type || "Khác";
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(c);
    }
    return [...map.entries()];
  }, [courts]);

  const cols = `180px repeat(7, minmax(160px, 1fr))`;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-edge">
        <div className="min-w-[1300px]">
          {/* ----- Tiêu đề ngày ----- */}
          <div className="sticky top-0 z-20 grid border-b border-edge bg-white" style={{ gridTemplateColumns: cols }}>
            <div className="sticky left-0 z-10 border-r border-edge bg-white px-4 py-3 text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Sân
            </div>
            {days.map((d, i) => {
              const n = groups.filter((g) => g.date === d && g.kind !== "cancelled").length;
              const isToday = d === today;
              const past = d < today;
              return (
                <button
                  key={d}
                  onClick={() => onDayClick(d)}
                  title="Xem chi tiết ngày này"
                  className={`border-r border-edge px-3 py-2.5 text-left transition last:border-r-0 hover:bg-pitch-50 ${
                    isToday ? "bg-pitch-700 text-white hover:bg-pitch-600" : past ? "text-ink-soft" : "text-ink"
                  }`}
                >
                  <div className={`text-xs font-semibold ${isToday ? "text-white/80" : i >= 5 ? "text-red-600" : "text-ink-soft"}`}>
                    {isToday ? "Hôm nay" : ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][i]}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-extrabold tabular-nums">{ddmm(d)}</span>
                    <span className={`text-xs ${isToday ? "text-white/80" : "text-ink-soft"}`}>{n ? `${n} khung` : "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ----- Các nhóm sân ----- */}
          {sections.map(([type, list]) => (
            <div key={type}>
              <div className="grid border-b border-edge bg-pitch-50" style={{ gridTemplateColumns: cols }}>
                <div className="sticky left-0 col-span-8 px-4 py-1.5 text-xs font-bold tracking-wide text-pitch-700 uppercase">
                  {type} · {list.length} sân
                </div>
              </div>

              {list.map((c) => {
                const h = hOf(c.court_id);
                const weekCount = days.reduce((s, d) => s + (byCell[`${d}|${c.court_id}`]?.length ?? 0), 0);
                return (
                  <div key={c.court_id} className="grid border-b border-edge last:border-b-0" style={{ gridTemplateColumns: cols }}>
                    {/* Tên sân */}
                    <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-edge bg-white px-4 py-3">
                      <p className="text-[15px] font-bold text-ink">{c.court_name}</p>
                      <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
                        {toHM(h.open)}–{toHM(h.close)}
                      </p>
                      <p className="mt-1.5 inline-flex w-fit rounded-full bg-pitch-100 px-2 py-0.5 text-[11px] font-semibold text-pitch-700">
                        {weekCount} khung / tuần
                      </p>
                    </div>

                    {/* 7 ô ngày */}
                    {days.map((d) => {
                      const cell = byCell[`${d}|${c.court_id}`] ?? [];
                      const busy = linkedBusy[`${d}|${c.court_id}`] ?? []; // bận vì sân ghép
                      const isToday = d === today;
                      const past = d < today;
                      const span = h.close - h.open;
                      return (
                        <div
                          key={d}
                          className={`group min-w-0 border-r border-edge p-2 last:border-r-0 ${isToday ? "bg-pitch-50/70" : ""} ${
                            past ? "bg-slate-50/60" : ""
                          }`}
                        >
                          {/* Thanh tổng quan: mức kín sân trong ngày */}
                          <div className="relative mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100" title="Mức kín sân trong ngày">
                            {cell.map((g) => {
                              const l = ((toMin(g.start_time) - h.open) / span) * 100;
                              const w = ((toMin(g.end_time) - toMin(g.start_time)) / span) * 100;
                              return (
                                <span
                                  key={g.key}
                                  className={`absolute inset-y-0 ${BAR[slotLook(g).key]}`}
                                  style={{ left: `${Math.max(0, l)}%`, width: `${Math.max(1, w)}%` }}
                                />
                              );
                            })}
                            {busy.map((g) => {
                              const l = ((toMin(g.start_time) - h.open) / span) * 100;
                              const w = ((toMin(g.end_time) - toMin(g.start_time)) / span) * 100;
                              return (
                                <span
                                  key={`busy-${g.key}`}
                                  className="absolute inset-y-0 bg-slate-400"
                                  style={{ left: `${Math.max(0, l)}%`, width: `${Math.max(1, w)}%` }}
                                />
                              );
                            })}
                          </div>

                          {cell.length === 0 && busy.length === 0 ? (
                            past ? (
                              <p className="py-2 text-center text-xs text-ink-soft/50">—</p>
                            ) : (
                              <Link
                                to={`/owner/book?court_id=${encodeURIComponent(c.court_id)}&date=${d}`}
                                className="flex h-12 items-center justify-center rounded-lg border border-dashed border-edge text-xs text-ink-soft/70 transition hover:border-pitch-600 hover:bg-white hover:text-pitch-700"
                              >
                                <span className="group-hover:hidden">Trống</span>
                                <span className="hidden font-semibold group-hover:inline">+ Đặt sân</span>
                              </Link>
                            )
                          ) : (
                            <ul className={`space-y-1.5 ${past ? "opacity-60" : ""}`}>
                              {cell.map((g) => {
                                const look = slotLook(g);
                                const active = g.all.filter((b) => b.status !== "cancelled");
                                const half = active.every((b) => b.booking_type === "half");
                                const who = active.map((b) => (half ? b.team_name || b.customer_name : b.customer_name)).filter(Boolean);
                                return (
                                  <li key={g.key}>
                                    <button
                                      onClick={() => onBlockClick(g.key)}
                                      title={`${g.start_time}–${g.end_time} · ${who.join(" vs ")} · ${look.label}`}
                                      className={`w-full rounded-lg border border-l-4 border-edge px-2 py-1.5 text-left shadow-xs transition hover:-translate-y-px hover:shadow-md ${
                                        look.card
                                      } ${focusSlot === g.key ? "ring-2 ring-sky-500" : ""}`}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[13px] font-bold text-ink tabular-nums">
                                          {g.start_time}–{g.end_time}
                                        </span>
                                        {half && (
                                          <span className="ml-auto rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900">½</span>
                                        )}
                                      </div>
                                      <div className="truncate text-xs text-ink">{who.join(" vs ") || "—"}</div>
                                      {look.key !== "ok" && <div className={`text-[11px] font-semibold ${look.text}`}>{look.label}</div>}
                                    </button>
                                  </li>
                                );
                              })}
                              {busy.map((g) => (
                                <li
                                  key={`busy-${g.key}`}
                                  title={`Mặt sân đang dùng cho ${g.by} — sân này không đặt được giờ này`}
                                  className="rounded-lg border border-dashed border-slate-300 bg-slate-100 px-2 py-1.5 text-slate-500"
                                  style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(148,163,184,.18) 0 5px, transparent 5px 10px)" }}
                                >
                                  <div className="text-[13px] font-bold tabular-nums">
                                    {g.start_time}–{g.end_time}
                                  </div>
                                  <div className="truncate text-[11px] font-semibold">Bận · {g.by}</div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Chú thích */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-1 rounded-full bg-pitch-700" /> Đã xác nhận</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-1 rounded-full bg-amber-500" /> Chờ xác nhận</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-1 rounded-full bg-amber-300" /> Nửa sân chờ ghép</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-1 rounded-full bg-slate-300" /> Đã đá xong</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-dashed border-slate-300 bg-slate-100" /> Bận do sân ghép</span>
        <span className="flex items-center gap-1.5"><span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900">½</span> Nửa sân</span>
        <span>Ô trống: bấm để đặt sân · Bấm tên ngày để xem theo giờ</span>
      </div>
    </div>
  );
}

/* ================= Danh sách khung giờ ================= */

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
                {b.booking_type === "half" && b.team_name && b.team_name !== b.customer_name && (
                  <span className="ml-1.5 rounded bg-pitch-100 px-1.5 py-0.5 text-xs font-bold text-pitch-700">{b.team_name}</span>
                )}
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
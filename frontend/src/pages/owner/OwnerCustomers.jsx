import { useEffect, useMemo, useState } from "react";
import { Search, Users, Repeat, UserPlus, Phone, Mail, Shield, ChevronDown, CalendarClock, Download, Ban, Unlock, X } from "lucide-react";
import { getCustomers, getBlacklist, blockCustomer, unblockCustomer } from "../../services/ownerApi";
import { formatVND, formatDateVN, todayStr, addDays } from "../../utils/format";
import { Card, PageHeader, StatCard, StatusBadge, EmptyState, ErrorBox, selectCls, btnGhost } from "./components";

const SORTS = {
  recent: { label: "Đặt gần đây", fn: (a, b) => b.last_date.localeCompare(a.last_date) },
  bookings: { label: "Đặt nhiều nhất", fn: (a, b) => b.bookings - a.bookings || b.spent - a.spent },
  spent: { label: "Chi nhiều nhất", fn: (a, b) => b.spent - a.spent },
  name: { label: "Tên A → Z", fn: (a, b) => a.name.localeCompare(b.name, "vi") },
};

const localDay = (iso) => new Date(iso).toLocaleDateString("sv-SE"); // ISO -> "YYYY-MM-DD" theo giờ máy
const initials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

// Xuất danh sách ra CSV (mở bằng Excel)
function exportCsv(list) {
  const rows = [
    ["Tên", "SĐT", "Email", "Tên đội", "Nguồn", "Số lượt đặt", "Đã huỷ", "Tổng chi (đ)", "Lần đầu", "Gần nhất", "Sân hay đặt"],
    ...list.map((c) => [
      c.name, c.phone, c.email, c.team_name, c.source === "owner" ? "Chủ sân đặt hộ" : "Online",
      c.bookings, c.cancelled, c.spent, c.first_date, c.last_date, c.top_court,
    ]),
  ];
  const csv = rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `khach-hang-${todayStr()}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function OwnerCustomers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState("recent");
  const [open, setOpen] = useState(null); // key khách đang mở chi tiết
  const [tab, setTab] = useState("customers"); // customers | blocked
  const [blacklist, setBlacklist] = useState([]);
  const [blockTarget, setBlockTarget] = useState(null); // khách đang mở hộp thoại chặn
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getCustomers()
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    getBlacklist()
      .then(setBlacklist)
      .catch(() => {});
  }, []);

  const blockedByUser = useMemo(() => Object.fromEntries(blacklist.map((b) => [b.user_id, b])), [blacklist]);

  async function unblock(userId, name) {
    if (!window.confirm(`Bỏ chặn ${name}? Khách sẽ đặt sân của bạn bình thường trở lại.`)) return;
    try {
      await unblockCustomer(userId);
      setBlacklist((l) => l.filter((b) => b.user_id !== userId));
      setNotice(`Đã bỏ chặn ${name}.`);
    } catch (e) {
      setError(e.message);
    }
  }

  function onBlocked({ block, cancelled }) {
    setBlacklist((l) => [block, ...l.filter((b) => b.user_id !== block.user_id)]);
    setBlockTarget(null);
    setNotice(`Đã chặn ${block.name}${cancelled ? ` và huỷ ${cancelled} lượt đặt sắp tới` : ""}.`);
    if (cancelled) getCustomers().then(setList).catch(() => {});
  }

  const stats = useMemo(() => {
    const monthAgo = addDays(todayStr(), -30);
    return {
      total: list.length,
      loyal: list.filter((c) => c.bookings >= 2).length,
      fresh: list.filter((c) => c.first_date >= monthAgo).length,
      upcoming: list.reduce((s, c) => s + c.upcoming, 0),
    };
  }, [list]);

  const shown = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return list
      .filter((c) => !source || c.source === source)
      .filter(
        (c) =>
          !k ||
          c.name.toLowerCase().includes(k) ||
          c.phone.includes(k) ||
          c.email.toLowerCase().includes(k) ||
          c.team_name.toLowerCase().includes(k)
      )
      .sort(SORTS[sort].fn);
  }, [list, keyword, source, sort]);

  return (
    <>
      <PageHeader title="Khách hàng" subtitle="Những người đã đặt sân của bạn — bấm vào từng khách để xem lịch sử đặt.">
        <button onClick={() => exportCsv(shown)} disabled={!shown.length} className={btnGhost}>
          <Download size={16} /> Xuất Excel
        </button>
      </PageHeader>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng khách" value={stats.total} icon={Users} />
        <StatCard label="Khách quen" value={stats.loyal} hint="Đặt từ 2 lần trở lên" icon={Repeat} />
        <StatCard label="Khách mới" value={stats.fresh} hint="Lần đầu đặt trong 30 ngày qua" icon={UserPlus} />
        <StatCard label="Lượt sắp tới" value={stats.upcoming} hint="Từ hôm nay trở đi" icon={CalendarClock} />
      </div>

      <div className="mb-4 flex w-fit rounded-xl bg-white p-1 ring-1 ring-edge" role="tablist">
        {[
          { k: "customers", label: "Tất cả khách", icon: Users, n: list.length },
          { k: "blocked", label: "Danh sách chặn", icon: Ban, n: blacklist.length },
        ].map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={tab === t.k}
            onClick={() => setTab(t.k)}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition ${
              tab === t.k ? (t.k === "blocked" ? "bg-red-600 text-white" : "bg-pitch-700 text-white") : "text-ink-soft hover:text-ink"
            }`}
          >
            <t.icon size={15} /> {t.label}
            <span className="opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      {notice && (
        <p className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-pitch-100 px-4 py-2.5 text-sm font-semibold text-pitch-700">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Đóng">
            <X size={15} />
          </button>
        </p>
      )}

      {tab === "blocked" ? (
        <BlacklistView list={blacklist} onUnblock={(b) => unblock(b.user_id, b.name)} />
      ) : (
      <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className={`${selectCls} flex min-w-56 flex-1 items-center gap-2`}>
          <Search size={15} className="text-ink-soft" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm tên, SĐT, email hoặc tên đội"
            className="h-full min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={selectCls}>
          <option value="">Mọi nguồn</option>
          <option value="online">Khách tự đặt online</option>
          <option value="owner">Chủ sân đặt hộ</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectCls}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <ErrorBox>{error}</ErrorBox>

      <Card className="p-0">
        {loading ? (
          <EmptyState>Đang tải danh sách khách...</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState>{list.length ? "Không có khách phù hợp." : "Chưa có ai đặt sân của bạn."}</EmptyState>
        ) : (
          <>
            {/* Tiêu đề cột (desktop) */}
            <div className="hidden grid-cols-[2fr_1.2fr_0.8fr_1fr_1fr_28px] gap-4 border-b border-edge px-5 py-3 text-xs font-semibold tracking-wide text-ink-soft uppercase md:grid">
              <span>Khách</span>
              <span>Liên hệ</span>
              <span className="text-right">Lượt đặt</span>
              <span className="text-right">Tổng chi</span>
              <span>Gần nhất</span>
              <span />
            </div>
            <ul className="divide-y divide-edge">
              {shown.map((c) => (
                <CustomerRow
                  key={c.key}
                  c={c}
                  open={open === c.key}
                  onToggle={() => setOpen(open === c.key ? null : c.key)}
                  block={c.user_id ? blockedByUser[c.user_id] : null}
                  onBlock={() => setBlockTarget(c)}
                  onUnblock={() => unblock(c.user_id, c.name)}
                />
              ))}
            </ul>
          </>
        )}
      </Card>
      {!loading && shown.length > 0 && (
        <p className="mt-3 text-right text-sm text-ink-soft">
          {shown.length} khách · tổng {formatVND(shown.reduce((s, c) => s + c.spent, 0))}
        </p>
      )}
      </>
      )}

      {blockTarget && <BlockModal customer={blockTarget} onClose={() => setBlockTarget(null)} onDone={onBlocked} />}
    </>
  );
}

function CustomerRow({ c, open, onToggle, block, onBlock, onUnblock }) {
  const today = todayStr();
  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left transition hover:bg-pitch-50 md:grid-cols-[2fr_1.2fr_0.8fr_1fr_1fr_28px] ${
          open ? "bg-pitch-50" : ""
        }`}
      >
        {/* Khách */}
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
              c.source === "owner" ? "bg-gray-100 text-gray-600" : "bg-pitch-100 text-pitch-700"
            }`}
          >
            {initials(c.name)}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
              <span className="truncate">{c.name}</span>
              {c.bookings >= 5 ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">Khách VIP</span>
              ) : c.bookings >= 2 ? (
                <span className="rounded bg-pitch-100 px-1.5 py-0.5 text-[11px] font-bold text-pitch-700">Khách quen</span>
              ) : null}
              {block && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                  Bị chặn {block.until ? `đến ${formatDateVN(localDay(block.until), { day: "2-digit", month: "2-digit" })}` : "vĩnh viễn"}
                </span>
              )}
              {c.source === "owner" && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">Đặt hộ</span>
              )}
            </p>
            {c.team_name && (
              <p className="flex items-center gap-1 truncate text-xs text-ink-soft">
                <Shield size={12} /> {c.team_name}
              </p>
            )}
          </div>
        </div>

        {/* Liên hệ */}
        <div className="hidden min-w-0 text-sm md:block">
          {c.phone ? <p className="text-ink tabular-nums">{c.phone}</p> : <p className="text-ink-soft">—</p>}
          {c.email && <p className="truncate text-xs text-ink-soft">{c.email}</p>}
        </div>

        <p className="hidden text-right md:block">
          <b className="text-ink tabular-nums">{c.bookings}</b>
          {c.cancelled > 0 && <span className="block text-xs text-red-600">{c.cancelled} huỷ</span>}
        </p>
        <p className="hidden text-right font-semibold text-pitch-700 tabular-nums md:block">{formatVND(c.spent)}</p>
        <p className="hidden text-sm md:block">
          {formatDateVN(c.last_date)}
          {c.upcoming > 0 && <span className="block text-xs font-semibold text-sky-700">{c.upcoming} lượt sắp tới</span>}
        </p>

        {/* Mobile: tóm tắt */}
        <p className="text-right text-sm md:hidden">
          <b className="text-ink">{c.bookings} lượt</b>
          <span className="block text-xs text-pitch-700">{formatVND(c.spent)}</span>
        </p>
        <ChevronDown size={18} className={`hidden justify-self-end text-ink-soft transition md:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-edge bg-pitch-50/60 px-5 py-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {c.user_id &&
              (block ? (
                <button onClick={onUnblock} className={`${btnGhost} order-last ml-auto`}>
                  <Unlock size={15} /> Bỏ chặn
                </button>
              ) : (
                <button
                  onClick={onBlock}
                  className="order-last ml-auto inline-flex h-10 items-center gap-2 rounded-lg border-[1.5px] border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:border-red-600 hover:bg-red-50"
                >
                  <Ban size={15} /> Chặn đặt sân
                </button>
              ))}
            {c.phone && (
              <a href={`tel:${c.phone}`} className={btnGhost}>
                <Phone size={15} /> Gọi {c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className={btnGhost}>
                <Mail size={15} /> Email
              </a>
            )}
          </div>
          <p className="mb-2 text-sm text-ink-soft">
            Khách từ {formatDateVN(c.first_date, { day: "2-digit", month: "2-digit", year: "numeric" })}
            {c.top_court && <> · hay đặt <b className="text-ink">{c.top_court}</b></>}
          </p>
          <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-white">
            {c.recent.map((r) => (
              <li key={`${r.booking_id}-${r.start_time}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className={`w-28 font-semibold tabular-nums ${r.date >= today ? "text-sky-700" : "text-ink"}`}>
                  {formatDateVN(r.date)}
                </span>
                <span className="tabular-nums">
                  {r.start_time}–{r.end_time}
                </span>
                <span className="text-ink-soft">
                  {r.court_name}
                  {r.booking_type === "half" && " · ½ sân"}
                </span>
                <span className="ml-auto font-semibold tabular-nums">{formatVND(r.price)}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
          {c.bookings + c.cancelled > c.recent.length && (
            <p className="mt-2 text-xs text-ink-soft">Hiện {c.recent.length} lượt gần nhất.</p>
          )}
        </div>
      )}
    </li>
  );
}

/* ================= Hộp thoại chặn khách ================= */

const DURATION_OPTIONS = [
  { value: "1w", label: "1 tuần", hint: "Tự hết hạn sau 7 ngày" },
  { value: "1m", label: "1 tháng", hint: "Tự hết hạn sau 30 ngày" },
  { value: "forever", label: "Vĩnh viễn", hint: "Đến khi bạn bỏ chặn" },
];

function BlockModal({ customer: c, onClose, onDone }) {
  const [duration, setDuration] = useState("1w");
  const [reason, setReason] = useState("");
  const [cancelUpcoming, setCancelUpcoming] = useState(c.upcoming > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onDone(await blockCustomer({ user_id: c.user_id, duration, reason, cancel_upcoming: cancelUpcoming }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
            <Ban size={22} />
          </span>
          <div>
            <h2 className="text-lg font-bold">Chặn {c.name}</h2>
            <p className="text-sm text-ink-soft">Khách sẽ không đặt được sân nào của bạn trong thời gian này. Sân khác vẫn đặt bình thường.</p>
          </div>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

        <p className="mb-2 text-sm font-semibold text-ink-soft">Chặn trong bao lâu?</p>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {DURATION_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setDuration(o.value)}
              aria-pressed={duration === o.value}
              className={`rounded-xl border-[1.5px] p-3 text-left transition ${
                duration === o.value ? "border-red-600 bg-red-50" : "border-edge hover:border-red-300"
              }`}
            >
              <span className={`block font-bold ${duration === o.value ? "text-red-700" : "text-ink"}`}>{o.label}</span>
              <span className="block text-[11px] leading-tight text-ink-soft">{o.hint}</span>
            </button>
          ))}
        </div>

        <label htmlFor="block-reason" className="mb-1.5 block text-sm font-semibold text-ink-soft">
          Lý do <span className="font-normal">(chỉ bạn thấy)</span>
        </label>
        <textarea
          id="block-reason"
          rows={2}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Đặt rồi không đến, bom sân, gây gổ..."
          className="mb-3 w-full rounded-lg border-[1.5px] border-edge px-3 py-2 text-sm outline-none focus:border-red-600"
        />

        {c.upcoming > 0 && (
          <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <input type="checkbox" checked={cancelUpcoming} onChange={(e) => setCancelUpcoming(e.target.checked)} className="mt-0.5 size-4 accent-red-600" />
            <span>
              Huỷ luôn <b>{c.upcoming} lượt đặt sắp tới</b> của khách này ở sân bạn
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>
            Huỷ
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            <Ban size={16} /> {busy ? "Đang chặn..." : "Chặn khách"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ================= Tab danh sách chặn ================= */

function BlacklistView({ list, onUnblock }) {
  if (!list.length) {
    return (
      <Card>
        <EmptyState>
          Chưa chặn ai. Muốn chặn khách: mở tab "Tất cả khách", bấm vào khách rồi chọn <b>Chặn đặt sân</b>.
        </EmptyState>
      </Card>
    );
  }
  const now = Date.now();
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.map((b) => {
        const daysLeft = b.until ? Math.max(0, Math.ceil((new Date(b.until).getTime() - now) / 86400000)) : null;
        return (
          <Card key={b.user_id} className="flex flex-col">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-red-100 text-sm font-bold text-red-700">{initials(b.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{b.name}</p>
                {b.phone && (
                  <a href={`tel:${b.phone}`} className="text-sm text-ink-soft hover:text-pitch-700">
                    {b.phone}
                  </a>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${b.until ? "bg-amber-100 text-amber-800" : "bg-red-600 text-white"}`}>
                {b.until ? `Còn ${daysLeft} ngày` : "Vĩnh viễn"}
              </span>
            </div>
            <p className="mt-3 rounded-lg bg-pitch-50 px-3 py-2 text-sm text-ink">{b.reason || <span className="text-ink-soft">Không ghi lý do</span>}</p>
            <p className="mt-2 text-xs text-ink-soft">
              Chặn ngày {formatDateVN(localDay(b.created_at), { day: "2-digit", month: "2-digit", year: "numeric" })}
              {b.until && ` · hết hạn ${formatDateVN(localDay(b.until), { day: "2-digit", month: "2-digit", year: "numeric" })}`}
            </p>
            <div className="grow" />
            <button onClick={() => onUnblock(b)} className={`${btnGhost} mt-4 w-full`}>
              <Unlock size={15} /> Bỏ chặn
            </button>
          </Card>
        );
      })}
    </div>
  );
}

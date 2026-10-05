import { useEffect, useMemo, useState } from "react";
import { Wallet, Hourglass, Undo2, ChevronLeft, ChevronRight } from "lucide-react";
import { getMyPitches, getRevenue, getRevenueTransactions } from "../../services/ownerApi";
import {
  REVENUE_STATUS, addDays, eachDay, formatDateTimeVN, formatDateVN, formatShortVND, formatVND, toDateStr, todayStr,
} from "../../utils/format";
import { Card, PageHeader, StatCard, EmptyState, ErrorBox, selectCls, btnGhost } from "./components";

// Hiện KHÔNG thu phí nền tảng trên từng lượt đặt -> chủ sân nhận đủ số tiền khách trả (amount).
// (Dự kiến sau này: chủ sân đóng phí duy trì cố định hằng tháng, tách riêng khỏi trang này.)

// Mã sân dạng "C001"
const courtId = (p) => String(p.court_id ?? p._id ?? p.id);

function presetRange(key) {
  const now = new Date();
  const today = todayStr();
  switch (key) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "lastMonth":
      return {
        from: toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toDateStr(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "thisYear":
      return { from: `${now.getFullYear()}-01-01`, to: today };
    default:
      return null;
  }
}

const PRESETS = [
  ["7d", "7 ngày"],
  ["30d", "30 ngày"],
  ["thisMonth", "Tháng này"],
  ["lastMonth", "Tháng trước"],
  ["thisYear", "Năm nay"],
  ["custom", "Tuỳ chọn"],
];

const ZERO = { count: 0, amount: 0 };
const EMPTY = { group: "day", summary: { paid: ZERO, pending: ZERO, refunded: ZERO }, series: [], byCourt: [] };
const PAGE_SIZE = 10;

export default function OwnerRevenue() {
  const [preset, setPreset] = useState("30d");
  const [range, setRange] = useState(presetRange("30d"));
  const [court, setCourt] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [courts, setCourts] = useState([]);
  const [report, setReport] = useState(EMPTY);
  const [tx, setTx] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const validRange = Boolean(range.from && range.to && range.from <= range.to);

  useEffect(() => {
    getMyPitches().then(setCourts).catch(() => {});
  }, []);

  // Đổi bộ lọc -> quay về trang 1
  useEffect(() => {
    setPage(1);
  }, [range, court, txStatus]);

  // Báo cáo tổng hợp
  useEffect(() => {
    if (!validRange) return;
    setLoading(true);
    setError("");
    getRevenue({ ...range, court_id: court })
      .then((r) => setReport({ ...EMPTY, ...r, summary: { ...EMPTY.summary, ...r.summary } }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [range, court, validRange]);

  // Danh sách giao dịch
  useEffect(() => {
    if (!validRange) return;
    getRevenueTransactions({ ...range, court_id: court, status: txStatus, page, limit: PAGE_SIZE })
      .then(setTx)
      .catch((e) => setError(e.message));
  }, [range, court, txStatus, page, validRange]);

  function choosePreset(key) {
    setPreset(key);
    const r = presetRange(key);
    if (r) setRange(r);
  }

  // Lấp ngày/tháng không có doanh thu = 0 để biểu đồ liền mạch
  const series = useMemo(() => {
    if (!validRange) return [];
    const isMonth = report.group === "month";
    const byKey = new Map(report.series.map((s) => [s.key, s]));
    const keys = [...new Set(eachDay(range.from, range.to).map((d) => (isMonth ? d.slice(0, 7) : d)))];
    return keys.map((key) => {
      const s = byKey.get(key) ?? ZERO;
      return {
        key,
        value: Number(s.amount) || 0,
        count: s.count,
        label: isMonth ? `T${Number(key.slice(5))}` : formatDateVN(key, { day: "2-digit", month: "2-digit" }),
        full: isMonth
          ? `Tháng ${Number(key.slice(5))}/${key.slice(0, 4)}`
          : formatDateVN(key, { weekday: "long", day: "2-digit", month: "2-digit" }),
      };
    });
  }, [report, range, validRange]);

  // Bảng theo sân: gồm cả sân chưa có doanh thu
  const perCourt = useMemo(() => {
    const byId = new Map(report.byCourt.map((r) => [String(r.court_id), r]));
    const list = (court ? courts.filter((c) => courtId(c) === court) : courts).map((c) => ({
      court_id: courtId(c),
      court_name: c.name ?? c.court_name,
      type: c.type ?? c.court_type,
      ...ZERO,
      ...byId.get(courtId(c)),
    }));
    for (const r of report.byCourt) if (!list.some((x) => x.court_id === String(r.court_id))) list.push({ ...ZERO, ...r });
    return list.sort((a, b) => b.amount - a.amount);
  }, [report, courts, court]);

  const { paid, pending, refunded } = report.summary;
  const totalPages = Math.max(1, Math.ceil(tx.total / PAGE_SIZE));
  const dash = (v) => (loading ? "…" : v);

  return (
    <>
      <PageHeader title="Doanh thu" subtitle="Doanh thu được tính trên các khoản khách đã thanh toán." />

      <Card className="mb-5 flex flex-wrap items-center gap-2 p-4">
        {PRESETS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => choosePreset(k)}
            className={`h-9 rounded-lg px-3 text-sm font-semibold transition ${
              preset === k ? "bg-pitch-700 text-white" : "text-ink-soft hover:bg-pitch-100 hover:text-pitch-700"
            }`}
          >
            {label}
          </button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={selectCls} />
            <span className="text-ink-soft">→</span>
            <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={selectCls} />
          </div>
        )}
        <select value={court} onChange={(e) => setCourt(e.target.value)} className={`${selectCls} ml-auto`}>
          <option value="">Tất cả sân</option>
          {courts.map((c) => (
            <option key={courtId(c)} value={courtId(c)}>{c.name ?? c.court_name}</option>
          ))}
        </select>
      </Card>

      <ErrorBox>{error || (!validRange && "Ngày bắt đầu phải trước ngày kết thúc.")}</ErrorBox>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Doanh thu"
          value={dash(formatVND(paid.amount))}
          hint={`${paid.count} khoản đã thanh toán`}
          icon={Wallet}
        />
        <StatCard
          label="Chờ thanh toán"
          value={dash(formatVND(pending.amount))}
          hint={`${pending.count} khoản · sẽ nhận sau khi khách trả`}
          icon={Hourglass}
        />
        <StatCard
          label="Đã hoàn tiền"
          value={dash(formatVND(refunded.amount))}
          hint={`${refunded.count} khoản`}
          icon={Undo2}
        />
      </div>

      <Card className="mb-5">
        <h2 className="mb-4 font-bold text-ink">Doanh thu theo {report.group === "month" ? "tháng" : "ngày"}</h2>
        {loading ? <EmptyState>Đang tải...</EmptyState> : <BarChart series={series} />}
      </Card>

      {/* Theo sân */}
      <Card className="mb-5 overflow-hidden p-0">
        <h2 className="border-b border-edge px-5 py-4 font-bold text-ink">Theo sân</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-[#f4f7f5] text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
              <tr>
                <th className="px-5 py-2.5">Sân</th>
                <th className="px-3 py-2.5 text-right">Số khoản</th>
                <th className="px-3 py-2.5 text-right">Doanh thu</th>
                <th className="w-40 px-5 py-2.5">Tỉ trọng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {perCourt.length === 0 && (
                <tr>
                  <td colSpan={4}><EmptyState>Chưa có dữ liệu.</EmptyState></td>
                </tr>
              )}
              {perCourt.map((c) => {
                const share = paid.amount ? c.amount / paid.amount : 0;
                return (
                  <tr key={c.court_id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-ink">{c.court_name ?? c.court_id}</p>
                      <p className="text-xs text-ink-soft">{c.type ? `${c.type} · ` : ""}{c.court_id}</p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.count}</td>
                    <td className="px-3 py-3 text-right font-bold text-ink tabular-nums">{formatVND(c.amount)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-pitch-100">
                          <div className="h-full rounded-full bg-pitch-600" style={{ width: `${share * 100}%` }} />
                        </div>
                        <span className="w-9 text-right text-xs text-ink-soft tabular-nums">{Math.round(share * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Chi tiết giao dịch (từng dòng owner_revenue) */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
          <h2 className="font-bold text-ink">
            Chi tiết giao dịch <span className="font-normal text-ink-soft">· {tx.total}</span>
          </h2>
          <select value={txStatus} onChange={(e) => setTxStatus(e.target.value)} className={selectCls}>
            <option value="">Mọi trạng thái</option>
            {Object.entries(REVENUE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        {tx.items.length === 0 ? (
          <EmptyState>Chưa có giao dịch nào.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-[#f4f7f5] text-left text-xs font-semibold tracking-wide text-ink-soft uppercase">
                <tr>
                  <th className="px-5 py-2.5">Thời gian</th>
                  <th className="px-3 py-2.5">Mã đặt sân</th>
                  <th className="px-3 py-2.5">Sân</th>
                  <th className="px-3 py-2.5 text-right">Số tiền</th>
                  <th className="px-5 py-2.5">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {tx.items.map((r) => (
                  <tr key={r._id} className={r.status === "refunded" ? "opacity-60" : ""}>
                    <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                      <p className="text-ink">{formatDateTimeVN(r.paid_at ?? r.created_at)}</p>
                      <p className="text-xs text-ink-soft">{r.paid_at ? "Thanh toán" : "Tạo lúc"}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-ink">{r.booking_id}</td>
                    <td className="px-3 py-3 font-semibold text-ink">{r.court_name ?? r.court_id}</td>
                    <td className="px-3 py-3 text-right font-bold text-ink tabular-nums">{formatVND(r.amount)}</td>
                    <td className="px-5 py-3"><RevenueBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3 text-sm">
            <button className={`${btnGhost} h-8 px-2`} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước">
              <ChevronLeft size={16} />
            </button>
            <span className="text-ink-soft tabular-nums">{page} / {totalPages}</span>
            <button className={`${btnGhost} h-8 px-2`} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

function RevenueBadge({ status }) {
  const s = REVENUE_STATUS[status] ?? { label: status, cls: "bg-gray-100 text-gray-700 ring-gray-400/25" };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ${s.cls}`}>{s.label}</span>;
}

/* Biểu đồ cột 1 chuỗi (doanh thu), không cần thư viện. Rê chuột / chạm vào cột để xem số liệu. */
function BarChart({ series }) {
  const [active, setActive] = useState(null);
  if (!series.length || series.every((s) => s.value === 0)) return <EmptyState>Chưa có doanh thu trong khoảng này.</EmptyState>;

  const max = Math.max(...series.map((s) => s.value));
  const ticks = [1, 0.5, 0].map((t) => t * max);
  const labelEvery = Math.ceil(series.length / 10);
  const current = active != null ? series[active] : null;

  return (
    <div>
      <div className="mb-2 h-10 text-sm">
        {current ? (
          <>
            <p className="text-ink-soft">
              {current.full} · {current.count} lượt
            </p>
            <p className="font-extrabold text-ink tabular-nums">Doanh thu {formatVND(current.value)}</p>
          </>
        ) : (
          <p className="pt-2 text-ink-soft">Rê chuột vào cột để xem chi tiết</p>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex h-56 flex-col justify-between pb-6 text-right text-[11px] text-ink-soft tabular-nums">
          {ticks.map((t, i) => <span key={i}>{formatShortVND(t)}</span>)}
        </div>

        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((_, i) => (
              <div key={i} className={`border-t ${i === ticks.length - 1 ? "border-ink-soft/40" : "border-dashed border-edge"}`} />
            ))}
          </div>

          <div className="relative flex h-56 items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
            {series.map((s, i) => (
              <div
                key={s.key}
                className="group flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
              >
                <div className="flex flex-1 items-end">
                  <div
                    className={`w-full rounded-t-[4px] transition-colors ${active === i ? "bg-pitch-700" : "bg-pitch-600/80 group-hover:bg-pitch-700"}`}
                    style={{ height: `${max ? (s.value / max) * 100 : 0}%`, minHeight: s.value ? 2 : 0 }}
                  />
                </div>
                <span className="mt-1 h-5 truncate text-center text-[10px] text-ink-soft">{i % labelEvery === 0 ? s.label : ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
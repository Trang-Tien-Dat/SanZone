import { useEffect, useMemo, useState } from "react";
import { Wallet, Receipt, Hourglass, Info } from "lucide-react";
import { getAdminRevenue } from "../../services/adminApi";
import { addDays, eachDay, formatDateVN, formatVND, toDateStr, todayStr } from "../../utils/format";
import { PageTitle, Panel, Stat, Tabs, Bars, Empty, ErrorNote, Avatar, inputCls } from "./UI";

// Doanh thu admin = phí thuê bao chủ sân đóng (collection "subscriptions").
function rangeOf(view) {
  const now = new Date();
  const today = todayStr();
  if (view === "day") return { from: addDays(today, -29), to: today, group: "day" };
  if (view === "month") return { from: `${now.getFullYear()}-01-01`, to: today, group: "month" };
  return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today, group: "day" };
}

const VIEWS = [
  ["day", "30 ngày"],
  ["month", "Theo tháng"],
  ["custom", "Tuỳ chọn"],
];

export default function AdminRevenue() {
  const [view, setView] = useState("day");
  const [range, setRange] = useState(rangeOf("day"));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const valid = range.from && range.to && range.from <= range.to;

  useEffect(() => {
    if (!valid) return;
    setData(null);
    setError("");
    getAdminRevenue(range).then(setData).catch((e) => setError(e.message));
  }, [range, valid]);

  function chooseView(v) {
    setView(v);
    if (v !== "custom") setRange(rangeOf(v));
  }

  const series = useMemo(() => {
    if (!data || !valid) return [];
    const isMonth = data.group === "month";
    const byKey = new Map(data.series.map((s) => [s.key, s]));
    const keys = [...new Set(eachDay(range.from, range.to).map((d) => (isMonth ? d.slice(0, 7) : d)))];
    return keys.map((key) => ({
      key,
      value: byKey.get(key)?.amount ?? 0,
      label: isMonth ? `T${Number(key.slice(5))}` : formatDateVN(key, { day: "2-digit", month: "2-digit" }),
      full: isMonth ? `Tháng ${Number(key.slice(5))}/${key.slice(0, 4)}` : formatDateVN(key, { weekday: "long", day: "2-digit", month: "2-digit" }),
    }));
  }, [data, range, valid]);

  const dash = (v) => (data ? v : "…");

  return (
    <>
      <PageTitle title="Doanh thu" subtitle="Tiền hệ thống thu từ phí thuê bao hằng tháng của chủ sân.">
        <Tabs items={VIEWS} value={view} onChange={chooseView} />
        {view === "custom" && (
          <>
            <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={inputCls} />
            <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={inputCls} />
            <select value={range.group} onChange={(e) => setRange((r) => ({ ...r, group: e.target.value }))} className={inputCls}>
              <option value="day">Theo ngày</option>
              <option value="month">Theo tháng</option>
            </select>
          </>
        )}
      </PageTitle>

      <ErrorNote>{error || (!valid && "Ngày bắt đầu phải trước ngày kết thúc.")}</ErrorNote>

      {data && data.total === 0 && data.pending === 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-800">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            Chưa có khoản thu nào. Doanh thu sẽ xuất hiện khi làm xong tính năng <b>phí thuê bao 50.000đ/tháng</b> cho chủ sân.
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Doanh thu trong kỳ" value={dash(formatVND(data?.total))} icon={Wallet} tone="emerald" />
        <Stat label="Số khoản đã thu" value={dash(data?.count)} icon={Receipt} tone="sky" />
        <Stat label="Khoản chờ thanh toán" value={dash(data?.pending)} hint="Tất cả thời gian" icon={Hourglass} tone="amber" />
      </div>

      <Panel title={`Doanh thu theo ${range.group === "month" ? "tháng" : "ngày"}`} className="mb-6">
        {!data ? <Empty>Đang tải...</Empty> : series.every((s) => !s.value) ? <Empty>Không có doanh thu trong khoảng này.</Empty> : <Bars series={series} format={formatVND} />}
      </Panel>

      <Panel title="Theo chủ sân" bodyClass="p-0">
        {!data ? (
          <Empty>Đang tải...</Empty>
        ) : data.byOwner.length === 0 ? (
          <Empty>Chưa có dữ liệu.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.byOwner.map((o) => {
              const share = data.total ? o.amount / data.total : 0;
              return (
                <li key={o.owner_id} className="flex items-center gap-4 px-5 py-3">
                  <Avatar name={o.fullName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{o.fullName}</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900 tabular-nums">{formatVND(o.amount)}</p>
                    <p className="text-xs text-slate-400">{o.count} khoản · {Math.round(share * 100)}%</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
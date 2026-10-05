import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, CalendarCheck2, UserRound, Building2, ArrowRight, MapPinned } from "lucide-react";
import { getStats } from "../../services/adminApi";
import { formatVND, formatDateVN, formatDateTimeVN } from "../../utils/format";
import { Panel, Stat, Pill, Bars, Empty, ErrorNote, Avatar, BOOKING_STATUS } from "./UI";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getStats().then(setData).catch((e) => setError(e.message));
  }, []);

  const t = data?.totals;
  const dash = (v) => (data ? v : "…");
  const series = (data?.series ?? []).map((s) => ({
    key: s.date,
    value: s.count,
    label: formatDateVN(s.date, { day: "2-digit", month: "2-digit" }),
    full: formatDateVN(s.date, { weekday: "long", day: "2-digit", month: "2-digit" }),
  }));
  const week = series.slice(-7).reduce((s, x) => s + x.value, 0);
  const prevWeek = series.slice(0, 7).reduce((s, x) => s + x.value, 0);

  return (
    <>
      {/* Lời chào */}
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-900 px-6 py-7 text-white md:px-8">
        <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <p className="relative text-sm text-emerald-300">Tổng quan hệ thống</p>
        <h1 className="relative mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">Chào mừng trở lại 👋</h1>
        <p className="relative mt-2 max-w-xl text-sm text-slate-300">
          {data
            ? `${t.venues} cụm sân · ${t.courts} sân đang hoạt động trên hệ thống. Tuần này có ${week} lượt đặt${
                prevWeek ? ` (${week >= prevWeek ? "+" : ""}${Math.round(((week - prevWeek) / prevWeek) * 100)}% so với tuần trước)` : ""
              }.`
            : "Đang tải số liệu..."}
        </p>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tổng doanh thu" value={dash(formatVND(t?.revenue))} hint="Phí thuê bao chủ sân đã thu" icon={Wallet} tone="emerald" />
        <Stat label="Tổng booking" value={dash(t?.bookings.toLocaleString("vi-VN"))} hint="Không tính lượt đã huỷ" icon={CalendarCheck2} tone="sky" />
        <Stat label="Khách hàng" value={dash(t?.customers.toLocaleString("vi-VN"))} hint="Tài khoản khách hàng" icon={UserRound} tone="violet" />
        <Stat label="Chủ sân" value={dash(t?.owners.toLocaleString("vi-VN"))} hint={data ? `${t.venues} cụm · ${t.courts} sân` : ""} icon={Building2} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Lượt đặt sân 14 ngày qua" action={<span className="text-sm text-slate-500">theo ngày đá</span>}>
          {!data ? <Empty>Đang tải...</Empty> : series.every((s) => !s.value) ? <Empty>Chưa có lượt đặt nào.</Empty> : <Bars series={series} format={(v) => `${v} lượt`} />}
        </Panel>

        <Panel
          title="Lượt đặt mới nhất"
          bodyClass="p-0"
          action={
            <Link to="/admin/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700">
              Xem tất cả <ArrowRight size={15} />
            </Link>
          }
        >
          {!data ? (
            <Empty>Đang tải...</Empty>
          ) : data.latest.length === 0 ? (
            <Empty>Chưa có lượt đặt nào.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.latest.map((b) => (
                <li key={b.booking_id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={b.customer_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{b.customer_name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                      <MapPinned size={12} /> {b.court_name} · {b.venue_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{formatVND(b.amount)}</p>
                    <p className="text-[11px] text-slate-400">{formatDateTimeVN(b.created_at)}</p>
                  </div>
                  <span className="hidden sm:block">
                    <Pill tone={BOOKING_STATUS[b.status]?.tone}>{BOOKING_STATUS[b.status]?.label ?? b.status}</Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
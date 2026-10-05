import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Clock, Wallet, TrendingUp, CalendarPlus, ChevronRight } from "lucide-react";
import { getBookings, getRevenue } from "../../services/ownerApi";
import { formatVND, todayStr, toDateStr, formatDateVN } from "../../utils/format";
import { Card, PageHeader, StatCard, StatusBadge, SourceBadge, EmptyState, ErrorBox, btnPrimary } from "./components";

export default function OwnerDashboard() {
  const [bookings, setBookings] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = todayStr();
  const now = new Date();
  const monthStart = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));

  useEffect(() => {
    Promise.all([
      getBookings({ from: monthStart, to: toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }),
      getRevenue({ from: monthStart, to: today }),
    ])
      .then(([list, rev]) => {
        setBookings(list);
        setRevenue(rev);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const todayList = bookings.filter((b) => b.booking_date === today);
    return {
      todayList: todayList
        .filter((b) => b.status !== "cancelled")
        .sort((a, b) => String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")) || String(a.court_name ?? "").localeCompare(String(b.court_name ?? ""))),
      todayRevenue: revenue?.series.find((x) => x.key === today)?.net_amount ?? 0,
      monthRevenue: revenue?.summary.paid?.net_amount ?? 0,
      pending: bookings.filter((b) => b.status === "pending" && b.booking_date >= today).length,
    };
  }, [bookings, revenue, today]);

  return (
    <>
      <PageHeader title="Tổng quan" subtitle={formatDateVN(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
        <Link to="/owner/book" className={btnPrimary}>
          <CalendarPlus size={16} /> Đặt sân nhanh
        </Link>
      </PageHeader>

      <ErrorBox>{error}</ErrorBox>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lượt đặt hôm nay" value={loading ? "…" : stats.todayList.length} icon={CalendarCheck} />
        <StatCard label="Chờ xác nhận" value={loading ? "…" : stats.pending} hint="Từ hôm nay trở đi" icon={Clock} />
        <StatCard label="Thực nhận hôm nay" value={loading ? "…" : formatVND(stats.todayRevenue)} icon={Wallet} />
        <StatCard
          label="Thực nhận tháng này"
          value={loading ? "…" : formatVND(stats.monthRevenue)}
          
          icon={TrendingUp}
        />
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="font-bold text-ink">Lịch hôm nay</h2>
          <Link to="/owner/bookings" className="flex items-center text-sm font-semibold text-pitch-700 hover:underline">
            Xem tất cả <ChevronRight size={16} />
          </Link>
        </div>
        {loading ? (
          <EmptyState>Đang tải...</EmptyState>
        ) : stats.todayList.length === 0 ? (
          <EmptyState>Hôm nay chưa có lượt đặt nào.</EmptyState>
        ) : (
          <ul className="divide-y divide-edge">
            {stats.todayList.map((b) => (
              <li key={b.booking_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="w-28 font-bold text-pitch-700 tabular-nums">
                  {b.start_time} – {b.end_time}
                </span>
                <span className="w-28 text-sm font-semibold text-ink">
                  {b.court_name}
                  <span className="ml-1.5 text-xs font-normal text-ink-soft">{b.booking_type === "half" ? "½ sân" : "cả sân"}</span>
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {b.customer_name} <span className="text-ink-soft">· {b.customer_phone}</span> <SourceBadge source={b.source} />
                </span>
                <span className="text-sm font-semibold text-ink tabular-nums">{formatVND(b.total_price)}</span>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
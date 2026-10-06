import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, CalendarDays, CalendarPlus, Wallet, LogOut, BadgeCheck, Lock, AlertTriangle, Users, Store } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getSubscription } from "../../services/ownerApi";

const SUB_PATH = "/owner/subscription";

const NAV = [
  { to: "/owner", end: true, label: "Tổng quan", icon: LayoutDashboard },
  { to: "/owner/bookings", label: "Lịch đặt sân", icon: CalendarDays },
  { to: "/owner/book", label: "Đặt sân", icon: CalendarPlus },
  { to: "/owner/customers", label: "Khách hàng", icon: Users },
  { to: "/owner/revenue", label: "Doanh thu", icon: Wallet },
  { to: "/owner/venue", label: "Thông tin sân", icon: Store },
  { to: SUB_PATH, label: "Gói dịch vụ", icon: BadgeCheck, always: true },
];

const linkCls = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition ${
    isActive ? "bg-pitch-700 text-white" : "text-ink-soft hover:bg-pitch-100 hover:text-pitch-700"
  }`;
const lockedCls = "flex cursor-not-allowed items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-ink-soft/50";

export default function OwnerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Gói dịch vụ: null = đang tải; lỗi thì không khoá (để không chặn nhầm khi backend chưa cập nhật)
  const [sub, setSub] = useState(null);
  const [subError, setSubError] = useState(false);
  const refreshSubscription = useCallback(
    () =>
      getSubscription()
        .then((s) => {
          setSub(s);
          setSubError(false);
          return s;
        })
        .catch(() => setSubError(true)),
    []
  );
  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  const locked = Boolean(sub && !sub.active);

  async function handleLogout() {
    await logout?.();
    navigate("/", { replace: true });
  }

  // Chưa đóng phí / hết hạn -> chỉ được vào trang Gói dịch vụ
  if (locked && pathname !== SUB_PATH) return <Navigate to={SUB_PATH} replace />;

  const navItem = ({ to, end, label, icon: Icon, always }, mobile) =>
    locked && !always ? (
      <span key={to} className={`${lockedCls} ${mobile ? "shrink-0 py-2" : ""}`} title="Thanh toán phí dịch vụ để mở khoá">
        <Icon size={mobile ? 16 : 18} /> {label} <Lock size={12} className="ml-auto" />
      </span>
    ) : (
      <NavLink key={to} to={to} end={end} className={(s) => `${linkCls(s)} ${mobile ? "shrink-0 py-2" : ""}`}>
        <Icon size={mobile ? 16 : 18} /> {label}
      </NavLink>
    );

  return (
    <div className="min-h-screen bg-[#f4f7f5] lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-edge bg-white p-5 lg:flex">
        <div className="mb-8 px-1">
          <p className="text-lg font-extrabold tracking-tight text-pitch-700">Quản lý sân</p>
          <p className="text-xs text-ink-soft">Dành cho chủ sân</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">{NAV.map((n) => navItem(n, false))}</nav>

        {sub && (
          <Link
            to={SUB_PATH}
            className={`mb-4 rounded-xl px-3.5 py-3 text-xs transition ${
              sub.active ? "bg-pitch-50 text-ink-soft hover:bg-pitch-100" : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            {sub.active ? (
              <>
                <span className="font-bold text-pitch-700">Gói đang hoạt động</span>
                <span className="block">Còn {sub.days_left} ngày</span>
              </>
            ) : (
              <>
                <span className="font-bold">Chưa kích hoạt gói</span>
                <span className="block">Thanh toán để sử dụng</span>
              </>
            )}
          </Link>
        )}

        <div className="border-t border-edge pt-4">
          <p className="truncate px-1 text-sm font-semibold text-ink">{user?.fullName || user?.full_name || "Chủ sân"}</p>
          <p className="mb-3 truncate px-1 text-xs text-ink-soft">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* Header + tab (mobile) */}
      <header className="sticky top-0 z-30 border-b border-edge bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-extrabold text-pitch-700">Quản lý sân</p>
          <button onClick={handleLogout} aria-label="Đăng xuất" className="text-red-700">
            <LogOut size={18} />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">{NAV.map((n) => navItem(n, true))}</nav>
      </header>

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        {/* Sắp hết hạn */}
        {sub?.active && sub.days_left <= 5 && pathname !== SUB_PATH && (
          <Link
            to={SUB_PATH}
            className="mb-5 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100"
          >
            <AlertTriangle size={18} className="shrink-0" />
            <span>
              Gói dịch vụ còn <b>{sub.days_left} ngày</b>. Gia hạn ngay để không bị gián đoạn nhận đặt sân.
            </span>
            <span className="ml-auto font-bold whitespace-nowrap">Gia hạn →</span>
          </Link>
        )}
        {subError && pathname === SUB_PATH && (
          <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Không tải được thông tin gói dịch vụ.</p>
        )}
        <Outlet context={{ subscription: sub, refreshSubscription }} />
      </main>
    </div>
  );
}
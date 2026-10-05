import { useState } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, TrendingUp, TicketPercent, CalendarCheck2, LogOut, Menu, X, ShieldCheck, QrCode } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const NAV = [
  { to: "/admin", end: true, label: "Tổng quan", icon: LayoutDashboard },
  { to: "/admin/accounts", label: "Tài khoản", icon: Users },
  { to: "/admin/bookings", label: "Booking", icon: CalendarCheck2 },
  { to: "/admin/revenue", label: "Doanh thu", icon: TrendingUp },
  
  { to: "/admin/promotions", label: "Khuyến mãi", icon: TicketPercent },
];

export default function AdminLayout() {
  const { user, checking, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Chặn người không phải admin (role_id = 1)
  if (checking) return <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">Đang tải...</div>;
  if (!user || Number(user.role_id) !== 1) return <Navigate to="/" replace />;

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-slate-950 text-slate-300">
      <div className="flex items-center gap-3 px-6 py-6">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
          <ShieldCheck size={21} />
        </span>
        <div>
          <p className="leading-tight font-extrabold text-white">Sân Ngay</p>
          <p className="text-xs text-slate-400">Trang quản trị</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <p className="px-3 pt-2 pb-2 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Quản lý</p>
        {NAV.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-2 bottom-2 left-0 w-1 rounded-r-full bg-emerald-400" />}
                <Icon size={18} className={isActive ? "text-emerald-400" : ""} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-2xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-300">
            {(user.fullName || "A").trim().slice(-1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.fullName}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => {
            logout();
            navigate("/", { replace: true });
          }}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut size={15} /> Đăng xuất
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar máy tính */}
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>

      {/* Sidebar điện thoại */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <div className="relative h-full w-64">{sidebar}</div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen((v) => !v)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-bold text-slate-900">Quản trị</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
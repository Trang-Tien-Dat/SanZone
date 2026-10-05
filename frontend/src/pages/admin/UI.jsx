/* Bộ component giao diện dùng chung cho các trang admin */
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

export const inputCls =
  "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15";
export const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSoft =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50";

export function PageTitle({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ title, action, className = "", bodyClass = "p-5", children }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const TONES = {
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  sky: "bg-sky-50 text-sky-600 ring-sky-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
};

export function Stat({ label, value, hint, icon: Icon, tone = "emerald" }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ${TONES[tone]}`}>
            <Icon size={19} />
          </span>
        )}
      </div>
      <p className="mt-2 text-[1.7rem] leading-tight font-extrabold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const PILL = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  gray: "bg-slate-100 text-slate-600 ring-slate-500/20",
};
export function Pill({ tone = "gray", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${PILL[tone]}`}>
      {children}
    </span>
  );
}

export const BOOKING_STATUS = {
  pending: { label: "Chờ xác nhận", tone: "amber" },
  confirmed: { label: "Đã xác nhận", tone: "green" },
  completed: { label: "Hoàn thành", tone: "sky" },
  cancelled: { label: "Đã huỷ", tone: "red" },
};
export const PAYMENT_STATUS = {
  unpaid: { label: "Chưa thanh toán", tone: "gray" },
  paid: { label: "Đã thanh toán", tone: "green" },
  refunded: { label: "Đã hoàn tiền", tone: "red" },
};

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className={`${inputCls} flex min-w-56 flex-1 items-center gap-2`}>
      <Search size={15} className="shrink-0 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent outline-none" />
      {value && (
        <button type="button" onClick={() => onChange("")} className="text-slate-400 hover:text-slate-600" aria-label="Xoá">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function Tabs({ items, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {items.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`h-8 rounded-lg px-3.5 text-sm font-semibold transition ${
            value === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, total, limit, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
      <span>
        {(page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button className={`${btnSoft} h-8 w-8 px-0`} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước">
          <ChevronLeft size={16} />
        </button>
        <span className="w-14 text-center tabular-nums">
          {page}/{pages}
        </span>
        <button className={`${btnSoft} h-8 w-8 px-0`} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function Empty({ children = "Không có dữ liệu." }) {
  return <p className="py-10 text-center text-sm text-slate-400">{children}</p>;
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{children}</p>;
}

export function Avatar({ name = "?" }) {
  const letters = String(name).trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-bold text-white">
      {letters}
    </span>
  );
}

/* Biểu đồ cột đơn giản. series: [{ key, label, full, value }] */
export function Bars({ series, format = (v) => v, height = "h-52" }) {
  const max = Math.max(1, ...series.map((s) => s.value));
  const every = Math.ceil(series.length / 12);
  return (
    <div className={`flex ${height} items-end gap-1.5`}>
      {series.map((s, i) => (
        <div key={s.key} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
          <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
            <p className="text-slate-300">{s.full ?? s.label}</p>
            <p className="font-bold">{format(s.value)}</p>
          </div>
          <div className="flex flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400 transition group-hover:from-emerald-700 group-hover:to-emerald-500"
              style={{ height: `${(s.value / max) * 100}%`, minHeight: s.value ? 3 : 0 }}
            />
          </div>
          <span className="mt-1.5 h-4 truncate text-center text-[10px] text-slate-400">{i % every === 0 ? s.label : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* Hộp thoại */
export function Modal({ open, title, onClose, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`my-auto w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl bg-white shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
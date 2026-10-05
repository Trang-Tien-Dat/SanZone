import { BOOKING_STATUS } from "../../utils/format";

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ className = "", children }) {
  return <div className={`rounded-2xl border border-edge bg-white p-5 ${className}`}>{children}</div>;
}

export function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-ink-soft">{label}</p>
        {Icon && (
          <span className="grid size-9 place-items-center rounded-lg bg-pitch-100 text-pitch-700">
            <Icon size={18} />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </Card>
  );
}

export function StatusBadge({ status }) {
  const s = BOOKING_STATUS[status] ?? { label: status, cls: "bg-gray-100 text-gray-700 ring-gray-400/25" };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function SourceBadge({ source }) {
  return source === "owner" ? (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">Chủ sân đặt</span>
  ) : null;
}

export const selectCls =
  "h-10 rounded-lg border-[1.5px] border-edge bg-white px-3 text-sm text-ink outline-none focus:border-pitch-600 focus:ring-3 focus:ring-pitch-600/15";

export const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-pitch-700 px-4 text-sm font-bold text-white transition hover:bg-pitch-600 active:bg-pitch-900 disabled:cursor-not-allowed disabled:opacity-60";

export const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border-[1.5px] border-edge bg-white px-3 text-sm font-semibold text-ink-soft transition hover:border-pitch-600 hover:text-pitch-700 disabled:opacity-50";

export function EmptyState({ children }) {
  return <p className="py-10 text-center text-sm text-ink-soft">{children}</p>;
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return (
    <p className="mb-4 rounded-r-lg border-l-4 border-red-700 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
      {children}
    </p>
  );
}
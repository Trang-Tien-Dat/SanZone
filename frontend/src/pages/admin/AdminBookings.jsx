import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock, UserRound, Building2, Eye } from "lucide-react";
import { getAdminBookings, setBookingStatus, setPaymentStatus } from "../../services/adminApi";
import { addDays, formatDateVN, formatDateTimeVN, formatVND, todayStr } from "../../utils/format";
import {
  PageTitle, Panel, SearchBox, Pill, Pager, Empty, ErrorNote, Modal, Tabs,
  BOOKING_STATUS, PAYMENT_STATUS, inputCls, btnSoft,
} from "./UI";

const LIMIT = 15;
const RANGES = [
  ["all", "Tất cả"],
  ["today", "Hôm nay"],
  ["7d", "7 ngày tới"],
  ["30d", "30 ngày qua"],
];
function rangeOf(k) {
  const t = todayStr();
  if (k === "today") return { from: t, to: t };
  if (k === "7d") return { from: t, to: addDays(t, 6) };
  if (k === "30d") return { from: addDays(t, -29), to: t };
  return { from: "", to: "" };
}

export default function AdminBookings() {
  const [rangeKey, setRangeKey] = useState("all");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, value: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [rangeKey, status, payment, debouncedQ]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getAdminBookings({ ...rangeOf(rangeKey), status, payment_status: payment, q: debouncedQ, page, limit: LIMIT })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey, status, payment, debouncedQ, page]);
  useEffect(load, [load]);

  async function change(kind, value) {
    if (!detail) return;
    if (kind === "status" && value === "cancelled" && !window.confirm(`Huỷ lượt đặt ${detail.booking_id}?`)) return;
    setBusy(true);
    try {
      const patch = kind === "status" ? await setBookingStatus(detail.booking_id, value) : await setPaymentStatus(detail.booking_id, value);
      const merge = (b) => (b.booking_id === detail.booking_id ? { ...b, ...patch } : b);
      setData((d) => ({ ...d, items: d.items.map(merge) }));
      setDetail((b) => ({ ...b, ...patch }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="Quản lý booking" subtitle="Tất cả lượt đặt sân trên hệ thống — xem đơn, trạng thái và thanh toán." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs items={RANGES} value={rangeKey} onChange={setRangeKey} />
        <SearchBox value={q} onChange={setQ} placeholder="Mã đặt, tên hoặc SĐT khách..." />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(BOOKING_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={payment} onChange={(e) => setPayment(e.target.value)} className={inputCls}>
          <option value="">Mọi thanh toán</option>
          {Object.entries(PAYMENT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <Panel
        bodyClass="p-0"
        title={
          <span>
            {data.total} lượt đặt
            <span className="ml-2 text-sm font-normal text-slate-500">· giá trị đã xác nhận {formatVND(data.value)}</span>
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
                <th className="px-5 py-3">Mã / Khách</th>
                <th className="px-3 py-3">Sân</th>
                <th className="px-3 py-3">Lịch đá</th>
                <th className="px-3 py-3 text-right">Tiền</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Thanh toán</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && data.items.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty>Không có lượt đặt nào.</Empty>
                  </td>
                </tr>
              )}
              {data.items.map((b) => (
                <tr key={b.booking_id} className="cursor-pointer transition hover:bg-slate-50/70" onClick={() => setDetail(b)}>
                  <td className="px-5 py-3">
                    <p className="font-mono text-xs font-semibold text-emerald-700">{b.booking_id}</p>
                    <p className="font-semibold text-slate-900">{b.customer_name}</p>
                    <p className="text-xs text-slate-400">{b.customer_phone}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-800">{b.court_name}</p>
                    <p className="text-xs text-slate-400">{b.venue_name}</p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-700">
                    <p>{b.booking_date ? formatDateVN(b.booking_date, { weekday: "short", day: "2-digit", month: "2-digit" }) : "—"}</p>
                    <p className="text-xs text-slate-400 tabular-nums">
                      {b.start_time}–{b.end_time} · {b.booking_type === "half" ? "½ sân" : "cả sân"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-900 tabular-nums">{formatVND(b.amount - b.discount)}</td>
                  <td className="px-3 py-3">
                    <Pill tone={BOOKING_STATUS[b.status]?.tone}>{BOOKING_STATUS[b.status]?.label ?? b.status}</Pill>
                  </td>
                  <td className="px-3 py-3">
                    <Pill tone={PAYMENT_STATUS[b.payment_status]?.tone}>{PAYMENT_STATUS[b.payment_status]?.label ?? b.payment_status}</Pill>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    <Eye size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <Empty>Đang tải...</Empty>}
        <Pager page={page} total={data.total} limit={LIMIT} onChange={setPage} />
      </Panel>

      {/* Chi tiết đơn */}
      <Modal open={!!detail} title={detail ? `Đơn ${detail.booking_id}` : ""} onClose={() => !busy && setDetail(null)} wide>
        {detail && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info icon={UserRound} label="Khách hàng">
                {detail.customer_name}
                <span className="block text-xs font-normal text-slate-500">
                  {detail.customer_phone} · {detail.source === "owner" ? "Chủ sân đặt hộ" : "Đặt online"}
                </span>
              </Info>
              <Info icon={Building2} label="Sân">
                {detail.court_name} · {detail.venue_name}
                <span className="block text-xs font-normal text-slate-500">Chủ sân: {detail.owner_name}</span>
              </Info>
              <Info icon={CalendarDays} label="Ngày đá">
                {detail.booking_date ? formatDateVN(detail.booking_date, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
              </Info>
              <Info icon={Clock} label="Giờ">
                {detail.start_time}–{detail.end_time} · {detail.booking_type === "half" ? "Nửa sân" : "Nguyên sân"}
              </Info>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <Row label="Tiền sân">{formatVND(detail.amount)}</Row>
              {detail.discount > 0 && <Row label={`Khuyến mãi ${detail.promo_code ?? ""}`}>−{formatVND(detail.discount)}</Row>}
              <Row label={<b className="text-slate-900">Khách trả</b>}>
                <b className="text-base text-emerald-700">{formatVND(detail.amount - detail.discount)}</b>
              </Row>
              <Row label="Đặt lúc">{formatDateTimeVN(detail.created_at)}</Row>
              {detail.paid_at && <Row label="Thanh toán lúc">{formatDateTimeVN(detail.paid_at)}</Row>}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Trạng thái đơn</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(BOOKING_STATUS).map(([k, v]) => (
                  <button key={k} disabled={busy || detail.status === k} onClick={() => change("status", k)} className={chipCls(detail.status === k)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Thanh toán <span className="font-normal text-slate-400">· sẽ tự cập nhật khi có thanh toán online</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PAYMENT_STATUS).map(([k, v]) => (
                  <button key={k} disabled={busy || detail.payment_status === k} onClick={() => change("payment", k)} className={chipCls(detail.payment_status === k)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button className={btnSoft} onClick={() => setDetail(null)} disabled={busy}>
                Đóng
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

const chipCls = (active) =>
  `h-9 rounded-xl border px-3.5 text-sm font-semibold transition disabled:cursor-default ${
    active ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
  }`;

function Info({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-100 p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{children}</p>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-800 tabular-nums">{children}</span>
    </div>
  );
}
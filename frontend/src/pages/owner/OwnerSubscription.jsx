import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { BadgeCheck, Copy, Check, QrCode, ShieldCheck, Smartphone, CalendarRange, Loader2, PartyPopper } from "lucide-react";
import { formatDateVN, formatDateTimeVN, formatVND } from "../../utils/format";
import { PageHeader } from "./components";

const dateVN = (s) => (s ? formatDateVN(s, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const POLL_MS = 5000; // hỏi lại trạng thái mỗi 5 giây khi đang có hoá đơn chờ thanh toán

export default function OwnerSubscription() {
  const { subscription: sub, refreshSubscription } = useOutletContext();
  const [justPaid, setJustPaid] = useState(null); // hoá đơn vừa được hệ thống tự kích hoạt
  const prevPendingId = useRef(null);

  const pendingId = sub?.pending?.subscription_id || null;
  const bankReady = Boolean(sub?.pending?.qr_url);

  // Đang có hoá đơn chờ -> tự hỏi lại server để biết tiền đã về chưa (webhook SePay kích hoạt ở backend)
  useEffect(() => {
    if (!pendingId || !bankReady) return;
    const id = setInterval(() => {
      if (!document.hidden) refreshSubscription();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pendingId, bankReady, refreshSubscription]);

  // Hoá đơn đang chờ biến mất và nằm trong lịch sử đã thanh toán -> báo thành công
  useEffect(() => {
    const prev = prevPendingId.current;
    if (prev && prev !== pendingId) {
      const paid = sub?.history?.find((h) => h.subscription_id === prev);
      if (paid) setJustPaid(paid);
    }
    prevPendingId.current = pendingId;
  }, [pendingId, sub]);

  if (!sub) return <p className="py-10 text-center text-ink-soft">Đang tải...</p>;

  const inv = sub.pending;

  return (
    <>
      <PageHeader title="Gói dịch vụ" subtitle={`Phí sử dụng hệ thống ${formatVND(sub.fee)} / ${sub.period_days} ngày, thanh toán bằng chuyển khoản QR.`} />

      {justPaid && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-pitch-600/30 bg-pitch-50 px-5 py-4 text-sm text-pitch-700">
          <PartyPopper size={20} className="mt-0.5 shrink-0" />
          <p>
            <b>Đã nhận {formatVND(justPaid.amount)}</b> cho hoá đơn {justPaid.subscription_id}. Gói dịch vụ đã được kích hoạt tự động, kỳ{" "}
            {dateVN(justPaid.period_start)} – {dateVN(justPaid.period_end)}.
          </p>
        </div>
      )}

      {/* Trạng thái gói */}
      <div
        className={`mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${
          sub.active ? "border-pitch-600/30 bg-pitch-50" : "border-red-200 bg-red-50"
        }`}
      >
        <span className={`grid h-12 w-12 place-items-center rounded-full ${sub.active ? "bg-pitch-700 text-white" : "bg-red-600 text-white"}`}>
          {sub.active ? <BadgeCheck size={24} /> : <ShieldCheck size={24} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-lg font-extrabold ${sub.active ? "text-pitch-700" : "text-red-700"}`}>
            {sub.active ? "Gói đang hoạt động" : "Chưa kích hoạt gói dịch vụ"}
          </p>
          <p className="text-sm text-ink-soft">
            {sub.active
              ? `Sử dụng đến hết ngày ${dateVN(sub.active_until)} · còn ${sub.days_left} ngày`
              : "Thanh toán phí dịch vụ để mở khoá quản lý sân, lịch đặt và nhận khách đặt sân."}
          </p>
        </div>
      </div>

      {inv && (
        <div className="mb-6 grid gap-6 overflow-hidden rounded-2xl border border-edge bg-white lg:grid-cols-[340px_1fr]">
          {/* QR */}
          <div className="flex flex-col items-center justify-center bg-gradient-to-br from-pitch-700 to-pitch-900 p-6 text-white">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
              <QrCode size={16} /> Quét mã để thanh toán
            </p>
            {bankReady ? (
              <div className="rounded-2xl bg-white p-3 shadow-xl">
                <img src={inv.qr_url} alt={`Mã QR thanh toán ${inv.subscription_id}`} className="block h-64 w-64 object-contain" />
              </div>
            ) : (
              <div className="grid h-64 w-64 place-items-center rounded-2xl bg-white/10 p-6 text-center text-sm text-white/80">
                Hệ thống chưa cấu hình tài khoản nhận tiền. Vui lòng liên hệ quản trị viên.
              </div>
            )}
            <p className="mt-4 text-3xl font-extrabold tabular-nums">{formatVND(inv.amount)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/70">
              <Smartphone size={13} /> Mở app ngân hàng bất kỳ → Quét QR
            </p>
          </div>

          {/* Thông tin chuyển khoản */}
          <div className="p-6">
            <p className="mb-1 text-sm font-semibold text-ink-soft">Hoá đơn {inv.subscription_id}</p>
            <p className="mb-5 flex items-center gap-1.5 text-sm text-ink">
              <CalendarRange size={15} className="text-pitch-600" /> Kỳ sử dụng {dateVN(inv.period_start)} – {dateVN(inv.period_end)}
            </p>

            <div className="divide-y divide-edge rounded-xl border border-edge">
              <CopyRow label="Ngân hàng" value={sub.bank.bank_id} />
              <CopyRow label="Số tài khoản" value={sub.bank.account_no} copy />
              <CopyRow label="Chủ tài khoản" value={sub.bank.account_name} />
              <CopyRow label="Số tiền" value={String(inv.amount)} display={formatVND(inv.amount)} copy />
              <CopyRow label="Nội dung" value={inv.transfer_note} copy highlight />
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Giữ <b>đúng nội dung chuyển khoản</b> và <b>đủ số tiền</b> để hệ thống tự nhận ra khoản thanh toán của bạn.
            </p>

            {bankReady && (
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-pitch-50 px-4 py-3 text-sm text-pitch-700">
                <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin" />
                <p>
                  Đang chờ thanh toán… Gói sẽ <b>tự động kích hoạt</b> trong vài giây sau khi tiền vào tài khoản, bạn không cần làm gì thêm.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lịch sử */}
      <div className="overflow-hidden rounded-2xl border border-edge bg-white">
        <h2 className="border-b border-edge px-5 py-4 font-bold text-ink">Lịch sử thanh toán</h2>
        {sub.history.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-soft">Chưa có khoản thanh toán nào.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {sub.history.map((h) => (
              <li key={h.subscription_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="font-mono text-xs text-ink-soft">{h.subscription_id}</span>
                <span className="text-ink">
                  {dateVN(h.period_start)} – {dateVN(h.period_end)}
                </span>
                <span className="text-xs text-ink-soft">Thanh toán {formatDateTimeVN(h.paid_at)}</span>
                <span className="ml-auto font-bold text-ink tabular-nums">{formatVND(h.amount)}</span>
                <span className="rounded-full bg-pitch-100 px-2.5 py-0.5 text-xs font-semibold text-pitch-700">Đã thanh toán</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function CopyRow({ label, value, display, copy, highlight }) {
  const [done, setDone] = useState(false);
  function doCopy() {
    navigator.clipboard?.writeText(value).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    });
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <span className="w-28 shrink-0 text-ink-soft">{label}</span>
      <span className={`min-w-0 flex-1 truncate font-semibold ${highlight ? "font-mono text-pitch-700" : "text-ink"}`}>{display ?? value ?? "—"}</span>
      {copy && value && (
        <button onClick={doCopy} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-soft transition hover:bg-pitch-100 hover:text-pitch-700" aria-label={`Sao chép ${label}`}>
          {done ? <Check size={15} className="text-pitch-700" /> : <Copy size={15} />}
        </button>
      )}
    </div>
  );
}
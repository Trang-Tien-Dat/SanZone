import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { BadgeCheck, Copy, Check, QrCode, ShieldCheck, Smartphone, CalendarRange, Loader2, PartyPopper, TicketPercent, X } from "lucide-react";
import { applySubscriptionPromo, removeSubscriptionPromo, getSubscriptionVouchers } from "../../services/ownerApi";
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
          {justPaid.promo_code && !justPaid.amount ? (
            <p>
              <b>Đã áp mã {justPaid.promo_code}</b>, gói dịch vụ được kích hoạt <b>miễn phí</b>, kỳ {dateVN(justPaid.period_start)} –{" "}
              {dateVN(justPaid.period_end)}.
            </p>
          ) : (
            <p>
              <b>Đã nhận {formatVND(justPaid.amount)}</b> cho hoá đơn {justPaid.subscription_id}. Gói dịch vụ đã được kích hoạt tự động, kỳ{" "}
              {dateVN(justPaid.period_start)} – {dateVN(justPaid.period_end)}.
            </p>
          )}
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
            {inv.promo_code && inv.base_amount > inv.amount && (
              <p className="mt-4 text-sm text-white/60 line-through tabular-nums">{formatVND(inv.base_amount)}</p>
            )}
            <p className={`${inv.promo_code ? "mt-0" : "mt-4"} text-3xl font-extrabold tabular-nums`}>{formatVND(inv.amount)}</p>
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

            <PromoBox inv={inv} onChanged={refreshSubscription} />

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
                {h.promo_code && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    <TicketPercent size={12} /> {h.promo_code}
                  </span>
                )}
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

/* ---------- Voucher cho hoá đơn đang chờ (chọn giống Shopee) ---------- */
function PromoBox({ inv, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await removeSubscriptionPromo(inv.subscription_id);
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-400 bg-amber-50/60 px-4 py-3">
        <TicketPercent size={20} className="shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">SanZone Voucher</p>
          {inv.promo_code ? (
            <p className="truncate text-sm text-amber-800">
              <b className="font-mono">{inv.promo_code}</b>
              {inv.discount ? <> · đã giảm {formatVND(inv.discount)}</> : null}
            </p>
          ) : (
            <p className="text-xs text-ink-soft">Chọn hoặc nhập mã để được giảm phí gói</p>
          )}
        </div>
        {inv.promo_code && (
          <button
            onClick={remove}
            disabled={busy}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
            aria-label="Bỏ voucher"
            title="Bỏ voucher"
          >
            <X size={16} />
          </button>
        )}
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 text-sm font-bold text-amber-700 transition hover:text-amber-900"
        >
          {inv.promo_code ? "Đổi" : "Chọn voucher"} ›
        </button>
      </div>
      {error && <p className="mt-1.5 text-sm font-medium text-red-700">{error}</p>}
      {open && <VoucherPicker inv={inv} onClose={() => setOpen(false)} onApplied={onChanged} />}
    </div>
  );
}

const voucherValue = (v) =>
  v.discount_type === "percent" ? `${v.discount_value}%` : `${Math.round(v.discount_value / 1000)}K`;

function VoucherPicker({ inv, onClose, onApplied }) {
  const [list, setList] = useState(null); // null = đang tải
  const [selected, setSelected] = useState(inv.promo_code || "");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSubscriptionVouchers(inv.subscription_id)
      .then(setList)
      .catch((e) => {
        setList([]);
        setError(e.message);
      });
  }, [inv.subscription_id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function apply(code) {
    if (!code) return;
    if (code === inv.promo_code) return onClose();
    setBusy(true);
    setError("");
    try {
      await applySubscriptionPromo(inv.subscription_id, code);
      await onApplied?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const chosen = list?.find((v) => v.code === selected);
  const usableCount = list?.filter((v) => v.usable).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chọn voucher"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        {/* Tiêu đề */}
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-lg font-bold">Chọn SanZone Voucher</h2>
          <button onClick={onClose} aria-label="Đóng" className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-pitch-100">
            <X size={18} />
          </button>
        </div>

        {/* Nhập mã */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply(typed.trim());
          }}
          className="flex gap-2 bg-pitch-50 px-5 py-3"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            placeholder="Nhập mã voucher"
            maxLength={20}
            className="h-10 min-w-0 flex-1 rounded-lg border-[1.5px] border-edge bg-white px-3 font-mono text-sm uppercase outline-none focus:border-pitch-600"
          />
          <button
            type="submit"
            disabled={busy || !typed.trim()}
            className="h-10 shrink-0 rounded-lg border-[1.5px] border-pitch-700 px-4 text-sm font-bold text-pitch-700 transition hover:bg-pitch-100 disabled:border-edge disabled:text-ink-soft"
          >
            Áp dụng
          </button>
        </form>
        {error && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

        {/* Danh sách voucher */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {list === null ? (
            <p className="py-8 text-center text-sm text-ink-soft">Đang tải voucher...</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">Hiện chưa có voucher nào. Nếu có mã, hãy nhập ở ô phía trên.</p>
          ) : (
            <>
              <p className="mb-3 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                Voucher phí gói · có thể chọn {usableCount}
              </p>
              <ul className="space-y-3">
                {list.map((v) => (
                  <VoucherCard key={v.code} v={v} selected={selected === v.code} onSelect={() => v.usable && setSelected(v.code)} />
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Chân: tổng giảm + nút đồng ý */}
        <div className="flex items-center gap-3 border-t border-edge px-5 py-4">
          <div className="min-w-0 flex-1 text-sm">
            {chosen ? (
              <>
                <p className="text-ink-soft">Đã chọn 1 voucher</p>
                <p className="font-bold text-amber-700">Giảm {formatVND(chosen.discount)} · còn {formatVND(chosen.final_amount)}</p>
              </>
            ) : (
              <p className="text-ink-soft">Chưa chọn voucher</p>
            )}
          </div>
          <button
            onClick={() => apply(selected)}
            disabled={busy || !chosen}
            className="h-11 shrink-0 rounded-lg bg-amber-500 px-6 font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? "Đang áp..." : "Đồng ý"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VoucherCard({ v, selected, onSelect }) {
  const low = v.remaining !== null && v.remaining > 0 && v.remaining <= 5;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={!v.usable}
        aria-pressed={selected}
        className={`flex w-full overflow-hidden rounded-xl border text-left transition ${
          !v.usable
            ? "cursor-not-allowed border-edge opacity-55 grayscale"
            : selected
            ? "border-amber-500 shadow-md ring-2 ring-amber-400/40"
            : "border-edge hover:border-amber-400"
        }`}
      >
        {/* Cuống vé */}
        <div className="relative flex w-24 shrink-0 flex-col items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 px-2 py-3 text-center text-white">
          <TicketPercent size={18} className="mb-1 opacity-90" />
          <span className="text-xl leading-none font-extrabold">{voucherValue(v)}</span>
          <span className="mt-1 text-[10px] font-semibold tracking-wide uppercase opacity-90">Giảm</span>
          <span className="absolute -top-2 -right-2 size-4 rounded-full bg-white" />
          <span className="absolute -right-2 -bottom-2 size-4 rounded-full bg-white" />
        </div>

        {/* Nội dung */}
        <div className="flex min-w-0 flex-1 items-center gap-3 border-l-2 border-dashed border-edge bg-white px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-sm font-extrabold text-ink">{v.code}</span>
              {v.new_owner_only && (
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 ring-1 ring-red-200">Tài khoản mới</span>
              )}
            </p>
            <p className="line-clamp-2 text-xs text-ink">
              {v.description ||
                `Giảm ${voucherValue(v)} phí gói${v.max_discount ? `, tối đa ${formatVND(v.max_discount)}` : ""}`}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-ink-soft">
              <span>HSD: {dateVN(v.end_date)}</span>
              {v.remaining === null ? (
                <span>Không giới hạn</span>
              ) : (
                <span className={low ? "font-bold text-red-600" : ""}>
                  {low ? `Sắp hết · còn ${v.remaining}` : `Còn ${v.remaining} lượt`}
                </span>
              )}
            </p>
            {!v.usable && v.reason && <p className="mt-1 text-[11px] font-semibold text-red-600">{v.reason}</p>}
          </div>
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${
              selected ? "border-amber-500 bg-amber-500" : "border-edge"
            }`}
          >
            {selected && <Check size={12} className="text-white" />}
          </span>
        </div>
      </button>
    </li>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, TicketPercent, CalendarRange, Users2 } from "lucide-react";
import { getPromotions, createPromotion, updatePromotion, deletePromotion, setPromotionActive } from "../../services/adminApi";
import { addDays, formatDateVN, formatVND, todayStr } from "../../utils/format";
import { PageTitle, Tabs, SearchBox, Pill, Empty, ErrorNote, Modal, inputCls, btnPrimary, btnSoft } from "./UI";

const EMPTY_FORM = () => ({
  code: "",
  description: "",
  discount_type: "percent",
  discount_value: "",
  max_discount: "",
  min_order: "",
  start_date: todayStr(),
  end_date: addDays(todayStr(), 30),
  usage_limit: "",
  is_active: true,
});

// Trạng thái hiển thị của 1 mã
function stateOf(p) {
  const today = todayStr();
  if (!p.is_active) return { key: "off", label: "Đã tắt", tone: "gray" };
  if (p.end_date < today) return { key: "expired", label: "Hết hạn", tone: "red" };
  if (p.start_date > today) return { key: "upcoming", label: "Sắp diễn ra", tone: "sky" };
  if (p.usage_limit && p.used_count >= p.usage_limit) return { key: "used", label: "Hết lượt", tone: "amber" };
  return { key: "on", label: "Đang chạy", tone: "green" };
}

const FILTERS = [
  ["", "Tất cả"],
  ["on", "Đang chạy"],
  ["upcoming", "Sắp tới"],
  ["off", "Đã tắt"],
  ["expired", "Hết hạn"],
];

const discountText = (p) =>
  p.discount_type === "percent" ? `${p.discount_value}%` : formatVND(p.discount_value).replace(/\s?₫/, "đ");

export default function AdminPromotions() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | promo_id
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPromotions()
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return list.filter(
      (p) => (!filter || stateOf(p).key === filter) && (!k || p.code.toLowerCase().includes(k) || p.description?.toLowerCase().includes(k))
    );
  }, [list, filter, q]);

  function openNew() {
    setForm(EMPTY_FORM());
    setFormError("");
    setEditing("new");
  }
  function openEdit(p) {
    const s = (v) => (v == null ? "" : String(v));
    setForm({ ...p, discount_value: s(p.discount_value), max_discount: s(p.max_discount), min_order: s(p.min_order || ""), usage_limit: s(p.usage_limit) });
    setFormError("");
    setEditing(p.promo_id);
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const body = { ...form, code: form.code.trim().toUpperCase() };
      if (editing === "new") {
        const created = await createPromotion(body);
        setList((l) => [created, ...l]);
      } else {
        const updated = await updatePromotion(editing, body);
        setList((l) => l.map((p) => (p.promo_id === editing ? { ...p, ...updated } : p)));
      }
      setEditing(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(p) {
    if (!window.confirm(`Xoá mã ${p.code}? Không thể hoàn tác.`)) return;
    try {
      await deletePromotion(p.promo_id);
      setList((l) => l.filter((x) => x.promo_id !== p.promo_id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggle(p) {
    try {
      await setPromotionActive(p.promo_id, !p.is_active);
      setList((l) => l.map((x) => (x.promo_id === p.promo_id ? { ...x, is_active: !p.is_active } : x)));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <PageTitle title="Khuyến mãi" subtitle="Tạo mã giảm giá để khách nhập khi đặt sân.">
        <button onClick={openNew} className={btnPrimary}>
          <Plus size={17} /> Thêm mã
        </button>
      </PageTitle>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs items={FILTERS} value={filter} onChange={setFilter} />
        <SearchBox value={q} onChange={setQ} placeholder="Tìm mã hoặc mô tả..." />
      </div>

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Empty>Đang tải...</Empty>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-14 text-center">
          <TicketPercent size={36} className="mx-auto text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">{list.length ? "Không có mã phù hợp" : "Chưa có mã khuyến mãi nào"}</p>
          {!list.length && (
            <button onClick={openNew} className={`${btnPrimary} mt-4`}>
              <Plus size={17} /> Tạo mã đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const st = stateOf(p);
            const used = p.usage_limit ? Math.min(1, p.used_count / p.usage_limit) : null;
            return (
              <article key={p.promo_id} className={`flex overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md ${st.key === "off" || st.key === "expired" ? "opacity-70" : ""}`}>
                {/* Cuống vé */}
                <div className="relative flex w-28 shrink-0 flex-col items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 px-2 text-center text-white">
                  <span className="text-[10px] font-semibold tracking-widest text-emerald-100 uppercase">Giảm</span>
                  <span className="text-2xl leading-tight font-extrabold">{discountText(p)}</span>
                  {p.discount_type === "percent" && p.max_discount ? (
                    <span className="mt-1 text-[10px] text-emerald-100">tối đa {formatVND(p.max_discount)}</span>
                  ) : null}
                  <span className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-slate-50" />
                  <span className="absolute -right-2.5 -bottom-2.5 h-5 w-5 rounded-full bg-slate-50" />
                </div>

                <div className="flex min-w-0 flex-1 flex-col border-l-2 border-dashed border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-lg font-extrabold tracking-wide text-slate-900">{p.code}</p>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                  {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{p.description}</p>}

                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <p className="flex items-center gap-1.5">
                      <CalendarRange size={13} /> {formatDateVN(p.start_date, { day: "2-digit", month: "2-digit", year: "numeric" })} –{" "}
                      {formatDateVN(p.end_date, { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Users2 size={13} /> Đã dùng {p.used_count ?? 0}
                      {p.usage_limit ? ` / ${p.usage_limit}` : " · không giới hạn"}
                      {p.min_order ? ` · đơn từ ${formatVND(p.min_order)}` : ""}
                    </p>
                  </div>
                  {used != null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${used * 100}%` }} />
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                      <span className="relative inline-flex">
                        <input type="checkbox" checked={p.is_active} onChange={() => toggle(p)} className="peer sr-only" />
                        <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500" />
                        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                      </span>
                      {p.is_active ? "Đang bật" : "Đang tắt"}
                    </label>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(p)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Sửa">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(p)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Xoá">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        wide
        title={editing === "new" ? "Thêm mã khuyến mãi" : `Sửa mã ${form.code}`}
        onClose={() => !saving && setEditing(null)}
        footer={
          <>
            <button type="button" className={btnSoft} onClick={() => setEditing(null)} disabled={saving}>
              Huỷ
            </button>
            <button type="submit" form="promo-form" className={btnPrimary} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </>
        }
      >
        <form id="promo-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Mã khuyến mãi">
            <input value={form.code} onChange={set("code")} placeholder="VD: CHAOMUNG10" className={`${inputCls} w-full font-mono uppercase`} maxLength={20} />
          </Field>
          <Field label="Kiểu giảm">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["percent", "Theo %"],
                ["fixed", "Số tiền"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, discount_type: v }))}
                  className={`h-10 rounded-xl border text-sm font-semibold transition ${
                    form.discount_type === v ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label={form.discount_type === "percent" ? "Giảm (%)" : "Giảm (đồng)"}>
            <input type="number" min="0" value={form.discount_value} onChange={set("discount_value")} className={`${inputCls} w-full`} />
          </Field>
          <Field label="Giảm tối đa (đồng)" hint={form.discount_type === "fixed" ? "Chỉ dùng cho giảm theo %" : "Để trống = không giới hạn"}>
            <input type="number" min="0" value={form.max_discount} onChange={set("max_discount")} disabled={form.discount_type === "fixed"} className={`${inputCls} w-full disabled:bg-slate-50`} />
          </Field>
          <Field label="Đơn tối thiểu (đồng)" hint="Để trống = mọi đơn">
            <input type="number" min="0" value={form.min_order} onChange={set("min_order")} className={`${inputCls} w-full`} />
          </Field>
          <Field label="Số lượt dùng tối đa" hint="Để trống = không giới hạn">
            <input type="number" min="0" value={form.usage_limit} onChange={set("usage_limit")} className={`${inputCls} w-full`} />
          </Field>
          <Field label="Ngày bắt đầu">
            <input type="date" value={form.start_date} onChange={set("start_date")} className={`${inputCls} w-full`} />
          </Field>
          <Field label="Ngày kết thúc">
            <input type="date" value={form.end_date} min={form.start_date} onChange={set("end_date")} className={`${inputCls} w-full`} />
          </Field>
          <Field label="Mô tả" className="sm:col-span-2">
            <input value={form.description} onChange={set("description")} placeholder="VD: Giảm 10% cho khách mới" className={`${inputCls} w-full`} maxLength={200} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={form.is_active} onChange={set("is_active")} className="h-4 w-4 accent-emerald-600" />
            Kích hoạt ngay
          </label>
          {formError && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 sm:col-span-2">{formError}</p>}
        </form>
      </Modal>
    </>
  );
}

function Field({ label, hint, className = "", children }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-sm font-semibold text-slate-700">{label}</p>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
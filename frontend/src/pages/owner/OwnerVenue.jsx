import { useEffect, useState } from "react";
import { ImagePlus, X, MapPin, Save, Store, UserRound, LayoutGrid, ExternalLink, CheckCircle2, AlertTriangle, Clock, KeyRound } from "lucide-react";
import { getMyVenue, updateMyVenue, updateCourt, updateAccount } from "../../services/ownerApi";
import { uploadVenueImages, deleteVenueImage } from "../../services/uploadApi";
import { hasMap, mapEmbedUrl, mapOpenUrl } from "../../utils/map";
import { Card, PageHeader, ErrorBox, EmptyState, btnPrimary, btnGhost } from "./components";
import ChangePasswordForm from "../../components/ChangePasswordForm";

const MAX_IMAGES = 5;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

const inputCls =
  "h-11 w-full rounded-lg border-[1.5px] border-edge bg-white px-3.5 text-[0.95rem] outline-none transition focus:border-pitch-600 focus:ring-3 focus:ring-pitch-600/15";
const labelCls = "mb-1.5 block text-sm font-semibold text-ink-soft";
const fmtNumber = (n) => (n ? Number(n).toLocaleString("vi-VN") : "");
const onlyDigits = (s) => Number(String(s).replace(/\D/g, "").slice(0, 8)) || 0;

function Section({ icon: Icon, title, subtitle, children, right }) {
  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-pitch-100 text-pitch-700">
            <Icon size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

// Thông báo "Đã lưu" tự tắt sau 2.5 giây
function useFlash() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 2500);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}
const Saved = ({ msg }) =>
  msg ? (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-pitch-700">
      <CheckCircle2 size={16} /> {msg}
    </span>
  ) : null;

export default function OwnerVenue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyVenue()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const setVenue = (venue) => setData((d) => ({ ...d, venue: { ...d.venue, ...venue } }));

  if (loading) return <EmptyState>Đang tải thông tin sân...</EmptyState>;
  if (!data) return <ErrorBox>{error || "Không tải được thông tin sân."}</ErrorBox>;

  return (
    <>
      <PageHeader
        title="Thông tin sân & tài khoản"
        subtitle="Thông tin ở đây hiện cho khách trên trang chủ: ảnh, địa chỉ, bản đồ Google Maps, giờ mở cửa."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <ImagesSection venue={data.venue} onChange={(images) => setVenue({ images })} />
          <InfoSection venue={data.venue} onSaved={setVenue} />
          <MapSection venue={data.venue} onSaved={setVenue} />
          <CourtsSection courts={data.courts} onSaved={(c) => setData((d) => ({ ...d, courts: d.courts.map((x) => (x.court_id === c.court_id ? c : x)) }))} />
        </div>
        <div className="flex flex-col gap-6 xl:sticky xl:top-6">
          <AccountSection account={data.account} />
          <Section icon={KeyRound} title="Đổi mật khẩu">
            <ChangePasswordForm />
          </Section>
          <PreviewCard venue={data.venue} />
        </div>
      </div>
    </>
  );
}

/* ---------- Ảnh sân ---------- */
function ImagesSection({ venue, onChange }) {
  const images = venue.images || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e) {
    const files = Array.from(e.target.files || []).filter((f) => IMAGE_TYPES.includes(f.type));
    e.target.value = "";
    if (!files.length) return;
    if (files.some((f) => f.size > 5 * 1024 * 1024)) return setError("Mỗi ảnh tối đa 5MB.");
    if (images.length + files.length > MAX_IMAGES) return setError(`Tối đa ${MAX_IMAGES} ảnh (đang có ${images.length}).`);
    setBusy(true);
    setError("");
    try {
      onChange(await uploadVenueImages(files));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(img) {
    if (!window.confirm("Xoá ảnh này?")) return;
    setBusy(true);
    setError("");
    try {
      onChange(await deleteVenueImage(img.public_id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section icon={ImagePlus} title="Ảnh sân" subtitle={`Ảnh đầu tiên là ảnh bìa trên trang chủ · tối đa ${MAX_IMAGES} ảnh, mỗi ảnh ≤ 5MB.`}>
      <ErrorBox>{error}</ErrorBox>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {images.map((img, i) => (
          <div key={img.public_id} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-edge bg-pitch-100">
            <img src={img.url.replace("/upload/", "/upload/f_auto,q_auto,w_400/")} alt="" className="size-full object-cover" />
            {i === 0 && (
              <span className="absolute bottom-1.5 left-1.5 rounded bg-pitch-900/80 px-1.5 py-0.5 text-[11px] font-bold text-white">Ảnh bìa</span>
            )}
            <button
              onClick={() => remove(img)}
              disabled={busy}
              aria-label="Xoá ảnh"
              className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {images.length < MAX_IMAGES && (
          <label
            className={`grid aspect-[4/3] cursor-pointer place-items-center rounded-xl border-[1.5px] border-dashed border-edge text-ink-soft transition hover:border-pitch-600 hover:text-pitch-700 ${
              busy ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <span className="flex flex-col items-center gap-1 text-xs font-semibold">
              <ImagePlus size={22} /> {busy ? "Đang tải..." : "Thêm ảnh"}
            </span>
            <input type="file" accept={IMAGE_TYPES.join(",")} multiple onChange={add} className="sr-only" />
          </label>
        )}
      </div>
      {images.length === 0 && (
        <p className="mt-3 text-sm text-amber-700">Chưa có ảnh — trang chủ đang dùng ảnh minh hoạ. Thêm ảnh thật để khách dễ chọn sân hơn.</p>
      )}
    </Section>
  );
}

/* ---------- Thông tin cụm sân ---------- */
function InfoSection({ venue, onSaved }) {
  const [form, setForm] = useState({
    venue_name: venue.venue_name || "",
    address: venue.address || "",
    phone: venue.phone || "",
    open_time: venue.open_time || "05:00",
    close_time: venue.close_time || "24:00",
    description: venue.description || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useFlash();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { venue: v } = await updateMyVenue(form);
      onSaved(v);
      setFlash("Đã lưu");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={Store} title="Thông tin cụm sân" right={<Saved msg={flash} />}>
      <form onSubmit={save}>
        <ErrorBox>{error}</ErrorBox>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="v-name">Tên cụm sân</label>
            <input id="v-name" value={form.venue_name} onChange={set("venue_name")} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="v-addr">Địa chỉ</label>
            <input id="v-addr" value={form.address} onChange={set("address")} placeholder="Số nhà, đường, phường, quận" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="v-phone">Số điện thoại sân</label>
            <input id="v-phone" type="tel" inputMode="numeric" value={form.phone} onChange={set("phone")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Giờ mở cửa</label>
            <div className="flex items-center gap-2">
              <select value={form.open_time} onChange={set("open_time")} className={inputCls} aria-label="Giờ mở cửa">
                {TIME_OPTIONS.slice(0, -1).map((t) => <option key={t}>{t}</option>)}
              </select>
              <span className="text-ink-soft">–</span>
              <select value={form.close_time} onChange={set("close_time")} className={inputCls} aria-label="Giờ đóng cửa">
                {TIME_OPTIONS.slice(1).map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="v-desc">
              Giới thiệu <span className="font-normal">(không bắt buộc)</span>
            </label>
            <textarea
              id="v-desc"
              rows={3}
              maxLength={1000}
              value={form.description}
              onChange={set("description")}
              placeholder="Cỏ nhân tạo mới, có bãi giữ xe, nước uống, thuê áo bib..."
              className={`${inputCls} h-auto py-2.5`}
            />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <p className="mr-auto flex items-center gap-1.5 text-xs text-ink-soft">
            <Clock size={13} /> Đổi giờ mở cửa sẽ áp dụng cho tất cả sân.
          </p>
          <button type="submit" disabled={saving} className={btnPrimary}>
            <Save size={16} /> {saving ? "Đang lưu..." : "Lưu thông tin"}
          </button>
        </div>
      </form>
    </Section>
  );
}

/* ---------- Google Maps ---------- */
function MapSection({ venue, onSaved }) {
  const [url, setUrl] = useState(venue.map_url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useFlash();

  async function save(value) {
    setSaving(true);
    setError("");
    try {
      const { venue: v } = await updateMyVenue({ map_url: value });
      onSaved(v);
      setUrl(v.map_url || "");
      setFlash(value ? "Đã lưu vị trí" : "Đã xoá vị trí");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const hasCoords = Number.isFinite(venue.lat) && Number.isFinite(venue.lng);

  return (
    <Section icon={MapPin} title="Vị trí trên Google Maps" subtitle="Khách bấm vào là mở bản đồ / chỉ đường tới sân của bạn." right={<Saved msg={flash} />}>
      <ErrorBox>{error}</ErrorBox>
      <ol className="mb-4 grid gap-2 rounded-xl bg-pitch-50 p-4 text-sm text-ink-soft sm:grid-cols-3">
        <li><b className="text-ink">1.</b> Mở Google Maps, tìm sân của bạn</li>
        <li><b className="text-ink">2.</b> Bấm <b className="text-ink">Chia sẻ</b> → <b className="text-ink">Sao chép đường liên kết</b></li>
        <li><b className="text-ink">3.</b> Dán vào ô dưới rồi bấm Lưu</li>
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://maps.app.goo.gl/...   hoặc toạ độ 10.0299, 105.7706"
          className={`${inputCls} flex-1`}
        />
        <button onClick={() => save(url.trim())} disabled={saving || url.trim() === (venue.map_url || "")} className={btnPrimary}>
          <Save size={16} /> {saving ? "Đang lưu..." : "Lưu vị trí"}
        </button>
        {venue.map_url && (
          <button onClick={() => save("")} disabled={saving} className={btnGhost}>
            Xoá
          </button>
        )}
      </div>

      {venue.map_url && !hasCoords && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-amber-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Đã lưu link nhưng chưa đọc được toạ độ — bản đồ nhúng sẽ tìm theo địa chỉ. Nút "Mở Google Maps" vẫn đúng vị trí.
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-edge">
        <iframe title="Bản đồ sân" src={mapEmbedUrl(venue)} className="block h-72 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
        <span>
          {hasCoords ? `Toạ độ: ${venue.lat.toFixed(5)}, ${venue.lng.toFixed(5)}` : hasMap(venue) ? "Theo link đã lưu" : "Chưa có link — đang hiển thị theo địa chỉ"}
        </span>
        <a href={mapOpenUrl(venue)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-pitch-700 hover:underline">
          Mở Google Maps <ExternalLink size={13} />
        </a>
      </div>
    </Section>
  );
}

/* ---------- Các sân ---------- */
function CourtsSection({ courts, onSaved }) {
  const byId = Object.fromEntries(courts.map((c) => [c.court_id, c]));
  return (
    <Section icon={LayoutGrid} title="Các sân" subtitle="Đổi tên hiển thị và giá thuê mỗi giờ của từng sân.">
      <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge">
        {courts.map((c) => (
          <CourtRow key={c.court_id} court={c} partsLabel={(c.parts || []).map((id) => byId[id]?.court_name ?? id).join(" + ")} onSaved={onSaved} />
        ))}
      </ul>
    </Section>
  );
}

function CourtRow({ court, partsLabel, onSaved }) {
  const [name, setName] = useState(court.court_name);
  const [price, setPrice] = useState(court.price_per_hour);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useFlash();
  const dirty = name.trim() !== court.court_name || price !== court.price_per_hour;

  async function save() {
    setSaving(true);
    setError("");
    try {
      onSaved(await updateCourt(court.court_id, { court_name: name.trim(), price_per_hour: price }));
      setFlash("Đã lưu");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-48 flex-1">
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} h-10`} aria-label="Tên sân" />
        <p className="mt-1 text-xs text-ink-soft">
          {court.court_type}
          {partsLabel && ` · ghép từ ${partsLabel}`}
        </p>
      </div>
      <label className="flex h-10 w-44 items-center gap-1 rounded-lg border-[1.5px] border-edge bg-white px-3 text-sm focus-within:border-pitch-600">
        <input
          inputMode="numeric"
          value={fmtNumber(price)}
          onChange={(e) => setPrice(onlyDigits(e.target.value))}
          className="h-full min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none"
          aria-label="Giá mỗi giờ"
        />
        <span className="shrink-0 text-ink-soft">đ/giờ</span>
      </label>
      <div className="flex w-24 justify-end">
        {flash ? (
          <Saved msg={flash} />
        ) : (
          <button onClick={save} disabled={!dirty || saving} className={`${btnGhost} h-10`}>
            {saving ? "..." : "Lưu"}
          </button>
        )}
      </div>
      {error && <p className="basis-full text-sm text-red-700">{error}</p>}
    </li>
  );
}

/* ---------- Tài khoản ---------- */
function AccountSection({ account }) {
  const [form, setForm] = useState({ fullName: account.fullName, phone: account.phone });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useFlash();

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const u = await updateAccount(form);
      setForm({ fullName: u.fullName, phone: u.phone });
      setFlash("Đã lưu");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={UserRound} title="Tài khoản chủ sân" right={<Saved msg={flash} />}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{error}</ErrorBox>
        <div>
          <label className={labelCls} htmlFor="a-name">Họ tên</label>
          <input id="a-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="a-phone">Số điện thoại</label>
          <input id="a-phone" type="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email đăng nhập</label>
          <input value={account.email} disabled className={`${inputCls} bg-pitch-50 text-ink-soft`} />
        </div>
        <button type="submit" disabled={saving} className={btnPrimary}>
          <Save size={16} /> {saving ? "Đang lưu..." : "Lưu tài khoản"}
        </button>
      </form>
    </Section>
  );
}

/* ---------- Xem trước thẻ sân trên trang chủ ---------- */
function PreviewCard({ venue }) {
  const cover = venue.images?.[0]?.url;
  return (
    <Card className="overflow-hidden p-0">
      <p className="border-b border-edge px-5 py-3 text-sm font-semibold text-ink-soft">Khách sẽ thấy trên trang chủ</p>
      <div className="aspect-[16/10] bg-pitch-100">
        {cover ? (
          <img src={cover.replace("/upload/", "/upload/f_auto,q_auto,w_600/")} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-sm text-ink-soft">Chưa có ảnh</div>
        )}
      </div>
      <div className="p-5">
        <p className="text-lg font-bold">{venue.venue_name}</p>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-soft">
          <MapPin size={14} className="mt-0.5 shrink-0 text-pitch-600" /> {venue.address}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Mở cửa {venue.open_time || "—"}–{venue.close_time || "—"} · {venue.phone}
        </p>
        {venue.description && <p className="mt-2 line-clamp-3 text-sm text-ink">{venue.description}</p>}
        <a
          href={mapOpenUrl(venue)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-pitch-700 hover:underline"
        >
          <MapPin size={14} /> {hasMap(venue) ? "Xem trên Google Maps" : "Chưa gắn Google Maps"}
        </a>
      </div>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Phone, Lock, Eye, EyeOff, X, UserRound, Building2, Check,
  MapPin, Store, Clock, Minus, Plus, ArrowLeft, ImagePlus, Shield, MailCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROLES, homePathForRole } from "../utils/roles";
import { uploadVenueImages } from "../services/uploadApi";
import { TEAM_NAME_MAX } from "../utils/teamName";
import { sendRegisterOtp } from "../services/authApi";
const fieldClass =
  "flex h-12 items-center gap-2.5 rounded-lg border-[1.5px] border-edge bg-white px-3.5 transition focus-within:border-pitch-600 focus-within:ring-3 focus-within:ring-pitch-600/15";
const inputClass =
  "h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-[#93a69a]";
const labelClass = "mb-1.5 block text-sm font-semibold text-ink-soft";

const ACCOUNT_TYPES = [
  { role_id: ROLES.CUSTOMER, title: "Khách hàng", desc: "Tìm sân, đặt sân, ghép kèo", icon: UserRound },
  { role_id: ROLES.OWNER, title: "Chủ sân", desc: "Quản lý sân, lịch đặt, doanh thu", icon: Building2 },
];

// Hiện chỉ mở sân bóng đá
const COURT_TYPES = [
  { court_type: "5 người", hint: "Sân mini, cỏ nhân tạo", defaultPrice: 300000 },
  { court_type: "7 người", hint: "Phổ biến nhất", defaultPrice: 350000 },
  { court_type: "11 người", hint: "Sân lớn tiêu chuẩn", defaultPrice: 1200000 },
];

const EMPTY_ACCOUNT = { fullName: "", team_name: "", email: "", phone: "", password: "", confirm: "" };
const EMPTY_VENUE = { venue_name: "", address: "", phone: "", open_time: "05:00", close_time: "24:00" };
const EMPTY_COURTS = COURT_TYPES.map((t) => ({
  court_type: t.court_type,
  quantity: 0, // chủ sân tự chọn số sân, không đặt sẵn
  price: t.defaultPrice, // số nguyên, luôn là giá của đúng loại sân này
  merge: 0, // sân 7/11: ghép từ bao nhiêu sân 5 (0 = sân riêng)
}));
// Sân 7 / sân 11 có thể ghép từ các sân 5 (giống backend)
const MERGE_OPTIONS = { "7 người": [0, 2, 3], "11 người": [0, 4, 6] };
const MAX_IMAGES = 5;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const formatMoney = (n) => `${Number(n || 0).toLocaleString("vi-VN")}đ`;
const formatNumber = (n) => (n ? Number(n).toLocaleString("vi-VN") : "");
const onlyDigits = (s) => Number(String(s).replace(/\D/g, "").slice(0, 8)) || 0;

// Giờ hoạt động chọn theo bước 30 phút, 00:00 -> 24:00
const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`
);
const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export default function RegisterModal({ open, onClose, onSwitchToLogin, defaultRole = ROLES.CUSTOMER }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [roleId, setRoleId] = useState(defaultRole);
  const [step, setStep] = useState(1); // chủ sân: 1 = tài khoản, 2 = thông tin sân
  const [form, setForm] = useState(EMPTY_ACCOUNT);
  const [venue, setVenue] = useState(EMPTY_VENUE);
  const [courts, setCourts] = useState(EMPTY_COURTS);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState([]);
  const isOwner = roleId === ROLES.OWNER;
  // Xác minh email bằng mã OTP trước khi tạo tài khoản
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [sending, setSending] = useState(false);
  const [otpInfo, setOtpInfo] = useState("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function requestOtp() {
    setSending(true);
    setError("");
    try {
      const r = await sendRegisterOtp(form.email.trim().toLowerCase(), form.phone.trim());
      setOtpStep(true);
      setOtp("");
      setOtpInfo(r.message);
      setResendIn(r.resend_after || 60);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSending(false);
    }
  }

  // Mỗi lần mở: xoá dữ liệu cũ
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_ACCOUNT);
    setVenue(EMPTY_VENUE);
    setCourts(EMPTY_COURTS);
    setStep(1);
    setError("");
    setShowPassword(false);
    setOtpStep(false);
    setOtp("");
    setResendIn(0);
    setRoleId(defaultRole);
    setImages((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.preview));
      return [];
    });
  }, [open, defaultRole]);

  // Đóng bằng phím Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && !submitting && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setV = (key) => (e) => setVenue((v) => ({ ...v, [key]: e.target.value }));
  const setCourt = (i, patch) => setCourts((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const totalCourts = courts.reduce((s, c) => s + c.quantity, 0);
  const fiveCount = courts.find((c) => c.court_type === "5 người")?.quantity ?? 0;
  function addImages(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // cho phép chọn lại cùng 1 file
    const room = MAX_IMAGES - images.length;
    const ok = [];
    for (const f of picked) {
      if (!IMAGE_TYPES.includes(f.type)) { setError(`"${f.name}" không phải ảnh JPG/PNG/WEBP.`); continue; }
      if (f.size > 5 * 1024 * 1024) { setError(`"${f.name}" lớn hơn 5MB.`); continue; }
      if (ok.length >= room) { setError(`Tối đa ${MAX_IMAGES} ảnh.`); break; }
      ok.push({ file: f, preview: URL.createObjectURL(f) });
    }
    setImages((list) => [...list, ...ok]);
  }

  function removeImage(index) {
    setImages((list) => {
      URL.revokeObjectURL(list[index].preview);
      return list.filter((_, i) => i !== index);
    });
  }


  function validateAccount() {
    if (!form.fullName.trim()) return "Vui lòng nhập họ tên.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Email không hợp lệ.";
    if (!/^0\d{9}$/.test(form.phone.trim())) return "Số điện thoại gồm 10 số, bắt đầu bằng 0.";
    if (form.password.length < 6) return "Mật khẩu tối thiểu 6 ký tự.";
    if (form.password !== form.confirm) return "Mật khẩu nhập lại không khớp.";
    return "";
  }

  function validateVenue() {
    if (!venue.venue_name.trim()) return "Vui lòng nhập tên cụm sân.";
    if (venue.address.trim().length < 5) return "Vui lòng nhập địa chỉ sân.";
    const vPhone = venue.phone.trim() || form.phone.trim();
    if (!/^0\d{9}$/.test(vPhone)) return "Số điện thoại sân gồm 10 số, bắt đầu bằng 0.";
    if (toMin(venue.close_time) - toMin(venue.open_time) < 60) return "Giờ đóng cửa phải sau giờ mở cửa ít nhất 1 giờ.";
    if (totalCourts === 0) return "Vui lòng thêm ít nhất 1 sân.";
    for (const c of courts) {
      if (c.quantity > 0 && !(c.price >= 50000 && c.price <= 10000000))
        return `Giá thuê/giờ sân ${c.court_type} phải từ 50.000đ đến 10.000.000đ.`;
    }
    for (const c of courts) {
      if (c.quantity > 0 && c.merge > 0 && c.quantity * c.merge > fiveCount)
        return `${c.quantity} sân ${c.court_type} ghép từ ${c.merge} sân 5 cần ít nhất ${c.quantity * c.merge} sân 5 (đang có ${fiveCount}).`;
    }
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    const accErr = validateAccount();
    if (accErr) {
      setStep(1);
      return setError(accErr);
    }
    // Chủ sân: bước 1 xong -> sang bước 2
    if (isOwner && step === 1) {
      setError("");
      setVenue((v) => ({ ...v, phone: v.phone || form.phone.trim() }));
      return setStep(2);
    }
    if (isOwner) {
      const vErr = validateVenue();
      if (vErr) return setError(vErr);
    }

    // Chưa xác minh email -> gửi mã OTP trước
    if (!otpStep) {
      await requestOtp();
      return;
    }
    if (!/^\d{6}$/.test(otp)) return setError("Vui lòng nhập đủ 6 số trong email.");

    setError("");
    setSubmitting(true);
    try {
      const payload = {
        otp,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        role_id: roleId,
      };
      // Khách hàng: tên đội (trống -> backend tự đặt "FC <tên>")
      if (!isOwner) payload.team_name = form.team_name.trim();
      if (isOwner) {
        payload.venue = {
          venue_name: venue.venue_name.trim(),
          address: venue.address.trim(),
          phone: venue.phone.trim() || form.phone.trim(),
          open_time: venue.open_time,
          close_time: venue.close_time,
        };
        payload.courts = courts
          .filter((c) => c.quantity > 0)
          .map((c) => ({ court_type: c.court_type, quantity: c.quantity, price_per_hour: c.price, merge_from: c.merge || 0 }));
      }
      const user = await register(payload);
      // Đã có token -> upload ảnh sân. Lỗi ảnh không chặn đăng ký (tài khoản đã tạo xong)
      if (isOwner && images.length) {
        try {
          await uploadVenueImages(images.map((i) => i.file));
        } catch (upErr) {
          console.error("Upload ảnh sân lỗi:", upErr);
        }
      }
      onClose();
      if (Number(user?.role_id) === ROLES.OWNER) navigate(homePathForRole(ROLES.OWNER), { replace: true });
    } catch (err) {
      setError(err?.message || "Đăng ký thất bại, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-pitch-900/60 p-4"
      onMouseDown={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-title"
        className={`relative my-auto w-full rounded-2xl bg-white p-7 shadow-[0_24px_48px_-16px_rgba(5,40,22,0.55)] ${isOwner && step === 2 ? "max-w-xl" : "max-w-md"
          }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Đóng"
          className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-pitch-100 hover:text-pitch-700 disabled:opacity-40"
        >
          <X size={18} />
        </button>

        {isOwner && step === 2 ? (
          <>
            <button
              type="button"
              onClick={() => {
                setError("");
                setStep(1);
              }}
              className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft transition hover:text-pitch-700"
            >
              <ArrowLeft size={15} /> Quay lại
            </button>
            <h2 id="register-title" className="mb-1 text-2xl font-extrabold tracking-tight text-ink">
              Thông tin sân của bạn
            </h2>
            <p className="mb-5 text-ink-soft">Bước 2/2 · Khách hàng sẽ thấy sân của bạn ngay sau khi đăng ký.</p>
          </>
        ) : (
          <>
            <h2 id="register-title" className="mb-1 text-2xl font-extrabold tracking-tight text-ink">
              Tạo tài khoản
            </h2>
            <p className="mb-5 text-ink-soft">
              {isOwner ? "Bước 1/2 · Thông tin tài khoản chủ sân." : "Chọn loại tài khoản bạn muốn đăng ký."}
            </p>
          </>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {otpStep ? (
            <div className="mb-5">
              <div className="mb-4 flex items-start gap-3 rounded-xl bg-pitch-50 p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-pitch-700 text-white">
                  <MailCheck size={20} />
                </span>
                <div className="text-sm">
                  <p className="font-bold text-ink">Xác minh email</p>
                  <p className="text-ink-soft">
                    {otpInfo || "Đã gửi mã"} Mở hộp thư (xem cả mục <b>Spam / Quảng cáo</b>) và nhập mã 6 số.
                  </p>
                </div>
              </div>
              <label htmlFor="reg-otp" className={labelClass}>Mã xác minh</label>
              <input
                id="reg-otp"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="h-14 w-full rounded-lg border-[1.5px] border-edge bg-white text-center text-2xl font-extrabold tracking-[0.6em] text-ink outline-none transition focus:border-pitch-600 focus:ring-3 focus:ring-pitch-600/15"
              />
              <div className="mt-3 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep(false);
                    setError("");
                  }}
                  className="font-semibold text-ink-soft hover:text-pitch-700"
                >
                  ← Sửa email
                </button>
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={resendIn > 0 || sending}
                  className="font-semibold text-pitch-700 hover:underline disabled:text-ink-soft disabled:no-underline"
                >
                  {sending ? "Đang gửi..." : resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : "Gửi lại mã"}
                </button>
              </div>
            </div>
          ) : (
          <>
          {step === 1 || !isOwner ? (
            <>
              {/* Chọn loại tài khoản */}
              <div className="mb-5 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Loại tài khoản">
                {ACCOUNT_TYPES.map(({ role_id, title, desc, icon: Icon }) => {
                  const active = roleId === role_id;
                  return (
                    <button
                      key={role_id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setRoleId(role_id)}
                      className={`relative rounded-xl border-[1.5px] p-3.5 text-left transition ${active ? "border-pitch-700 bg-pitch-100 ring-3 ring-pitch-600/15" : "border-edge hover:border-pitch-600"
                        }`}
                    >
                      {active && (
                        <span className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-pitch-700 text-white">
                          <Check size={13} strokeWidth={3} />
                        </span>
                      )}
                      <Icon size={22} className="mb-2 text-pitch-700" />
                      <span className="block font-bold text-ink">{title}</span>
                      <span className="block text-xs text-ink-soft">{desc}</span>
                    </button>
                  );
                })}
              </div>

              <label htmlFor="reg-name" className={labelClass}>
                {isOwner ? "Họ tên chủ sân" : "Họ tên"}
              </label>
              <div className={`${fieldClass} mb-3.5`}>
                <User size={16} className="shrink-0 text-pitch-600" />
                <input id="reg-name" autoComplete="name" value={form.fullName} onChange={set("fullName")} placeholder="Nguyễn Văn A" className={inputClass} />
              </div>

              {!isOwner && (
                <>
                  <label htmlFor="reg-team" className={labelClass}>
                    Tên đội <span className="font-normal">(không bắt buộc)</span>
                  </label>
                  <div className={`${fieldClass} mb-1`}>
                    <Shield size={16} className="shrink-0 text-pitch-600" />
                    <input
                      id="reg-team"
                      value={form.team_name}
                      onChange={set("team_name")}
                      maxLength={TEAM_NAME_MAX}
                      placeholder="VD: FC Ninh Kiều"
                      className={inputClass}
                    />
                  </div>
                  <p className="mb-3.5 text-xs text-ink-soft">
                    Hiện cho đội khác khi bạn mở kèo ghép nửa sân.
                    {!form.team_name.trim() && (
                      <> Để trống sẽ tự đặt tên dạng <b className="text-pitch-700">Đội A1234</b>.</>
                    )}
                  </p>
                </>
              )}

              <label htmlFor="reg-email" className={labelClass}>Email</label>
              <div className={`${fieldClass} mb-3.5`}>
                <Mail size={16} className="shrink-0 text-pitch-600" />
                <input id="reg-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="ban@gmail.com" className={inputClass} />
              </div>

              <label htmlFor="reg-phone" className={labelClass}>Số điện thoại</label>
              <div className={`${fieldClass} mb-3.5`}>
                <Phone size={16} className="shrink-0 text-pitch-600" />
                <input id="reg-phone" type="tel" inputMode="numeric" autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder="0901234567" className={inputClass} />
              </div>

              <div className="mb-5 grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor="reg-pass" className={labelClass}>Mật khẩu</label>
                  <div className={fieldClass}>
                    <Lock size={16} className="shrink-0 text-pitch-600" />
                    <input
                      id="reg-pass"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={set("password")}
                      placeholder="Tối thiểu 6 ký tự"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      className="shrink-0 text-ink-soft transition hover:text-pitch-700"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-confirm" className={labelClass}>Nhập lại mật khẩu</label>
                  <div className={fieldClass}>
                    <Lock size={16} className="shrink-0 text-pitch-600" />
                    <input
                      id="reg-confirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={form.confirm}
                      onChange={set("confirm")}
                      placeholder="Nhập lại"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Môn thể thao */}
              <p className={labelClass}>Môn thể thao</p>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-pitch-700 bg-pitch-100 px-4 text-sm font-bold text-pitch-700">
                  ⚽ Bóng đá <Check size={14} strokeWidth={3} />
                </span>
                <span className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-dashed border-edge px-4 text-sm text-ink-soft">
                  🏸 Cầu lông · sắp mở
                </span>
              </div>

              <label htmlFor="v-name" className={labelClass}>Tên cụm sân</label>
              <div className={`${fieldClass} mb-3.5`}>
                <Store size={16} className="shrink-0 text-pitch-600" />
                <input id="v-name" value={venue.venue_name} onChange={setV("venue_name")} placeholder="Sân bóng Ninh Kiều" className={inputClass} />
              </div>

              <label htmlFor="v-address" className={labelClass}>Địa chỉ</label>
              <div className={`${fieldClass} mb-3.5`}>
                <MapPin size={16} className="shrink-0 text-pitch-600" />
                <input
                  id="v-address"
                  value={venue.address}
                  onChange={setV("address")}
                  placeholder="Số nhà, đường, phường, quận, Cần Thơ"
                  className={inputClass}
                />
              </div>

              <div className="mb-5 grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor="v-phone" className={labelClass}>SĐT sân</label>
                  <div className={fieldClass}>
                    <Phone size={16} className="shrink-0 text-pitch-600" />
                    <input id="v-phone" type="tel" inputMode="numeric" value={venue.phone} onChange={setV("phone")} placeholder={form.phone} className={inputClass} />
                  </div>
                </div>
                <div>
                  <p className={labelClass}>Giờ hoạt động (hằng ngày)</p>
                  <div className={fieldClass}>
                    <Clock size={16} className="shrink-0 text-pitch-600" />
                    <select
                      value={venue.open_time}
                      onChange={(e) => {
                        const open_time = e.target.value;
                        // Giờ đóng cửa luôn sau giờ mở cửa ít nhất 1 giờ
                        setVenue((v) => ({
                          ...v,
                          open_time,
                          close_time: toMin(v.close_time) >= toMin(open_time) + 60 ? v.close_time : "24:00",
                        }));
                      }}
                      aria-label="Giờ mở cửa"
                      className="h-full min-w-0 flex-1 bg-transparent font-semibold text-ink outline-none"
                    >
                      {TIME_OPTIONS.slice(0, -1).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <span className="text-ink-soft">–</span>
                    <select
                      value={venue.close_time}
                      onChange={setV("close_time")}
                      aria-label="Giờ đóng cửa"
                      className="h-full min-w-0 flex-1 bg-transparent font-semibold text-ink outline-none"
                    >
                      {TIME_OPTIONS.filter((t) => toMin(t) >= toMin(venue.open_time) + 60).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
                      {/* Ảnh sân */}
<div className="mb-2 flex items-end justify-between gap-3">
  <p className="text-sm font-semibold text-ink-soft">
    Ảnh sân <span className="font-normal">(không bắt buộc — có thể thêm sau trong mục "Thông tin sân")</span>
  </p>
  <p className="text-sm text-ink-soft">{images.length}/{MAX_IMAGES}</p>
</div>
<div className="mb-5 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
  {images.map((img, i) => (
    <div key={img.preview} className="relative aspect-square overflow-hidden rounded-lg border-[1.5px] border-edge">
      <img src={img.preview} alt={`Ảnh sân ${i + 1}`} className="size-full object-cover" />
      {i === 0 && (
        <span className="absolute bottom-1 left-1 rounded bg-pitch-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
          Ảnh bìa
        </span>
      )}
      <button
        type="button"
        onClick={() => removeImage(i)}
        aria-label={`Xoá ảnh ${i + 1}`}
        className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-700"
      >
        <X size={13} />
      </button>
    </div>
  ))}
  {images.length < MAX_IMAGES && (
    <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border-[1.5px] border-dashed border-edge text-ink-soft transition hover:border-pitch-600 hover:text-pitch-700">
      <span className="flex flex-col items-center gap-1 text-xs font-semibold">
        <ImagePlus size={20} /> Thêm ảnh
      </span>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addImages} className="sr-only" />
    </label>
  )}
</div>
              {/* Số sân theo loại */}
              <div className="mb-2 flex items-end justify-between gap-3">
                <p className="text-sm font-semibold text-ink-soft">Bạn có bao nhiêu sân?</p>
                <p className="text-sm text-ink-soft">
                  Tổng: <b className="text-pitch-700">{totalCourts} sân</b>
                </p>
              </div>
              <div className="mb-5 divide-y divide-edge rounded-xl border-[1.5px] border-edge">
                {courts.map((c, i) => {
                  const meta = COURT_TYPES[i];
                  const on = c.quantity > 0;
                  return (
                    <div key={c.court_type} className={`flex flex-wrap items-center gap-3 p-3.5 ${on ? "bg-pitch-50" : ""}`}>
                      <div className="min-w-28 flex-1">
                        <p className="font-bold text-ink">Sân {c.court_type}</p>
                        <p className="text-xs text-ink-soft">{meta.hint}</p>
                      </div>

                      {/* Số lượng */}
                      <div className="flex items-center rounded-lg border-[1.5px] border-edge bg-white">
                        <button
                          type="button"
                          onClick={() => setCourt(i, { quantity: Math.max(0, c.quantity - 1) })}
                          disabled={c.quantity === 0}
                          aria-label={`Bớt sân ${c.court_type}`}
                          className="grid size-9 place-items-center text-pitch-700 transition hover:bg-pitch-100 disabled:opacity-30"
                        >
                          <Minus size={15} />
                        </button>
                        <span className="w-8 text-center font-bold tabular-nums">{c.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setCourt(i, { quantity: Math.min(20, c.quantity + 1) })}
                          aria-label={`Thêm sân ${c.court_type}`}
                          className="grid size-9 place-items-center text-pitch-700 transition hover:bg-pitch-100"
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      {/* Giá */}
                      <label
                        className={`flex h-9 w-40 items-center gap-1 rounded-lg border-[1.5px] bg-white px-2.5 text-sm transition focus-within:border-pitch-600 ${on ? "border-edge" : "border-edge opacity-40"
                          }`}
                      >
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatNumber(c.price)}
                          disabled={!on}
                          onChange={(e) => setCourt(i, { price: onlyDigits(e.target.value) })}
                          aria-label={`Giá thuê mỗi giờ sân ${c.court_type}`}
                          className="h-full min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none"
                        />
                        <span className="shrink-0 text-ink-soft">đ/giờ</span>
                      </label>

                      {/* Sân 7 / 11: sân riêng hay ghép từ sân 5 */}
                      {MERGE_OPTIONS[c.court_type] && on && (
                        <div className="flex basis-full flex-wrap items-center gap-1.5 text-sm">
                          <span className="mr-1 text-ink-soft">Mặt sân:</span>
                          {MERGE_OPTIONS[c.court_type].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setCourt(i, { merge: n })}
                              aria-pressed={c.merge === n}
                              className={`h-8 rounded-full border-[1.5px] px-3 text-xs font-semibold transition ${
                                c.merge === n
                                  ? "border-pitch-700 bg-pitch-700 text-white"
                                  : "border-edge bg-white text-ink hover:border-pitch-600"
                              }`}
                            >
                              {n ? `Ghép ${n} sân 5` : "Sân riêng"}
                            </button>
                          ))}
                          {c.merge > 0 && (
                            <span className={`text-xs ${c.quantity * c.merge > fiveCount ? "font-semibold text-red-700" : "text-ink-soft"}`}>
                              cần {c.quantity * c.merge} sân 5 · đang có {fiveCount}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {totalCourts > 0 && (
                <p className="mb-4 text-xs text-ink-soft">
                  Sẽ tạo:{" "}
                  {courts
                    .filter((c) => c.quantity > 0)
                    .map(
                      (c) =>
                        `${c.quantity} sân ${c.court_type} (${formatMoney(c.price)}/giờ${c.merge ? `, ghép từ ${c.merge} sân 5` : ""})`
                    )
                    .join(", ")}
                  , mở cửa {venue.open_time}–{venue.close_time}. Tên sân tự đặt kiểu "Sân 7 số 1", bạn có thể đổi sau.
                  {courts.some((c) => c.quantity > 0 && c.merge > 0) &&
                    " Sân ghép dùng chung mặt cỏ: đặt sân 7 thì các sân 5 bên dưới tự bận, và ngược lại."}
                </p>
              )}
            </>
          )}

          </>
          )}

          {error && (
            <p role="alert" className="mb-4 rounded-r-lg border-l-4 border-red-700 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || sending || (otpStep && otp.length !== 6)}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-pitch-700 font-bold text-white transition hover:bg-pitch-600 active:bg-pitch-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Đang tạo tài khoản..."
              : sending
                ? "Đang gửi mã..."
                : otpStep
                  ? "Xác nhận & tạo tài khoản"
                  : !isOwner || step === 2
                    ? "Gửi mã xác minh email"
                    : !isOwner
                ? "Đăng ký khách hàng"
                : step === 1
                  ? "Tiếp tục: thông tin sân"
                  : `Hoàn tất đăng ký · ${totalCourts} sân`}
          </button>
        </form>

        {onSwitchToLogin && step === 1 && (
          <p className="mt-5 text-center text-sm text-ink-soft">
            Đã có tài khoản?{" "}
            <button type="button" onClick={onSwitchToLogin} className="font-bold text-pitch-700 hover:underline">
              Đăng nhập
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
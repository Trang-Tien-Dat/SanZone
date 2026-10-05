import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, UserRound, Lock, Eye, EyeOff, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROLES, getRoleId, homePathForRole } from "../utils/roles";

const fieldClass =
  "flex h-12 items-center gap-2.5 rounded-lg border-[1.5px] border-edge bg-white px-3.5 transition focus-within:border-pitch-600 focus-within:ring-3 focus-within:ring-pitch-600/15";
const inputClass =
  "h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-[#93a69a]";
const labelClass = "mb-1.5 block text-sm font-semibold text-ink-soft";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{9}$/;

/**
 * Nhận diện người dùng nhập email hay số điện thoại và chuẩn hoá giá trị.
 *  - Có "@"            -> email (chuyển về chữ thường)
 *  - Chỉ số / + . - () -> SĐT (bỏ ký tự phân cách, +84 / 84 -> 0)
 * Trả về { type: "email" | "phone" | null, value }
 */
export function parseIdentifier(raw) {
  const s = String(raw || "").trim();
  if (!s) return { type: null, value: "" };
  if (s.includes("@")) return { type: "email", value: s.toLowerCase() };
  if (/^[\d\s+().-]+$/.test(s)) {
    let digits = s.replace(/\D/g, "");
    if (digits.startsWith("84") && digits.length === 11) digits = "0" + digits.slice(2);
    return { type: "phone", value: digits };
  }
  return { type: null, value: s };
}

export default function LoginModal({ open, onClose }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Mỗi lần mở: xoá mật khẩu & lỗi cũ, cho phép đóng bằng phím Esc
  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError("");
    setShowPassword(false);
    const onKey = (e) => e.key === "Escape" && !submitting && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const { type: idType } = parseIdentifier(identifier);
  const IdIcon = idType === "email" ? Mail : idType === "phone" ? Phone : UserRound;

  function validate() {
    const { type, value } = parseIdentifier(identifier);
    if (!value) return "Vui lòng nhập email hoặc số điện thoại.";
    if (type === "email" && !EMAIL_RE.test(value)) return "Email không hợp lệ.";
    if (type === "phone" && !PHONE_RE.test(value)) return "Số điện thoại gồm 10 số, bắt đầu bằng 0.";
    if (!type) return "Vui lòng nhập email hoặc số điện thoại hợp lệ.";
    if (!password) return "Vui lòng nhập mật khẩu.";
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const vErr = validate();
    if (vErr) return setError(vErr);

    setError("");
    setSubmitting(true);
    try {
      const { value } = parseIdentifier(identifier);
      // login() PHẢI trả về user (xem AuthContext) để biết role ngay lập tức
      const user = await login(value, password);
      const roleId = getRoleId(user);

      if (!Object.values(ROLES).includes(roleId)) {
        throw new Error("Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.");
      }

      onClose();
      // Khách hàng: ở lại trang hiện tại. Admin / chủ sân: vào trang quản lý
      if (roleId !== ROLES.CUSTOMER) {
        navigate(homePathForRole(roleId), { replace: true });
      }
    } catch (err) {
      setError(err?.message || "Đăng nhập thất bại, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pitch-900/60 p-4"
      onMouseDown={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-[0_24px_48px_-16px_rgba(5,40,22,0.55)]"
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

        <h2 id="login-title" className="mb-1 text-2xl font-extrabold tracking-tight text-ink">
          Đăng nhập
        </h2>
        <p className="mb-6 text-ink-soft">Đăng nhập để đặt sân hoặc quản lý sân của bạn.</p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="login-identifier" className={labelClass}>
            Email hoặc số điện thoại
          </label>
          <div className={`${fieldClass} mb-4`}>
            <IdIcon size={16} className="shrink-0 text-pitch-600" />
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="ban@gmail.com hoặc 0901234567"
              className={inputClass}
            />
          </div>

          <label htmlFor="login-password" className={labelClass}>
            Mật khẩu
          </label>
          <div className={`${fieldClass} mb-5`}>
            <Lock size={16} className="shrink-0 text-pitch-600" />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
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

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-r-lg border-l-4 border-red-700 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-pitch-700 font-bold text-white transition hover:bg-pitch-600 active:bg-pitch-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
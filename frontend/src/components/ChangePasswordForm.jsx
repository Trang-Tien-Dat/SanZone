import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { changePassword } from "../services/authApi";

const inputCls =
  "h-11 w-full rounded-lg border-[1.5px] border-edge bg-white px-3.5 pr-11 text-[0.95rem] outline-none transition focus:border-pitch-600 focus:ring-3 focus:ring-pitch-600/15";
const labelCls = "mb-1.5 block text-sm font-semibold text-ink-soft";
const EMPTY = { current: "", next: "", confirm: "" };

function PasswordInput({ id, value, onChange, show, autoComplete }) {
  return (
    <input
      id={id}
      type={show ? "text" : "password"}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

// Form đổi mật khẩu dùng chung cho trang tài khoản khách và trang chủ sân
export default function ChangePasswordForm() {
  const { token } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 3000);
    return () => clearTimeout(t);
  }, [done]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const mismatch = form.confirm && form.next !== form.confirm;
  const tooShort = form.next && form.next.length < 6;
  const canSubmit = form.current && form.next.length >= 6 && form.next === form.confirm && !busy;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await changePassword(token, form.current, form.next);
      setForm(EMPTY);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p>}
      {done && (
        <p className="flex items-center gap-1.5 rounded-lg bg-pitch-100 px-3.5 py-2.5 text-sm font-semibold text-pitch-700">
          <CheckCircle2 size={16} /> Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.
        </p>
      )}

      <div>
        <label className={labelCls} htmlFor="pw-current">Mật khẩu hiện tại</label>
        <div className="relative">
          <PasswordInput id="pw-current" value={form.current} onChange={set("current")} show={show} autoComplete="current-password" />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-soft hover:text-pitch-700"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="pw-new">Mật khẩu mới</label>
        <PasswordInput id="pw-new" value={form.next} onChange={set("next")} show={show} autoComplete="new-password" />
        {tooShort && <p className="mt-1 text-xs text-red-700">Tối thiểu 6 ký tự.</p>}
      </div>
      <div>
        <label className={labelCls} htmlFor="pw-confirm">Nhập lại mật khẩu mới</label>
        <PasswordInput id="pw-confirm" value={form.confirm} onChange={set("confirm")} show={show} autoComplete="new-password" />
        {mismatch && <p className="mt-1 text-xs text-red-700">Mật khẩu nhập lại không khớp.</p>}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-lg bg-pitch-700 px-5 font-bold text-white transition hover:bg-pitch-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <KeyRound size={16} /> {busy ? "Đang đổi..." : "Đổi mật khẩu"}
      </button>
    </form>
  );
}

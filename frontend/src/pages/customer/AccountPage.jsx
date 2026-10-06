import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Camera, Trash2, Save, Shield, Star, Plus, Pencil, Check, X, UserRound, CheckCircle2, CalendarCheck, KeyRound,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { updateProfile, updateTeams, uploadAvatar, deleteAvatar } from "../../services/authApi";
import { TEAM_NAME_MAX } from "../../utils/teamName";
import ChangePasswordForm from "../../components/ChangePasswordForm";

const MAX_TEAMS = 5;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const inputCls =
  "h-11 w-full rounded-lg border-[1.5px] border-edge bg-white px-3.5 text-[0.95rem] outline-none transition focus:border-pitch-600 focus:ring-3 focus:ring-pitch-600/15";
const labelCls = "mb-1.5 block text-sm font-semibold text-ink-soft";
const btnPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pitch-700 px-5 font-bold text-white transition hover:bg-pitch-600 disabled:cursor-not-allowed disabled:opacity-60";

const initials = (name) =>
  String(name || "?").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase();

// Thông báo "Đã lưu" tự tắt
function useFlash() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 2500);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}

function Panel({ icon: Icon, title, subtitle, flash, children }) {
  return (
    <section className="rounded-2xl border border-edge bg-white p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-pitch-100 text-pitch-700">
            <Icon size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
          </div>
        </div>
        {flash && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-pitch-700">
            <CheckCircle2 size={16} /> {flash}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

const ErrorText = ({ children }) =>
  children ? <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{children}</p> : null;

export default function AccountPage() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-pitch-50 font-sans text-ink">
      <header className="bg-pitch-900 text-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white/75 transition hover:text-white">
            <ArrowLeft size={16} /> Về trang chủ
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Tài khoản của bạn</h1>
          <p className="mt-1 text-sm text-white/75">Ảnh đại diện, thông tin cá nhân và các đội bóng của bạn.</p>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl items-start gap-6 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <AvatarCard user={user} />
        <div className="flex flex-col gap-6">
          <TeamsPanel user={user} />
          <ProfilePanel user={user} />
          <Panel icon={KeyRound} title="Đổi mật khẩu" subtitle="Nhập mật khẩu hiện tại để xác nhận đúng là bạn.">
            <div className="max-w-md">
              <ChangePasswordForm />
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}

/* ---------- Ảnh đại diện ---------- */
function AvatarCard({ user }) {
  const { token, setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError("Chỉ nhận ảnh JPG, PNG hoặc WEBP.");
    if (file.size > 5 * 1024 * 1024) return setError("Ảnh tối đa 5MB.");
    setBusy(true);
    setError("");
    try {
      setUser((await uploadAvatar(token, file)).user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Xoá ảnh đại diện?")) return;
    setBusy(true);
    try {
      setUser((await deleteAvatar(token)).user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const avatar = user.avatar_url ? user.avatar_url.replace("/upload/", "/upload/f_auto,q_auto,w_320,h_320,c_fill,g_face/") : "";

  return (
    <section className="rounded-2xl border border-edge bg-white p-6 text-center lg:sticky lg:top-6">
      <div className="relative mx-auto size-36">
        {avatar ? (
          <img src={avatar} alt="Ảnh đại diện" className="size-full rounded-full object-cover ring-4 ring-pitch-100" />
        ) : (
          <div className="grid size-full place-items-center rounded-full bg-pitch-700 text-4xl font-extrabold text-white ring-4 ring-pitch-100">
            {initials(user.fullName)}
          </div>
        )}
        <label
          title="Đổi ảnh đại diện"
          className={`absolute right-1 bottom-1 grid size-11 cursor-pointer place-items-center rounded-full bg-whistle text-pitch-900 shadow-md ring-4 ring-white transition hover:scale-105 ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Camera size={19} />
          <input type="file" accept={IMAGE_TYPES.join(",")} onChange={pick} className="sr-only" />
        </label>
      </div>
      {busy && <p className="mt-3 text-sm text-ink-soft">Đang xử lý ảnh...</p>}
      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}

      <p className="mt-4 text-xl font-bold">{user.fullName}</p>
      <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-pitch-100 px-3 py-1 text-sm font-semibold text-pitch-700">
        <Shield size={14} /> {user.team_name}
      </p>
      <p className="mt-3 text-sm text-ink-soft">{user.email}</p>
      {user.phone && <p className="text-sm text-ink-soft">{user.phone}</p>}

      <div className="mt-5 flex flex-col gap-2">
        <Link
          to="/my-bookings"
          className="flex h-10 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-edge text-sm font-semibold text-ink transition hover:border-pitch-600 hover:text-pitch-700"
        >
          <CalendarCheck size={16} /> Sân đã đặt
        </Link>
        {user.avatar_url && (
          <button onClick={remove} disabled={busy} className="flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-red-700 transition hover:bg-red-50">
            <Trash2 size={15} /> Xoá ảnh đại diện
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- Đội bóng ---------- */
function TeamsPanel({ user }) {
  const { token, setUser } = useAuth();
  const [editing, setEditing] = useState(null); // index đội đang sửa tên
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useFlash();
  const teams = user.teams?.length ? user.teams : [user.team_name];

  async function save(nextTeams, nextDefault, msg) {
    setBusy(true);
    setError("");
    try {
      setUser((await updateTeams(token, nextTeams, nextDefault)).user);
      setFlash(msg);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function rename(i) {
    const name = draft.trim();
    if (!name || name === teams[i]) return setEditing(null);
    const next = teams.map((t, j) => (j === i ? name : t));
    if (await save(next, i === 0 ? name : teams[0], "Đã đổi tên đội")) setEditing(null);
  }

  async function add(e) {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    if (await save([...teams, name], teams[0], "Đã thêm đội")) setAdding("");
  }

  const remove = (i) => window.confirm(`Xoá đội "${teams[i]}"?`) && save(teams.filter((_, j) => j !== i), i === 0 ? teams[1] : teams[0], "Đã xoá đội");
  const makeDefault = (i) => save(teams, teams[i], "Đã đổi đội mặc định");

  return (
    <Panel
      icon={Shield}
      title="Đội bóng của bạn"
      subtitle={`Tối đa ${MAX_TEAMS} đội. Lúc đặt sân ghép kèo bạn chọn đội nào thì đối thủ thấy tên đội đó.`}
      flash={flash}
    >
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge">
        {teams.map((t, i) => (
          <li key={`${t}-${i}`} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i === 0 ? "bg-pitch-50" : ""}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-extrabold ${i === 0 ? "bg-pitch-700 text-white" : "bg-pitch-100 text-pitch-700"}`}>
              {initials(t.replace(/^(đội|fc|clb)\s+/i, ""))}
            </span>

            {editing === i ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  rename(i);
                }} className="flex min-w-48 flex-1 items-center gap-2">
                <input
                  autoFocus
                  value={draft}
                  maxLength={TEAM_NAME_MAX}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                  className={`${inputCls} h-10`}
                />
                <button type="submit" disabled={busy} aria-label="Lưu tên" className="grid size-10 shrink-0 place-items-center rounded-lg bg-pitch-700 text-white">
                  <Check size={17} />
                </button>
                <button type="button" onClick={() => setEditing(null)} aria-label="Huỷ" className="grid size-10 shrink-0 place-items-center rounded-lg border border-edge text-ink-soft">
                  <X size={17} />
                </button>
              </form>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{t}</p>
                  {i === 0 && <p className="text-xs font-semibold text-pitch-700">Đội mặc định</p>}
                </div>
                <div className="flex items-center gap-1">
                  {i !== 0 && (
                    <button onClick={() => makeDefault(i)} disabled={busy} title="Đặt làm đội mặc định" className="grid size-9 place-items-center rounded-lg text-ink-soft transition hover:bg-amber-50 hover:text-amber-600">
                      <Star size={17} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(i);
                      setDraft(t);
                    }}
                    disabled={busy}
                    title="Đổi tên"
                    className="grid size-9 place-items-center rounded-lg text-ink-soft transition hover:bg-pitch-100 hover:text-pitch-700"
                  >
                    <Pencil size={16} />
                  </button>
                  {teams.length > 1 && (
                    <button onClick={() => remove(i)} disabled={busy} title="Xoá đội" className="grid size-9 place-items-center rounded-lg text-ink-soft transition hover:bg-red-50 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {teams.length < MAX_TEAMS && (
        <form onSubmit={add} className="mt-4 flex gap-2">
          <input
            value={adding}
            maxLength={TEAM_NAME_MAX}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="Tên đội mới, vd: FC Công ty, Đội lớp 12A..."
            className={`${inputCls} flex-1`}
          />
          <button type="submit" disabled={busy || !adding.trim()} className={btnPrimary}>
            <Plus size={17} /> Thêm đội
          </button>
        </form>
      )}
    </Panel>
  );
}

/* ---------- Thông tin cá nhân ---------- */
function ProfilePanel({ user }) {
  const { token, setUser } = useAuth();
  const [form, setForm] = useState({ fullName: user.fullName || "", phone: user.phone || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useFlash();
  const dirty = form.fullName.trim() !== user.fullName || form.phone.trim() !== (user.phone || "");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setUser((await updateProfile(token, { fullName: form.fullName.trim(), phone: form.phone.trim() })).user);
      setFlash("Đã lưu");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel icon={UserRound} title="Thông tin cá nhân" flash={flash}>
      <form onSubmit={save}>
        <ErrorText>{error}</ErrorText>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="p-name">Họ tên</label>
            <input id="p-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="p-phone">Số điện thoại</label>
            <input id="p-phone" type="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Email đăng nhập</label>
            <input value={user.email} disabled className={`${inputCls} bg-pitch-50 text-ink-soft`} />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="submit" disabled={busy || !dirty} className={btnPrimary}>
            <Save size={16} /> {busy ? "Đang lưu..." : "Lưu thông tin"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

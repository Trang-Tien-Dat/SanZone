import { useCallback, useEffect, useState } from "react";
import { Lock, LockOpen, Mail, Phone } from "lucide-react";
import { getUsers, setUserStatus } from "../../services/adminApi";
import { PageTitle, Panel, Tabs, SearchBox, Pill, Pager, Empty, ErrorNote, Avatar, inputCls } from "./UI";

const LIMIT = 12;
const ROLE_TABS = [
  ["3", "Khách hàng"],
  ["2", "Chủ sân"],
];

export default function AdminAccounts() {
  const [role, setRole] = useState("3");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const isOwner = role === "2";

  // Gõ tìm kiếm: đợi 300ms rồi mới gọi API
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => setPage(1), [role, debouncedQ, status]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getUsers({ role, q: debouncedQ, status, page, limit: LIMIT })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [role, debouncedQ, status, page]);

  useEffect(load, [load]);

  async function toggleLock(u) {
    const next = u.status === "locked" ? "active" : "locked";
    if (next === "locked" && !window.confirm(`Khoá tài khoản ${u.fullName}? Người này sẽ không đăng nhập được.`)) return;
    setBusy(u.userID);
    try {
      await setUserStatus(u.userID, next);
      setData((d) => ({ ...d, items: d.items.map((x) => (x.userID === u.userID ? { ...x, status: next } : x)) }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageTitle title="Quản lý tài khoản" subtitle="Xem, tìm kiếm và khoá / mở khoá tài khoản khách hàng và chủ sân." />

      <Panel
        bodyClass="p-0"
        title={<Tabs items={ROLE_TABS} value={role} onChange={setRole} />}
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <SearchBox value={q} onChange={setQ} placeholder="Tên, email, SĐT, mã..." />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              <option value="">Mọi trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="locked">Đã khoá</option>
            </select>
          </div>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
                <th className="px-5 py-3">Tài khoản</th>
                <th className="px-3 py-3">Liên hệ</th>
                <th className="px-3 py-3">{isOwner ? "Cụm sân" : "Lượt đặt"}</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && data.items.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <Empty>Không tìm thấy tài khoản nào.</Empty>
                  </td>
                </tr>
              )}
              {data.items.map((u) => (
                <tr key={u.userID} className={`transition hover:bg-slate-50/70 ${u.status === "locked" ? "bg-rose-50/30" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.fullName} />
                      <div>
                        <p className="font-semibold text-slate-900">{u.fullName}</p>
                        <p className="font-mono text-xs text-slate-400">{u.userID}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <p className="flex items-center gap-1.5">
                      <Mail size={13} className="text-slate-400" /> {u.email}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5">
                      <Phone size={13} className="text-slate-400" /> {u.phone}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {isOwner ? (
                      u.venues?.length ? (
                        <>
                          <p className="font-medium text-slate-800">{u.venues.join(", ")}</p>
                          <p className="text-xs text-slate-400">{u.court_count} sân</p>
                        </>
                      ) : (
                        <span className="text-slate-400">Chưa có sân</span>
                      )
                    ) : (
                      <span className="font-semibold text-slate-800 tabular-nums">{u.booking_count}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {u.status === "locked" ? <Pill tone="red">Đã khoá</Pill> : <Pill tone="green">Hoạt động</Pill>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => toggleLock(u)}
                      disabled={busy === u.userID}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition disabled:opacity-50 ${
                        u.status === "locked"
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
                      }`}
                    >
                      {u.status === "locked" ? (
                        <>
                          <LockOpen size={14} /> Mở khoá
                        </>
                      ) : (
                        <>
                          <Lock size={14} /> Khoá
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <Empty>Đang tải...</Empty>}
        <Pager page={page} total={data.total} limit={LIMIT} onChange={setPage} />
      </Panel>
    </>
  );
}
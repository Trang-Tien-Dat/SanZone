import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getRoleId } from "../utils/roles";

export default function RoleRoute({ allow }) {
  const { user, checking } = useAuth();

  // F5: đang hỏi backend token còn hợp lệ không -> chờ, chưa đá ra ngoài
  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center text-ink-soft">
        Đang kiểm tra đăng nhập...
      </div>
    );
  }

  // Chưa đăng nhập hoặc sai quyền -> về trang chủ
  if (!user || !allow.includes(getRoleId(user))) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Khu quản lý: chủ sân + admin
const MANAGE_PATHS = ["/owner", "/admin"];
const isManagePath = (path) =>
  MANAGE_PATHS.some((p) => path === p || path.startsWith(p + "/"));

// Rời khỏi khu quản lý (mũi tên back, link, nút...) => đăng xuất, vào lại phải đăng nhập
export default function LogoutOnLeave() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (isManagePath(prevPath.current) && !isManagePath(pathname) && user) {
      logout();
    }
    prevPath.current = pathname;
  }, [pathname]);

  return null;
}
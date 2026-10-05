import { createContext, useContext, useEffect, useState } from "react";
import { loginRequest, registerRequest, getMe } from "../services/authApi";
import { TOKEN_KEY, getToken, setToken as saveToken, clearToken } from "../utils/tokenStorage";

// Giữ export này để file nào đang import TOKEN_KEY từ AuthContext vẫn chạy
export { TOKEN_KEY };

const AuthContext = createContext(null);

// Chuẩn hoá giống LoginModal để đăng ký & đăng nhập luôn khớp dữ liệu trong DB
const normalizeEmail = (s) => String(s || "").trim().toLowerCase();
const normalizePhone = (s) => {
  let d = String(s || "").replace(/\D/g, "");
  if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2);
  return d;
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getToken());
  const [user, setUser] = useState(null);
  // true trong lúc hỏi backend token cũ còn hợp lệ không
  const [checking, setChecking] = useState(() => Boolean(getToken()));

  useEffect(() => {
    // Dọn token cũ còn sót trong localStorage từ phiên bản trước
    localStorage.removeItem(TOKEN_KEY);

    const saved = getToken();
    if (!saved) return;
    getMe(saved)
      .then((res) => setUser(res?.user ?? res?.data ?? res))
      .catch(() => {
        clearToken();
        setToken(null);
      })
      .finally(() => setChecking(false));
  }, []);

  /**
   * Đăng nhập bằng email HOẶC số điện thoại.
   * @param {string} identifier  email (vd ban@gmail.com) hoặc SĐT (vd 0901234567)
   */
  async function login(identifier, password) {
    const data = await loginRequest(identifier, password);
    saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  // Đăng ký xong thì đăng nhập luôn
  async function register(payload) {
    const clean = {
      ...payload,
      email: normalizeEmail(payload.email),
      phone: normalizePhone(payload.phone),
    };
    await registerRequest(clean);
    return login(clean.email, clean.password);
  }

  // JWT không lưu trên server nên đăng xuất = xoá token ở trình duyệt
  function logout() {
    clearToken();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, checking, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return ctx;
}
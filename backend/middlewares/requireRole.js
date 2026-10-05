
const ROLES = { ADMIN: 1, OWNER: 2, CUSTOMER: 3 };

const requireRole =
  (...allowed) =>
  (req, res, next) => {
    if (!(req.auth ?? req.user)) return res.status(401).json({ message: "Vui lòng đăng nhập" });
    if (!allowed.includes(Number((req.auth ?? req.user).role_id))) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    next();
  };

module.exports = { requireRole, ROLES };
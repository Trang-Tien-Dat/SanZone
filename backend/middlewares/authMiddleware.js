const jwt = require("jsonwebtoken");

// Bắt buộc đăng nhập: đọc token từ header "Authorization: Bearer <token>"
function verifyToken(req, res, next) {
  const [type, token] = (req.headers.authorization || "").split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ message: "Bạn cần đăng nhập để tiếp tục." });
  }
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET); // { id, userID, role_id }
    next();
  } catch {
    return res
      .status(401)
      .json({ message: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại." });
  }
}

// Giới hạn theo quyền, vd: requireRole(1) -> chỉ Admin
function requireRole(...roleIds) {
  return (req, res, next) => {
    if (!req.auth || !roleIds.includes(req.auth.role_id)) {
      return res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này." });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };
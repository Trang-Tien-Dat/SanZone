const router = require("express").Router();
// Đổi đường dẫn / tên cho đúng middleware xác thực JWT hiện có của bạn (gán req.user)
const { verifyToken } = require("../middlewares/authMiddleware");
const { requireRole, ROLES } = require("../middlewares/requireRole");
const { getOwnerRevenue, listOwnerTransactions } = require("../controllers/ownerRevenueController");

router.use(verifyToken, requireRole(ROLES.OWNER));

router.get("/", getOwnerRevenue); // tổng hợp + biểu đồ + theo sân
router.get("/transactions", listOwnerTransactions); // danh sách từng dòng owner_revenue

module.exports = router;

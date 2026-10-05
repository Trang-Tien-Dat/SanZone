const OwnerRevenue = require("../models/OwnerRevenue");
const { STATUSES } = require("../models/OwnerRevenue");

const getOwnerId = (req) => (req.auth ?? req.user).userID; // mã chủ sân trong token, vd "OWN001"

// Collection sân để lấy tên sân
const COURTS = { from: "courts", key: "court_id" };
const courtNameExpr = { $ifNull: ["$court.court_name", { $ifNull: ["$court.name", "$court_id"] }] };

const TZ = "Asia/Ho_Chi_Minh";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

// from/to là ngày theo giờ Việt Nam -> khoảng thời gian UTC [start, end)
function parseRange({ from, to }) {
  if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) throw badRequest("from/to phải có dạng YYYY-MM-DD");
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000);
  const days = Math.round((end - start) / 86_400_000);
  if (Number.isNaN(days) || days < 1 || days > MAX_DAYS) throw badRequest(`Khoảng ngày không hợp lệ (tối đa ${MAX_DAYS} ngày)`);
  return { from, to, start, end, days };
}

/**
 * Các bước lọc chung.
 * Mốc thời gian của 1 dòng = paid_at (nếu đã trả) hoặc created_at.
 * $toDate xử lý được cả khi field lưu dạng chuỗi ISO lẫn kiểu Date.
 */
function basePipeline(req, { start, end }) {
  const match = { owner_id: getOwnerId(req) };
  if (req.query.court_id) match.court_id = String(req.query.court_id);
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw badRequest("status không hợp lệ");
    match.status = req.query.status;
  }
  return [
    { $match: match },
    { $addFields: { _at: { $toDate: { $ifNull: ["$paid_at", "$created_at"] } } } },
    { $match: { _at: { $gte: start, $lt: end } } },
  ];
}

const lookupCourt = [
  { $lookup: { from: COURTS.from, localField: "court_id", foreignField: COURTS.key, as: "court" } },
  { $unwind: { path: "$court", preserveNullAndEmptyArrays: true } },
];

const SUMS = {
  count: { $sum: 1 },
  amount: { $sum: "$amount" },
  platform_fee: { $sum: "$platform_fee" },
  net_amount: { $sum: "$net_amount" },
};

/**
 * GET /api/owner/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&court_id=
 * -> {
 *   from, to, group: "day" | "month",
 *   summary: { paid: {count, amount, platform_fee, net_amount}, pending: {...}, refunded: {...} },
 *   series:  [{ key: "2026-09-26" | "2026-09", count, amount, platform_fee, net_amount }],  // chỉ "paid"
 *   byCourt: [{ court_id, court_name, count, amount, platform_fee, net_amount }]            // chỉ "paid"
 * }
 */
exports.getOwnerRevenue = async (req, res, next) => {
  try {
    const range = parseRange(req.query);
    const group = range.days > 62 ? "month" : "day";
    const bucket = { $dateToString: { format: group === "month" ? "%Y-%m" : "%Y-%m-%d", date: "$_at", timezone: TZ } };

    const [r] = await OwnerRevenue.aggregate([
      ...basePipeline(req, range),
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", ...SUMS } }],
          series: [
            { $match: { status: "paid" } },
            { $group: { _id: bucket, ...SUMS } },
            { $sort: { _id: 1 } },
          ],
          byCourt: [
            { $match: { status: "paid" } },
            { $group: { _id: "$court_id", ...SUMS } },
            { $sort: { net_amount: -1 } },
            { $addFields: { court_id: "$_id" } },
            ...lookupCourt,
            { $project: { _id: 0, court_id: 1, court_name: courtNameExpr, count: 1, amount: 1, platform_fee: 1, net_amount: 1 } },
          ],
        },
      },
    ]);

    const zero = { count: 0, amount: 0, platform_fee: 0, net_amount: 0 };
    const summary = Object.fromEntries(STATUSES.map((s) => [s, { ...zero }]));
    for (const { _id, ...v } of r.byStatus) if (summary[_id]) summary[_id] = v;

    res.json({
      from: range.from,
      to: range.to,
      group,
      summary,
      series: r.series.map(({ _id, ...v }) => ({ key: _id, ...v })),
      byCourt: r.byCourt,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/owner/revenue/transactions?from=&to=&court_id=&status=&page=1&limit=10
 * -> { items: [{ ...dòng owner_revenue, court_name }], total, page, limit }
 */
exports.listOwnerTransactions = async (req, res, next) => {
  try {
    const range = parseRange(req.query);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

    const [r] = await OwnerRevenue.aggregate([
      ...basePipeline(req, range),
      {
        $facet: {
          items: [
            { $sort: { _at: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            ...lookupCourt,
            { $addFields: { court_name: courtNameExpr } },
            { $project: { court: 0, _at: 0, owner_id: 0 } },
          ],
          total: [{ $count: "n" }],
        },
      },
    ]);

    res.json({ items: r.items, total: r.total[0]?.n ?? 0, page, limit });
  } catch (err) {
    next(err);
  }
};
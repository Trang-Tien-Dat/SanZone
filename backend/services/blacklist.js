/**
 * Danh sách chặn của chủ sân: khách bị chặn không đặt được sân của cụm sân đó.
 * Collection "owner_blacklist":
 *   { block_id, venue_id, owner_id, user_id, name, phone, reason,
 *     duration: "1w" | "1m" | "forever", until: ISO string | null (vĩnh viễn), created_at }
 */
const mongoose = require("mongoose");

const col = () => mongoose.connection.collection("owner_blacklist");
const DURATIONS = {
  "1w": { label: "1 tuần", days: 7 },
  "1m": { label: "1 tháng", days: 30 },
  forever: { label: "Vĩnh viễn", days: null },
};

const activeFilter = () => ({ $or: [{ until: null }, { until: { $gt: new Date().toISOString() } }] });

// Lần chặn còn hiệu lực của 1 khách ở 1 cụm sân (hoặc null)
const findActiveBlock = (venueId, userId) =>
  col().findOne({ venue_id: venueId, user_id: userId, ...activeFilter() }, { projection: { _id: 0 } });

// Câu báo cho khách
function blockMessage(b) {
  if (!b.until) return "Bạn đã bị chủ sân chặn đặt sân tại cụm sân này.";
  const d = new Date(b.until).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return `Bạn đang bị chủ sân tạm chặn đặt sân tại cụm sân này đến hết ngày ${d}.`;
}

module.exports = { blacklistCol: col, DURATIONS, activeFilter, findActiveBlock, blockMessage };

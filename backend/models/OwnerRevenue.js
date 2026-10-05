const mongoose = require("mongoose");


const STATUSES = ["pending", "paid", "refunded"];

const ownerRevenueSchema = new mongoose.Schema(
  {
    owner_id: { type: String, required: true, index: true },
    booking_id: { type: String, required: true, unique: true }, // 1 booking = 1 dòng doanh thu
    court_id: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    platform_fee: { type: Number, required: true, min: 0 },
    net_amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: STATUSES, default: "pending" },
    created_at: { type: String }, // ISO string, vd "2026-09-26T08:00:00Z"
    paid_at: { type: String, default: null },
  },
  {
    collection: "owner_revenue", // dùng đúng tên collection có sẵn
    versionKey: false,
  }
);

ownerRevenueSchema.index({ owner_id: 1, status: 1, paid_at: 1 });

module.exports = mongoose.model("OwnerRevenue", ownerRevenueSchema);
module.exports.STATUSES = STATUSES;
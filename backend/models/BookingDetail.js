const mongoose = require("mongoose");

const bookingDetailSchema = new mongoose.Schema(
  {
    detail_id: { type: String, required: true, unique: true }, // "BD001"
    booking_id: { type: String, required: true },
    court_id: { type: String, required: true },
    booking_date: { type: String, required: true },            // "2026-09-23"
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    price: { type: Number, required: true },

    // --- cột mới ---
    // full = nguyên sân, half = nửa sân. Dữ liệu cũ không có cột này được coi là "full"
    booking_type: { type: String, enum: ["full", "half"], default: "full" },
    // trình độ đội muốn tìm (chỉ đội đặt nửa sân trước mới có)
    wanted_level: { type: String, default: null },
    // đội vào ghép: detail_id của đội đã đặt nửa sân trước
    joined_detail_id: { type: String, default: null },
  },
  { collection: "booking_details" } // ← sửa cho khớp tên collection thật
);

module.exports =
  mongoose.models.BookingDetail || mongoose.model("BookingDetail", bookingDetailSchema);
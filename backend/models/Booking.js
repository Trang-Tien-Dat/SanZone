const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
    {
        booking_id: { type: String, required: true, unique: true }, // "B001"
        user_id: { type: String, required: true },                  // "U003"
        booking_date: { type: String, required: true },             // ngày đá "2026-09-23"
        status: { type: String, default: "confirmed" },             // confirmed | cancelled
        created_at: { type: String, default: () => new Date().toISOString() },
        // Chủ sân đặt hộ khách: source = "owner" + thông tin khách chủ sân nhập
        source: { type: String, default: "online" },
        customer_name: { type: String, default: "" },
        customer_phone: { type: String, default: "" },
        note: { type: String, default: "" },
        // Tên đội khách chọn khi đặt (để trống -> dùng đội mặc định trong tài khoản)
        team_name: { type: String, default: "" },
    },
    { collection: "bookings" } 
);

module.exports = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
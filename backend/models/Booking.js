const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
    {
        booking_id: { type: String, required: true, unique: true }, // "B001"
        user_id: { type: String, required: true },                  // "U003"
        booking_date: { type: String, required: true },             // ngày đá "2026-09-23"
        status: { type: String, default: "confirmed" },             // confirmed | cancelled
        created_at: { type: String, default: () => new Date().toISOString() },
    },
    { collection: "bookings" } 
);

module.exports = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
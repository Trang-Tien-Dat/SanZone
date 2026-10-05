const mongoose = require("mongoose");

// Khung giờ + giá của từng sân (không theo ngày)
const courtScheduleSchema = new mongoose.Schema(
  {
    schedule_id: { type: String, required: true, unique: true },
    court_id: { type: String, required: true },
    start_time: { type: String, required: true }, // "17:00"
    end_time: { type: String, required: true },   // "18:00"
    price: { type: Number, required: true },
  },
  { collection: "court_schedules" } // ← sửa cho khớp tên collection thật
);

module.exports =
  mongoose.models.CourtSchedule || mongoose.model("CourtSchedule", courtScheduleSchema);
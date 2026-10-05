require("dotenv").config();
const mongoose = require("mongoose");
const { syncRevenueForBooking } = require("../services/ownerRevenueService");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const bookings = await mongoose.connection.collection("bookings").find({}).project({ booking_id: 1 }).toArray();
  let ok = 0;
  for (const b of bookings) {
    try {
      if (await syncRevenueForBooking(b.booking_id)) ok++;
    } catch (e) {
      console.error(b.booking_id, e.message);
    }
  }
  console.log(`Đã đồng bộ ${ok}/${bookings.length} lượt đặt vào owner_revenue`);
  await mongoose.disconnect();
})();
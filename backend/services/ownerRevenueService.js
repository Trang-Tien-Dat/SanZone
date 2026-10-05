const OwnerRevenue = require("../models/OwnerRevenue");

// % phí web thu. Đặt trong .env: PLATFORM_FEE_RATE=0.05  (0.05 = 5%, khớp mẫu 200.000 -> phí 10.000)
const FEE_RATE = Number(process.env.PLATFORM_FEE_RATE ?? 0);

// "2026-09-26T08:30:00Z" (cùng định dạng dữ liệu đang có, bỏ phần mili giây)
const nowISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");


async function createRevenueForBooking({ booking_id, court_id, owner_id, amount, paid = false, feeRate = FEE_RATE }) {
  const platform_fee = Math.round(Number(amount) * feeRate);
  const now = nowISO();
  return OwnerRevenue.findOneAndUpdate(
    { booking_id },
    {
      $setOnInsert: {
        booking_id,
        court_id,
        owner_id,
        amount: Number(amount),
        platform_fee,
        net_amount: Number(amount) - platform_fee,
        status: paid ? "paid" : "pending",
        created_at: now,
        paid_at: paid ? now : null,
      },
    },
    { upsert: true, new: true }
  );
}

/** Khách đã thanh toán (hoặc chủ sân bấm "Đã thu tiền") */
function markPaid(booking_id) {
  return OwnerRevenue.findOneAndUpdate(
    { booking_id, status: "pending" },
    { $set: { status: "paid", paid_at: nowISO() } },
    { new: true }
  );
}

/** Booking bị huỷ -> không tính doanh thu nữa */
function markRefunded(booking_id) {
  return OwnerRevenue.findOneAndUpdate({ booking_id }, { $set: { status: "refunded" } }, { new: true });
}

const mongoose = require("mongoose");
const col = (name) => mongoose.connection.collection(name);

/**
 * Đồng bộ 1 dòng owner_revenue theo trạng thái hiện tại của booking.
 *   pending / confirmed -> "pending" (chờ thanh toán)
 *   completed           -> "paid"    (tính vào doanh thu)
 *   cancelled           -> "refunded"
 */
async function syncRevenueForBooking(booking_id) {
  const booking = await col("bookings").findOne({ booking_id });
  if (!booking) return null;

  const status = booking.status ?? "pending";
  if (status === "cancelled") return markRefunded(booking_id);

  const details = await col("booking_details").find({ booking_id }).toArray();
  if (!details.length) return null;

  // Tìm chủ sân: court -> venue -> owner_id
  const court = await col("courts").findOne({ court_id: details[0].court_id });
  const venue = court && (await col("venues").findOne({ venue_id: court.venue_id }));
  if (!venue) return null;

  const amount = details.reduce((s, d) => s + Number(d.price || 0), 0);
  await createRevenueForBooking({
    booking_id,
    court_id: details[0].court_id,
    owner_id: venue.owner_id,
    amount,
  });

  // Lỡ huỷ rồi đặt lại -> đưa về chờ thanh toán
  await OwnerRevenue.updateOne({ booking_id, status: "refunded" }, { $set: { status: "pending", paid_at: null } });

  if (status === "completed") return markPaid(booking_id);
  return OwnerRevenue.findOne({ booking_id });
}
module.exports = { createRevenueForBooking, markPaid, markRefunded, syncRevenueForBooking, FEE_RATE };


const mongoose = require('mongoose');

// Khớp đúng field thật trong collection "venues" trên Atlas:
// { venue_id, owner_id, sport_id, venue_name, address, phone }
const venueSchema = new mongoose.Schema(
  {
    venue_id: { type: String, required: true, unique: true },
    owner_id: { type: String, required: true },
    sport_id: { type: String, required: true }, // liên kết tới Sport.sportID
    venue_name: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String },
    open_time: { type: String },
    close_time: { type: String },
    description: { type: String, default: "" },
    // Google Maps: link chủ sân dán vào + toạ độ tách ra từ link (để nhúng bản đồ)
    map_url: { type: String, default: "" },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    // Ảnh sân lưu trên Cloudinary
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
    ],
  },
  { collection: 'venues' }
);

module.exports = mongoose.model('Venue', venueSchema);
const mongoose = require('mongoose');

// Khớp field thật trong collection "courts":
// { court_id, venue_id, court_name, court_type, price_per_hour, status }
const courtSchema = new mongoose.Schema(
  {
    court_id: { type: String, required: true, unique: true },
    venue_id: { type: String, required: true }, // liên kết tới Venue.venue_id
    court_name: { type: String, required: true },
    court_type: { type: String },
    price_per_hour: { type: Number, required: true },
    status: { type: String, default: 'active' },
  },
  { collection: 'courts' }
);

module.exports = mongoose.model('Court', courtSchema);
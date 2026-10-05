const mongoose = require('mongoose');
const sportSchema = new mongoose.Schema(
  {
    sportID: { type: String, required: true, unique: true },
    sportName: { type: String, required: true },
  },
  { collection: 'sports' } // 
);

module.exports = mongoose.model('Sport', sportSchema);
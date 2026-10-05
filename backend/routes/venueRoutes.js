const express = require('express');
const router = express.Router();
const Venue = require('../models/Venue');

// GET /api/venues?sport_id=SP01&area=Ninh+Kieu
router.get('/', async (req, res) => {
  try {
    const { sport_id, area } = req.query;
    const filter = {};
    if (sport_id) filter.sport_id = sport_id;
    if (area) filter.address = { $regex: area, $options: 'i' };

    const venues = await Venue.find(filter);
    res.json(venues);
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Lỗi khi lấy danh sách sân', error: err.message });
  }
});

module.exports = router;
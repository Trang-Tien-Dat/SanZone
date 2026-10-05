const express = require('express');
const router = express.Router();
const Court = require('../models/Court');

// GET /api/courts?venue_id=V001
// GET /api/courts?venue_id=V001,V002  (nhiều venue cùng lúc, dùng cho trang chủ)
router.get('/', async (req, res) => {
  try {
    const { venue_id } = req.query;
    const filter = {};
    if (venue_id) {
      const ids = venue_id.split(',').map((id) => id.trim());
      filter.venue_id = { $in: ids };
    }

    const courts = await Court.find(filter);
    res.json(courts);
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Lỗi khi lấy danh sách sân con', error: err.message });
  }
});

module.exports = router;
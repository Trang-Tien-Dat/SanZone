const express = require('express');
const router = express.Router();
const Sport = require('../models/Sport');

// GET /api/sports
router.get('/', async (req, res) => {
  try {
    const sports = await Sport.find();
    res.json(sports);
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Lỗi khi lấy danh sách môn thể thao', error: err.message });
  }
});

module.exports = router;
const router = require('express').Router();
const Venue = require('../models/Venue');
const { verifyToken } = require('../middlewares/authMiddleware');
const { requireRole, ROLES } = require('../middlewares/requireRole');
const { cloudinary, uploadImages, uploadBuffer } = require('../config/cloudinary');

const MAX_IMAGES = 5;

// Chỉ chủ sân đã đăng nhập; venues.owner_id = userID trong token (vd "U002")
const ownerOnly = [verifyToken, requireRole(ROLES.OWNER)];
const findMyVenue = (req) => Venue.findOne({ owner_id: (req.auth ?? req.user).userID });

// Bắt lỗi của multer -> trả thông báo tiếng Việt
function handleUpload(req, res, next) {
  uploadImages.array('images', MAX_IMAGES)(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Mỗi ảnh tối đa 5MB.'
      : err.code === 'LIMIT_UNEXPECTED_FILE' ? `Tối đa ${MAX_IMAGES} ảnh mỗi lần.`
      : err.message;
    res.status(400).json({ message });
  });
}

// POST /api/owner/venue/images  (form-data, field "images")
router.post('/', ownerOnly, handleUpload, async (req, res) => {
  try {
    const venue = await findMyVenue(req);
    if (!venue) return res.status(404).json({ message: 'Không tìm thấy cụm sân của bạn.' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'Chưa chọn ảnh nào.' });
    if (venue.images.length + files.length > MAX_IMAGES) {
      return res.status(400).json({
        message: `Mỗi cụm sân tối đa ${MAX_IMAGES} ảnh (đang có ${venue.images.length}).`,
      });
    }

    const results = await Promise.all(
      files.map((f) => uploadBuffer(f.buffer, `sanzone/venues/${venue.venue_id}`))
    );
    venue.images.push(...results.map((r) => ({ url: r.secure_url, public_id: r.public_id })));
    await venue.save();

    res.status(201).json({ images: venue.images });
  } catch (e) {
    console.error('[upload ảnh sân]', e);
    res.status(500).json({ message: 'Tải ảnh thất bại, vui lòng thử lại.' });
  }
});

// DELETE /api/owner/venue/images?public_id=...
router.delete('/', ownerOnly, async (req, res) => {
  try {
    const { public_id } = req.query;
    const venue = await findMyVenue(req);
    if (!venue || !venue.images.some((i) => i.public_id === public_id)) {
      return res.status(404).json({ message: 'Không tìm thấy ảnh.' });
    }
    await cloudinary.uploader.destroy(public_id);
    venue.images = venue.images.filter((i) => i.public_id !== public_id);
    await venue.save();
    res.json({ images: venue.images });
  } catch (e) {
    console.error('[xoá ảnh sân]', e);
    res.status(500).json({ message: 'Xoá ảnh thất bại.' });
  }
});

module.exports = router;
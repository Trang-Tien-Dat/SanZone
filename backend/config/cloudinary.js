const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

// Giữ file trong RAM rồi đẩy thẳng lên Cloudinary (không lưu ổ cứng server)
const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB / ảnh
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Chỉ nhận ảnh JPG, PNG hoặc WEBP.')),
});

// Upload 1 buffer -> trả về { secure_url, public_id, ... }
function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          resource_type: 'image',
          // Thu nhỏ ảnh quá to, tự nén cho nhẹ
          transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }],
        },
        (err, result) => (err ? reject(err) : resolve(result))
      )
      .end(buffer);
  });
}

module.exports = { cloudinary, uploadImages, uploadBuffer };
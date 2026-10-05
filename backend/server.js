const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db');

const sportRoutes = require('./routes/sportRoutes');
const venueRoutes = require('./routes/venueRoutes');
const courtRoutes = require('./routes/CourtRoutes');
const authRoutes = require('./routes/auth');
const courtBookingRoutes = require('./routes/courtBookingRoutes');
const ownerRevenueRoutes = require('./routes/ownerRevenue.routes');
const ownerRoutes = require('./routes/owner.routes');

// 👇 sửa đường dẫn cho đúng file service thuê bao (xem hướng dẫn bên dưới)
const { handleSepayWebhook } = require('./services/subscriptionService');

const app = express();
app.use(cors());
app.use(express.json());

connectDB();

// Kiểm tra server sống (mở link ngrok trên trình duyệt sẽ thấy dòng này)
app.get('/', (req, res) => res.send('SanZone API đang chạy ✅'));

// ===== Webhook SePay: tự kích hoạt gói khi tiền về =====
app.post('/webhooks/sepay', async (req, res) => {
  if (req.headers.authorization !== `Apikey ${process.env.SEPAY_API_KEY}`) {
    console.warn('[sepay] sai API key:', req.headers.authorization);
    return res.status(401).json({ success: false, message: 'Sai API key' });
  }
  try {
    const result = await handleSepayWebhook(req.body);
    console.log('[sepay]', req.body?.id, req.body?.content, '->', result);
    res.json({ success: true, result });
  } catch (e) {
    console.error('[sepay] lỗi', e);
    res.status(500).json({ success: false });
  }
});

app.use('/api/sports', sportRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/courts', courtRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/court-booking', courtBookingRoutes);

// Chủ sân (đặt /revenue TRƯỚC /api/owner)
app.use('/api/owner/revenue', ownerRevenueRoutes);
app.use('/api/owner/venue/images', require('./routes/venueImage.routes'));
app.use('/api/owner', ownerRoutes);

// admin
app.use('/api/admin', require('./routes/admin.routes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Server backend đang chạy ở port ${PORT}`);
});
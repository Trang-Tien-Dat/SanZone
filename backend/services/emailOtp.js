/**
 * Mã OTP 6 số gửi qua email khi đăng ký.
 * Collection "email_otps": { email, purpose, code_hash, expires_at, attempts, last_sent_at }
 */
const crypto = require("crypto");
const mongoose = require("mongoose");
const { sendMail, otpEmail } = require("./mailer");

const col = () => mongoose.connection.collection("email_otps");
const TTL_MIN = 10; // mã sống 10 phút
const RESEND_SEC = 60; // 60 giây mới được gửi lại
const MAX_ATTEMPTS = 5; // nhập sai quá 5 lần -> phải gửi mã mới

const hash = (email, code) =>
  crypto.createHash("sha256").update(`${email}|${code}|${process.env.JWT_SECRET || "sanzone"}`).digest("hex");

// -> { ok: true } | { error, wait? }
async function sendOtp(email, purpose = "register") {
  const now = Date.now();
  const old = await col().findOne({ email, purpose });
  if (old && now - new Date(old.last_sent_at).getTime() < RESEND_SEC * 1000) {
    const wait = Math.ceil((RESEND_SEC * 1000 - (now - new Date(old.last_sent_at).getTime())) / 1000);
    return { error: `Vui lòng chờ ${wait} giây rồi gửi lại mã.`, wait };
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const mail = otpEmail(code, TTL_MIN);
  await sendMail({ to: email, ...mail }); // gửi lỗi -> ném lỗi, chưa lưu mã
  await col().updateOne(
    { email, purpose },
    {
      $set: {
        code_hash: hash(email, code),
        expires_at: new Date(now + TTL_MIN * 60000).toISOString(),
        attempts: 0,
        last_sent_at: new Date(now).toISOString(),
      },
    },
    { upsert: true }
  );
  return { ok: true, resend_after: RESEND_SEC, ttl_minutes: TTL_MIN };
}

// -> { ok: true } | { error }   (đúng thì xoá mã, mỗi mã chỉ dùng 1 lần)
async function verifyOtp(email, code, purpose = "register") {
  const rec = await col().findOne({ email, purpose });
  if (!rec) return { error: "Vui lòng bấm gửi mã xác minh về email trước." };
  if (new Date(rec.expires_at).getTime() < Date.now()) return { error: "Mã xác minh đã hết hạn, vui lòng gửi mã mới." };
  if (rec.attempts >= MAX_ATTEMPTS) return { error: "Nhập sai quá nhiều lần, vui lòng gửi mã mới." };
  if (rec.code_hash !== hash(email, String(code || "").trim())) {
    await col().updateOne({ _id: rec._id }, { $inc: { attempts: 1 } });
    const left = MAX_ATTEMPTS - rec.attempts - 1;
    return { error: left > 0 ? `Mã xác minh không đúng (còn ${left} lần thử).` : "Nhập sai quá nhiều lần, vui lòng gửi mã mới." };
  }
  await col().deleteOne({ _id: rec._id });
  return { ok: true };
}

module.exports = { sendOtp, verifyOtp };

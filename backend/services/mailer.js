/**
 * Gửi email (mã OTP...). Ưu tiên theo thứ tự cấu hình trong .env:
 *   1) RESEND_API_KEY=re_xxx   (+ MAIL_FROM="SanZone <no-reply@ten-mien-cua-ban>")  -> gửi qua API Resend (HTTPS)
 *   2) MAIL_USER=ban@gmail.com + MAIL_PASS=<App Password 16 ký tự>                  -> gửi qua Gmail SMTP
 *   3) Không cấu hình gì + chạy ở máy (không phải Render) -> in mã ra terminal để test
 */
const hasResend = () => Boolean(process.env.RESEND_API_KEY);
const hasSmtp = () => Boolean(process.env.MAIL_USER && process.env.MAIL_PASS);
const isServer = () => Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";

let transporter = null;
function smtp() {
  if (!transporter) {
    // require lúc cần: máy chưa "npm install nodemailer" vẫn chạy được server
    const nodemailer = require("nodemailer");
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || "smtp.gmail.com",
      port: Number(process.env.MAIL_PORT) || 465,
      secure: (Number(process.env.MAIL_PORT) || 465) === 465,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });
  }
  return transporter;
}

const fromAddr = () => process.env.MAIL_FROM || (process.env.MAIL_USER ? `SanZone <${process.env.MAIL_USER}>` : "SanZone <onboarding@resend.dev>");

async function sendMail({ to, subject, html, text }) {
  if (hasResend()) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddr(), to, subject, html, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return;
  }
  if (hasSmtp()) {
    await smtp().sendMail({ from: fromAddr(), to, subject, html, text });
    return;
  }
  if (!isServer()) {
    console.log(`\n[mail:DEV] Chưa cấu hình gửi email -> in ra đây\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  throw new Error("Chưa cấu hình gửi email (RESEND_API_KEY hoặc MAIL_USER/MAIL_PASS).");
}

// Email chứa mã OTP
function otpEmail(code, minutes) {
  const text = `Mã xác minh SanZone của bạn là ${code}. Mã có hiệu lực trong ${minutes} phút. Không chia sẻ mã này cho bất kỳ ai.`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#15261c">
    <h2 style="margin:0 0 8px;color:#13603a">SanZone</h2>
    <p style="margin:0 0 16px">Mã xác minh để tạo tài khoản của bạn:</p>
    <div style="font-size:32px;font-weight:800;letter-spacing:10px;background:#f3faf5;border:1px solid #d5e6da;border-radius:12px;padding:16px;text-align:center;color:#0b3d24">${code}</div>
    <p style="margin:16px 0 0;font-size:14px;color:#52665a">Mã có hiệu lực trong <b>${minutes} phút</b>. Nếu bạn không đăng ký tài khoản SanZone, hãy bỏ qua email này.</p>
  </div>`;
  return { subject: `${code} là mã xác minh SanZone`, html, text };
}

module.exports = { sendMail, otpEmail };

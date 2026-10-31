import nodemailer from 'nodemailer';

/**
 * Plain-text mail through the SMTP server in .env (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS, SMTP_FROM). Port 465 uses implicit TLS; other ports
 * upgrade with STARTTLS.
 */
export async function sendTextMail(message: { to: string; subject: string; text: string }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter.sendMail({
    from: process.env.SMTP_FROM || `"Ayur-stock Pro" <${process.env.SMTP_USER}>`,
    ...message,
  });
}

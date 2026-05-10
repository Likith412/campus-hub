const nodemailer = require("nodemailer");

const from = process.env.SMTP_FROM || "CampusHub <no-reply@campushub.local>";
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT) || 587;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

let transporter = null;

function getTransporter() {
   if (transporter) return transporter;

   if (!host) return null;

   transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
   });

   return transporter;
}

async function send(to, subject, html, text) {
   const t = getTransporter();

   if (!t) {
      console.log(
         `\n[email:dev] to=${to}\n  subject="${subject}"\n  ${text}\n`,
      );
      return;
   }

   await t.sendMail({ from: FROM, to, subject, html, text });
}

async function sendVerificationEmail(to, link) {
   const subject = "Verify your CampusHub email";
   const text = `Welcome to CampusHub! Verify your email: ${link}\n\nThis link expires in 24 hours.`;
   const html = `<p>Welcome to CampusHub.</p><p><a href="${link}">Verify your email</a></p><p>This link expires in 24 hours.</p>`;
   await send(to, subject, html, text);
}

async function sendPasswordResetEmail(to, link) {
   const subject = "Reset your CampusHub password";
   const text = `Reset your password: ${link}\n\nThis link expires in 30 minutes. If you didn't request this, ignore this email.`;
   const html = `<p>Reset your password using the link below.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 30 minutes. If you didn't request this, ignore this email.</p>`;
   await send(to, subject, html, text);
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };

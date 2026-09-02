// Email service — sends verification + password-reset mails via SMTP.
// In dev (no SMTP_HOST set), emails are logged to the console instead so the flow still works.
const nodemailer = require("nodemailer");
const { addToQueue } = require("../config/queue");

const from = process.env.SMTP_FROM || "Campus Hub <no-reply@campushub.local>";
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT) || 587;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

// Lazy singleton — created on first use, reused for the lifetime of the process.
let transporter = null;

function getTransporter() {
   if (transporter) return transporter;

   if (!host) return null; // No SMTP configured → caller falls back to console logging.

   transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 uses TLS; 587/25 use STARTTLS.
      auth: user ? { user, pass } : undefined,
   });

   return transporter;
}

// Internal sender. If SMTP isn't configured we just print the email — handy for local dev.
async function sendEmail(to, subject, html, text) {
   const t = getTransporter();

   if (!t) {
      console.log(
         `\n[email:dev] to=${to}\n  subject="${subject}"\n  ${text}\n`,
      );
      return;
   }

   await t.sendMail({ from, to, subject, html, text });
}

// Sends the "verify your email" message used after registration / resend-verification.
async function sendVerificationEmail(to, link) {
   const subject = "Verify your Campus Hub email";
   const text = `Welcome to Campus Hub! Verify your email: ${link}\n\nThis link expires in 24 hours.`;
   const html = `<p>Welcome to Campus Hub.</p><p><a href="${link}">Verify your email</a></p><p>This link expires in 24 hours.</p>`;
   await addToQueue("sendEmail", { to, subject, html, text });
}

// Sends the password-reset link triggered by /auth/forgot-password.
async function sendPasswordResetEmail(to, link) {
   const subject = "Reset your Campus Hub password";
   const text = `Reset your password: ${link}\n\nThis link expires in 30 minutes. If you didn't request this, ignore this email.`;
   const html = `<p>Reset your password using the link below.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 30 minutes. If you didn't request this, ignore this email.</p>`;
   await addToQueue("sendEmail", { to, subject, html, text });
}

// Sends a new faculty their generated login credentials.
async function sendFacultyAccountEmail(to, { name, password, loginUrl }) {
   const subject = "Your Campus Hub faculty account";
   const text = `Hi ${name},\n\nA Campus Hub faculty account has been created for you.\n\nLogin: ${loginUrl}\nEmail: ${to}\nTemporary password: ${password}\n\nPlease sign in and change your password from your profile.`;
   const html = `<p>Hi ${name},</p><p>A Campus Hub faculty account has been created for you.</p><p><b>Login:</b> <a href="${loginUrl}">${loginUrl}</a><br/><b>Email:</b> ${to}<br/><b>Temporary password:</b> <code>${password}</code></p><p>Please sign in and change your password from your profile.</p>`;
   await addToQueue("sendEmail", { to, subject, html, text });
}

module.exports = {
   sendVerificationEmail,
   sendPasswordResetEmail,
   sendFacultyAccountEmail,
   sendEmail,
};

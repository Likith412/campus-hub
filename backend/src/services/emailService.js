// Email service. Three transports, tried in order:
//   RESEND_API_KEY → Resend's HTTPS API. The only one that works on hosts that block
//                    outbound SMTP, which most free PaaS tiers (Render included) do.
//   SMTP_HOST      → plain SMTP via nodemailer. Fine locally.
//   neither        → print the message, so the flow still works without any provider.
const nodemailer = require("nodemailer");
const { addToQueue } = require("../config/queue");

const from = process.env.SMTP_FROM || "Campus Hub <no-reply@campushub.local>";
const resendKey = process.env.RESEND_API_KEY;
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT) || 587;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

// Lazy singleton — created on first use, reused for the lifetime of the process.
let transporter = null;

function getTransporter() {
   if (transporter) return transporter;
   if (!host) return null;

   transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 uses TLS; 587/25 use STARTTLS.
      auth: user ? { user, pass } : undefined,
   });

   return transporter;
}

// Resend over HTTPS. Errors carry the API's own message so the queue log is useful.
async function sendViaResend(to, subject, html, text) {
   const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
         Authorization: `Bearer ${resendKey}`,
         "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
   });
   if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
   }
}

async function sendEmail(to, subject, html, text) {
   if (resendKey) return sendViaResend(to, subject, html, text);

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

// Announcement titles and bodies are written by club members, so they can't go into
// the HTML as-is.
function escapeHtml(s) {
   return String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
         ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
   );
}

// Sent when an announcement goes up. notify.js decides the recipients: members always,
// plus followers and any attached event's registrants when the note is public.
async function sendAnnouncementEmail(
   to,
   { name, clubName, title, body, eventTitle, link },
) {
   const about = eventTitle ? ` about ${eventTitle}` : "";
   const subject = `${clubName}: ${title}`;
   const text = `Hi ${name},\n\n${clubName} posted a new announcement${about}.\n\n${title}\n\n${body}\n\nRead it here: ${link}`;
   const html = `<p>Hi ${escapeHtml(name)},</p><p><b>${escapeHtml(
      clubName,
   )}</b> posted a new announcement${escapeHtml(about)}.</p><h3>${escapeHtml(
      title,
   )}</h3><p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p><p><a href="${link}">Read it on Campus Hub</a></p>`;
   await addToQueue("sendEmail", { to, subject, html, text });
}

module.exports = {
   sendVerificationEmail,
   sendAnnouncementEmail,
   sendPasswordResetEmail,
   sendFacultyAccountEmail,
   sendEmail,
};

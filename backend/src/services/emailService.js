// Email service. Two transports, chosen by environment:
//   production  → Brevo's HTTPS API. Render and most free hosts block outbound SMTP,
//                 so nodemailer simply cannot work there.
//   development → SMTP via nodemailer, which is easy to point at a real inbox.
// Neither configured → the message is printed, so signup and reset stay usable.
const nodemailer = require("nodemailer");
const { addToQueue, addBulkToQueue } = require("../config/queue");

// The sender is kept as two values because Brevo wants them apart, and the SMTP
// header is trivially composed from them.
const fromName = process.env.MAIL_FROM_NAME || "Campus Hub";
const fromEmail = process.env.MAIL_FROM_EMAIL || "no-reply@campushub.local";
const fromHeader = `${fromName} <${fromEmail}>`;

const useBrevo = process.env.NODE_ENV === "production";
const brevoKey = process.env.BREVO_API_KEY;

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

async function sendViaBrevo(to, subject, html, text) {
   const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
         "api-key": brevoKey,
         "content-type": "application/json",
         accept: "application/json",
      },
      body: JSON.stringify({
         sender: { name: fromName, email: fromEmail },
         to: [{ email: to }],
         subject,
         htmlContent: html,
         textContent: text,
      }),
   });

   if (!res.ok) {
      // Brevo puts the reason in the body — carry it so the queue log is useful.
      const detail = await res.text();
      throw new Error(`Brevo ${res.status}: ${detail.slice(0, 300)}`);
   }
}

async function sendEmail(to, subject, html, text) {
   if (useBrevo) return sendViaBrevo(to, subject, html, text);

   const t = getTransporter();
   if (!t) {
      console.log(
         `\n[email:dev] to=${to}\n  subject="${subject}"\n  ${text}\n`,
      );
      return;
   }

   await t.sendMail({ from: fromHeader, to, subject, html, text });
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
// plus followers and any attached event's registrants when the note is public. The body
// is identical for everyone, so the jobs are built per recipient but enqueued in one call.
async function sendAnnouncementEmails(
   recipients,
   { clubName, title, body, eventTitle, link },
) {
   const about = eventTitle ? ` about ${eventTitle}` : "";
   const subject = `${clubName}: ${title}`;
   const safeClub = escapeHtml(clubName);
   const safeAbout = escapeHtml(about);
   const safeTitle = escapeHtml(title);
   const safeBody = escapeHtml(body).replace(/\n/g, "<br/>");

   return addBulkToQueue(
      "sendEmail",
      recipients.map(({ email, name }) => ({
         to: email,
         subject,
         text: `Hi ${name},\n\n${clubName} posted a new announcement${about}.\n\n${title}\n\n${body}\n\nRead it here: ${link}`,
         html: `<p>Hi ${escapeHtml(name)},</p><p><b>${safeClub}</b> posted a new announcement${safeAbout}.</p><h3>${safeTitle}</h3><p>${safeBody}</p><p><a href="${link}">Read it on Campus Hub</a></p>`,
      })),
   );
}

// Sent to everyone holding a seat when an event is called off. Bulk-enqueued: the body
// is the same for all of them.
async function sendEventCancelledEmails(recipients, { clubName, eventTitle, when }) {
   const subject = `${clubName}: ${eventTitle} has been cancelled`;
   const safeClub = escapeHtml(clubName);
   const safeTitle = escapeHtml(eventTitle);
   const safeWhen = escapeHtml(when);

   return addBulkToQueue(
      "sendEmail",
      recipients.map(({ email, name }) => ({
         to: email,
         subject,
         text: `Hi ${name},\n\n${clubName} has cancelled ${eventTitle}, which was scheduled for ${when}.\n\nYour registration has been kept on record, but the event will not take place. Nothing further is needed from you.`,
         html: `<p>Hi ${escapeHtml(name)},</p><p><b>${safeClub}</b> has cancelled <b>${safeTitle}</b>, which was scheduled for ${safeWhen}.</p><p>Your registration has been kept on record, but the event will not take place. Nothing further is needed from you.</p>`,
      })),
   );
}

// Sent when an event turns members-only and a non-member's seat is released. They
// signed up legitimately while it was public, so this is the only notice they get.
async function sendRegistrationRevokedEmail(to, { name, clubName, eventTitle }) {
   const subject = `${clubName}: your place at ${eventTitle} was released`;
   const text = `Hi ${name},\n\n${eventTitle} is now open to ${clubName} members only, so your registration has been cancelled.\n\nIf you'd still like to attend, join ${clubName} and register again.`;
   const html = `<p>Hi ${escapeHtml(name)},</p><p><b>${escapeHtml(
      eventTitle,
   )}</b> is now open to ${escapeHtml(
      clubName,
   )} members only, so your registration has been cancelled.</p><p>If you'd still like to attend, join ${escapeHtml(
      clubName,
   )} and register again.</p>`;
   await addToQueue("sendEmail", { to, subject, html, text });
}

module.exports = {
   sendVerificationEmail,
   sendAnnouncementEmails,
   sendRegistrationRevokedEmail,
   sendEventCancelledEmails,
   sendPasswordResetEmail,
   sendFacultyAccountEmail,
   sendEmail,
};

// Who gets emailed when an announcement goes up.
//
//   private → the club's approved members, and nobody else
//   public  → the club's members, plus its followers, plus (when the note is attached
//             to an event) everyone holding a live registration for that event
//
// Members are always in the innermost circle, so a public note reaches them too — a
// coordinator posting campus-wide shouldn't skip their own club. Recipients are
// de-duplicated, so someone who is a member *and* follows *and* registered gets one
// email, not three. The author is never emailed their own post.
const {
   ClubFollow,
   ClubMembership,
   EventRegistration,
   User,
} = require("../../models");
const { sendAnnouncementEmails } = require("../../services/emailService");
const { FRONTEND_URL } = require("../../config/env");
// Live registrations only — someone who cancelled shouldn't keep getting the club's mail.
const { LIVE_REGISTRATION_STATUSES } = require("../events/helpers");

async function recipientIdsFor(announcement) {
   const members = await ClubMembership.find({
      clubId: announcement.clubId,
      status: "approved",
   })
      .select("userId")
      .lean();
   const ids = members.map((m) => String(m.userId));

   if (announcement.visibility === "public") {
      const followers = await ClubFollow.find({ clubId: announcement.clubId })
         .select("userId")
         .lean();
      ids.push(...followers.map((f) => String(f.userId)));

      if (announcement.eventId) {
         const regs = await EventRegistration.find({
            eventId: announcement.eventId,
            status: { $in: LIVE_REGISTRATION_STATUSES },
         })
            .select("userId")
            .lean();
         ids.push(...regs.map((r) => String(r.userId)));
      }
   }

   const authorId = String(announcement.authorId);
   return [...new Set(ids)].filter((id) => id !== authorId);
}

// Queue one email per recipient. Called after the announcement is already saved, so a
// mail failure can never lose the post itself.
async function notifyAnnouncement(announcement, { club, event } = {}) {
   const ids = await recipientIdsFor(announcement);
   if (ids.length === 0) return { queued: 0 };

   // Deactivated and deleted accounts don't get mail.
   const wanted = await User.find({
      _id: { $in: ids },
      isActive: true,
      deletedAt: null,
   })
      .select("email name")
      .lean();

   // The read-only tab, not /announcements: that board is the management view and
   // redirects anyone without manage rights — i.e. almost everyone receiving this.
   const link = `${FRONTEND_URL}/clubs/${club?.slug || ""}?tab=announcements`;
   // One bulk enqueue rather than a Redis round trip per recipient — a club with a few
   // hundred members had that many awaited writes sitting inside the POST.
   // A queue failure must not lose the post, which is already saved.
   try {
      const queued = await sendAnnouncementEmails(wanted, {
         clubName: club?.name || "your club",
         title: announcement.title,
         body: announcement.body,
         eventTitle: event?.title || null,
         link,
      });
      return { queued };
   } catch (err) {
      console.error("[announcements] notification enqueue failed:", err.message);
      return { queued: 0 };
   }
}

module.exports = { notifyAnnouncement };

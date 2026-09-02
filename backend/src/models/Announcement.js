// Announcement: a note a club posts. Private notes are for the club's own members;
// public ones are readable campus-wide and are what the follower/registrant emails
// go out for.
const mongoose = require("mongoose");

const ANNOUNCEMENT_VISIBILITIES = ["public", "private"];

const announcementSchema = new mongoose.Schema(
   {
      clubId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Club",
         required: true,
      },
      authorId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
      },

      title: { type: String, required: true, trim: true },
      body: { type: String, required: true, trim: true },

      // Defaults to the safe option, same as Event — you opt in to campus-wide.
      visibility: {
         type: String,
         enum: ANNOUNCEMENT_VISIBILITIES,
         default: "private",
      },

      // Pinned notes float to the top of the club's feed.
      pinned: { type: Boolean, default: false },

      // Optional pointer to the event the note is about.
      eventId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Event",
         default: null,
      },
   },
   { timestamps: true, versionKey: false },
);

// The club feed reads pinned-first, then newest — this index serves it directly.
announcementSchema.index({ clubId: 1, pinned: -1, createdAt: -1 });
// The cross-club dashboard feed pulls the newest across every club you belong to.
announcementSchema.index({ createdAt: -1 });
// The notices shown on one event's detail page.
announcementSchema.index({ eventId: 1, pinned: -1, createdAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);
module.exports.ANNOUNCEMENT_VISIBILITIES = ANNOUNCEMENT_VISIBILITIES;

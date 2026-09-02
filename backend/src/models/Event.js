// Event model: anything a club hosts (workshop, hackathon, etc.). Belongs to a Club.
const mongoose = require("mongoose");

const EVENT_TYPES = ["contest", "workshop", "hackathon", "seminar", "fun"];
const EVENT_STATUSES = [
   "draft",
   "published",
   "ongoing",
   "completed",
   "cancelled",
];
const VENUE_TYPES = ["online", "offline", "hybrid"];
// Who the event is for. Public events are browsable campus-wide and open to any
// student; private ones are visible and open only to the club's own members.
// Only a verified club may publish public events.
const EVENT_VISIBILITIES = ["public", "private"];

const eventSchema = new mongoose.Schema(
   {
      clubId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Club",
         required: true,
      },
      createdBy: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
      },

      title: { type: String, required: true, trim: true },
      description: String,
      bannerUrl: String,

      eventType: {
         type: String,
         enum: EVENT_TYPES,
         required: true,
      },

      startAt: { type: Date, required: true },
      endAt: { type: Date, required: true },
      registrationDeadline: Date,

      venue: {
         type: {
            type: String,
            enum: VENUE_TYPES,
         },
         location: String,
         meetingUrl: String,
      },

      capacity: { type: Number, default: 0, min: 0 }, // 0 = unlimited.
      waitlistEnabled: { type: Boolean, default: false },

      status: {
         type: String,
         enum: EVENT_STATUSES,
         default: "draft",
      },
      // Defaults to the safe option: an unverified club can't create public events.
      visibility: {
         type: String,
         enum: EVENT_VISIBILITIES,
         default: "private",
      },

      tags: { type: [String], default: [] },

      stats: {
         registered: { type: Number, default: 0 },
      },
   },
   { timestamps: true, versionKey: false },
);

// Indexes power: "events for a club", "upcoming by type/status", and tag filtering.
eventSchema.index({ clubId: 1, startAt: -1 });
eventSchema.index({ eventType: 1, status: 1, startAt: 1 });
eventSchema.index({ status: 1, startAt: 1 });
eventSchema.index({ visibility: 1, status: 1, startAt: 1 });
eventSchema.index({ tags: 1 });

module.exports = mongoose.model("Event", eventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.EVENT_STATUSES = EVENT_STATUSES;
module.exports.VENUE_TYPES = VENUE_TYPES;
module.exports.EVENT_VISIBILITIES = EVENT_VISIBILITIES;

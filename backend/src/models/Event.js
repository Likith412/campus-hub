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
      slug: { type: String, lowercase: true, trim: true },
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

      tags: { type: [String], default: [] },

      stats: {
         registered: { type: Number, default: 0 },
         attended: { type: Number, default: 0 },
         feedbackCount: { type: Number, default: 0 },
         avgRating: { type: Number, default: 0 },
      },
   },
   { timestamps: true, versionKey: false },
);

// Indexes power: "events for a club", "upcoming by type/status", and tag filtering.
eventSchema.index({ clubId: 1, startAt: -1 });
eventSchema.index({ eventType: 1, status: 1, startAt: 1 });
eventSchema.index({ status: 1, startAt: 1 });
eventSchema.index({ tags: 1 });

module.exports = mongoose.model("Event", eventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.EVENT_STATUSES = EVENT_STATUSES;
module.exports.VENUE_TYPES = VENUE_TYPES;

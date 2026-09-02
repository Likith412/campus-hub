// Join table linking a User to an Event. One row per (user, event) — the unique index below
// is the double-registration guard, so the controllers never have to check for one first.
const mongoose = require("mongoose");

// Lifecycle of a seat. "registered" holds a confirmed seat and is what Event.stats.registered
// counts; "waitlisted" rows are promoted (oldest first) when a seat frees up.
const REGISTRATION_STATUSES = ["registered", "waitlisted", "cancelled"];

const eventRegistrationSchema = new mongoose.Schema(
   {
      eventId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Event",
         required: true,
      },
      userId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
      },

      status: {
         type: String,
         enum: REGISTRATION_STATUSES,
         default: "registered",
      },

      // Set when the row first took a seat or joined the queue; drives waitlist order.
      registeredAt: { type: Date, default: Date.now },
      cancelledAt: Date,
   },
   { timestamps: true, versionKey: false },
);

// One registration per (user, event) — re-registering after cancelling reuses the row.
eventRegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });
// Powers "my events" (the student dashboard) without scanning every event.
eventRegistrationSchema.index({ userId: 1, status: 1 });
// Powers the attendee list and the oldest-waitlisted lookup on promotion.
eventRegistrationSchema.index({ eventId: 1, status: 1, registeredAt: 1 });

module.exports = mongoose.model("EventRegistration", eventRegistrationSchema);
module.exports.REGISTRATION_STATUSES = REGISTRATION_STATUSES;

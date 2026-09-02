// Zod schemas for /api/clubs/:slug/events and /api/events endpoints.
const { z } = require("zod");
const {
   EVENT_TYPES,
   EVENT_STATUSES,
   VENUE_TYPES,
   EVENT_VISIBILITIES,
} = require("../models/Event");
const { urlOrEmpty } = require("./common");

// Where the event happens. Offline/hybrid need a location, online/hybrid need a link.
const venueSchema = z
   .object({
      type: z.enum(VENUE_TYPES),
      location: z.string().trim().max(200).optional(),
      meetingUrl: urlOrEmpty,
   })
   .strict()
   .refine((v) => v.type === "online" || !!v.location, {
      message: "Location is required for offline and hybrid events",
      path: ["location"],
   })
   .refine((v) => v.type === "offline" || !!v.meetingUrl, {
      message: "Meeting link is required for online and hybrid events",
      path: ["meetingUrl"],
   });

// Shared field shape — create requires the core ones, update takes any subset (.partial()).
const eventFields = {
   title: z.string().trim().min(3).max(120),
   description: z.string().trim().max(2000).optional(),
   eventType: z.enum(EVENT_TYPES),
   startAt: z.coerce.date(),
   endAt: z.coerce.date(),
   // nullable so a patch can clear a deadline that was set.
   registrationDeadline: z.coerce.date().nullable().optional(),
   venue: venueSchema,
   // Rejected for an unverified club when set to "public" — see createEvent.
   visibility: z.enum(EVENT_VISIBILITIES),
   // 0 = unlimited.
   capacity: z.coerce.number().int().min(0).max(100000),
   waitlistEnabled: z.boolean(),
   tags: z.array(z.string().trim().max(40)).max(10).optional(),
};

// POST /api/clubs/:slug/events — create. `publish: true` skips the draft state.
// A new event can only be scheduled forward: you can't open registration for something
// that has already happened. (Editing keeps a past event's own dates — see updateEvent.)
const createEventBodySchema = z
   .object({
      ...eventFields,
      capacity: eventFields.capacity.default(0),
      waitlistEnabled: eventFields.waitlistEnabled.default(false),
      visibility: eventFields.visibility.default("private"),
      publish: z.boolean().default(false),
   })
   .strict()
   .refine((b) => b.endAt > b.startAt, {
      message: "End time must be after the start time",
      path: ["endAt"],
   })
   .refine(
      (b) => !b.registrationDeadline || b.registrationDeadline <= b.startAt,
      {
         message: "Registration deadline must be on or before the start time",
         path: ["registrationDeadline"],
      },
   )
   .refine((b) => b.startAt > new Date(), {
      message: "Start time must be in the future",
      path: ["startAt"],
   })
   .refine((b) => !b.registrationDeadline || b.registrationDeadline > new Date(), {
      message: "Registration deadline must be in the future",
      path: ["registrationDeadline"],
   });

// PATCH /api/clubs/:slug/events/:eventId — every field optional; at least one required.
// The startAt/endAt ordering can't be checked here (a patch may send only one side of the
// pair), so updateEvent re-checks it against the merged document.
const updateEventBodySchema = z
   .object(eventFields)
   .partial()
   .strict()
   .refine((b) => Object.keys(b).length > 0, {
      message: "Provide at least one field to update",
   });

// PATCH /api/clubs/:slug/events/:eventId/status — publish a draft or cancel an event.
// Deleting a live event isn't allowed; cancelling keeps it (and its registrations) visible.
const eventStatusBodySchema = z
   .object({ status: z.enum(["published", "cancelled"]) })
   .strict();

// GET /api/clubs/:slug/events — one club's events. Drafts are filtered out for
// non-managers by the controller.
const listEventsQuerySchema = z
   .object({
      status: z.enum(EVENT_STATUSES).optional(),
      type: z.enum(EVENT_TYPES).optional(),
      visibility: z.enum(EVENT_VISIBILITIES).optional(),
      when: z.enum(["upcoming", "past", "all"]).default("all"),
      sort: z.enum(["soonest", "latest", "popular", "new"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(12),
   })
   .strict();

// GET /api/events — cross-club browse. Published events in active clubs only.
const listPublicEventsQuerySchema = z
   .object({
      q: z.string().trim().max(100).optional(),
      type: z.enum(EVENT_TYPES).optional(),
      when: z.enum(["upcoming", "past"]).default("upcoming"),
      sort: z.enum(["soonest", "latest", "popular", "new"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(12),
   })
   .strict();

// GET /api/events/me — the caller's registrations (drives the dashboard widget).
const listMyEventsQuerySchema = z
   .object({
      when: z.enum(["upcoming", "past"]).default("upcoming"),
      q: z.string().trim().max(100).optional(),
      type: z.enum(EVENT_TYPES).optional(),
      // Your standing on the event, not the event's own status.
      status: z.enum(["registered", "waitlisted"]).optional(),
      sort: z.enum(["soonest", "latest"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
   })
   .strict();

// GET /api/clubs/:slug/events/:eventId/attendees — the roster behind one event.
const listAttendeesQuerySchema = z
   .object({
      q: z.string().trim().max(100).optional(),
      status: z.enum(["registered", "waitlisted", "cancelled"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
   })
   .strict();

module.exports = {
   createEventBodySchema,
   updateEventBodySchema,
   eventStatusBodySchema,
   listEventsQuerySchema,
   listPublicEventsQuerySchema,
   listMyEventsQuerySchema,
   listAttendeesQuerySchema,
};

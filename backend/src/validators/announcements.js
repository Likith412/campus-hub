// Zod schemas for the announcement endpoints (club-scoped feed + the cross-club digest).
const { z } = require("zod");
const { limitRule, pageRule, searchRule } = require("./common");
const { ANNOUNCEMENT_VISIBILITIES } = require("../models/Announcement");

const objectId = z
   .string()
   .regex(/^[0-9a-fA-F]{24}$/, "Invalid id")
   .optional();

const createAnnouncementBodySchema = z
   .object({
      title: z.string().trim().min(3).max(120),
      body: z.string().trim().min(1).max(4000),
      visibility: z.enum(ANNOUNCEMENT_VISIBILITIES).default("private"),
      // Pin on the way in, so a coordinator doesn't have to post then pin.
      pinned: z.boolean().default(false),
      eventId: objectId,
   })
   .strict();

const pinAnnouncementBodySchema = z
   .object({
      pinned: z.boolean(),
   })
   .strict();

const listAnnouncementsQuerySchema = z
   .object({
      q: searchRule,
      visibility: z.enum(ANNOUNCEMENT_VISIBILITIES).optional(),
      page: pageRule,
      limit: limitRule(10),
   })
   .strict();

// The dashboard digest — everything from the clubs you belong to, newest first.
// `source` splits the two ways a notice reaches you: a club you're in vs one you follow.
const listMyAnnouncementsQuerySchema = z
   .object({
      q: searchRule,
      visibility: z.enum(ANNOUNCEMENT_VISIBILITIES).optional(),
      club: z.string().trim().max(120).optional(),
      source: z.enum(["member", "following"]).optional(),
      sort: z.enum(["newest", "oldest"]).default("newest"),
      // The club list behind the toolbar's filter. Only the digest page renders it —
      // the dashboard panel asks for three notices and would throw the list away.
      withClubs: z.enum(["true", "false"]).default("false"),
      page: pageRule,
      limit: limitRule(5),
   })
   .strict();

module.exports = {
   createAnnouncementBodySchema,
   pinAnnouncementBodySchema,
   listAnnouncementsQuerySchema,
   listMyAnnouncementsQuerySchema,
};

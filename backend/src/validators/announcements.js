// Zod schemas for the announcement endpoints (club-scoped feed + the cross-club digest).
const { z } = require("zod");
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
      q: z.string().trim().max(100).optional(),
      visibility: z.enum(ANNOUNCEMENT_VISIBILITIES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
   })
   .strict();

// The dashboard digest — everything from the clubs you belong to, newest first.
const listMyAnnouncementsQuerySchema = z
   .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(5),
   })
   .strict();

module.exports = {
   createAnnouncementBodySchema,
   pinAnnouncementBodySchema,
   listAnnouncementsQuerySchema,
   listMyAnnouncementsQuerySchema,
};

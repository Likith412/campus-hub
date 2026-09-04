// Announcements controller — a club's notice board, plus the cross-club digest that
// drives the dashboard. Writes are gated per-club by requireClubPermission, which
// leaves the resolved club on req.club and the caller's standing on req.clubContext.
const { successResponse, pageMeta } = require("../../utils/response");
const { NotFoundError, ForbiddenError } = require("../../utils/errors");
const {
   Announcement,
   Club,
   ClubFollow,
   ClubMembership,
   Event,
   User,
} = require("../../models");
const { escapeRegex } = require("../../utils/escapeRegex");
const { ROLES } = require("../../constants/roles");
const { notifyAnnouncement } = require("./notify");
const {
   findClubBySlugFor,
   resolveClubContext,
   contextCan,
} = require("../clubs/helpers");

// What the viewer may do on this club's board — drives the buttons the frontend shows.
function announcementViewer(ctx) {
   return {
      canPost: contextCan(ctx, "announcements:create"),
      canPin: contextCan(ctx, "announcements:pin"),
      // Deleting *anyone's* note. Deleting your own only needs canPost — see below.
      canDeleteAny: contextCan(ctx, "announcements:delete"),
   };
}

// `board` adds the two fields only a club's own notice board acts on: `pinned` drives
// the pin control and the pinned-first grouping, `isMine` lets you take your own note
// down. The cross-club digest sorts by date and offers neither, so it omits both.
function publicAnnouncement(a, { author, club, event, viewerId, board = false } = {}) {
   // populate() swaps the ref for the doc, so read ids through both shapes.
   const authorId = a.authorId?._id || a.authorId;
   const linked = event || (a.eventId?.title ? a.eventId : null);
   const row = {
      id: a._id,
      // The card prints the name and links by slug — the id is read nowhere.
      club: club ? { name: club.name, slug: club.slug } : null,
      title: a.title,
      body: a.body,
      visibility: a.visibility || "private",
      // The note's card links back to the event it's about.
      event: linked ? { id: linked._id, title: linked.title } : null,
      author: author ? { id: author._id, name: author.name } : null,
      createdAt: a.createdAt,
   };
   if (!board) return row;
   return {
      ...row,
      pinned: !!a.pinned,
      isMine: viewerId ? String(authorId) === String(viewerId) : false,
   };
}

// GET /api/clubs/:slug/announcements — the club's board. Members see everything;
// everyone else sees only the public notices.
async function listClubAnnouncements(req, res) {
   const { q, visibility, page, limit } = req.validatedQuery;
   const club = await findClubBySlugFor(req.user, req.params.slug);
   const ctx = await resolveClubContext(req.user, club._id);
   const isMember = !!ctx;

   const match = { clubId: club._id };
   if (!isMember) match.visibility = "public";
   if (visibility) {
      if (visibility === "private" && !isMember) {
         throw new ForbiddenError("Only members can read private announcements");
      }
      match.visibility = visibility;
   }
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      match.$or = [{ title: rx }, { body: rx }];
   }

   const skip = (page - 1) * limit;
   const [rows, total] = await Promise.all([
      Announcement.find(match)
         .populate({ path: "authorId", model: User, select: "name" })
         .populate({ path: "eventId", model: Event, select: "title" })
         .sort({ pinned: -1, createdAt: -1 })
         .skip(skip)
         .limit(limit)
         .lean(),
      Announcement.countDocuments(match),
   ]);

   return successResponse(res, 200, "Announcements", {
      items: rows.map((a) =>
         publicAnnouncement(a, {
            author: a.authorId,
            viewerId: req.user._id,
            board: true,
         }),
      ),
      pagination: pageMeta(page, limit, total, rows.length),
      viewer: { ...announcementViewer(ctx), isMember },
   });
}

// POST /api/clubs/:slug/announcements — needs announcements:create.
async function createAnnouncement(req, res) {
   const { title, body, visibility, pinned, eventId } = req.body;
   const club = req.club;

   // Pinning on the way in is still a pin — don't let it dodge announcements:pin.
   if (pinned && !contextCan(req.clubContext, "announcements:pin")) {
      throw new ForbiddenError("You don't have permission to pin announcements");
   }

   // A linked event has to belong to this club, or the link would leak another club's.
   let event = null;
   if (eventId) {
      event = await Event.findOne({ _id: eventId, clubId: club._id })
         .select("_id title")
         .lean();
      if (!event) throw new NotFoundError("Event not found in this club");
   }

   const created = await Announcement.create({
      clubId: club._id,
      authorId: req.user._id,
      title,
      body,
      visibility,
      pinned: !!pinned,
      eventId: eventId || null,
   });

   // Emails go out after the post is safely saved — a queue hiccup must never cost
   // the announcement itself. notify.js decides who's on the list.
   let notified = { queued: 0 };
   try {
      notified = await notifyAnnouncement(created.toObject(), { club, event });
   } catch (err) {
      console.error("[announcements] notify failed:", err.message);
   }

   return successResponse(res, 201, "Announcement posted", {
      announcement: publicAnnouncement(created.toObject(), {
         author: { _id: req.user._id, name: req.user.name },
         event,
         viewerId: req.user._id,
         board: true,
      }),
      notified: notified.queued,
   });
}

// PATCH /api/clubs/:slug/announcements/:id/pin — needs announcements:pin.
async function setAnnouncementPinned(req, res) {
   const updated = await Announcement.findOneAndUpdate(
      { _id: req.params.id, clubId: req.club._id },
      { $set: { pinned: req.body.pinned } },
      { returnDocument: "after" },
   )
      .populate({ path: "authorId", model: User, select: "name" })
      .populate({ path: "eventId", model: Event, select: "title" })
      .lean();
   if (!updated) throw new NotFoundError("Announcement not found");

   return successResponse(
      res,
      200,
      req.body.pinned ? "Pinned" : "Unpinned",
      {
         announcement: publicAnnouncement(updated, {
            author: updated.authorId,
            viewerId: req.user._id,
            board: true,
         }),
      },
   );
}

// DELETE /api/clubs/:slug/announcements/:id
// Taking down your own note is part of posting; removing someone else's needs
// announcements:delete. Either permission gets you through the route gate.
async function deleteAnnouncement(req, res) {
   const found = await Announcement.findOne({
      _id: req.params.id,
      clubId: req.club._id,
   })
      .select("authorId")
      .lean();
   if (!found) throw new NotFoundError("Announcement not found");

   const isAuthor = String(found.authorId) === String(req.user._id);
   if (!isAuthor && !contextCan(req.clubContext, "announcements:delete")) {
      throw new ForbiddenError(
         "You can only delete your own announcements",
      );
   }

   await Announcement.deleteOne({ _id: found._id });
   return successResponse(res, 200, "Announcement deleted", {
      id: req.params.id,
   });
}

// GET /api/events/:eventId/announcements — the notices attached to one event, shown on
// its detail page. Enforces the club-status rule and the announcement one (private notices
// are for members); the event's own draft/private gate lives on GET /events/:eventId.
async function listEventAnnouncements(req, res) {
   const event = await Event.findById(req.params.eventId)
      .select("clubId status visibility")
      .lean();
   if (!event) throw new NotFoundError("Event not found");

   const club = await Club.findById(event.clubId).select("status").lean();
   if (!club) throw new NotFoundError("Event not found");
   // Same club-visibility rule the event itself is behind, applied to the club already
   // in hand rather than fetching it again by slug.
   if (club.status !== "active" && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new NotFoundError("Event not found");
   }

   const ctx = await resolveClubContext(req.user, event.clubId);
   const isMember = !!ctx;

   const match = { eventId: event._id };
   if (!isMember) match.visibility = "public";

   const rows = await Announcement.find(match)
      .populate({ path: "authorId", model: User, select: "name" })
      .sort({ pinned: -1, createdAt: -1 })
      .lean();

   return successResponse(res, 200, "Announcements", {
      items: rows.map((a) =>
         publicAnnouncement(a, { author: a.authorId, board: true }),
      ),
   });
}

// GET /api/announcements — the dashboard digest. Clubs you're a member of contribute
// everything; clubs you merely follow contribute their public notices only.
async function listMyAnnouncements(req, res) {
   const { q, visibility, club: clubSlug, source, sort, withClubs, page, limit } =
      req.validatedQuery;
   const sendClubs = withClubs === "true";

   const [memberships, follows] = await Promise.all([
      ClubMembership.find({ userId: req.user._id, status: "approved" })
         .select("clubId")
         .lean(),
      ClubFollow.find({ userId: req.user._id }).select("clubId").lean(),
   ]);

   const memberSet = new Set(memberships.map((m) => String(m.clubId)));
   // Following a club you're already in adds nothing — membership is the wider access.
   const followIds = follows
      .map((f) => String(f.clubId))
      .filter((id) => !memberSet.has(id));

   if (memberSet.size === 0 && followIds.length === 0) {
      return successResponse(res, 200, "Announcements", {
         items: [],
         ...(sendClubs ? { clubs: [] } : {}),
         pagination: { page, limit, total: 0, hasMore: false },
      });
   }

   // Skip clubs that have been suspended or archived since you joined or followed.
   const activeClubs = await Club.find({
      _id: { $in: [...memberSet, ...followIds] },
      status: "active",
   })
      .select("name slug")
      .lean();
   const clubById = new Map(activeClubs.map((c) => [String(c._id), c]));
   const memberClubIds = activeClubs
      .filter((c) => memberSet.has(String(c._id)))
      .map((c) => c._id);
   const followClubIds = activeClubs
      .filter((c) => !memberSet.has(String(c._id)))
      .map((c) => c._id);

   // Every club that can put something in this feed — what the toolbar's club filter
   // offers. Built before the filters narrow anything, so the choices stay stable.
   const clubOptions = !sendClubs
      ? []
      : activeClubs
           .map((c) => ({ name: c.name, slug: c.slug }))
           .sort((a, b) => a.name.localeCompare(b.name));

   const empty = (extra = {}) =>
      successResponse(res, 200, "Announcements", {
         items: [],
         ...(sendClubs ? { clubs: clubOptions } : {}),
         pagination: { page, limit, total: 0, hasMore: false },
         ...extra,
      });

   // A slug outside your own clubs isn't an error — it just selects nothing.
   let memberIds = memberClubIds;
   let followIds2 = followClubIds;
   if (clubSlug) {
      const picked = activeClubs.find((c) => c.slug === clubSlug);
      if (!picked) return empty();
      const isMemberClub = memberSet.has(String(picked._id));
      memberIds = isMemberClub ? [picked._id] : [];
      followIds2 = isMemberClub ? [] : [picked._id];
   }
   if (source === "member") followIds2 = [];
   if (source === "following") memberIds = [];

   const or = [];
   if (memberIds.length) or.push({ clubId: { $in: memberIds } });
   if (followIds2.length) {
      or.push({ clubId: { $in: followIds2 }, visibility: "public" });
   }
   // Every club you belonged to has since been suspended or archived. Mongoose drops an
   // empty $or, which would leave {} and match the whole collection.
   if (or.length === 0) return empty();
   const access = or.length === 1 ? or[0] : { $or: or };

   // Access first, then the toolbar's filters — $and keeps the follow branch's own
   // visibility clause intact instead of overwriting it.
   const extra = [];
   if (visibility) extra.push({ visibility });
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      extra.push({ $or: [{ title: rx }, { body: rx }] });
   }
   const match = extra.length ? { $and: [access, ...extra] } : access;

   const skip = (page - 1) * limit;
   const [rows, total] = await Promise.all([
      Announcement.find(match)
         .populate({ path: "authorId", model: User, select: "name" })
         .populate({ path: "eventId", model: Event, select: "title" })
         .sort({ createdAt: sort === "oldest" ? 1 : -1 })
         .skip(skip)
         .limit(limit)
         .lean(),
      Announcement.countDocuments(match),
   ]);

   return successResponse(res, 200, "Announcements", {
      items: rows.map((a) =>
         publicAnnouncement(a, {
            author: a.authorId,
            club: clubById.get(String(a.clubId)),
            viewerId: req.user._id,
         }),
      ),
      ...(sendClubs ? { clubs: clubOptions } : {}),
      pagination: pageMeta(page, limit, total, rows.length),
   });
}

module.exports = {
   listClubAnnouncements,
   listEventAnnouncements,
   createAnnouncement,
   setAnnouncementPinned,
   deleteAnnouncement,
   listMyAnnouncements,
};

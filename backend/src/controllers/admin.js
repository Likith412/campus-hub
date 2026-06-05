// Admin controller — superAdmin-only platform administration (faculty accounts).
const { successResponse } = require("../utils/response");
const {
   ConflictError,
   NotFoundError,
   ForbiddenError,
} = require("../utils/errors");
const { User, Faculty, ClubMembership, Club } = require("../models");
const { ROLES } = require("../constants/roles");
const { hashPassword } = require("../utils/password");
const { generateTempPassword } = require("../utils/tokens");
const { sendFacultyAccountEmail } = require("../services/emailService");

// Escape user input before dropping into a RegExp.
function escapeRegex(s) {
   return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sort options for the All Clubs table.
const CLUB_SORT = {
   popular: { "stats.memberCount": -1, createdAt: -1 },
   new: { createdAt: -1 },
   name: { name: 1 },
};

function publicUser(u, clubCount = 0) {
   return {
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt || null,
      createdAt: u.createdAt,
      clubCount,
   };
}

const LOGIN_URL = `${process.env.FRONTEND_URL || "http://localhost:5173"}/login`;

// POST /api/admin/users — create a faculty account; emails generated credentials.
async function createFaculty(req, res) {
   const { name, email } = req.body;

   const existing = await User.findOne({ email });
   if (existing) {
      throw new ConflictError("A user with this email already exists");
   }

   const tempPassword = generateTempPassword();
   const passwordHash = await hashPassword(tempPassword);

   // Faculty discriminator — sets role: "faculty" and the faculty schema.
   const user = await Faculty.create({
      name,
      email,
      passwordHash,
      emailVerified: true,
      isActive: true,
   });

   await sendFacultyAccountEmail(email, {
      name,
      password: tempPassword,
      loginUrl: LOGIN_URL,
   });

   // Plaintext password is returned exactly once so the admin can relay it if the email fails.
   return successResponse(res, 201, "Faculty account created", {
      user: publicUser(user),
      tempPassword,
   });
}

// GET /api/admin/users — paginated, filterable list of platform users.
async function listUsers(req, res) {
   const { role, q, status, sort, page, limit } = req.validatedQuery;

   const filter = {};
   if (role) filter.role = role;
   // active = has logged in; pending = created but never logged in; inactive = deactivated.
   if (status === "active") {
      filter.isActive = true;
      filter.lastLoginAt = { $ne: null };
   } else if (status === "pending") {
      filter.isActive = true;
      filter.lastLoginAt = null;
   } else if (status === "inactive") {
      filter.isActive = false;
   }
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ name: rx }, { email: rx }];
   }

   const sortStage =
      sort === "name"
         ? { name: 1 }
         : sort === "clubs"
           ? { clubCount: -1, createdAt: -1 }
           : { createdAt: -1 }; // new

   // One pipeline: attach each user's approved-coordinator club count, then sort/paginate.
   // (Lookup-before-sort so "Most clubs" can order by the derived count.)
   const skip = (page - 1) * limit;
   const [items, total] = await Promise.all([
      User.aggregate([
         { $match: filter },
         {
            $lookup: {
               from: "clubmemberships",
               let: { uid: "$_id" },
               pipeline: [
                  {
                     $match: {
                        $expr: {
                           $and: [
                              { $eq: ["$userId", "$$uid"] },
                              { $eq: ["$role", "coordinator"] },
                              { $eq: ["$status", "approved"] },
                           ],
                        },
                     },
                  },
                  { $count: "n" },
               ],
               as: "cc",
            },
         },
         {
            $addFields: {
               clubCount: { $ifNull: [{ $arrayElemAt: ["$cc.n", 0] }, 0] },
            },
         },
         { $sort: sortStage },
         { $skip: skip },
         { $limit: limit },
         {
            $project: {
               name: 1,
               email: 1,
               role: 1,
               isActive: 1,
               lastLoginAt: 1,
               createdAt: 1,
               clubCount: 1,
            },
         },
      ]),
      User.countDocuments(filter),
   ]);

   return successResponse(res, 200, "Users", {
      items: items.map((u) => publicUser(u, u.clubCount)),
      pagination: { page, limit, total, hasMore: skip + items.length < total },
   });
}

// GET /api/admin/faculty/stats — headline counts for the faculty dashboard.
async function getFacultyStats(req, res) {
   const faculty = { role: ROLES.FACULTY };
   const [total, active, pending, coordinatingClubs] = await Promise.all([
      User.countDocuments(faculty),
      User.countDocuments({ ...faculty, isActive: true, lastLoginAt: { $ne: null } }),
      User.countDocuments({ ...faculty, isActive: true, lastLoginAt: null }),
      ClubMembership.distinct("clubId", {
         role: "coordinator",
         status: "approved",
      }).then((ids) => ids.length),
   ]);

   return successResponse(res, 200, "Faculty stats", {
      total,
      active,
      pending,
      coordinatingClubs,
   });
}

// PATCH /api/admin/users/:id/active — activate or deactivate an account.
async function setUserActive(req, res) {
   const { isActive } = req.body;

   if (String(req.params.id) === String(req.user._id)) {
      throw new ConflictError("You can't change your own active status");
   }

   const user = await User.findById(req.params.id);
   if (!user) throw new NotFoundError("User not found");
   // Never let one superAdmin lock out another (or themselves) via this endpoint.
   if (user.role === ROLES.SUPER_ADMIN) {
      throw new ForbiddenError("Cannot change a super admin's active status");
   }

   user.isActive = isActive;
   await user.save();

   return successResponse(res, 200, "User updated", { user: publicUser(user) });
}

// GET /api/admin/clubs — every club across the institute (any status), with each club's
// coordinator(s) and member count, plus a status breakdown. superAdmin-only.
async function listAllClubs(req, res) {
   const { q, category, status, sort, page, limit } = req.validatedQuery;

   const filter = {};
   if (status) filter.status = status;
   if (category) filter.category = category;
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ name: rx }, { tagline: rx }, { tags: rx }];
   }

   const skip = (page - 1) * limit;
   const [items, total, statusAgg] = await Promise.all([
      Club.find(filter)
         .select(
            "slug name tagline category verified status logoUrl coverFrom coverTo stats.memberCount",
         )
         .sort(CLUB_SORT[sort] || CLUB_SORT.popular)
         .skip(skip)
         .limit(limit)
         .lean(),
      Club.countDocuments(filter),
      Club.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
   ]);

   // Coordinator name(s) per club for the page.
   const coordsByClub = new Map();
   if (items.length) {
      const rows = await ClubMembership.find({
         clubId: { $in: items.map((c) => c._id) },
         role: "coordinator",
         status: "approved",
      })
         .populate({ path: "userId", select: "name" })
         .select("clubId userId")
         .lean();
      for (const r of rows) {
         if (!r.userId?.name) continue;
         const key = String(r.clubId);
         coordsByClub.set(key, [...(coordsByClub.get(key) || []), r.userId.name]);
      }
   }

   // Status breakdown (across all clubs, ignoring filters) for the headline cards.
   const counts = { total: 0, active: 0, suspended: 0, archived: 0 };
   for (const row of statusAgg) {
      counts.total += row.n;
      if (counts[row._id] !== undefined) counts[row._id] = row.n;
   }

   const shaped = items.map((c) => ({
      id: c._id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      category: c.category,
      verified: !!c.verified,
      status: c.status,
      logoUrl: c.logoUrl,
      coverFrom: c.coverFrom,
      coverTo: c.coverTo,
      memberCount: c.stats?.memberCount ?? 0,
      coordinators: coordsByClub.get(String(c._id)) || [],
   }));

   return successResponse(res, 200, "Clubs", {
      items: shaped,
      counts,
      pagination: { page, limit, total, hasMore: skip + items.length < total },
   });
}

module.exports = {
   createFaculty,
   listUsers,
   getFacultyStats,
   setUserActive,
   listAllClubs,
};

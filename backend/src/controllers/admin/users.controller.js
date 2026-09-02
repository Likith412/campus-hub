// Admin users controller — superAdmin-only faculty account administration.
const { successResponse, pageMeta } = require("../../utils/response");
const {
   ConflictError,
   NotFoundError,
   ForbiddenError,
} = require("../../utils/errors");
const { User, Faculty, ClubMembership, Club } = require("../../models");
const { ROLES } = require("../../constants/roles");
const { hashPassword } = require("../../utils/password");
const { generateTempPassword } = require("../../utils/tokens");
const { sendFacultyAccountEmail } = require("../../services/emailService");
const { escapeRegex } = require("../../utils/escapeRegex");

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

   const filter = { deletedAt: null };
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

   // clubCount is role-relative: clubs a faculty coordinates, clubs a student belongs to.
   const coordinatorOnly = role !== ROLES.STUDENT;

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
                              { $eq: ["$status", "approved"] },
                           ],
                        },
                     },
                  },
                  // Coordinator is a per-club ClubRole — join it and match the slug.
                  ...(coordinatorOnly
                     ? [
                          {
                             $lookup: {
                                from: "clubroles",
                                localField: "roleId",
                                foreignField: "_id",
                                as: "r",
                             },
                          },
                          { $unwind: "$r" },
                          { $match: { "r.slug": "coordinator" } },
                       ]
                     : []),
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
      pagination: pageMeta(page, limit, total, items.length),
   });
}

// GET /api/admin/faculty/stats — headline counts for the faculty dashboard.
async function getFacultyStats(req, res) {
   const faculty = { role: ROLES.FACULTY };
   const [total, active, pending, coordinatingClubs] = await Promise.all([
      User.countDocuments(faculty),
      User.countDocuments({
         ...faculty,
         isActive: true,
         lastLoginAt: { $ne: null },
      }),
      User.countDocuments({ ...faculty, isActive: true, lastLoginAt: null }),
      // Clubs with ≥1 approved coordinator. "coordinator" is a per-club ClubRole now, so
      // join clubroles and match the slug rather than a denormalized role string.
      ClubMembership.aggregate([
         { $match: { status: "approved" } },
         {
            $lookup: {
               from: "clubroles",
               localField: "roleId",
               foreignField: "_id",
               as: "r",
            },
         },
         { $unwind: "$r" },
         { $match: { "r.slug": "coordinator" } },
         { $group: { _id: "$clubId" } },
         { $count: "n" },
      ]).then((rows) => rows[0]?.n || 0),
   ]);

   return successResponse(res, 200, "Faculty stats", {
      total,
      active,
      pending,
      coordinatingClubs,
   });
}

// GET /api/admin/students/stats — headline counts for the students page.
async function getStudentStats(req, res) {
   const students = { role: ROLES.STUDENT };
   const [total, active, pending, inClubs] = await Promise.all([
      User.countDocuments(students),
      User.countDocuments({
         ...students,
         isActive: true,
         lastLoginAt: { $ne: null },
      }),
      User.countDocuments({ ...students, isActive: true, lastLoginAt: null }),
      // Students holding at least one approved membership.
      ClubMembership.aggregate([
         { $match: { status: "approved" } },
         { $group: { _id: "$userId" } },
         {
            $lookup: {
               from: "users",
               localField: "_id",
               foreignField: "_id",
               as: "u",
            },
         },
         { $unwind: "$u" },
         { $match: { "u.role": ROLES.STUDENT } },
         { $count: "n" },
      ]).then((rows) => rows[0]?.n || 0),
   ]);

   return successResponse(res, 200, "Student stats", {
      total,
      active,
      pending,
      inClubs,
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

   // Deactivating a faculty who is the sole coordinator of a club would leave it
   // unmanaged — block until another coordinator is assigned to those clubs.
   if (!isActive && user.role === ROLES.FACULTY) {
      // Clubs this faculty coordinates. "coordinator" is a per-club ClubRole — join it.
      const coordRows = await ClubMembership.aggregate([
         { $match: { userId: user._id, status: "approved" } },
         {
            $lookup: {
               from: "clubroles",
               localField: "roleId",
               foreignField: "_id",
               as: "r",
            },
         },
         { $unwind: "$r" },
         { $match: { "r.slug": "coordinator" } },
         { $project: { clubId: 1 } },
      ]);
      const coordClubIds = coordRows.map((r) => r.clubId);
      if (coordClubIds.length) {
         const sole = await ClubMembership.aggregate([
            { $match: { clubId: { $in: coordClubIds }, status: "approved" } },
            {
               $lookup: {
                  from: "clubroles",
                  localField: "roleId",
                  foreignField: "_id",
                  as: "r",
               },
            },
            { $unwind: "$r" },
            { $match: { "r.slug": "coordinator" } },
            { $group: { _id: "$clubId", n: { $sum: 1 } } },
            { $match: { n: { $lte: 1 } } },
         ]);
         if (sole.length) {
            const clubs = await Club.find({
               _id: { $in: sole.map((s) => s._id) },
            })
               .select("name")
               .lean();
            const names = clubs.map((c) => c.name).join(", ");
            throw new ConflictError(
               `Can't deactivate — they're the only coordinator of ${names}. Assign another coordinator to ${clubs.length > 1 ? "those clubs" : "that club"} first.`,
            );
         }
      }
   }

   user.isActive = isActive;
   await user.save();

   return successResponse(res, 200, "User updated", { user: publicUser(user) });
}

module.exports = {
   createFaculty,
   listUsers,
   getFacultyStats,
   getStudentStats,
   setUserActive,
};

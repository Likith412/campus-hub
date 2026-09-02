// Club roles + the grantable-permission catalog.
const { successResponse } = require("../../utils/response");
const {
   NotFoundError,
   ForbiddenError,
   ConflictError,
} = require("../../utils/errors");
const { ClubMembership, ClubRole } = require("../../models");
const { CLUB_PERMISSIONS } = require("../../constants/clubPermissions");
const {
   findClubBySlugFor,
   ensureSystemRoles,
   slugify,
   systemRoleId,
   resolveClubContext,
   contextCan,
} = require("./helpers");

// A role editor can't outrank themselves or hand out access they don't hold — otherwise
// roles:manage alone would be a route to every other permission in the club.
function assertCanGrant(ctx, { roleWeight, permissions }) {
   if (ctx.isSuperAdmin || ctx.roleSlug === "coordinator") return;
   if (roleWeight !== undefined && roleWeight >= ctx.weight) {
      throw new ForbiddenError("You can only manage roles ranked below your own");
   }
   const missing = (permissions || []).filter((p) => !contextCan(ctx, p));
   if (missing.length) {
      throw new ForbiddenError(
         `You can't grant a permission you don't hold: ${missing.join(", ")}`,
      );
   }
}

// GET /api/permissions/catalog — static list of grantable permissions for the picker.
async function getPermissionCatalog(req, res) {
   return successResponse(res, 200, "Permission catalog", {
      permissions: CLUB_PERMISSIONS,
   });
}

function publicRole(r) {
   return {
      name: r.name,
      slug: r.slug,
      color: r.color,
      permissions: r.permissions || [],
      isSystem: !!r.isSystem,
      roleWeight: r.roleWeight,
   };
}

// De-duplicate a role slug within one club (slug-2, slug-3, …).
async function uniqueRoleSlug(clubId, base) {
   const root = slugify(base) || "role";
   let slug = root;
   let n = 2;
   while (await ClubRole.exists({ clubId, slug })) slug = `${root}-${n++}`;
   return slug;
}

// GET /api/clubs/:slug/roles — system + custom roles (with holder counts), plus
// what the viewer may do.
async function listRoles(req, res) {
   const club = await findClubBySlugFor(req.user, req.params.slug);
   await ensureSystemRoles(club._id);

   const [roles, counts] = await Promise.all([
      ClubRole.find({ clubId: club._id }).sort({ roleWeight: -1, name: 1 }).lean(),
      ClubMembership.aggregate([
         { $match: { clubId: club._id, status: "approved" } },
         { $group: { _id: "$roleId", n: { $sum: 1 } } },
      ]),
   ]);
   const countByRoleId = new Map(counts.map((c) => [String(c._id), c.n]));

   const ctx = await resolveClubContext(req.user, club._id);
   const viewer = {
      isSuperAdmin: !!ctx?.isSuperAdmin,
      weight: ctx?.isSuperAdmin ? 100 : (ctx?.weight ?? 0),
      canManageRoles: contextCan(ctx, "roles:manage"),
      canAssignRole: contextCan(ctx, "members:assign-role"),
      canModerate: contextCan(ctx, "members:moderate"),
      canEditClub: contextCan(ctx, "club:edit"),
   };

   return successResponse(res, 200, "Roles", {
      items: roles.map((r) => ({
         ...publicRole(r),
         memberCount: countByRoleId.get(String(r._id)) || 0,
      })),
      viewer,
   });
}

// POST /api/clubs/:slug/roles — create a custom role (weight 1..99).
async function createRole(req, res) {
   const club = req.club; // resolved + roles:manage asserted by requireClubPermission
   await ensureSystemRoles(club._id);

   const { name, roleWeight, permissions, color } = req.body;
   assertCanGrant(req.clubContext, { roleWeight, permissions });

   // Weight is unique per club — reject a collision up front with a clear message.
   if (await ClubRole.exists({ clubId: club._id, roleWeight })) {
      throw new ConflictError(
         `Weight ${roleWeight} is already taken by another role`,
      );
   }

   const slug = await uniqueRoleSlug(club._id, name);

   const role = await ClubRole.create({
      clubId: club._id,
      name: name.trim(),
      slug,
      color: color || "#6c63ff",
      permissions: permissions || [],
      roleWeight,
      isSystem: false,
   });

   return successResponse(res, 201, "Role created", { role: publicRole(role) });
}

// PATCH /api/clubs/:slug/roles/:roleSlug — edit a custom role. System rows immutable.
async function updateRole(req, res) {
   const club = req.club; // resolved + roles:manage asserted by requireClubPermission

   const role = await ClubRole.findOne({
      clubId: club._id,
      slug: req.params.roleSlug,
   });
   if (!role) throw new NotFoundError("Role not found");
   if (role.isSystem) throw new ForbiddenError("System roles can't be edited");

   const { name, roleWeight, permissions, color } = req.body;
   assertCanGrant(req.clubContext, { roleWeight, permissions });
   // The role being edited has to sit below the editor too, or they could promote the
   // very role they hold.
   assertCanGrant(req.clubContext, { roleWeight: role.roleWeight });

   // Weight is unique per club — block a move onto a weight another role already holds.
   if (roleWeight !== undefined && roleWeight !== role.roleWeight) {
      if (
         await ClubRole.exists({
            clubId: club._id,
            roleWeight,
            _id: { $ne: role._id },
         })
      ) {
         throw new ConflictError(
            `Weight ${roleWeight} is already taken by another role`,
         );
      }
   }

   if (name !== undefined) role.name = name.trim();
   if (roleWeight !== undefined) role.roleWeight = roleWeight;
   if (permissions !== undefined) role.permissions = permissions;
   if (color !== undefined) role.color = color;
   await role.save();

   return successResponse(res, 200, "Role updated", { role: publicRole(role) });
}

// DELETE /api/clubs/:slug/roles/:roleSlug — only if no live membership still holds it.
async function deleteRole(req, res) {
   const club = req.club; // resolved + roles:manage asserted by requireClubPermission

   const role = await ClubRole.findOne({
      clubId: club._id,
      slug: req.params.roleSlug,
   });
   if (!role) throw new NotFoundError("Role not found");
   if (role.isSystem) throw new ForbiddenError("System roles can't be deleted");
   assertCanGrant(req.clubContext, { roleWeight: role.roleWeight });

   const inUse = await ClubMembership.exists({
      clubId: club._id,
      roleId: role._id,
      status: { $in: ["approved", "pending"] },
   });
   if (inUse) {
      throw new ConflictError(
         "Reassign members off this role before deleting it",
      );
   }

   // Past members still point at the role. Move them to `member` first, or approving one
   // of them later would resurrect a membership whose roleId no longer resolves.
   const memberRoleId = await systemRoleId(club._id, "member");
   await ClubMembership.updateMany(
      { clubId: club._id, roleId: role._id },
      { $set: { roleId: memberRoleId } },
   );

   await ClubRole.deleteOne({ _id: role._id });
   return successResponse(res, 200, "Role deleted", { slug: role.slug });
}

module.exports = {
   getPermissionCatalog,
   listRoles,
   createRole,
   updateRole,
   deleteRole,
};

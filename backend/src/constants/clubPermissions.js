// Per-club permission catalog — the grantable permissions a custom ClubRole can hold.
// Distinct from the platform-level PERMISSIONS (constants/permissions.js): these are
// scoped inside one club and checked via middlewares/requireClubPermission.
// Format: "resource:action". The `coordinator` system role implicitly holds all of them.
const CLUB_PERMISSIONS = [
   { key: "club:edit", label: "Edit club profile", group: "Club", desc: "Name, logo, description, tags, join policy" },
   { key: "members:moderate", label: "Approve & remove members", group: "Members", desc: "Accept or reject requests, remove members" },
   { key: "members:assign-role", label: "Assign member roles", group: "Members", desc: "Assign roles below their own weight" },
   { key: "roles:manage", label: "Manage roles", group: "Governance", desc: "Create, edit & delete custom roles" },
   { key: "announcements:create", label: "Post announcements", group: "Announcements", desc: "Write & publish announcements to members" },
   { key: "announcements:pin", label: "Pin announcements", group: "Announcements", desc: "Pin announcements to the top of the feed" },
   { key: "announcements:delete", label: "Delete announcements", group: "Announcements", desc: "Remove any announcement in the club" },
   { key: "events:create", label: "Create events", group: "Events", desc: "Run the event creation wizard" },
   { key: "events:edit", label: "Edit events", group: "Events", desc: "Edit details, reschedule, view the attendee roster" },
   { key: "events:publish", label: "Publish events", group: "Events", desc: "Take a draft live so members can register" },
   { key: "events:cancel", label: "Cancel events", group: "Events", desc: "Call off a live event, delete a draft" },
];

const CLUB_PERMISSION_KEYS = CLUB_PERMISSIONS.map((p) => p.key);

module.exports = { CLUB_PERMISSIONS, CLUB_PERMISSION_KEYS };

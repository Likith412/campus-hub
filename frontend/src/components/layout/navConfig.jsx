// Sidebar nav per role. Mirrors .design/nav.js — kept in code so the React sidebar
// can render the right items based on the logged-in user's role.
import Icon from "../Icon";

const I = {
   dashboard: (
      <Icon>
         <rect x="3" y="3" width="7" height="9" />
         <rect x="14" y="3" width="7" height="5" />
         <rect x="14" y="12" width="7" height="9" />
         <rect x="3" y="16" width="7" height="5" />
      </Icon>
   ),
   discover: (
      <Icon>
         <circle cx="11" cy="11" r="8" />
         <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </Icon>
   ),
   contests: (
      <Icon>
         <polyline points="16 18 22 12 16 6" />
         <polyline points="8 6 2 12 8 18" />
      </Icon>
   ),
   chat: (
      <Icon>
         <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </Icon>
   ),
   cert: (
      <Icon>
         <circle cx="12" cy="8" r="7" />
         <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      </Icon>
   ),
   user: (
      <Icon>
         <circle cx="12" cy="12" r="3" />
         <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </Icon>
   ),
   admin: (
      <Icon>
         <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
         <circle cx="9" cy="7" r="4" />
         <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
         <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </Icon>
   ),
   plus: (
      <Icon>
         <line x1="12" y1="5" x2="12" y2="19" />
         <line x1="5" y1="12" x2="19" y2="12" />
      </Icon>
   ),
   workshop: (
      <Icon>
         <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
         <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </Icon>
   ),
   analytics: (
      <Icon>
         <line x1="18" y1="20" x2="18" y2="10" />
         <line x1="12" y1="20" x2="12" y2="4" />
         <line x1="6" y1="20" x2="6" y2="14" />
      </Icon>
   ),
   shield: (
      <Icon>
         <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </Icon>
   ),
   calendar: (
      <Icon>
         <rect x="3" y="4" width="18" height="18" rx="2" />
         <line x1="16" y1="2" x2="16" y2="6" />
         <line x1="8" y1="2" x2="8" y2="6" />
         <line x1="3" y1="10" x2="21" y2="10" />
      </Icon>
   ),
   log: (
      <Icon>
         <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
         <polyline points="14 2 14 8 20 8" />
         <line x1="9" y1="13" x2="15" y2="13" />
         <line x1="9" y1="17" x2="15" y2="17" />
      </Icon>
   ),
};

export const NAV_BY_ROLE = {
   student: [
      { section: "Discover" },
      { id: "dashboard", label: "Dashboard", to: "/", icon: I.dashboard },
      { id: "discovery", label: "Explore", to: "/explore", icon: I.discover },
      { id: "clubs", label: "Clubs", to: "/clubs", icon: I.admin },
      { id: "contests", label: "Contests", to: "/contests", icon: I.contests },
      { section: "Your Hub" },
      {
         id: "messages",
         label: "Messages",
         to: "/messages",
         icon: I.chat,
      },
      {
         id: "certs",
         label: "Certificates",
         to: "/certificates",
         icon: I.cert,
      },
      {
         id: "profile",
         label: "Profile & Settings",
         to: "/profile",
         icon: I.user,
      },
   ],
   // faculty nav is built per active club — see getFacultyNav() below.
   faculty: [],
   superAdmin: [
      { section: "Institute" },
      { id: "super", label: "Overview", to: "/", icon: I.shield },
      { id: "faculty", label: "All Faculties", to: "/admin/faculty", icon: I.admin },
      { id: "clubs", label: "All Clubs", to: "/admin/clubs", icon: I.admin },
      { id: "users", label: "All Users", to: "/users", icon: I.admin },
      { id: "events", label: "All Events", to: "/events", icon: I.calendar },
      { section: "System" },
      {
         id: "analytics",
         label: "Institute Analytics",
         to: "/analytics",
         icon: I.analytics,
      },
      { id: "audit", label: "Audit Log", to: "/audit", icon: I.log },
   ],
};

// Faculty sidebar is scoped to the club currently in focus (the switcher's selection).
// Without a focused club the club-specific links are hidden — only the personal items remain.
export function getFacultyNav(slug) {
   const clubItems = slug
      ? [
           { section: "This Club" },
           { id: "home", label: "Club Home", to: `/clubs/${slug}`, icon: I.dashboard },
           {
              id: "members",
              label: "Members",
              to: `/clubs/${slug}/members`,
              icon: I.admin,
           },
           { id: "wizard", label: "Create Event", to: "/events/new", icon: I.plus },
           { id: "analytics", label: "Analytics", to: "/analytics", icon: I.analytics },
        ]
      : [];
   return [
      ...clubItems,
      { section: "Engage" },
      { id: "messages", label: "Messages", to: "/messages", icon: I.chat },
      { id: "certs", label: "Certificates", to: "/certificates", icon: I.cert },
      { id: "profile", label: "Settings", to: "/profile", icon: I.user },
   ];
}

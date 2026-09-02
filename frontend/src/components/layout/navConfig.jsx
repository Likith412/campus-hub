// Sidebar nav items per platform role.
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
   profile: (
      <Icon>
         <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
         <circle cx="12" cy="7" r="4" />
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
   // Mortarboard — matches the icon the Faculty page uses on its own stat card.
   faculty: (
      <Icon>
         <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
         <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </Icon>
   ),
   // Layers — matches the icon the Roles links already use on the club pages.
   roles: (
      <Icon>
         <path d="M12 2 2 7l10 5 10-5-10-5Z" />
         <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
      </Icon>
   ),
   // Briefcase — a club as an organisation, distinct from the people icon.
   org: (
      <Icon>
         <rect x="2" y="7" width="20" height="14" rx="2" />
         <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </Icon>
   ),
   plus: (
      <Icon>
         <line x1="12" y1="5" x2="12" y2="19" />
         <line x1="5" y1="12" x2="19" y2="12" />
      </Icon>
   ),
   megaphone: (
      <Icon>
         <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
         <path d="M16 9a3 3 0 0 1 0 6" />
         <path d="M19 6a7 7 0 0 1 0 12" />
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
};

export const NAV_BY_ROLE = {
   student: [
      { section: "Discover" },
      { id: "dashboard", label: "Dashboard", to: "/", icon: I.dashboard },
      { id: "discovery", label: "Explore", to: "/explore", icon: I.discover },
      { id: "clubs", label: "Clubs", to: "/clubs", icon: I.org },
      { section: "Your Hub" },
      { id: "my-events", label: "My Events", to: "/my-events", icon: I.calendar },
      { id: "my-clubs", label: "My Clubs", to: "/my-clubs", icon: I.org },
      { id: "profile", label: "Profile", to: "/profile", icon: I.profile },
      { id: "settings", label: "Settings", to: "/settings", icon: I.user },
   ],
   // faculty nav is built per active club — see getFacultyNav() below.
   faculty: [],
   superAdmin: [
      { section: "Institute" },
      { id: "faculty", label: "All Faculties", to: "/admin/faculty", icon: I.faculty },
      { id: "students", label: "All Students", to: "/admin/students", icon: I.admin },
      { id: "clubs", label: "All Clubs", to: "/admin/clubs", icon: I.org },
      { id: "events", label: "All Events", to: "/admin/events", icon: I.calendar },
   ],
};

// Faculty sidebar is scoped to the club currently in focus (the switcher's selection).
// Without a focused club the club-specific links are hidden — only the personal items remain.
export function getFacultyNav(slug) {
   const clubItems = slug
      ? [
           { section: "This Club" },
           {
              id: "home",
              label: "Club Home",
              to: `/clubs/${slug}/admin`,
              icon: I.dashboard,
           },
           {
              id: "members",
              label: "Members",
              to: `/clubs/${slug}/members`,
              icon: I.admin,
           },
           {
              id: "roles",
              label: "Roles",
              to: `/clubs/${slug}/roles`,
              icon: I.roles,
           },
           {
              id: "events",
              label: "Events",
              to: `/clubs/${slug}/events`,
              icon: I.calendar,
           },
           {
              id: "announcements",
              label: "Announcements",
              to: `/clubs/${slug}/announcements`,
              icon: I.megaphone,
           },
           {
              id: "wizard",
              label: "Create Event",
              to: `/clubs/${slug}/events/new`,
              icon: I.plus,
           },
        ]
      : [];
   return [
      ...clubItems,
      { section: "You" },
      { id: "profile", label: "Profile", to: "/profile", icon: I.profile },
      { id: "settings", label: "Settings", to: "/settings", icon: I.user },
   ];
}

import { useEffect, useState } from "react";
import { Link } from "react-router";
import Icon from "../Icon";
import { announcementsApi } from "../../services";
import { useAuth } from "../../contexts/AuthContext";
import { lastSeenAt } from "../../utils/announcementsSeen";

// Topbar remounts on every navigation, so the newest-notice lookup is cached at module
// scope and runs once per app session rather than once per page. Clearing the dot needs
// no request — visiting the digest writes the seen marker, and the comparison below is
// re-read on each mount. Keyed by user: signing in as someone else in the same tab must
// not inherit the previous account's notices.
let newest = { userId: null, iso: null };

function formatNow() {
   return new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
   });
}

export default function Topbar({ title, subtitle, rightSlot }) {
   // The digest is a student's inbox for the clubs they joined or follow. Faculty reach
   // each club's board from their own sidebar, and a superAdmin holds no memberships —
   // neither has anything to read here, so neither gets the bell.
   const { user } = useAuth();
   const showBell = user?.role === "student";

   const [now, setNow] = useState(formatNow);
   useEffect(() => {
      const id = setInterval(() => setNow(formatNow()), 30000);
      return () => clearInterval(id);
   }, []);

   const [unread, setUnread] = useState(false);
   const userId = user?.id || null;
   useEffect(() => {
      if (!showBell) return;
      let cancelled = false;
      const apply = (iso) => {
         const seen = lastSeenAt(userId);
         setUnread(!!iso && (!seen || new Date(iso) > new Date(seen)));
      };
      if (newest.userId === userId) {
         apply(newest.iso);
         return;
      }
      announcementsApi
         .listMyAnnouncements({ limit: 1 })
         .then((d) => {
            newest = { userId, iso: d?.items?.[0]?.createdAt || null };
            if (!cancelled) apply(newest.iso);
         })
         .catch(() => {});
      return () => {
         cancelled = true;
      };
   }, [showBell, userId]);

   return (
      <div className="topbar">
         <div className="topbar-title">
            {title}
            {/* Which club (or record) the page is about — the only place that says it. */}
            {subtitle && (
               <>
                  <span className="topbar-dot">·</span>
                  <span className="topbar-sub">{subtitle}</span>
               </>
            )}
         </div>
         <div className="topbar-divider"></div>
         <div className="topbar-time">{now}</div>
         {rightSlot}
         {showBell && (
            <div className="topbar-right">
               {/* Opens the cross-club digest — every notice from the clubs you're
                   in or follow. Each club's own board stays under /clubs/:slug. */}
               <Link
                  to="/announcements"
                  className="icon-btn"
                  title="Announcements"
                  aria-label="Announcements"
               >
                  <Icon size={18}>
                     <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                     <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </Icon>
                  {unread && <span className="dot"></span>}
               </Link>
            </div>
         )}
      </div>
   );
}

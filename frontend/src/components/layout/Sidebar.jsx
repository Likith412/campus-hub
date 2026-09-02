import { Link, useLocation } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveClub } from "../../contexts/ActiveClubContext";
import Icon from "../Icon";
import ClubSwitcher from "./ClubSwitcher";
import { NAV_BY_ROLE, getFacultyNav } from "./navConfig";

// Two-letter initials for the avatar (e.g. "Arjun Sharma" → "AS").
function initials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

// Subtitle under the user's name in the sidebar footer.
function userMeta(user) {
   const dept = user?.profile?.department;
   const year = user?.profile?.year;
   if (dept && year)
      return `${dept} · ${year === "postgrad" ? "PG" : `Year ${year}`}`;
   return user?.role || "";
}

export default function Sidebar() {
   const { user, logout } = useAuth();
   const { activeClub } = useActiveClub();
   const { pathname } = useLocation();
   const isFaculty = user?.role === "faculty";
   const items = isFaculty
      ? getFacultyNav(activeClub?.slug)
      : NAV_BY_ROLE[user?.role] || NAV_BY_ROLE.student;

   return (
      <aside className="sidebar">
         <div className="brand">
            <div className="brand-mark">C</div>
            <div className="brand-name">
               Campus Hub
            </div>
         </div>

         {isFaculty && <ClubSwitcher />}

         {items.map((item, i) =>
            item.section ? (
               <div key={`s-${i}`} className="nav-section-label">
                  {item.section}
               </div>
            ) : (
               <Link
                  key={item.id}
                  to={item.to}
                  className={`nav-item${pathname === item.to ? " active" : ""}`}
               >
                  <span className="icon">{item.icon}</span>
                  {item.label}
               </Link>
            ),
         )}

         <div className="sidebar-footer">
            <Link to="/profile" className="user-card">
               <div className="avatar">{initials(user?.name)}</div>
               <div>
                  <div className="user-name">{user?.name || "—"}</div>
                  <div className="user-meta">{userMeta(user)}</div>
               </div>
            </Link>
            <button className="logout-btn" onClick={logout}>
               <Icon size={14}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
               </Icon>
               Log out
            </button>
         </div>
      </aside>
   );
}

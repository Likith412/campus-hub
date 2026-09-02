import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useActiveClub } from "../../contexts/ActiveClubContext";
import Icon from "../Icon";

function initials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

// Square club badge — logo image if set, else initials over the club's cover gradient.
function ClubBadge({ club, size = 30 }) {
   const style = {
      width: size,
      height: size,
      backgroundImage:
         club.coverFrom && club.coverTo
            ? `linear-gradient(135deg, ${club.coverFrom}, ${club.coverTo})`
            : "var(--gradient-accent)",
   };
   return (
      <span className="cs-badge" style={style}>
         {club.logoUrl ? (
            <img src={club.logoUrl} alt="" />
         ) : (
            initials(club.name)
         )}
      </span>
   );
}

function VerifiedTick() {
   return (
      <span className="cs-tick" title="Verified by institute">
         <Icon size={11} strokeWidth={3}>
            <polyline points="20 6 9 17 4 12" />
         </Icon>
      </span>
   );
}

// Faculty-only sidebar control: shows the club in focus and switches between the
// clubs they coordinate. Selecting a club scopes the rest of the sidebar to it.
export default function ClubSwitcher() {
   const { clubs, activeClub, setActiveSlug, loading } = useActiveClub();
   const [open, setOpen] = useState(false);
   const wrapRef = useRef(null);
   const navigate = useNavigate();

   // Close on outside click or Escape.
   useEffect(() => {
      if (!open) return;
      const onDown = (e) => {
         if (wrapRef.current && !wrapRef.current.contains(e.target)) {
            setOpen(false);
         }
      };
      const onKey = (e) => e.key === "Escape" && setOpen(false);
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
         document.removeEventListener("mousedown", onDown);
         document.removeEventListener("keydown", onKey);
      };
   }, [open]);

   if (loading) {
      return <div className="cs-trigger cs-skeleton" aria-hidden />;
   }

   // No clubs yet — straight to the creation wizard.
   if (!activeClub) {
      return (
         <button
            type="button"
            className="cs-empty"
            onClick={() => navigate("/clubs/new")}
         >
            <span className="cs-empty-ic">
               <Icon size={15} strokeWidth={2.5}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
               </Icon>
            </span>
            <span>
               <b>Create club</b>
               <small>Start running a club on campus</small>
            </span>
         </button>
      );
   }

   // Switching focus lands on that club's home — the switcher scopes the whole
   // sidebar to the new club, so staying on a page belonging to the old one would
   // leave the nav and the content disagreeing.
   const pick = (slug) => {
      setActiveSlug(slug);
      setOpen(false);
      navigate(`/clubs/${slug}/admin`);
   };

   return (
      <div className="cs-wrap" ref={wrapRef}>
         <button
            type="button"
            className={`cs-trigger${open ? " open" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
         >
            <ClubBadge club={activeClub} />
            <span className="cs-trigger-text">
               <span className="cs-eyebrow">Managing</span>
               <span className="cs-name">
                  {/* Inner span so the ellipsis applies — .cs-name is a flex row. */}
                  <span className="cs-name-text">{activeClub.name}</span>
                  {activeClub.verified && <VerifiedTick />}
               </span>
            </span>
            <span className="cs-chevron">
               <Icon size={14}>
                  <polyline points="6 9 12 15 18 9" />
               </Icon>
            </span>
         </button>

         {open && (
            <div className="cs-menu" role="listbox">
               <div className="cs-menu-head">Your clubs</div>
               <div className="cs-menu-list">
                  {clubs.map((club) => {
                     const active = club.slug === activeClub.slug;
                     return (
                        <button
                           key={club.slug}
                           type="button"
                           role="option"
                           aria-selected={active}
                           className={`cs-item${active ? " active" : ""}`}
                           onClick={() => pick(club.slug)}
                        >
                           <ClubBadge club={club} size={28} />
                           <span className="cs-item-text">
                              <span className="cs-item-name">
                                 {club.name}
                                 {club.verified && <VerifiedTick />}
                              </span>
                              <span className="cs-item-meta">
                                 {club.memberCount}{" "}
                                 {club.memberCount === 1 ? "member" : "members"}
                              </span>
                           </span>
                           {active && (
                              <span className="cs-check">
                                 <Icon size={14} strokeWidth={3}>
                                    <polyline points="20 6 9 17 4 12" />
                                 </Icon>
                              </span>
                           )}
                        </button>
                     );
                  })}
               </div>
               <button
                  type="button"
                  className="cs-create"
                  onClick={() => {
                     setOpen(false);
                     navigate("/clubs/new");
                  }}
               >
                  <span className="cs-create-ic">
                     <Icon size={14} strokeWidth={2.5}>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                     </Icon>
                  </span>
                  Create a new club
               </button>
            </div>
         )}
      </div>
   );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { profileApi } from "../../services";
import Icon from "../Icon";

const ACTIVE_KEY = "ch_active_club";

function initials(name = "") {
   const p = name.trim().split(/\s+/);
   return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}
function gradient(c) {
   return `linear-gradient(135deg, ${c?.coverFrom || "#6c63ff"}, ${c?.coverTo || "#34d399"})`;
}

function Tick() {
   return (
      <span className="cs-tick" title="Verified">
         <Icon size={9} strokeWidth={4}>
            <polyline points="20 6 9 17 4 12" />
         </Icon>
      </span>
   );
}

// Coordinator club switcher — lists clubs they coordinate, persists the active
// one, and links to each club / the create-club flow.
export default function ClubSwitcher() {
   const navigate = useNavigate();
   const [clubs, setClubs] = useState(null);
   const [activeId, setActiveId] = useState(
      () => localStorage.getItem(ACTIVE_KEY) || null,
   );
   const [open, setOpen] = useState(false);
   const ref = useRef(null);

   useEffect(() => {
      profileApi
         .getClubs()
         .then((d) =>
            setClubs((d?.items || []).filter((c) => c.role === "coordinator")),
         )
         .catch(() => setClubs([]));
   }, []);

   useEffect(() => {
      if (!open) return;
      const onDoc = (e) => {
         if (!ref.current?.contains(e.target)) setOpen(false);
      };
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
   }, [open]);

   if (clubs === null) return null; // nothing until loaded
   // No clubs yet — just a prompt to create the first one.
   if (clubs.length === 0) {
      return (
         <button
            type="button"
            className="cs-empty"
            onClick={() => navigate("/clubs/new")}
         >
            <span className="cs-add-ic">
               <Icon size={13} strokeWidth={2.5}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
               </Icon>
            </span>
            Create your first club
         </button>
      );
   }

   const active = clubs.find((c) => c.clubId === activeId) || clubs[0];

   const choose = (c) => {
      setActiveId(c.clubId);
      localStorage.setItem(ACTIVE_KEY, c.clubId);
      setOpen(false);
      navigate(`/clubs/${c.slug}`);
   };

   return (
      <div className={`club-switcher${open ? " open" : ""}`} ref={ref}>
         <div className="cs-label">Active club</div>
         <button
            type="button"
            className="cs-trigger"
            onClick={() => setOpen((v) => !v)}
         >
            <span className="cs-logo" style={{ background: gradient(active) }}>
               {initials(active.name)}
            </span>
            <span className="cs-meta">
               <span className="cs-name">
                  {active.name}
                  {active.verified ? <Tick /> : <span className="cs-unverified">●</span>}
               </span>
               <span className="cs-sub">{active.memberCount} members</span>
            </span>
            <Icon size={14} strokeWidth={2.4} className="cs-chevron">
               <polyline points="6 9 12 15 18 9" />
            </Icon>
         </button>

         {open && (
            <div className="cs-menu">
               <div className="cs-menu-head">Switch club</div>
               {clubs.map((c) => (
                  <button
                     type="button"
                     key={c.clubId}
                     className={`cs-item${c.clubId === active.clubId ? " active" : ""}`}
                     onClick={() => choose(c)}
                  >
                     <span className="cs-logo sm" style={{ background: gradient(c) }}>
                        {initials(c.name)}
                     </span>
                     <span className="cs-item-meta">
                        <span className="cs-item-name">
                           {c.name}
                           {c.verified ? <Tick /> : <span className="cs-unverified">●</span>}
                        </span>
                        <span className="cs-item-sub">
                           {c.memberCount} members{c.verified ? "" : " · unverified"}
                        </span>
                     </span>
                  </button>
               ))}
               <button
                  type="button"
                  className="cs-add"
                  onClick={() => {
                     setOpen(false);
                     navigate("/clubs/new");
                  }}
               >
                  <span className="cs-add-ic">
                     <Icon size={13} strokeWidth={2.5}>
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

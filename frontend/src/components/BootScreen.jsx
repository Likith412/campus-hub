// Full-screen branded splash shown while the app bootstraps the session.
// Reuses the CampusHub logo mark (white "C" + purple orbit dot) so the cold-load
// looks intentional instead of a blank flash.
export default function BootScreen({ label = "Loading your campus…" }) {
   return (
      <div className="boot-screen" role="status" aria-live="polite">
         <div className="boot-inner">
            <div className="boot-mark">
               <svg viewBox="0 0 24 24" fill="none" width="40" height="40">
                  <path
                     d="M17.5 6.8 A6.8 6.8 0 1 0 17.5 17.2"
                     stroke="white"
                     strokeWidth="2.6"
                     strokeLinecap="round"
                     fill="none"
                  />
                  <circle
                     className="boot-dot"
                     cx="17.8"
                     cy="12"
                     r="2.1"
                     fill="#6c63ff"
                  />
               </svg>
            </div>
            <div className="boot-name">
               CampusHub <span>AI</span>
            </div>
            <div className="boot-bar">
               <span />
            </div>
            <div className="boot-label">{label}</div>
         </div>
      </div>
   );
}

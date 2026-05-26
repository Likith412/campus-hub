import { useEffect, useState } from "react";
import Icon from "../Icon";

function formatNow() {
   return new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
   });
}

export default function Topbar({ title, rightSlot }) {
   const [now, setNow] = useState(formatNow);
   useEffect(() => {
      const id = setInterval(() => setNow(formatNow()), 30000);
      return () => clearInterval(id);
   }, []);

   return (
      <div className="topbar">
         <div className="topbar-title">{title}</div>
         <div className="topbar-time">{now}</div>
         <div className="topbar-divider"></div>
         {rightSlot}
         <div className="topbar-right">
            <button className="icon-btn" title="Notifications">
               <Icon size={18}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
               </Icon>
               <span className="dot"></span>
            </button>
         </div>
      </div>
   );
}

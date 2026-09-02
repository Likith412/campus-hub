import { useEffect } from "react";

// Modal chrome every dialog needs: hold the page still behind the overlay and let
// Escape close it. `disabled` keeps Escape from cancelling a save in flight.
export default function useModalChrome(onClose, { disabled = false } = {}) {
   useEffect(() => {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e) => {
         if (e.key === "Escape" && !disabled) onClose?.();
      };
      window.addEventListener("keydown", onKey);
      return () => {
         document.body.style.overflow = prevOverflow;
         window.removeEventListener("keydown", onKey);
      };
   }, [onClose, disabled]);
}

import { useEffect, useRef } from "react";
import Icon from "./Icon";

// Reusable confirmation dialog. Controlled via `open`; resolves the choice
// through onConfirm / onCancel. Use directly, or imperatively via useConfirm().
export default function ConfirmModal({
   open,
   title = "Are you sure?",
   message,
   confirmLabel = "Confirm",
   cancelLabel = "Cancel",
   danger = false,
   busy = false,
   onConfirm,
   onCancel,
}) {
   const confirmRef = useRef(null);

   const dialogRef = useRef(null);

   // Focus the confirm button on open, lock body scroll, wire Escape to cancel, keep
   // Tab inside the dialog, and hand focus back to whatever opened it on close.
   useEffect(() => {
      if (!open) return;
      const opener = document.activeElement;
      confirmRef.current?.focus();
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e) => {
         if (e.key === "Escape" && !busy) {
            onCancel?.();
            return;
         }
         if (e.key !== "Tab") return;
         const focusables = dialogRef.current?.querySelectorAll("button");
         if (!focusables?.length) return;
         const first = focusables[0];
         const last = focusables[focusables.length - 1];
         if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
         } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
         }
      };
      window.addEventListener("keydown", onKey);
      return () => {
         document.body.style.overflow = prevOverflow;
         window.removeEventListener("keydown", onKey);
         // The trigger may have unmounted with the action — optional-call it.
         opener?.focus?.();
      };
   }, [open, busy, onCancel]);

   if (!open) return null;

   return (
      <div
         className="cm-overlay"
         onClick={() => !busy && onCancel?.()}
      >
         <div
            ref={dialogRef}
            className="cm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cm-title"
            onClick={(e) => e.stopPropagation()}
         >
            <div className={`cm-icon${danger ? " danger" : ""}`}>
               <Icon size={20} strokeWidth={2.5}>
                  {danger ? (
                     <>
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12" y2="17.01" />
                     </>
                  ) : (
                     <>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12" y2="16.01" />
                     </>
                  )}
               </Icon>
            </div>
            <h3 className="cm-title" id="cm-title">
               {title}
            </h3>
            {message && <p className="cm-message">{message}</p>}
            <div className="cm-actions">
               <button
                  type="button"
                  className="cm-btn cancel"
                  onClick={() => onCancel?.()}
                  disabled={busy}
               >
                  {cancelLabel}
               </button>
               <button
                  type="button"
                  ref={confirmRef}
                  className={`cm-btn confirm${danger ? " danger" : ""}`}
                  onClick={() => onConfirm?.()}
                  disabled={busy}
               >
                  {busy ? "…" : confirmLabel}
               </button>
            </div>
         </div>
      </div>
   );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { ToastContext } from "./ToastContext";

let idSeq = 0;
const nextId = () => {
   idSeq += 1;
   return `t-${Date.now()}-${idSeq}`;
};

const DEFAULT_DURATION = 4000;
const MAX_VISIBLE = 1;

function ToastIcon({ variant }) {
   if (variant === "success") {
      return (
         <Icon size={14} strokeWidth={3}>
            <polyline points="20 6 9 17 4 12" />
         </Icon>
      );
   }
   if (variant === "error") {
      return (
         <Icon size={14} strokeWidth={3}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
         </Icon>
      );
   }
   if (variant === "warning") {
      return (
         <Icon size={14} strokeWidth={3}>
            <line x1="12" y1="8" x2="12" y2="13" />
            <line x1="12" y1="16.5" x2="12" y2="16.6" />
         </Icon>
      );
   }
   return (
      <Icon size={14} strokeWidth={3}>
         <line x1="12" y1="11" x2="12" y2="16" />
         <line x1="12" y1="7.5" x2="12" y2="7.6" />
      </Icon>
   );
}

// Slide-out duration in App.css, plus a little slack for the fallback below.
const EXIT_MS = 400;

function ToastCard({ toast, onDismiss }) {
   const [show, setShow] = useState(false);
   const timerRef = useRef(null);
   const exitRef = useRef(null);
   const shownRef = useRef(false);

   useEffect(() => {
      // Slide in on the next frame, so the initial paint has the off-screen position.
      const r = requestAnimationFrame(() => setShow(true));
      timerRef.current = setTimeout(() => setShow(false), toast.duration);
      return () => {
         cancelAnimationFrame(r);
         clearTimeout(timerRef.current);
         clearTimeout(exitRef.current);
      };
   }, [toast.duration]);

   // transitionend is the normal removal path, but it never fires in a backgrounded tab
   // or when the transition is overridden — without a fallback the toast would stay in
   // the stack for the rest of the session.
   useEffect(() => {
      if (show) {
         shownRef.current = true;
         return;
      }
      if (!shownRef.current) return; // still waiting on the slide-in frame
      exitRef.current = setTimeout(() => onDismiss(toast.id), EXIT_MS);
      return () => clearTimeout(exitRef.current);
   }, [show, toast.id, onDismiss]);

   // after slide-out transition, remove from stack
   const handleTransitionEnd = (e) => {
      if (e.propertyName === "transform" && !show) onDismiss(toast.id);
   };

   const close = () => setShow(false);

   return (
      <div
         className={`toast toast-${toast.variant}${show ? " show" : ""}`}
         role={toast.variant === "error" ? "alert" : "status"}
         onTransitionEnd={handleTransitionEnd}
      >
         <span className="toast-ic">
            <ToastIcon variant={toast.variant} />
         </span>
         <div className="toast-body">
            {toast.title && <div className="toast-title">{toast.title}</div>}
            <div className="toast-msg">{toast.message}</div>
         </div>
         <button
            type="button"
            className="toast-close"
            onClick={close}
            aria-label="Dismiss"
         >
            <Icon size={14}>
               <line x1="18" y1="6" x2="6" y2="18" />
               <line x1="6" y1="6" x2="18" y2="18" />
            </Icon>
         </button>
      </div>
   );
}

export function ToastProvider({ children }) {
   const [toasts, setToasts] = useState([]);

   const dismiss = useCallback((id) => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
   }, []);

   const show = useCallback((variant, message, opts = {}) => {
      const id = nextId();
      const entry = {
         id,
         variant,
         message,
         title: opts.title,
         duration: opts.duration ?? DEFAULT_DURATION,
      };
      // Cap visible stack — drop the oldest when at limit.
      setToasts((cur) => [...cur, entry].slice(-MAX_VISIBLE));
      return id;
   }, []);

   // Stable identity — consumers depend on `toast` in effect deps, so a fresh
   // object each render would re-fire their effects (and loop on error paths).
   const api = useMemo(
      () => ({
         success: (msg, opts) => show("success", msg, opts),
         error: (msg, opts) => show("error", msg, opts),
         warning: (msg, opts) => show("warning", msg, opts),
         info: (msg, opts) => show("info", msg, opts),
         dismiss,
      }),
      [show, dismiss],
   );

   return (
      <ToastContext.Provider value={api}>
         {children}
         <div className="toast-stack" aria-live="polite">
            {toasts.map((t) => (
               <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
            ))}
         </div>
      </ToastContext.Provider>
   );
}

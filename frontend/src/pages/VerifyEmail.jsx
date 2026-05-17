import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { authApi, ApiError } from "../services";

// Tiny inline SVG wrapper (same pattern as Login/Register).
function Icon({ size = 14, strokeWidth = 2.2, children }) {
   return (
      <svg
         width={size}
         height={size}
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         strokeWidth={strokeWidth}
         strokeLinecap="round"
         strokeLinejoin="round"
      >
         {children}
      </svg>
   );
}

const brandFeats = [
   {
      icon: (
         <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
         </>
      ),
      title: "One click confirms you.",
      body: "We just need to make sure that email is yours before unlocking access.",
   },
   {
      icon: (
         <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
         </>
      ),
      title: "Link valid for 24 hours.",
      body: "If it expired, resend a fresh one — old links stop working automatically.",
   },
   {
      icon: (
         <>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
         </>
      ),
      title: "Check spam too.",
      body: "If you don't see it in your inbox, look under Promotions or Spam.",
   },
];

const stats = [
   { num: "24 hr", label: "Link validity" },
   { num: "1-tap", label: "Verification" },
   { num: "Secure", label: "Single-use token" },
];

// View state machine: VERIFYING on mount, then SUCCESS or ERROR.
// IDLE is used when no token was supplied (user landed here directly to resend).
const STATUS = {
   VERIFYING: "verifying",
   SUCCESS: "success",
   ERROR: "error",
   IDLE: "idle",
};

function VerifyEmail() {
   const [params] = useSearchParams();
   const token = params.get("token");
   const navigate = useNavigate();

   const [status, setStatus] = useState(token ? STATUS.VERIFYING : STATUS.IDLE);
   const [errorMessage, setErrorMessage] = useState(null);

   // Resend form (shown on error or when no token was provided at all).
   const [resendEmail, setResendEmail] = useState("");
   const [resendSubmitting, setResendSubmitting] = useState(false);
   const [resendSent, setResendSent] = useState(false);

   // Guard against StrictMode double-invocation in dev (would consume the single-use token twice).
   const hasVerified = useRef(false);

   useEffect(() => {
      if (!token || hasVerified.current) return;
      hasVerified.current = true;
      (async () => {
         try {
            await authApi.verifyEmail(token);
            setStatus(STATUS.SUCCESS);
         } catch (err) {
            setStatus(STATUS.ERROR);
            setErrorMessage(
               err instanceof ApiError
                  ? err.message
                  : "Verification failed. The link may be expired or invalid.",
            );
         }
      })();
   }, [token]);

   const handleResend = async (e) => {
      e.preventDefault();
      if (resendSubmitting) return;
      setResendSubmitting(true);
      try {
         await authApi.resendVerification(resendEmail);
         setResendSent(true);
      } catch {
         // Backend deliberately returns a generic message either way (anti-enumeration).
         // We mirror that — always show success-style confirmation.
         setResendSent(true);
      } finally {
         setResendSubmitting(false);
      }
   };

   return (
      <div className="auth-shell">
         <aside className="auth-brand">
            <div className="brand-top">
               <div className="brand-mark-big">C</div>
               <div className="brand-name-big">
                  CampusHub <span>AI</span>
               </div>
            </div>

            <div className="brand-content">
               <div className="brand-eyebrow">
                  <span className="pulse"></span>Almost in
               </div>
               <h1 className="brand-headline">
                  Verify your email. <em>Then you're set.</em>
               </h1>
               <p className="brand-sub">
                  One quick confirmation keeps your campus tenant secure. After
                  this, your dashboard, clubs, and events are all unlocked.
               </p>

               <ul className="brand-feats">
                  {brandFeats.map(({ icon, title, body }) => (
                     <li key={title} className="brand-feat">
                        <div className="feat-ic">
                           <Icon>{icon}</Icon>
                        </div>
                        <div>
                           <b>{title}</b> {body}
                        </div>
                     </li>
                  ))}
               </ul>
            </div>

            <div className="brand-foot">
               {stats.map(({ num, label }, i) => (
                  <Fragment key={label}>
                     {i > 0 && <div className="stat-divider"></div>}
                     <div>
                        <div className="stat-num">{num}</div>
                        <div>{label}</div>
                     </div>
                  </Fragment>
               ))}
            </div>
         </aside>

         <section className="auth-form-wrap">
            <div className="auth-form-top">
               Already verified?<Link to="/login">Sign in</Link>
            </div>

            <div className="auth-form">
               {status === STATUS.VERIFYING && (
                  <>
                     <h2 className="auth-title">Verifying your email…</h2>
                     <p className="auth-subtitle">
                        Hang tight — this usually takes a moment.
                     </p>
                     <div className="auth-banner">
                        Checking your verification link with the server.
                     </div>
                  </>
               )}

               {status === STATUS.SUCCESS && (
                  <>
                     <h2 className="auth-title">Email verified.</h2>
                     <p className="auth-subtitle">
                        Your account is ready. You can sign in now.
                     </p>
                     <div className="auth-banner">
                        All set — your email has been confirmed and your account
                        is active.
                     </div>
                     <button
                        type="button"
                        className="btn-submit accent"
                        onClick={() => navigate("/login", { replace: true })}
                     >
                        Continue to sign in
                        <Icon strokeWidth={2.5}>
                           <line x1="5" y1="12" x2="19" y2="12" />
                           <polyline points="12 5 19 12 12 19" />
                        </Icon>
                     </button>
                  </>
               )}

               {(status === STATUS.ERROR || status === STATUS.IDLE) && (
                  <>
                     <h2 className="auth-title">
                        {status === STATUS.ERROR
                           ? "We couldn't verify that link."
                           : "Resend verification email."}
                     </h2>
                     <p className="auth-subtitle">
                        {status === STATUS.ERROR
                           ? "The link may be expired or already used. Request a fresh one below."
                           : "Enter the email you signed up with and we'll send a new link."}
                     </p>

                     {status === STATUS.ERROR && errorMessage && (
                        <div className="auth-error">{errorMessage}</div>
                     )}

                     {resendSent ? (
                        <div className="auth-banner">
                           If that email exists, a fresh verification link is on
                           its way. Check your inbox (and spam).
                        </div>
                     ) : (
                        <form onSubmit={handleResend}>
                           <div className="field">
                              <label className="field-label">
                                 Institutional email
                              </label>
                              <div className="input-wrap">
                                 <span className="lead-ic">
                                    <Icon size={16} strokeWidth={2}>
                                       <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                       <polyline points="22,6 12,13 2,6" />
                                    </Icon>
                                 </span>
                                 <input
                                    className="field-input has-lead"
                                    type="email"
                                    name="email"
                                    placeholder="you@nitk.edu.in"
                                    value={resendEmail}
                                    onChange={(e) =>
                                       setResendEmail(e.target.value)
                                    }
                                    required
                                 />
                              </div>
                           </div>

                           <button
                              type="submit"
                              className="btn-submit accent"
                              disabled={resendSubmitting}
                           >
                              {resendSubmitting
                                 ? "Sending…"
                                 : "Resend verification link"}
                              <Icon strokeWidth={2.5}>
                                 <line x1="5" y1="12" x2="19" y2="12" />
                                 <polyline points="12 5 19 12 12 19" />
                              </Icon>
                           </button>
                        </form>
                     )}
                  </>
               )}

               <div className="auth-foot">
                  Need help?
                  <Link to="/contact">Contact your club coordinator</Link>
               </div>
            </div>
         </section>
      </div>
   );
}

export default VerifyEmail;

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { authApi, errMessage } from "../services";
import { useToast } from "../contexts/ToastContext";
import Spinner, { LoadingBlock } from "../components/Spinner";
import Icon from "../components/Icon";
import AuthBrand from "../components/AuthBrand";

// Tiny inline SVG wrapper (same pattern as Login/Register).

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

// View state machine: 'verifying' on mount, then 'success' or 'error'.
// 'idle' is used when no token was supplied (user landed here directly to resend).
function VerifyEmail() {
   const [params] = useSearchParams();
   const token = params.get("token");
   const navigate = useNavigate();
   const location = useLocation();
   const toast = useToast();

   const [status, setStatus] = useState(token ? "verifying" : "idle");
   const [errorMessage, setErrorMessage] = useState(null);

   // Resend form (shown on error or when no token was provided at all).
   // Prefilled when Login sends the user here with the address they tried.
   const [resendEmail, setResendEmail] = useState(location.state?.email ?? "");
   const [resendSubmitting, setResendSubmitting] = useState(false);
   const [resendSent, setResendSent] = useState(false);

   useEffect(() => {
      if (!token) return;
      (async () => {
         try {
            await authApi.verifyEmail(token);
            setStatus("success");
         } catch (err) {
            setStatus("error");
            setErrorMessage(
               errMessage(err, "Verification failed. The link may be expired or invalid."),
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
         toast.success("Verification email sent — check your inbox");
         setResendSent(true);
      } catch (err) {
         // The 200 path is already generic (anti-enumeration), so anything landing here
         // is a real transport or server failure and the user needs to know to retry.
         toast.error(errMessage(err, "Couldn't send that — try again in a moment"));
      } finally {
         setResendSubmitting(false);
      }
   };

   return (
      <div className="auth-shell">
         <AuthBrand
            headline={
               <>
                  Verify your email. <em>Then you're set.</em>
               </>
            }
            sub="One quick confirmation keeps your campus tenant secure. After this, your dashboard, clubs, and events are all unlocked."
            feats={brandFeats}
         />

         <section className="auth-form-wrap">
            <div className="auth-form-top">
               Already verified?<Link to="/login">Sign in</Link>
            </div>

            <div className="auth-form">
               {status === "verifying" && (
                  <>
                     <h2 className="auth-title">Verifying your email…</h2>
                     <p className="auth-subtitle">
                        Hang tight — this usually takes a moment.
                     </p>
                     <LoadingBlock label="Checking your verification link" />
                  </>
               )}

               {status === "success" && (
                  <>
                     <h2 className="auth-title">Email verified.</h2>
                     <p className="auth-subtitle">
                        Your account is ready. You can sign in now.
                     </p>
                     <div className="success-card">
                        <div className="success-ic">
                           <Icon size={18} strokeWidth={3}>
                              <polyline points="20 6 9 17 4 12" />
                           </Icon>
                        </div>
                        <div>
                           <div className="title">You're all set</div>
                           <div className="msg">
                              Your email has been confirmed and your account is
                              active. Sign in to start exploring Campus Hub.
                           </div>
                        </div>
                     </div>
                     <button
                        type="button"
                        className="btn-submit accent"
                        onClick={() => navigate("/login", { replace: true })}
                     >
                        Continue to sign in
                        <Icon size={14} strokeWidth={2.5}>
                           <line x1="5" y1="12" x2="19" y2="12" />
                           <polyline points="12 5 19 12 12 19" />
                        </Icon>
                     </button>
                  </>
               )}

               {(status === "error" || status === "idle") && (
                  <>
                     <h2 className="auth-title">
                        {status === "error"
                           ? "We couldn't verify that link."
                           : "Resend verification email."}
                     </h2>
                     <p className="auth-subtitle">
                        {status === "error"
                           ? "The link may be expired or already used. Request a fresh one below."
                           : "Enter the email you signed up with and we'll send a new link."}
                     </p>

                     {status === "error" && errorMessage && (
                        <div className="auth-error">{errorMessage}</div>
                     )}

                     {resendSent ? (
                        <div className="success-card">
                           <div className="success-ic">
                              <Icon size={18} strokeWidth={3}>
                                 <polyline points="20 6 9 17 4 12" />
                              </Icon>
                           </div>
                           <div>
                              <div className="title">Check your inbox</div>
                              <div className="msg">
                                 If that email exists, a fresh verification link
                                 is on its way. Check your spam folder too.
                              </div>
                           </div>
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
                              {resendSubmitting ? (
                                 <>
                                    <Spinner size={16} />
                                    Sending
                                 </>
                              ) : (
                                 <>
                                    Resend verification link
                                    <Icon size={14} strokeWidth={2.5}>
                                       <line x1="5" y1="12" x2="19" y2="12" />
                                       <polyline points="12 5 19 12 12 19" />
                                    </Icon>
                                 </>
                              )}
                           </button>
                        </form>
                     )}
                  </>
               )}

               <div className="auth-foot">
                  Need help?
                  <span>Contact your club coordinator</span>
               </div>
            </div>
         </section>
      </div>
   );
}

export default VerifyEmail;

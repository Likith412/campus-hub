import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, authApi, errMessage } from "../services";
import { useToast } from "../contexts/ToastContext";
import Spinner, { LoadingBlock } from "../components/Spinner";
import Icon from "../components/Icon";
import AuthBrand from "../components/AuthBrand";

// Tiny inline SVG wrapper (same pattern as the other auth pages).

const brandFeats = [
   {
      icon: (
         <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
         </>
      ),
      title: "Pick something new.",
      body: "At least 8 characters, with an uppercase letter, a lowercase letter and a number.",
   },
   {
      icon: (
         <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
         </>
      ),
      title: "One-time token.",
      body: "This link works once and then expires — finish here to avoid asking for another.",
   },
   {
      icon: (
         <>
            <path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" />
            <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
         </>
      ),
      title: "Other sessions sign out.",
      body: "Setting a new password ends every other active login on your account.",
   },
];

const stats = [
   { num: "8+", label: "Min length" },
   { num: "Single-use", label: "Token" },
   { num: "Auto", label: "Sign-out" },
];

// View state machine:
//   'validating' on mount while we check the token with the backend,
//   'form' if the token is valid (user can set a new password),
//   'success' after the reset call succeeds,
//   'no_token' if the URL had no token OR the token is invalid/expired.
function ResetPassword() {
   const [params] = useSearchParams();
   const token = params.get("token");
   const navigate = useNavigate();
   const toast = useToast();

   const [status, setStatus] = useState(token ? "validating" : "no_token");
   const [password, setPassword] = useState("");
   const [confirm, setConfirm] = useState("");
   const [showPassword, setShowPassword] = useState(false);
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState(null);

   // Check the token up-front so an invalid/expired link surfaces the "request a new link"
   useEffect(() => {
      if (!token || status !== "validating") return;
      (async () => {
         try {
            await authApi.validateResetToken(token);
            setStatus("form");
         } catch (err) {
            // Only a 401 means the link is genuinely spent; a network blip or a 5xx
            // must not tell the user to request a new one.
            setStatus(
               err instanceof ApiError && err.status === 401
                  ? "no_token"
                  : "check_failed",
            );
         }
      })();
   }, [token, status]);

   const handleSubmit = async (e) => {
      e.preventDefault();
      if (submitting) return;
      if (password !== confirm) {
         setError("Passwords don't match.");
         return;
      }
      setError(null);
      setSubmitting(true);
      try {
         await authApi.resetPassword({ token, password });
         toast.success("Password reset — sign in with your new password");
         setStatus("success");
      } catch (err) {
         setError(
            errMessage(err, "We couldn't reset your password. The link may be expired or invalid."),
         );
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div className="auth-shell">
         <AuthBrand
            eyebrow="Choose a new password"
            headline={
               <>
                  Fresh password, <em>same campus</em>.
               </>
            }
            sub="Pick something you'll remember but no one else would guess. Saving it signs you out everywhere — sign in again with the new one."
            feats={brandFeats}
            stats={stats}
         />

         <section className="auth-form-wrap">
            <div className="auth-form-top">
               Remembered it?<Link to="/login">Back to sign in</Link>
            </div>

            <div className="auth-form">
               {status === "validating" && (
                  <>
                     <h2 className="auth-title">Checking your link…</h2>
                     <p className="auth-subtitle">
                        Hang tight — we're confirming this reset link is still
                        valid.
                     </p>
                     <LoadingBlock label="Verifying your reset token" />

                  </>
               )}

               {status === "no_token" && (
                  <>
                     <h2 className="auth-title">Reset link not valid.</h2>
                     <p className="auth-subtitle">
                        This link is missing, expired, or already used. Request
                        a new one to continue.
                     </p>
                     <div className="auth-error">
                        We couldn't verify this reset link.
                     </div>
                     <Link
                        to="/forgot-password"
                        className="btn-submit accent"
                        style={{ textDecoration: "none" }}
                     >
                        Request a reset link
                        <Icon size={14} strokeWidth={2.5}>
                           <line x1="5" y1="12" x2="19" y2="12" />
                           <polyline points="12 5 19 12 12 19" />
                        </Icon>
                     </Link>
                  </>
               )}

               {status === "check_failed" && (
                  <>
                     <h2 className="auth-title">Couldn't check that link.</h2>
                     <p className="auth-subtitle">
                        We couldn't reach the server. Your link is probably
                        fine — try again in a moment.
                     </p>
                     <button
                        type="button"
                        className="btn-submit accent"
                        onClick={() => setStatus("validating")}
                     >
                        Try again
                     </button>
                  </>
               )}

               {status === "success" && (
                  <>
                     <h2 className="auth-title">Password updated.</h2>
                     <p className="auth-subtitle">
                        You can sign in with your new password now. Other
                        devices have been signed out.
                     </p>
                     <div className="auth-banner">
                        All set — your password has been changed.
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

               {status === "form" && (
                  <form onSubmit={handleSubmit}>
                     <h2 className="auth-title">Set a new password</h2>
                     <p className="auth-subtitle">
                        At least 8 characters, with an uppercase letter, a
                        lowercase letter and a number.
                     </p>

                     <div className="field">
                        <label className="field-label">New password</label>
                        <div className="input-wrap">
                           <span className="lead-ic">
                              <Icon size={16} strokeWidth={2}>
                                 <rect
                                    x="3"
                                    y="11"
                                    width="18"
                                    height="11"
                                    rx="2"
                                 />
                                 <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </Icon>
                           </span>
                           <span
                              className="trail-ic"
                              onClick={() => setShowPassword((s) => !s)}
                           >
                              <Icon size={16} strokeWidth={2}>
                                 <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                 <circle cx="12" cy="12" r="3" />
                              </Icon>
                           </span>
                           <input
                              className="field-input has-lead has-trail"
                              type={showPassword ? "text" : "password"}
                              name="password"
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              minLength={8}
                              required
                           />
                        </div>
                     </div>

                     <div className="field">
                        <label className="field-label">Confirm password</label>
                        <div className="input-wrap">
                           <span className="lead-ic">
                              <Icon size={16} strokeWidth={2}>
                                 <rect
                                    x="3"
                                    y="11"
                                    width="18"
                                    height="11"
                                    rx="2"
                                 />
                                 <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </Icon>
                           </span>
                           <input
                              className="field-input has-lead"
                              type={showPassword ? "text" : "password"}
                              name="confirm"
                              placeholder="••••••••"
                              value={confirm}
                              onChange={(e) => setConfirm(e.target.value)}
                              minLength={8}
                              required
                           />
                        </div>
                     </div>

                     {error && <div className="auth-error">{error}</div>}

                     <button
                        type="submit"
                        className="btn-submit accent"
                        disabled={submitting}
                     >
                        {submitting ? (
                           <>
                              <Spinner size={16} />
                              Saving
                           </>
                        ) : (
                           <>
                              Save new password
                              <Icon size={14} strokeWidth={2.5}>
                                 <line x1="5" y1="12" x2="19" y2="12" />
                                 <polyline points="12 5 19 12 12 19" />
                              </Icon>
                           </>
                        )}
                     </button>

                     <div className="auth-foot">
                        Need a new link?
                        <Link to="/forgot-password">Request another</Link>
                     </div>
                  </form>
               )}
            </div>
         </section>
      </div>
   );
}

export default ResetPassword;

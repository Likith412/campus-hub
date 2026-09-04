import { useState } from "react";
import { Link } from "react-router";
import { authApi, errMessage } from "../services";
import Spinner from "../components/Spinner";
import Icon from "../components/Icon";
import AuthBrand from "../components/AuthBrand";

// Tiny inline SVG wrapper (same pattern as Login/Register/VerifyEmail).

const brandFeats = [
   {
      icon: (
         <>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
         </>
      ),
      title: "Magic reset link.",
      body: "Single-use, expires in 30 minutes. No new password to memorise yet.",
   },
   {
      icon: (
         <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
         </>
      ),
      title: "Sessions cleared.",
      body: "Resetting your password signs you out of all other devices.",
   },
   {
      icon: (
         <>
            <path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" />
            <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
         </>
      ),
      title: "Still stuck?",
      body: "Reach out to your faculty coordinator — they can re-issue access.",
   },
];

const stats = [
   { num: "30 min", label: "Link lifetime" },
   { num: "Single-use", label: "Tokens" },
];

// View state machine: 'form' → 'sent' after the server responds; network/5xx surfaces an
// inline error.
function ForgotPassword() {
   const [status, setStatus] = useState("form");
   const [email, setEmail] = useState("");
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState(null);

   const submitRequest = async () => {
      setError(null);
      setSubmitting(true);
      try {
         await authApi.forgotPassword(email);
         // 2xx — backend already applies anti-enumeration (same response whether the
         // account exists or not), so we just show the generic success card.
         setStatus("sent");
      } catch (err) {
         // Any error (validation, network, 5xx) is a real problem the user
         // needs to see — don't paper over it with a fake success.
         setError(
            errMessage(err, "We couldn't reach the server. Check your connection and try again."),
         );
      } finally {
         setSubmitting(false);
      }
   };

   const handleSubmit = (e) => {
      e.preventDefault();
      if (submitting) return;
      submitRequest();
   };

   return (
      <div className="auth-shell">
         <AuthBrand
            eyebrow="Account recovery"
            headline={
               <>
                  Locked out? <em>We've got you.</em>
               </>
            }
            sub="Enter the email you signed up with. We'll send a one-time reset link valid for 30 minutes. Your account, events, and certificates stay safe."
            feats={brandFeats}
            stats={stats}
         />

         <section className="auth-form-wrap">
            <div className="auth-form-top">
               Remembered it?<Link to="/login">Back to sign in</Link>
            </div>

            {status === "form" && (
               <form className="auth-form" onSubmit={handleSubmit}>
                  <h2 className="auth-title">Reset your password</h2>
                  <p className="auth-subtitle">
                     No worries. Type your email and we'll send a single-use
                     reset link.
                  </p>

                  <div className="field">
                     <label className="field-label">Institutional email</label>
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
                           value={email}
                           onChange={(e) => setEmail(e.target.value)}
                           required
                        />
                     </div>
                     <div className="field-help">
                        Use the same email you registered with. The link lasts
                        30 minutes and can be used once.
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
                           Sending
                        </>
                     ) : (
                        <>
                           Send reset link
                           <Icon size={14} strokeWidth={2.5}>
                              <line x1="22" y1="2" x2="11" y2="13" />
                              <polygon points="22 2 15 22 11 13 2 9 22 2" />
                           </Icon>
                        </>
                     )}
                  </button>

                  <div className="auth-foot">
                     New here?<Link to="/register">Create an account</Link>
                  </div>
               </form>
            )}

            {status === "sent" && (
               <div className="auth-form">
                  <div className="success-card">
                     <div className="success-ic">
                        <Icon size={18} strokeWidth={3}>
                           <polyline points="20 6 9 17 4 12" />
                        </Icon>
                     </div>
                     <div>
                        <div className="title">Check your inbox</div>
                        <div className="msg">
                           If an account exists for that email, a reset link is
                           on its way. Click it within 30 minutes to set a new
                           password.
                        </div>
                     </div>
                  </div>

                  <div className="resend-help">
                     <div className="resend-help-title">Didn't get it?</div>
                     <ul>
                        <li>Check spam, promotions, and updates folders</li>
                        <li>
                           Confirm the email is your <b>institutional</b>{" "}
                           address
                        </li>
                     </ul>
                  </div>

                  <div className="auth-foot">
                     Got the email?<Link to="/login">Back to sign in</Link>
                  </div>
               </div>
            )}
         </section>
      </div>
   );
}

export default ForgotPassword;

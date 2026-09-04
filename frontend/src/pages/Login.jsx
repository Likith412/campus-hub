import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { ApiError, errMessage } from "../services";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Spinner from "../components/Spinner";
import { redirectAfterLogin } from "../utils/nav";
import Icon from "../components/Icon";
import AuthBrand from "../components/AuthBrand";

// Tiny inline SVG wrapper for the small icons scattered through this page.

const brandFeats = [
   {
      icon: (
         <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21 12 17.77 5.82 21 7 14.14 2 9.27 8.91 8.26" />
      ),
      title: "One place to look.",
      body: "Every workshop, contest and hackathon running across campus, in one feed.",
   },
   {
      icon: (
         <>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
         </>
      ),
      title: "Live contests.",
      body: "Multi-language judge, real-time leaderboards, ELO-style ratings.",
   },
   {
      icon: (
         <>
            <circle cx="12" cy="8" r="7" />
            <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
         </>
      ),
      title: "Verified certificates.",
      body: "QR-signed, recruiter-ready, shareable to LinkedIn in one tap.",
   },
];

function Login() {
   const navigate = useNavigate();
   const location = useLocation();
   const { login } = useAuth();
   const toast = useToast();
   // Hints passed in router state: from Register (just signed up) or from ProtectedRoute (deep link).
   const justRegistered = location.state?.justRegistered === true;
   const redirectTo = redirectAfterLogin(location.state);

   const [formData, setFormData] = useState({
      email: location.state?.email ?? "",
      password: "",
   });
   const [showPassword, setShowPassword] = useState(false);
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState(null);
   // 403 on login means the account exists but the email isn't verified — offer a resend link.
   const [unverified, setUnverified] = useState(false);

   const handleChange = (e) => {
      const { name, value, type, checked } = e.target;
      setFormData((prev) => ({
         ...prev,
         [name]: type === "checkbox" ? checked : value,
      }));
   };

   const handleSubmit = async (e) => {
      e.preventDefault();
      if (submitting) return; // guard against double-submit while a request is in-flight
      setError(null);
      setUnverified(false);
      setSubmitting(true);
      try {
         await login({
            email: formData.email,
            password: formData.password,
         });
         toast.success("Welcome back");
         // replace: don't add /login to history — back button should bypass it.
         navigate(redirectTo, { replace: true });
      } catch (err) {
         setError(
            errMessage(err, "Something went wrong"),
         );
         setUnverified(err instanceof ApiError && err.status === 403);
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div className="auth-shell">
         <AuthBrand
            headline={
               <>
                  Your campus, <em>all in one place</em>.
               </>
            }
            sub="Discover events, run clubs, contest with peers, earn verified certificates — all in one place."
            feats={brandFeats}
         />

         <section className="auth-form-wrap">
            <div className="auth-form-top">
               New to Campus Hub?<Link to="/register">Create an account</Link>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
               <h2 className="auth-title">Sign in to your account</h2>
               <p className="auth-subtitle">
                  Use your institutional email to continue.
               </p>

               {justRegistered && (
                  <div className="auth-banner">
                     Account created — check your inbox to verify your email
                     before signing in.
                     <Link
                        className="auth-inline-link"
                        to="/verify-email"
                        state={{ email: formData.email }}
                     >
                        Didn't get it? Resend
                     </Link>
                  </div>
               )}

               <div className="field">
                  <label className="field-label">Email</label>
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
                        value={formData.email}
                        onChange={handleChange}
                        required
                     />
                  </div>
               </div>

               <div className="field">
                  <label className="field-label">
                     Password
                     <Link className="label-hint" to="/forgot-password">
                        Forgot password?
                     </Link>
                  </label>
                  <div className="input-wrap">
                     <span className="lead-ic">
                        <Icon size={16} strokeWidth={2}>
                           <rect x="3" y="11" width="18" height="11" rx="2" />
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
                        value={formData.password}
                        onChange={handleChange}
                        required
                     />
                  </div>
               </div>

               {error && (
                  <div className="auth-error">
                     {error}
                     {unverified && (
                        <Link
                           className="auth-inline-link"
                           to="/verify-email"
                           state={{ email: formData.email }}
                        >
                           Resend verification email
                        </Link>
                     )}
                  </div>
               )}

               <button
                  type="submit"
                  className="btn-submit accent"
                  disabled={submitting}
               >
                  {submitting ? (
                     <>
                        <Spinner size={16} />
                        Signing in
                     </>
                  ) : (
                     <>
                        Sign in
                        <Icon size={14} strokeWidth={2.5}>
                           <line x1="5" y1="12" x2="19" y2="12" />
                           <polyline points="12 5 19 12 12 19" />
                        </Icon>
                     </>
                  )}
               </button>
            </form>
         </section>
      </div>
   );
}

export default Login;

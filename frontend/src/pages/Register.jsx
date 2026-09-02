import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authApi, ApiError } from "../services";
import { useToast } from "../contexts/ToastContext";
import Spinner from "../components/Spinner";

// Tiny inline SVG wrapper for the small icons scattered through this page.
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

const strengthLabels = ["—", "Weak", "Fair", "Good", "Strong"];

// Score 0–4 used by the strength meter — purely cosmetic; backend enforces its own rules.
const scorePassword = (v) => {
   let s = 0;
   if (v.length >= 8) s++;
   if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
   if (/\d/.test(v)) s++;
   if (/[^A-Za-z0-9]/.test(v)) s++;
   return s;
};

const brandFeats = [
   {
      icon: <polyline points="20 6 9 17 4 12" />,
      title: "Verified by institute.",
      body: ".edu.in email confirms you, no admin gatekeeping.",
   },
   {
      icon: (
         <>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
         </>
      ),
      title: "Start as a student.",
      body: "Apply to lead a club or coordinate an event later from your profile.",
   },
   {
      icon: (
         <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
         </>
      ),
      title: "Privacy-first.",
      body: "Your data never leaves your campus tenant.",
   },
];

function Register() {
   const [formData, setFormData] = useState({
      fullName: "",
      email: "",
      password: "",
   });

   const [showPassword, setShowPassword] = useState(false);
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState(null);
   const navigate = useNavigate();
   const toast = useToast();

   const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
   };

   const handleSubmit = async (e) => {
      e.preventDefault();
      if (submitting) return; // guard against double-submit while a request is in-flight
      setError(null);
      setSubmitting(true);
      try {
         await authApi.register({
            email: formData.email,
            password: formData.password,
            name: formData.fullName,
         });
         toast.success("Account created — check your inbox to verify your email");
         // Hand off to Login with a banner + pre-filled email (no auto-login: email must be verified).
         navigate("/login", {
            state: { justRegistered: true, email: formData.email },
         });
      } catch (err) {
         setError(
            err instanceof ApiError ? err.message : "Something went wrong",
         );
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div className="auth-shell">
         <aside className="auth-brand">
            <div className="brand-top">
               <div className="brand-mark-big">C</div>
               <div className="brand-name-big">
                  Campus Hub
               </div>
            </div>

            <div className="brand-content">
               <div className="brand-eyebrow">
                  <span className="pulse"></span>Join your campus
               </div>
               <h1 className="brand-headline">
                  One profile. <em>Every event, club, contest.</em>
               </h1>
               <p className="brand-sub">
                  Sign up once with your institutional email — we'll auto-link
                  you to your department, year, and the clubs already at your
                  campus.
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
               <div>
                  <div className="stat-num">12 sec</div>
                  <div>Avg signup</div>
               </div>
               <div className="stat-divider"></div>
               <div>
                  <div className="stat-num">100%</div>
                  <div>Verified</div>
               </div>
               <div className="stat-divider"></div>
               <div>
                  <div className="stat-num">SOC&nbsp;2</div>
                  <div>Compliant</div>
               </div>
            </div>
         </aside>

         <section className="auth-form-wrap">
            <div className="auth-form-top">
               Already have an account?<Link to="/login">Sign in</Link>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
               <h2 className="auth-title">Create your account</h2>
               <p className="auth-subtitle">
                  Takes ~12 seconds. You can change everything later.
               </p>

               <div className="field">
                  <label className="field-label">Full name</label>
                  <div className="input-wrap">
                     <input
                        className="field-input"
                        type="text"
                        name="fullName"
                        placeholder="Arjun Sharma"
                        value={formData.fullName}
                        onChange={handleChange}
                        required
                     />
                  </div>
               </div>

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
                        value={formData.email}
                        onChange={handleChange}
                        required
                     />
                  </div>
                  <div className="field-help">
                     We'll send a verification code to confirm your campus.
                  </div>
               </div>

               <div className="field">
                  <label className="field-label">Password</label>
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
                        placeholder="At least 8 characters"
                        value={formData.password}
                        onChange={handleChange}
                        required
                     />
                  </div>
                  <div
                     className="pw-meter"
                     data-strength={scorePassword(formData.password)}
                  >
                     <span></span>
                     <span></span>
                     <span></span>
                     <span></span>
                  </div>
                  <div className="pw-meter-label">
                     Strength:{" "}
                     <b>{strengthLabels[scorePassword(formData.password)]}</b> ·
                     use letters, numbers, &amp; symbols
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
                        Creating account
                     </>
                  ) : (
                     <>
                        Create account
                        <Icon strokeWidth={2.5}>
                           <line x1="5" y1="12" x2="19" y2="12" />
                           <polyline points="12 5 19 12 12 19" />
                        </Icon>
                     </>
                  )}
               </button>

               <div className="auth-foot">
                  Already verified?<Link to="/login">Sign in instead</Link>
               </div>
            </form>
         </section>
      </div>
   );
}

export default Register;

import { Link, useNavigate } from "react-router";

function NotFound() {
   const navigate = useNavigate();

   return (
      <div className="nf-shell">
         <div className="nf-card">
            <div className="nf-code">404</div>
            <h1 className="nf-title">Page not found</h1>
            <p className="nf-sub">
               The page you're looking for doesn't exist, was moved, or the link
               you followed is broken.
            </p>
            <div className="nf-actions">
               <button
                  type="button"
                  className="nf-btn primary"
                  onClick={() => navigate("/", { replace: true })}
               >
                  Go home
               </button>
               <button
                  type="button"
                  className="nf-btn ghost"
                  onClick={() => navigate(-1)}
               >
                  Go back
               </button>
            </div>
            <div className="nf-foot">
               Or <Link to="/login">sign in</Link> to your account.
            </div>
         </div>
      </div>
   );
}

export default NotFound;

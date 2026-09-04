import { Fragment } from "react";
import Icon from "./Icon";

// The branded aside on every auth screen. Each page supplies its own copy; the
// eyebrow and the footer stats are optional (only the recovery flows carry them).
export default function AuthBrand({ eyebrow, headline, sub, feats = [], stats }) {
   return (
      <aside className="auth-brand">
         <div className="brand-top">
            <div className="brand-mark-big">C</div>
            <div className="brand-name-big">Campus Hub</div>
         </div>

         <div className="brand-content">
            {eyebrow && (
               <div className="brand-eyebrow">
                  <span className="pulse"></span>
                  {eyebrow}
               </div>
            )}
            <h1 className="brand-headline">{headline}</h1>
            <p className="brand-sub">{sub}</p>

            <ul className="brand-feats">
               {feats.map(({ icon, title, body }) => (
                  <li key={title} className="brand-feat">
                     <div className="feat-ic">
                        <Icon size={14} strokeWidth={2.2}>
                           {icon}
                        </Icon>
                     </div>
                     <div>
                        <b>{title}</b> {body}
                     </div>
                  </li>
               ))}
            </ul>
         </div>

         {stats?.length > 0 && (
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
         )}
      </aside>
   );
}

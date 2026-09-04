// One headline figure on an admin table page — icon, label, and the number (or a
// skeleton while it loads).
export default function StatCard({ tone, label, value, loading, children }) {
   return (
      <div className="fac-stat">
         <div className={`fac-stat-ic ${tone}`}>{children}</div>
         <div>
            <div className="fac-stat-label">{label}</div>
            <div className="fac-stat-value">
               {loading ? <span className="skeleton fac-stat-skel" /> : value}
            </div>
         </div>
      </div>
   );
}

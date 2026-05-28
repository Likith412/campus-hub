// Reusable page navigator with an optional per-page selector.
export default function Pagination({
   page,
   totalPages,
   perPage,
   perPageOptions,
   onPerPageChange,
   hasMore,
   onChange,
}) {
   const showNav = totalPages > 1;
   const showPerPage =
      typeof onPerPageChange === "function" && perPageOptions?.length > 0;
   if (!showNav && !showPerPage) return null;

   const canPrev = page > 1;
   const canNext = hasMore ?? page < totalPages;

   return (
      <div className="pagination">
         <div className="page-info">
            <span>
               Page <b>{page}</b> of <b>{totalPages}</b>
            </span>
            {showPerPage && (
               <label className="page-size">
                  Show
                  <select
                     value={perPage}
                     onChange={(e) => onPerPageChange(Number(e.target.value))}
                  >
                     {perPageOptions.map((n) => (
                        <option key={n} value={n}>
                           {n}
                        </option>
                     ))}
                  </select>
                  per page
               </label>
            )}
         </div>
         {showNav && (
            <div className="page-controls">
               <button
                  type="button"
                  className="page-btn"
                  disabled={!canPrev}
                  onClick={() => onChange(Math.max(1, page - 1))}
               >
                  ‹
               </button>
               {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                     type="button"
                     key={n}
                     className={`page-btn${n === page ? " active" : ""}`}
                     onClick={() => onChange(n)}
                  >
                     {n}
                  </button>
               ))}
               <button
                  type="button"
                  className="page-btn"
                  disabled={!canNext}
                  onClick={() => onChange(page + 1)}
               >
                  ›
               </button>
            </div>
         )}
      </div>
   );
}

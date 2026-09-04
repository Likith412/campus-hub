import { PAGE_SIZE_OPTIONS } from "../utils/pagination";

// The footer under every admin table: the visible range, a per-page selector and a
// numbered pager. Faculty, AllStudents and AllClubs all render exactly this.
export default function TableFooter({
   page,
   perPage,
   totalPages,
   pagination,
   shown,
   onPage,
   onPerPage,
   perPageOptions = PAGE_SIZE_OPTIONS,
}) {
   // From the response rather than live state, so the range doesn't lie mid-refetch.
   const rangeStart = pagination?.total
      ? (pagination.page - 1) * pagination.limit + 1
      : 0;
   const rangeEnd = pagination ? rangeStart + shown - 1 : 0;

   return (
      <div className="fac-table-foot">
         <div className="fac-foot-left">
            <div className="fac-page-info">
               Showing{" "}
               <b>
                  {rangeStart}–{rangeEnd}
               </b>{" "}
               of <b>{pagination?.total ?? 0}</b>
            </div>
            <label className="page-size">
               Show
               <select
                  value={perPage}
                  onChange={(e) => onPerPage(Number(e.target.value))}
               >
                  {perPageOptions.map((n) => (
                     <option key={n} value={n}>
                        {n}
                     </option>
                  ))}
               </select>
               per page
            </label>
         </div>
         <div className="fac-page-ctrl">
            <button
               type="button"
               className="fac-pg"
               disabled={page <= 1}
               onClick={() => onPage(Math.max(1, page - 1))}
            >
               ‹ Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
               <button
                  type="button"
                  key={n}
                  className={`fac-pg${n === page ? " active" : ""}`}
                  onClick={() => onPage(n)}
               >
                  {n}
               </button>
            ))}
            <button
               type="button"
               className="fac-pg"
               disabled={!(pagination?.hasMore ?? page < totalPages)}
               onClick={() => onPage(page + 1)}
            >
               Next ›
            </button>
         </div>
      </div>
   );
}

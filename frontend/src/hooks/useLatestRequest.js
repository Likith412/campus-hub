import { useCallback, useRef } from "react";

// Guards a list page against out-of-order responses. Call it when a fetch starts; the
// returned check is false once a newer fetch has begun, so a slow earlier response
// can't overwrite the newer filter's results.
//
//   const startRequest = useLatestRequest();
//   const isCurrent = startRequest();
//   api.list().then((d) => { if (isCurrent()) setData(d); });
export default function useLatestRequest() {
   const idRef = useRef(0);
   return useCallback(() => {
      const id = ++idRef.current;
      return () => id === idRef.current;
   }, []);
}

import { useEffect, useState } from "react";

// Trailing-edge debounce for search boxes: the returned value only catches up once
// typing pauses, so a list page fetches once instead of once per keystroke.
export default function useDebounced(value, delay = 300) {
   const [settled, setSettled] = useState(value);
   useEffect(() => {
      const id = setTimeout(() => setSettled(value), delay);
      return () => clearTimeout(id);
   }, [value, delay]);
   return settled;
}

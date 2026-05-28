import {
   createContext,
   useCallback,
   useContext,
   useRef,
   useState,
} from "react";
import ConfirmModal from "../components/ConfirmModal";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
   const [options, setOptions] = useState(null);
   const resolveRef = useRef(null);

   const confirm = useCallback((opts = {}) => {
      const config = typeof opts === "string" ? { message: opts } : opts;
      return new Promise((resolve) => {
         resolveRef.current = resolve;
         setOptions(config);
      });
   }, []);

   const close = useCallback((result) => {
      resolveRef.current?.(result);
      resolveRef.current = null;
      setOptions(null);
   }, []);

   return (
      <ConfirmContext.Provider value={confirm}>
         {children}
         <ConfirmModal
            open={options !== null}
            {...options}
            onConfirm={() => close(true)}
            onCancel={() => close(false)}
         />
      </ConfirmContext.Provider>
   );
}

export function useConfirm() {
   const ctx = useContext(ConfirmContext);
   if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
   return ctx;
}

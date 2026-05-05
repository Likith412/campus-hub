import { useEffect, useState } from "react";
import "./App.css";

function App() {
   const [count, setCount] = useState(0);
   const [message, setMessage] = useState("");

   const fetchMessage = async () => {
      const response = await fetch("http://localhost:8000/");
      const data = await response.json();
      setMessage(data.message);
   };

   useEffect(() => {
      (async () => {
         await fetchMessage();
      })();
   }, []);

   return (
      <div>
         <h1>
            {message} * {count}
         </h1>
         <button onClick={() => setCount((count) => count + 1)}>
            increase
         </button>
      </div>
   );
}

export default App;

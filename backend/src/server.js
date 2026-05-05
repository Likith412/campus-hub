const http = require("http");
const dotenv = require("dotenv");

dotenv.config();

const app = require("./app");
const server = http.createServer(app);

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
   console.log(`Server is running on http://localhost:${PORT}`);
});

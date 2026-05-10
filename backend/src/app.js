const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const routes = require("./routes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(
   cors({
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true,
   }),
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.get("/", (_req, res) => {
   res.send({ message: "CampusHub API" });
});

app.use("/api", routes);

app.use(errorHandler);

module.exports = app;

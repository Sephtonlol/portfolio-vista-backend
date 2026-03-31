import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import router from "./routes/app.routes.js";

const PORT = process.env.APP_PORT ? Number(process.env.APP_PORT) : 3000;
if (Number.isNaN(PORT)) throw new Error("APP_PORT must be a number");
const app = express();

app.use(
  cors({
    origin: process.env.APP_BASE_URL, // Frontend rest-api
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.use("/api", router);

app.listen(PORT, () => {
  console.log("App listening on PORT", PORT);
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/app.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const PORT = process.env.APP_PORT ? Number(process.env.APP_PORT) : 3000;
if (Number.isNaN(PORT)) throw new Error("APP_PORT must be a number");
const app = express();

// Payload size limits (default Express body-parser limit is ~100kb).
// Configure via env var APP_BODY_LIMIT, e.g. "50mb".
const BODY_LIMIT = process.env.APP_BODY_LIMIT ?? "50mb";

app.use(
  cors({
    origin: process.env.APP_BASE_URL, // Frontend rest-api
  }),
);

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use("/uploads", express.static(path.resolve(PROJECT_ROOT, "uploads")));

app.use("/api", router);

app.listen(PORT, () => {
  console.log("App listening on PORT", PORT);
});

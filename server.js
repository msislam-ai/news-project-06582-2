// server.js  (ESM version – works when package.json has "type": "module")
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { startDailyManager } from "./services/dailyManager.js";

dotenv.config();

// ── __dirname shim for ESM ─────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ────────────────────────────────────────────────────────────────────────────────

const app = express();

/* ====================== CORS (Vercel + local) ============================= */
const allowList = new Set([
  "http://localhost:5173",
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
]);

// Vercel preview URLs look like:
// https://exciting-aj-git-branch-username.vercel.app
const vercelPreview = /^https:\/\/exciting-aj(-[\w-]+)?\.vercel\.app$/;

const corsOptions = {
  origin(origin, cb) {
    // No Origin header → server‑to‑server or curl → allow
    if (!origin) return cb(null, true);

    if (allowList.has(origin) || vercelPreview.test(origin))
      return cb(null, true);

    // Reject – the header simply won’t be added
    return cb(null, false);
  },
  credentials: true, // needed only if you send cookies / auth headers
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // pre‑flight for every route

/* ====================== Middleware ====================================== */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ====================== Public folder (if you have one) ================ */
// Example: serve static images uploaded by the aggregator
// app.use("/static", express.static(path.join(__dirname, "public")));

 /* ====================== Routes ========================================= */
app.get("/", (req, res) => {
  res.send("AI News Backend Running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/news", newsRoutes);

/* ====================== Error handling ================================ */
app.use((err, req, res, next) => {
  console.error("❌ Error:", err?.stack || err);
  const status = err?.statusCode ?? 500;
  res.status(status).json({ error: err?.message ?? "Internal Server Error" });
});

/* ====================== Server start ================================== */
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();               // ← your MongoDB (or other) connection
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on http://localhost:${PORT}`);

      // ---- background jobs (fire‑and‑forget) ---------------------------
      fetchAndSaveAllNews().catch((e) =>
        console.error("⚡ fetchAndSaveAllNews failed:", e)
      );
      try {
        startAutoNewsUpdater();
      } catch (e) {
        console.error("⚡ startAutoNewsUpdater failed:", e);
      }
      try {
        startDailyManager();
      } catch (e) {
        console.error("⚡ startDailyManager failed:", e);
      }
    });
  } catch (e) {
    console.error("💥 Server startup error:", e);
    process.exit(1);
  }
}

startServer();

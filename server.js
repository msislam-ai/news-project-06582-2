// server.js (or index.js) — Express backend with robust CORS for Vercel + previews

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { startDailyManager } from "./services/dailyManager.js";

dotenv.config();

const app = express();

/* ======================
   CORS (Vercel + local)
====================== */

const allowList = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
]);

// Allow Vercel preview deployments too:
// e.g. https://exciting-aj-git-branch-username.vercel.app
const vercelPreview = /^https:\/\/exciting-aj(-[\w-]+)?\.vercel\.app$/;

const corsOptions = {
  origin(origin, cb) {
    // Allow server-to-server requests or curl (no Origin header)
    if (!origin) return cb(null, true);

    if (allowList.has(origin) || vercelPreview.test(origin)) return cb(null, true);

    // Not allowed: no CORS headers will be added
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Ensure preflight requests are handled for all routes
app.options("*", cors(corsOptions));

/* ======================
   Middleware
====================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ======================
   Routes
====================== */
app.get("/", (req, res) => {
  res.send("AI News Backend Running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/news", newsRoutes);

/* ======================
   Error Handling
====================== */
app.use((err, req, res, next) => {
  console.error(err?.stack || err);
  res.status(500).json({ error: err?.message || "Internal Server Error" });
});

/* ======================
   Start Server
====================== */
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);

      // Run background jobs (don’t crash server if one fails)
      fetchAndSaveAllNews().catch((e) =>
        console.error("fetchAndSaveAllNews failed:", e)
      );
      try {
        startAutoNewsUpdater();
      } catch (e) {
        console.error("startAutoNewsUpdater failed:", e);
      }
      try {
        startDailyManager();
      } catch (e) {
        console.error("startDailyManager failed:", e);
      }
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();

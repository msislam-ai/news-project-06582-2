import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";

import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { manageData } from "./utils/manageData.js"; // directly import manageData

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// ===== Middleware =====
app.use(
  helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } })
);
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ===== CORS =====
const allowedOrigins = [
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
  "https://exciting-aj-git-main-sadekul-islams-projects-ba35ed38.vercel.app",
  "https://exciting-bw2ssdxkn-sadekul-islams-projects-ba35ed38.vercel.app",
  "http://localhost:3000",
  "https://exciting-aj-sadekul-islams-projects-ba35ed38.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

// ===== Routes =====
app.get("/", (req, res) => res.send("AI News Backend Running 🚀"));
app.get("/health", (req, res) =>
  res.json({ status: "OK", timestamp: new Date().toISOString() })
);
app.use("/news", newsRoutes);

// ===== Error handling =====
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

// ===== Server + Daily Manager Integration =====
async function startServer() {
  try {
    // Connect to DB
    await connectDB();

    // Fetch and save initial news
    await fetchAndSaveAllNews();

    // Run manageData immediately on server start
    console.log("🧠 Running initial news categorization...");
    await manageData();

    // Start auto news updater
    startAutoNewsUpdater();

    // Schedule daily manager (every 24h using simple interval)
    setInterval(async () => {
      console.log("🧠 Running daily news manager...");
      try {
        await manageData();
        console.log("✅ Daily news manager completed");
      } catch (err) {
        console.error("❌ Daily manager error:", err);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Start server
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Server failed:", err);
    process.exit(1);
  }
}

startServer();

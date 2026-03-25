// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";

import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { startDailyManager } from "./services/dailyManager.js";

dotenv.config();

const app = express();

// ✅ CRITICAL: Use Render's PORT env var (NOT hardcoded 5000)
const PORT = process.env.PORT || 5000;

// ================= SYSTEM STATUS =================
const systemStatus = {
  db: false,
  initialFetch: false,
  autoUpdater: false,
  dailyManager: false,
};

// ================= MIDDLEWARE =================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ================= CORS =================
const allowedOrigins = [
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
  "https://exciting-aj-git-main-sadekul-islams-projects-ba35ed38.vercel.app",
  "https://exciting-bw2ssdxkn-sadekul-islams-projects-ba35ed38.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "https://exciting-aj-sadekul-islams-projects-ba35ed38.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const trimmedOrigin = origin.trim();
      if (allowedOrigins.includes(trimmedOrigin)) {
        return callback(null, true);
      }
      console.warn(`⚠️ CORS blocked: ${origin}`);
      return callback(new Error("CORS policy blocked this request"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// ✅ Handle preflight OPTIONS requests
app.options("*", cors());

// ================= ROUTES =================
app.get("/", (req, res) => {
  res.json({ 
    message: "AI News Backend Running 🚀",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      news: "/news",
      newsAll: "/news/all",
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get("/system-status", (req, res) => {
  res.json({
    ...systemStatus,
    serverTime: new Date().toISOString(),
  });
});

// ✅ Mount news routes at /news (matches frontend calls)
app.use("/news", newsRoutes);

// ================= ERROR HANDLING =================
app.use((req, res, next) => {
  console.warn(`⚠️ 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false, 
    error: "Route not found",
    path: req.originalUrl,
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", {
    message: err.message,
    path: req.path,
    method: req.method,
  });
  res.status(err.status || 500).json({ 
    success: false, 
    error: err.message || "Internal Server Error",
  });
});

// ================= START SERVER =================
async function startServer() {
  try {
    console.log("🔌 Connecting to DB...");
    await connectDB();
    systemStatus.db = true;
    console.log("✅ Database connected");

    console.log("📰 Fetching initial news...");
    await fetchAndSaveAllNews();
    systemStatus.initialFetch = true;
    console.log("✅ Initial news fetched");

    console.log("🔁 Starting auto news updater...");
    startAutoNewsUpdater();
    systemStatus.autoUpdater = true;

    console.log("📅 Starting daily manager...");
    startDailyManager();
    systemStatus.dailyManager = true;

    // ✅ LISTEN with proper error handling for EADDRINUSE
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Health: http://localhost:${PORT}/health`);
      console.log(`📰 API: http://localhost:${PORT}/news/all`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // ✅ Handle EADDRINUSE error gracefully
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use`);
        console.log("💡 This is normal on Render during restarts. Waiting for port release...");
        
        // Wait 2 seconds then retry (Render will assign a new PORT anyway)
        setTimeout(() => {
          console.log("🔄 Retrying server start...");
          // On Render, process.env.PORT will be different on retry
          app.listen(process.env.PORT || 5001, () => {
            console.log(`🚀 Server running on port ${process.env.PORT || 5001}`);
          });
        }, 2000);
      } else {
        console.error("❌ Server error:", err);
        process.exit(1);
      }
    });

    // ✅ Graceful shutdown for Render deployments
    const gracefulShutdown = (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log("🔌 HTTP server closed");
        process.exit(0);
      });
      
      // Force exit after 10 seconds if graceful shutdown fails
      setTimeout(() => {
        console.error("❌ Could not close connections in time, forcefully shutting down");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  } catch (err) {
    console.error("❌ Server failed to start:", err);
    process.exit(1);
  }
}

// ================= UNHANDLED ERRORS =================
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err);
  // Don't exit on Render - let it handle restarts
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

// ================= START =================
startServer();

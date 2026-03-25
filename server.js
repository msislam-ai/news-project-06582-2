// server.js
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
const PORT = process.env.PORT || 5000; // ✅ Fixed: const, not let (no reassignment needed)

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
// ✅ FIXED: Removed trailing spaces from all origins!
const allowedOrigins = [
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
  "https://exciting-aj-git-main-sadekul-islams-projects-ba35ed38.vercel.app",
  "https://exciting-bw2ssdxkn-sadekul-islams-projects-ba35ed38.vercel.app",
  "http://localhost:3000",
  "https://exciting-aj-sadekul-islams-projects-ba35ed38.vercel.app",
  "http://localhost:5173", // ✅ Added Vite default port
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Log blocked origin for debugging
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      return callback(new Error("CORS policy blocked this request"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// ✅ Explicitly handle preflight OPTIONS requests
app.options("*", cors());

// ================= ROUTES =================
app.get("/", (req, res) => {
  res.json({ 
    message: "AI News Backend Running 🚀",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      systemStatus: "/system-status",
      news: "/news",
      newsAll: "/news/all",
      newsById: "/news/:id",
      update: "POST /news/update"
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
    environment: process.env.NODE_ENV || "development",
  });
});

// ✅ Mount news routes at /news (matches frontend calls to /news/all)
app.use("/news", newsRoutes);

// ================= ERROR HANDLING =================
// ✅ 404 Handler - must come AFTER all routes
app.use((req, res, next) => {
  console.warn(`⚠️ 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false, 
    error: "Route not found",
    path: req.originalUrl,
    method: req.method
  });
});

// ✅ Global Error Handler - MUST have 4 parameters (err, req, res, next)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
    body: process.env.NODE_ENV === "development" ? req.body : undefined
  });
  
  // MongoDB duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({ 
      success: false, 
      error: "Duplicate entry",
      field: Object.keys(err.keyPattern)[0]
    });
  }
  
  // MongoDB validation error
  if (err.name === "ValidationError") {
    return res.status(400).json({ 
      success: false, 
      error: "Validation failed",
      details: Object.values(err.errors).map(e => e.message)
    });
  }
  
  // Default error response
  res.status(err.status || 500).json({ 
    success: false, 
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
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
    console.log("✅ Initial news fetched & saved");

    console.log("🔁 Starting auto news updater...");
    startAutoNewsUpdater();
    systemStatus.autoUpdater = true;
    console.log("✅ Auto news updater started");

    console.log("📅 Starting daily manager...");
    startDailyManager();
    systemStatus.dailyManager = true;
    console.log("✅ Daily manager started");

    // ================= LISTEN =================
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
      console.log(`📰 News API: http://localhost:${PORT}/news/all`);
    });
    
  } catch (err) {
    console.error("❌ Server failed to start:", err);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err);
  // Don't exit in production, but log the error
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

startServer();

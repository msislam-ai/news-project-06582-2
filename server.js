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
const PORT = process.env.PORT || 5000;

// ======================
// CORS - MUST BE FIRST
// ======================
app.use(cors({
  origin: "*",  // Allow all for now - restrict later
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Preflight handling
app.options('*', cors());

// ======================
// MIDDLEWARE
// ======================
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ======================
// ROUTES
// ======================
app.get("/", (req, res) => {
  res.send("AI News Backend Running 🚀");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Debug route to check CORS
app.get("/test-cors", (req, res) => {
  res.json({ 
    message: "CORS working!", 
    origin: req.headers.origin,
    headers: req.headers
  });
});

app.use("/news", newsRoutes);

// ======================
// ERROR HANDLING
// ======================
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error"
  });
});

// ======================
// START SERVER
// ======================
async function startServer() {
  try {
    // 1️⃣ Connect to MongoDB
    await connectDB();
    console.log("✅ Database connected!");

    // 2️⃣ Initial fetch & start schedulers
    await fetchAndSaveAllNews();
    startAutoNewsUpdater();
    startDailyManager();

    // 3️⃣ Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
}

startServer();

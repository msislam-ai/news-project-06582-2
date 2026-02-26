// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { startDailyManager } from "./services/dailyManager.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ======================
// Middleware
// ======================
app.use(express.json());

// Production-safe CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173", // frontend URL from .env
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Preflight requests handler (fixed PathError)
app.options("/", cors());
app.options("/news/*", cors());

// ======================
// Routes
// ======================
app.use("/news", newsRoutes);

app.get("/", (req, res) => {
  res.send("AI News Backend Running");
});

// ======================
// Start Server
// ======================
async function startServer() {
  try {
    // 1️⃣ Connect DB first
    await connectDB();
    console.log("✅ MongoDB Connected");

    // 2️⃣ Start server
    app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);

      // 3️⃣ Initial news fetch
      await fetchAndSaveAllNews();

      // 4️⃣ Start schedulers
      startAutoNewsUpdater();
      startDailyManager();
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
  }
}

// Start the server
startServer();

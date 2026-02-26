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

// Standard CORS for all normal requests
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Preflight handler for all routes (OPTION 2 - robust)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header(
      "Access-Control-Allow-Origin",
      process.env.CLIENT_URL || "http://localhost:5173"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization"
    );
    return res.sendStatus(200);
  }
  next();
});

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
    // Connect to MongoDB first
    await connectDB();
    console.log("✅ MongoDB Connected");

    // Start server
    app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);

      // Initial news fetch
      await fetchAndSaveAllNews();

      // Start schedulers
      startAutoNewsUpdater();
      startDailyManager();
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
  }
}

// Start the backend
startServer();

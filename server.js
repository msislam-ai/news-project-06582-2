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

/* ======================
   Middleware
====================== */
app.use(express.json());

// CORS setup (allow only specific origins)
const allowedOrigins = [
  "http://localhost:3000",
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed for this origin"));
      }
    },
  })
);

/* ======================
   Routes
====================== */
app.use("/news", newsRoutes);

app.get("/", (req, res) => {
  res.send("AI News Backend Running 🚀");
});

/* ======================
   Global Error Handler
====================== */
app.use((err, req, res, next) => {
  console.error("Global Error:", err.stack || err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

/* ======================
   Start Server
====================== */
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1️⃣ Connect to database
    await connectDB();

    // 2️⃣ Start Express server
    app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);

      try {
        // 3️⃣ Initial fetch of news
        await fetchAndSaveAllNews();
        console.log("✅ Initial news fetch completed");

        // 4️⃣ Start automatic news updater
        startAutoNewsUpdater();
        console.log("⏱️ Auto news updater started");

        // 5️⃣ Start daily DB manager
        startDailyManager();
        console.log("🗓️ Daily manager started");
      } catch (serviceError) {
        console.error("Error in background services:", serviceError);
      }
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1); // exit process if startup fails
  }
}

// Run server
startServer();

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { startDailyManager } from "./services/dailyManager.js";

// ======================
// Load ENV
// ======================
dotenv.config();

const app = express();

// ======================
// Middleware
// ======================

// JSON parser
app.use(express.json());

// ✅ PRODUCTION CORS (IMPORTANT)
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow Postman / server requests
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ✅ Handle preflight requests
app.options("*", cors());

// ======================
// Routes
// ======================

app.use("/news", newsRoutes);

app.get("/", (req, res) => {
  res.send("🚀 AI News Backend Running");
});

// ======================
// Start Server
// ======================

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1️⃣ Connect MongoDB
    await connectDB();

    // 2️⃣ Start Express Server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    // 3️⃣ Background Services (NON-BLOCKING)
    fetchAndSaveAllNews();
    startAutoNewsUpdater();
    startDailyManager();

  } catch (error) {
    console.error("❌ Server startup failed:", error);
  }
}

startServer();

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { manageData } from "./utils/manageData.js"; 
import { startDailyManager } from "./services/dailyManager.js";

// Load ENV first
dotenv.config();

const app = express();



/* ======================
   Middleware
====================== */

app.use(express.json());

const allowedOrigins = [
  "http://localhost:3000",
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));

// ✅ Handle OPTIONS preflight for all routes
app.options("*", cors());
/* ======================
   Routes
====================== */

app.use("/news", newsRoutes);

app.get("/", (req, res) => {
  res.send("AI News Backend Running");
});

/* ======================
   Start Server
====================== */


const PORT = process.env.PORT || 5000;

async function startServer() {
  try {

    // 1️⃣ Connect DB first
    await connectDB();

    // 2️⃣ Start server
    app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);

      // 3️⃣ Initial fetch
      await fetchAndSaveAllNews();

      // 4️⃣ Start scheduler
      startAutoNewsUpdater();

        // Daily DB cleanup + recategorization
       startDailyManager();
    });

  } catch (error) {
    console.error("Server startup failed:", error);
  }
}

startServer();



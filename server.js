import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { manageData } from "./utils/manageData.js"; 
import { startDailyManager } from "./services/dailyManager.js";

dotenv.config();

const app = express();

/* ======================
   CORS - Pick ONE approach
====================== */

// ✅ Option A: Using just the cors package (RECOMMENDED)
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://exciting-aj.vercel.app",
    "https://j34vsk-5173.csb.app"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/* ======================
   Middleware
====================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ======================
   Routes
====================== */
app.use("/news", newsRoutes);

app.get("/", (req, res) => {
  res.send("AI News Backend Running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/* ======================
   Error Handling
====================== */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

/* ======================
   Start Server
====================== */
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();
    
    app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);
      await fetchAndSaveAllNews();
      startAutoNewsUpdater();
      startDailyManager();
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();

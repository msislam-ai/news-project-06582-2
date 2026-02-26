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

// ===== Middleware =====
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== CORS =====
const allowedOrigins = [
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
  "https://exciting-aj-git-main-sadekul-islams-projects-ba35ed38.vercel.app",
  "https://exciting-kf8t5d8y8-sadekul-islams-projects-ba35ed38.vercel.app",
];
  "http://localhost:3000"
];

app.use(cors({
  origin: (origin, callback) => {
    if(!origin) return callback(null, true);
    if(allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed"));
  },
  credentials: true
}));

// ===== Routes =====
app.get("/", (req, res) => res.send("AI News Backend Running 🚀"));
app.get("/health", (req,res) => res.json({ status:"OK", timestamp:new Date().toISOString() }));
app.use("/news", newsRoutes);

// ===== Error handling =====
app.use((req,res)=>res.status(404).json({ error:"Route not found" }));
app.use((err,req,res,next)=>{
  console.error(err);
  res.status(err.status||500).json({ error: err.message || "Internal Server Error" });
});

// ===== Start Server =====
async function startServer(){
  try{
    await connectDB();
    await fetchAndSaveAllNews();
    startAutoNewsUpdater();
    startDailyManager();

    app.listen(PORT, ()=>console.log(`🚀 Server running on port ${PORT}`));
  } catch(err){
    console.error("❌ Server failed:", err);
    process.exit(1);
  }
}

startServer();




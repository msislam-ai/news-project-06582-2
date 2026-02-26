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
   Enhanced CORS Middleware
====================== */
app.use((req, res, next) => {
  // You can be more restrictive here if needed
  const allowedOrigins = [
    "http://localhost:3000",
    "https://exciting-aj.vercel.app",
    "https://j34vsk-5173.csb.app",
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Content-Length');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Keep the cors package for additional handling
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:3000",
      "https://exciting-aj.vercel.app",
      "https://j34vsk-5173.csb.app",
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

/* ======================
   Additional Middleware
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/* ======================
   Error Handling Middleware
====================== */
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed'
    });
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
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
      console.log(`📡 CORS enabled for: ${["http://localhost:3000", "https://exciting-aj.vercel.app", "https://j34vsk-5173.csb.app"].join(', ')}`);

      // 3️⃣ Initial fetch
      await fetchAndSaveAllNews();

      // 4️⃣ Start scheduler
      startAutoNewsUpdater();

      // 5️⃣ Daily DB cleanup + recategorization
      startDailyManager();
    });

  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();

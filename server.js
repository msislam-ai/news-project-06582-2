import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Import your routes and services
import newsRoutes from "./routes/newsRoutes.js";
import connectDB from "./config/db.js";
import { fetchAndSaveAllNews } from "./services/newsAggregator.js";
import { startAutoNewsUpdater } from "./services/autoNewsUpdater.js";
import { startDailyManager } from "./services/dailyManager.js";

dotenv.config();

const app = express();

/* ======================================================
   CORS CONFIGURATION (Fixed & Simplified)
====================================================== */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app" // Your CodeSandbox if needed
];

const corsOptions = {
  origin: (origin, callback) => {
    // 1. Allow requests with no origin (like Postman, cURL, or server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // 2. Check if origin is explicitly allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // 3. Allow Vercel Previews (Dynamic Subdomains)
    // This allows any URL ending in .vercel.app that contains "exciting-aj"
    if (origin.endsWith(".vercel.app") && origin.includes("exciting-aj")) {
      return callback(null, true);
    }

    // 4. If nothing matches, block it
    console.log(`🚫 CORS Blocked: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

// Apply CORS globally - MUST be before routes
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options("*", cors(corsOptions));

/* ======================
   Middleware
====================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ======================
   Routes
====================== */
// Health check
app.get("/", (req, res) => {
  res.send("AI News Backend Running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// API Routes
app.use("/news", newsRoutes);

/* ======================
   Error Handling
====================== */
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack || err);
  res.status(500).json({ 
    error: err.message || "Internal Server Error",
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

/* ======================
   Start Server
====================== */
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    console.log("✅ Database connected");

    app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);

      // Run background tasks safely
      try {
        await fetchAndSaveAllNews(); // Initial fetch
        startAutoNewsUpdater();      // Scheduler
        startDailyManager();         // Cleanup
        console.log("✅ Background services started");
      } catch (serviceError) {
        console.error("⚠️ Background service error:", serviceError);
        // We do not exit process here, so the server keeps running
      }
    });

  } catch (error) {
    console.error("❌ Critical Startup Error:", error);
    process.exit(1);
  }
};

startServer();

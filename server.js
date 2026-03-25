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
let PORT = process.env.PORT || 5000;

// ================= SYSTEM STATUS =================
const systemStatus = {
  db: false,
  initialFetch: false,
  autoUpdater: false,
  dailyManager: false,
};

// ================= MIDDLEWARE =================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ================= CORS =================
const allowedOrigins = [
  "https://exciting-aj.vercel.app",
  "https://j34vsk-5173.csb.app",
  "https://exciting-aj-git-main-sadekul-islams-projects-ba35ed38.vercel.app",
  "https://exciting-bw2ssdxkn-sadekul-islams-projects-ba35ed38.vercel.app",
  "http://localhost:3000",
  "https://exciting-aj-sadekul-islams-projects-ba35ed38.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

// ================= ROUTES =================
app.get("/", (req, res) => {
  res.send("AI News Backend Running 🚀");
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

app.get("/system-status", (req, res) => {
  res.json({
    ...systemStatus,
    serverTime: new Date().toISOString(),
  });
});

app.use("/news", newsRoutes);

// ================= ERROR HANDLING =================
app.use((req, res) =>
  res.status(404).json({ error: "Route not found" })
);

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal Server Error" });
});

// ================= START SERVER =================
async function startServer() {
  try {
    console.log("🔌 Connecting to DB...");
    await connectDB();
    systemStatus.db = true;
    console.log("✅ Database connected");

    console.log("📰 Fetching initial news...");
    await fetchAndSaveAllNews();
    systemStatus.initialFetch = true;
    console.log("✅ Initial news fetched & saved");

    console.log("🔁 Starting auto news updater...");
    startAutoNewsUpdater();
    systemStatus.autoUpdater = true;
    console.log("✅ Auto news updater started");

    console.log("📅 Starting daily manager...");
    startDailyManager();
    systemStatus.dailyManager = true;
    console.log("✅ Daily manager started");

    // ================= LISTEN =================
    const server = app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)
    );

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `❌ Port ${PORT} is already in use. Trying port ${PORT + 1}...`
        );
        PORT += 1;
        server.close();
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
      } else {
        console.error(err);
      }
    });
  } catch (err) {
    console.error("❌ Server failed:", err);
    process.exit(1);
  }
}

startServer();

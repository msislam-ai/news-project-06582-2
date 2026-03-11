// backend/fetchNews.js

import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import connectDB from "./config/db.js";
import { fetchAndSaveNews } from "./services/newsAPIService.js";

// Optional: NodeCache for in-memory caching
import NodeCache from "node-cache";
const newsCache = new NodeCache({ stdTTL: 60 }); // cache for 60 seconds

// 1️⃣ Connect to DB
connectDB();

async function run() {
  try {
    console.log("Fetching news from API and saving to DB...");

    // 2️⃣ Check cache first
    const cached = newsCache.get("news-fetch");
    if (cached) {
      console.log("Using cached news. Articles count:", cached.length);
      process.exit();
    }

    // 3️⃣ Fetch and save news
    const savedCount = await fetchAndSaveNews({ limit: 10, lang: "en" });
    console.log(`Finished! ${savedCount} articles saved.`);

    // 4️⃣ Store in cache to reduce immediate repeated calls
    newsCache.set("news-fetch", savedCount);

    process.exit();
  } catch (error) {
    console.error("Error fetching/saving news:", error);
    process.exit(1);
  }
}

run();

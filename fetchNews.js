// backend/fetchNews.js

import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import connectDB from "./config/db.js";
import News from "./models/News.js"; // your Mongoose model
import axios from "axios";

// Optional in-memory cache
import NodeCache from "node-cache";
const newsCache = new NodeCache({ stdTTL: 60 }); // cache for 60 seconds

// 1️⃣ Connect to MongoDB
connectDB();

// ------------------------
// Helper: Fetch from API
// ------------------------
async function fetchNewsFromAPI({ limit = 10, lang = "en" } = {}) {
  try {
    const NEWS_API_KEY = process.env.NEWS_API_KEY;
    if (!NEWS_API_KEY) throw new Error("NEWS_API_KEY not set in .env");

    const { data } = await axios.get(
      `https://gnews.io/api/v4/top-headlines?token=${NEWS_API_KEY}&lang=${lang}&max=${limit}`
    );

    if (!data.articles || data.articles.length === 0) return [];

    // Map API response to your DB structure
    return data.articles.map(item => ({
      title: item.title,
      description: item.description,
      content: item.content || item.description,
      image: item.image,
      source: item.source.name,
      url: item.url,
      pubDate: item.publishedAt,
      referenceType: "newsapi",
    }));
  } catch (err) {
    console.error("News API fetch error:", err.message);
    return [];
  }
}

// ------------------------
// Main: Fetch & Save News
// ------------------------
async function fetchAndSaveNews({ limit = 10, lang = "en" } = {}) {
  // 1️⃣ Check cache first
  const cached = newsCache.get("news-fetch");
  if (cached) {
    console.log("Using cached news. Articles count:", cached.length);
    return cached.length;
  }

  // 2️⃣ Fetch news from API
  const articles = await fetchNewsFromAPI({ limit, lang });
  if (articles.length === 0) return 0;

  // 3️⃣ Sort newest first by pubDate
  articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // 4️⃣ Save to DB (avoid duplicates by URL)
  let savedCount = 0;
  for (const article of articles) {
    const exists = await News.findOne({ url: article.url });
    if (!exists) {
      await News.create(article);
      savedCount++;
    }
  }

  // 5️⃣ Cache result
  newsCache.set("news-fetch", articles);

  console.log(`✅ Fetched ${articles.length} articles, saved ${savedCount}`);
  return savedCount;
}

// ------------------------
// Run script
// ------------------------
async function run() {
  try {
    console.log("📰 Fetching news from API and saving to DB...");
    const savedCount = await fetchAndSaveNews({ limit: 50, lang: "en" }); // fetch more if needed
    console.log(`🎯 Finished! ${savedCount} articles saved.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error fetching/saving news:", err);
    process.exit(1);
  }
}

run();

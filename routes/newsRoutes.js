import express from "express";
import { scrapeArticle } from "../services/scraperService.js";
import puterAIService from "../services/aiService.js";
import News from "../models/News.js";
import cleanNewsData from "../utils/newsCleaner.js";
import axios from "axios";
import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";

const router = express.Router();
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// =======================
// 1️⃣ Fetch & Update Latest News (RSS + Scraper + AI + NewsAPI)
// =======================
router.get("/update", async (req, res) => {
  try {
    let allArticles = [];

    // --- 1. RSS Feed ---
    for (const category of Object.keys(RSS_SOURCES)) {
      const rssItems = await fetchRSSByCategory(category);

      const rssArticles = await Promise.all(
        rssItems.slice(0, 5).map(async (item) => {
          const { content: scrapedContent, image } = await scrapeArticle(item.link);

          const referenceText =
            scrapedContent?.length > 150
              ? scrapedContent
              : item.shortDescription || item.title;

          let aiContent = null;
          try {
            aiContent = await puterAIService.rewriteArticle(referenceText);
          } catch {}

          return {
            title: item.title,
            description: item.shortDescription,
            content: aiContent || scrapedContent || item.shortDescription || item.title,
            image: image || null,
            source: item.source,
            url: item.link,
            pubDate: item.publishDate || new Date().toISOString(),
            category: category,
            referenceType: scrapedContent ? "scraper" : "rss"
          };
        })
      );

      allArticles.push(...rssArticles);
    }

    // --- 2. News API ---
    if (NEWS_API_KEY) {
      try {
        const { data } = await axios.get(
          `https://gnews.io/api/v4/top-headlines?token=${NEWS_API_KEY}&lang=en&max=10`
        );

        if (data.articles && data.articles.length > 0) {
          const apiArticles = data.articles.map((item) => ({
            title: item.title,
            description: item.description,
            content: item.content,
            image: item.image,
            source: item.source.name,
            url: item.url,
            pubDate: item.publishedAt || new Date().toISOString(),
            category: "general",
            referenceType: "newsapi"
          }));
          allArticles = allArticles.concat(apiArticles);
        }
      } catch (apiErr) {
        console.log("News API fetch error:", apiErr.response?.data || apiErr.message);
      }
    }

    // --- Clean & Categorize ---
    const cleanedArticles = cleanNewsData(allArticles);

    // --- Save to DB (Prevent duplicates by URL) ---
    let savedCount = 0;
    for (const article of cleanedArticles) {
      const exists = await News.findOne({ url: article.url });
      if (!exists) {
        // Ensure pubDate exists in DB for sorting
        if (!article.pubDate) article.pubDate = new Date().toISOString();
        await News.create(article);
        savedCount++;
      }
    }

    res.json({
      success: true,
      message: "News updated",
      totalFetched: allArticles.length,
      savedCount
    });
  } catch (error) {
    console.log("Update News Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =======================
// 2️⃣ Get All News (paginated)
// =======================
router.get("/all", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const news = await News.aggregate([
      { $sort: { pubDate: -1 } }, // newest first
      { $skip: skip },
      { $limit: limit }
    ]).allowDiskUse(true);

    const total = await News.countDocuments();

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: news.map(article => ({
        ...article,
        timeAgo: getTimeAgo(article.pubDate)
      }))
    });
  } catch (error) {
    console.log("Get All News Error:", error.message);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// =======================
// 3️⃣ Get News by Category
// =======================
router.get("/category/:cat", async (req, res) => {
  try {
    const { cat } = req.params;
    const news = await News.find({ category: cat }).sort({ pubDate: -1 });
    res.json(news.map(article => ({
      ...article._doc,
      timeAgo: getTimeAgo(article.pubDate)
    })));
  } catch (error) {
    console.log("Get Category News Error:", error.message);
    res.status(500).json({ error: "Failed to fetch news by category" });
  }
});

// =======================
// 4️⃣ Get All Categories
// =======================
router.get("/categories", async (req, res) => {
  try {
    const categories = await News.distinct("category");
    res.json(categories);
  } catch (error) {
    console.log("Get Categories Error:", error.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// =======================
// 5️⃣ Get Single Article by ID
// =======================
router.get("/article/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const article = await News.findById(id);
    if (!article) return res.status(404).json({ error: "Article not found" });
    res.json({ ...article._doc, timeAgo: getTimeAgo(article.pubDate) });
  } catch (error) {
    console.log("Get Article Error:", error.message);
    res.status(500).json({ error: "Failed to fetch article" });
  }
});

// =======================
// Time Ago Helper
// =======================
function getTimeAgo(pubDate) {
  const diff = Date.now() - new Date(pubDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export default router;

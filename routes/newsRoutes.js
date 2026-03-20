import express from "express";
import { scrapeArticle } from "../services/scraperService.js";
import puterAIService from "../services/aiService.js";
import News from "../models/News.js";
import cleanNewsData from "../utils/newsCleaner.js";
import axios from "axios";
import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";
import NodeCache from "node-cache";

const router = express.Router();
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// =======================
// Cache setup (optional, huge speed boost)
// =======================
const cache = new NodeCache({ stdTTL: 60 }); // cache for 60 seconds

// =======================
// 1️⃣ Fetch & Update Latest News
// =======================
router.get("/update", async (req, res) => {
  try {
    let allArticles = [];

    // --- Fetch RSS Category Wise ---
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
            content:
              aiContent || scrapedContent || item.shortDescription || item.title,
            image: image || null,
            source: item.source,
            url: item.link,
            publishedAt: new Date(item.publishDate), // correct field
            category: category,
            referenceType: scrapedContent ? "scraper" : "rss"
          };
        })
      );

      allArticles.push(...rssArticles);
    }

    // --- News API ---
    if (NEWS_API_KEY) {
      try {
        const { data } = await axios.get(
          `https://gnews.io/api/v4/top-headlines?token=${NEWS_API_KEY}&lang=en&max=10`
        );

        if (data.articles?.length) {
          const apiArticles = data.articles.map((item) => ({
            title: item.title,
            description: item.description,
            content: item.content,
            image: item.image,
            source: item.source.name,
            url: item.url,
            publishedAt: new Date(item.publishedAt),
            category: "general",
            referenceType: "newsapi"
          }));

          allArticles.push(...apiArticles);
        }
      } catch (apiErr) {
        console.log(
          "News API fetch error:",
          apiErr.response?.data || apiErr.message
        );
      }
    }

    // --- Clean ---
    const cleanedArticles = cleanNewsData(allArticles);

    // --- Save (FAST + NO DUPLICATES) ---
    let savedCount = 0;
    try {
      const result = await News.insertMany(cleanedArticles, { ordered: false });
      savedCount = result.length;
    } catch (err) {
      savedCount = err.result?.nInserted || 0;
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
// 2️⃣ Get All News (fast + paginated)
// =======================
router.get("/all", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);
    const skip = (page - 1) * limit;

    const cacheKey = `news_${page}_${limit}`;
    if (cache.has(cacheKey)) {
      return res.json(cache.get(cacheKey));
    }

    const news = await News.find({}, {
      title: 1,
      description: 1,
      image: 1,
      category: 1,
      publishedAt: 1
    })
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await News.countDocuments();

    const response = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: news.map((article) => ({
        ...article,
        timeAgo: getTimeAgo(article.publishedAt)
      }))
    };

    cache.set(cacheKey, response);

    res.json(response);
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

    const news = await News.find({ category: cat }, {
      title: 1,
      description: 1,
      image: 1,
      category: 1,
      publishedAt: 1
    })
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();

    res.json(
      news.map((article) => ({
        ...article,
        timeAgo: getTimeAgo(article.publishedAt)
      }))
    );
  } catch (error) {
    console.log("Get Category News Error:", error.message);
    res.status(500).json({ error: "Failed to fetch news by category" });
  }
});

// =======================
// 4️⃣ Get Single Article
// =======================
router.get("/article/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const article = await News.findById(id).lean();

    if (!article)
      return res.status(404).json({ error: "Article not found" });

    res.json({
      ...article,
      timeAgo: getTimeAgo(article.publishedAt)
    });
  } catch (error) {
    console.log("Get Article Error:", error.message);
    res.status(500).json({ error: "Failed to fetch article" });
  }
});

// =======================
// Time Ago Helper
// =======================
function getTimeAgo(date) {
  if (!date) return "";

  const diff = Date.now() - new Date(date).getTime();

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export default router;

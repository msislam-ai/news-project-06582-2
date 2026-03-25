// backend/routes/news.js

import express from "express";
import News from "../models/News.js";
import { cleanNewsData, categoryKeywords } from "../utils/newsCleaner.js";
import axios from "axios";
import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";
import NodeCache from "node-cache";
import crypto from "crypto";
import puterAIService from "../services/aiService.js"; // AI service import

const router = express.Router();
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// ================= CONFIGURATION =================
const CONFIG = {
  cache: { stdTTL: 60, checkPeriod: 600, maxKeys: 1000 },
  pagination: { defaultLimit: 10, maxLimit: 100, defaultPage: 1 },
  fetching: { rssItemsPerCategory: 5, newsApiMaxResults: 10, parallelFetchLimit: 10 },
  categories: Object.keys(RSS_SOURCES)
};

// Combine valid categories (English + Bangla + general)
const BANGLA_CATEGORIES = Object.keys(categoryKeywords || {});
const VALID_CATEGORIES = [...CONFIG.categories, ...BANGLA_CATEGORIES, "general", "আরও"].filter(Boolean);

// Initialize cache
const cache = new NodeCache(CONFIG.cache);

// ================= HELPER FUNCTIONS =================

// Format "time ago"
function getTimeAgo(date) {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Validate pagination params
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || CONFIG.pagination.defaultPage);
  const limit = Math.min(CONFIG.pagination.maxLimit, Math.max(1, parseInt(query.limit) || CONFIG.pagination.defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

// Format article for API response
function formatArticleResponse(article) {
  return {
    id: article._id,
    title: article.title,
    description: article.description,
    image: article.image,
    category: article.category,
    source: article.source,
    url: article.url,
    publishedAt: article.publishedAt,
    timeAgo: getTimeAgo(article.publishedAt),
    createdAt: article.createdAt
  };
}

// Generate safe cache key
function safeCacheKey(...parts) {
  return crypto.createHash("md5").update(parts.join("_")).digest("hex");
}

// ================= FETCHERS =================

// Fetch RSS articles
async function fetchRSSArticles(category, limit = CONFIG.fetching.rssItemsPerCategory) {
  try {
    const rssItems = await fetchRSSByCategory(category);
    const items = rssItems.slice(0, limit);
    const articles = await Promise.allSettled(
      items.map(async (item) => {
        const content = item.shortDescription || item.title;
        return {
          title: item.title?.trim(),
          description: item.shortDescription?.trim() || item.title?.trim(),
          content: content?.trim(),
          image: item.image || null,
          source: item.source || category,
          url: item.link,
          publishedAt: new Date(item.publishDate || Date.now()),
          category,
          referenceType: "rss"
        };
      })
    );
    return articles
      .filter(r => r.status === "fulfilled" && r.value?.title)
      .map(r => r.value)
      .filter(a => a.description?.length >= 20);
  } catch (error) {
    console.error(`RSS fetch error for ${category}:`, error.message);
    return [];
  }
}

// Fetch News API articles
async function fetchNewsAPIArticles() {
  if (!NEWS_API_KEY) return [];
  try {
    const { data } = await axios.get(
      `https://gnews.io/api/v4/top-headlines?token=${NEWS_API_KEY.trim()}&lang=en&max=${CONFIG.fetching.newsApiMaxResults}`,
      { timeout: 10000 }
    );
    if (!data.articles?.length) return [];
    return data.articles
      .filter(item => item.title && item.description)
      .map(item => ({
        title: item.title.trim(),
        description: item.description?.trim() || item.title.trim(),
        content: item.content?.trim() || item.description?.trim(),
        image: item.image || null,
        source: item.source?.name || "News API",
        url: item.url,
        publishedAt: new Date(item.publishedAt),
        category: "general",
        referenceType: "newsapi"
      }));
  } catch (error) {
    console.error("News API fetch error:", error.message);
    return [];
  }
}

// Fetch all news
async function fetchAllNews() {
  const allArticles = [];
  const rssPromises = CONFIG.categories.map(category => fetchRSSArticles(category));
  for (let i = 0; i < rssPromises.length; i += CONFIG.fetching.parallelFetchLimit) {
    const batch = rssPromises.slice(i, i + CONFIG.fetching.parallelFetchLimit);
    const batchResults = await Promise.all(batch);
    batchResults.forEach(articles => { if (Array.isArray(articles)) allArticles.push(...articles); });
  }
  allArticles.push(...(await fetchNewsAPIArticles()));
  console.log(`Fetched ${allArticles.length} articles from all sources`);
  return allArticles;
}

// ================= SAVE ARTICLES WITH AI =================
async function saveArticlesWithAI(articles) {
  if (!articles.length) return 0;
  const cleaned = await cleanNewsData(articles, { enableDedupe: true, batchSize: 10, minConfidence: 0.3 });
  if (!cleaned.length) return 0;

  try {
    const bulkOps = [];

    for (const article of cleaned) {
      let aiContent = article.content || article.description || "";

      // ✅ Generate AI content from description
      try {
        aiContent = await puterAIService.rewriteArticle(article.description || "");
      } catch (err) {
        console.warn(`AI content generation failed for: ${article.title}`, err.message);
      }

      bulkOps.push({
        updateOne: {
          filter: { url: article.url },
          update: { 
            $set: { 
              ...article,
              content: aiContent,
              updatedAt: new Date() 
            } 
          },
          upsert: true
        }
      });
    }

    const result = await News.bulkWrite(bulkOps, { ordered: false });
    return (result.upsertedCount || 0) + (result.modifiedCount || 0);

  } catch (err) {
    console.error("Database bulkWrite error:", err.message);
    return 0;
  }
}

// ================= REUSABLE HANDLER =================
async function handleListNews(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { category } = req.query;

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: "Invalid category", validCategories: VALID_CATEGORIES });
    }

    const cacheKey = `news_list_${safeCacheKey(page, limit, category || "all")}`;
    if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

    const query = category ? { category } : {};
    const [news, total] = await Promise.all([
      News.find(query, { title: 1, description: 1, image: 1, category: 1, source: 1, url: 1, publishedAt: 1 })
        .sort({ publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      News.countDocuments(query)
    ]);

    const response = { 
      success: true, 
      pagination: { 
        page, limit, total, 
        totalPages: Math.ceil(total / limit), 
        hasNext: skip + limit < total, 
        hasPrev: page > 1 
      }, 
      data: news.map(formatArticleResponse) 
    };
    cache.set(cacheKey, response, CONFIG.cache.stdTTL);
    res.json(response);
  } catch (error) {
    console.error("List news error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch news" });
  }
}

// ================= ROUTES =================

// POST /api/news/update
router.post("/update", async (req, res) => {
  const rateLimitKey = "news_update_ratelimit";
  if (cache.has(rateLimitKey)) return res.status(429).json({ success: false, error: "Please wait before updating again" });

  try {
    const articles = await fetchAllNews();
    const savedCount = await saveArticlesWithAI(articles); // AI rewrite content before saving
    cache.set(rateLimitKey, true, 60);
    cache.keys().forEach(k => { if (k.startsWith("news_") || k.startsWith("category_")) cache.del(k); });
    res.json({ success: true, message: "News updated with AI content", stats: { fetched: articles.length, saved: savedCount } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to update news" });
  }
});

// GET /api/news/all
router.get("/all", handleListNews);

// GET /api/news
router.get("/", handleListNews);

// GET /api/news/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ success: false, error: "Invalid article ID" });

    const cacheKey = `article_${safeCacheKey(id)}`;
    if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

    const article = await News.findById(id).lean();
    if (!article) return res.status(404).json({ success: false, error: "Article not found" });

    const response = { 
      success: true, 
      data: { 
        ...formatArticleResponse(article), 
        content: article.content, 
        referenceType: article.referenceType 
      } 
    };
    cache.set(cacheKey, response, 300);
    res.json(response);
  } catch (error) {
    console.error("Fetch article error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch article" });
  }
});

// Export router + cache
export { cache, VALID_CATEGORIES };
export default router;

// backend/routes/news.js

import express from "express";
import News from "../models/News.js";
import { cleanNewsData, categorizeArticle, addCategory, categoryKeywords } from "../utils/newsCleaner.js";
import axios from "axios";
import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";
import NodeCache from "node-cache";
import crypto from "crypto";

const router = express.Router();
const NEWS_API_KEY = process.env.NEWS_API_KEY;

/* ===================================================
   📦 CONFIGURATION & CACHING
=================================================== */
const CONFIG = {
  cache: {
    stdTTL: 60,              // Cache TTL in seconds
    checkPeriod: 600,        // Cache cleanup interval
    maxKeys: 1000            // Max cache entries
  },
  pagination: {
    defaultLimit: 10,
    maxLimit: 100,
    defaultPage: 1
  },
  fetching: {
    rssItemsPerCategory: 5,
    newsApiMaxResults: 10,
    parallelFetchLimit: 10   // Max concurrent RSS fetches
  },
  categories: Object.keys(RSS_SOURCES)
};

// ✅ FIX: Support both English (RSS) and Bangla (NLP) categories
const BANGLA_CATEGORIES = Object.keys(categoryKeywords || {});
const VALID_CATEGORIES = [
  ...CONFIG.categories, 
  ...BANGLA_CATEGORIES, 
  'general', 
  'আরও'
].filter(Boolean);

// Initialize cache
const cache = new NodeCache(CONFIG.cache);

/* ===================================================
   🧹 HELPER FUNCTIONS
=================================================== */

/**
 * Format date to "time ago" string
 */
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
  
  return new Date(date).toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric' 
  });
}

/**
 * Validate and sanitize pagination params
 */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || CONFIG.pagination.defaultPage);
  const limit = Math.min(
    CONFIG.pagination.maxLimit, 
    Math.max(1, parseInt(query.limit) || CONFIG.pagination.defaultLimit)
  );
  
  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

/**
 * Transform article for API response
 */
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

/**
 * ✅ FIX: Safe cache key generator (handles Bangla/special chars)
 */
function safeCacheKey(...parts) {
  const raw = parts.join('_');
  return crypto.createHash('md5').update(raw).digest('hex');
}

/**
 * Fetch and process RSS articles for a category (NO AI, NO SCRAPING)
 */
async function fetchRSSArticles(category, limit = CONFIG.fetching.rssItemsPerCategory) {
  try {
    const rssItems = await fetchRSSByCategory(category);
    const items = rssItems.slice(0, limit);
    
    const articles = await Promise.allSettled(
      items.map(async (item) => {
        // Use RSS description or fallback to title - NO AI rewriting
        const content = item.shortDescription || item.title;
        
        return {
          title: item.title?.trim(),
          description: item.shortDescription?.trim() || item.title?.trim(),
          content: content?.trim(),
          image: item.image || null,
          source: item.source || category,
          url: item.link,
          publishedAt: new Date(item.publishDate || Date.now()),
          category: category,
          referenceType: "rss"
        };
      })
    );
    
    // Filter successful fetches and valid articles
    return articles
      .filter(r => r.status === 'fulfilled' && r.value?.title)
      .map(r => r.value)
      .filter(article => article.description?.length >= 20); // Minimum quality filter
      
  } catch (error) {
    console.error(`❌ RSS fetch error for ${category}:`, error.message);
    return [];
  }
}

/**
 * Fetch articles from News API
 */
async function fetchNewsAPIArticles() {
  if (!NEWS_API_KEY) return [];
  
  try {
    // ✅ FIX: Removed extra spaces after token=
    const { data } = await axios.get(
      `https://gnews.io/api/v4/top-headlines?token=${NEWS_API_KEY.trim()}&lang=en&max=${CONFIG.fetching.newsApiMaxResults}`,
      { timeout: 10000 }
    );

    if (!data.articles?.length) return [];
    
    return data.articles
      .filter(item => item.title && item.description)
      .map((item) => ({
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
    console.error("❌ News API fetch error:", error.message);
    return [];
  }
}

/* ===================================================
   🔄 MAIN UPDATE LOGIC
=================================================== */

/**
 * Fetch all news from configured sources
 */
async function fetchAllNews() {
  const allArticles = [];
  
  // 📡 Fetch RSS feeds by category (with concurrency limit)
  const rssPromises = CONFIG.categories.map(category => 
    fetchRSSArticles(category)
  );
  
  // Process RSS in batches to avoid rate limiting
  for (let i = 0; i < rssPromises.length; i += CONFIG.fetching.parallelFetchLimit) {
    const batch = rssPromises.slice(i, i + CONFIG.fetching.parallelFetchLimit);
    const batchResults = await Promise.all(batch);
    batchResults.forEach(articles => {
      if (Array.isArray(articles)) {
        allArticles.push(...articles);
      }
    });
  }
  
  // 🌐 Fetch News API
  const apiArticles = await fetchNewsAPIArticles();
  allArticles.push(...apiArticles);
  
  console.log(`📥 Fetched ${allArticles.length} articles from all sources`);
  return allArticles;
}

/**
 * ✅ FIX: Save articles with bulkWrite upsert (not insertMany)
 */
async function saveArticles(articles) {
  if (!articles.length) return 0;
  
  // ✅ FIX: Add await + options for cleanNewsData
  const cleanedArticles = await cleanNewsData(articles, { 
    enableDedupe: true,
    batchSize: 10,
    minConfidence: 0.3
  });
  
  if (!cleanedArticles.length) {
    console.log("⚠️  No valid articles after cleaning");
    return 0;
  }
  
  // ✅ FIX: Use bulkWrite with upsert instead of insertMany
  // This ensures articles are updated if URL already exists
  try {
    const bulkOps = cleanedArticles.map(article => ({
      updateOne: {
        filter: { url: article.url },  // Requires unique index on News.url
        update: { 
          $set: { 
            ...article, 
            updatedAt: new Date() 
          } 
        },
        upsert: true
      }
    }));
    
    const result = await News.bulkWrite(bulkOps, { ordered: false });
    
    const inserted = result.upsertedCount || 0;
    const modified = result.modifiedCount || 0;
    const total = inserted + modified;
    
    console.log(`✅ Saved/updated ${total} articles (new: ${inserted}, updated: ${modified})`);
    return total;
    
  } catch (err) {
    // Handle duplicate key errors gracefully (if unique index not set)
    if (err.code === 11000 || err.writeErrors?.some(e => e.code === 11000)) {
      const inserted = err.result?.nInserted || 0;
      const duplicates = err.writeErrors?.filter(e => e.code === 11000).length || 0;
      
      console.log(`✅ Saved ${inserted} articles, skipped ${duplicates} duplicates`);
      return inserted;
    }
    
    console.error("❌ Database bulkWrite error:", err.message);
    throw err;
  }
}

/* ===================================================
   🛣️ API ROUTES
=================================================== */

/**
 * 🔄 POST /api/news/update
 * Fetch and update news from all sources
 * Rate limited: 1 request per minute via cache
 */
router.post("/update", async (req, res) => {
  // Simple rate limiting via cache
  const rateLimitKey = "news_update_ratelimit";
  if (cache.has(rateLimitKey)) {
    return res.status(429).json({
      success: false,
      error: "Please wait before updating again",
      retryAfter: Math.max(0, (cache.getTtl(rateLimitKey) || 0) - Math.floor(Date.now() / 1000))
    });
  }
  
  try {
    console.log("🔄 Starting news update...");
    
    // Fetch from all sources
    const allArticles = await fetchAllNews();
    
    // Save to database (with await + bulkWrite)
    const savedCount = await saveArticles(allArticles);
    
    // Set rate limit cache (1 minute)
    cache.set(rateLimitKey, true, 60);
    
    // Invalidate list caches to show fresh content
    cache.keys().forEach(key => {
      if (key.startsWith('news_') || key.startsWith('category_')) {
        cache.del(key);
      }
    });
    
    res.json({
      success: true,
      message: "News updated successfully",
      stats: {
        fetched: allArticles.length,
        saved: savedCount,
        sources: {
          rss: CONFIG.categories.length,
          newsApi: !!NEWS_API_KEY
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Update news error:", error);
    
    res.status(500).json({
      success: false,
      error: "Failed to update news",
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 📰 GET /api/news
 * Get paginated list of all news
 * Query params: page, limit, category (optional filter)
 */
router.get("/", async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { category } = req.query;
    
    // ✅ FIX: Validate category against combined list
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: "Invalid category",
        validCategories: VALID_CATEGORIES
      });
    }
    
    // ✅ FIX: Use safe cache key generator
    const cacheKey = `news_list_${safeCacheKey(page, limit, category || 'all')}`;
    
    // Return cached response if available
    if (cache.has(cacheKey)) {
      return res.json(cache.get(cacheKey));
    }
    
    // Build query
    const query = category && VALID_CATEGORIES.includes(category)
      ? { category }
      : {};
    
    // Fetch articles with projection for performance
    const [news, total] = await Promise.all([
      News.find(query, {
        title: 1,
        description: 1,
        image: 1,
        category: 1,
        source: 1,
        url: 1,
        publishedAt: 1,
        createdAt: 1
      })
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      
      News.countDocuments(query)
    ]);
    
    // Format response
    const response = {
      success: true,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1
      },
      data: news.map(formatArticleResponse)
    };
    
    // Cache the response
    cache.set(cacheKey, response, CONFIG.cache.stdTTL);
    
    res.json(response);
    
  } catch (error) {
    console.error("❌ Get news error:", error);
    
    res.status(500).json({
      success: false,
      error: "Failed to fetch news"
    });
  }
});

/**
 * 📂 GET /api/news/category/:category
 * Get news filtered by category
 */
router.get("/category/:category", async (req, res) => {
  try {
    const { category } = req.params;
    
    // ✅ FIX: Validate against combined Bangla + English categories
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: "Invalid category",
        validCategories: VALID_CATEGORIES
      });
    }
    
    const { page, limit, skip } = parsePagination(req.query);
    
    // ✅ FIX: Safe cache key
    const cacheKey = `category_${safeCacheKey(category, page, limit)}`;
    
    // Return cached response
    if (cache.has(cacheKey)) {
      return res.json(cache.get(cacheKey));
    }
    
    // Fetch from database
    const [news, total] = await Promise.all([
      News.find({ category }, {
        title: 1,
        description: 1,
        image: 1,
        category: 1,
        source: 1,
        url: 1,
        publishedAt: 1,
        createdAt: 1
      })
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      
      News.countDocuments({ category })
    ]);
    
    const response = {
      success: true,
      category,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      data: news.map(formatArticleResponse)
    };
    
    cache.set(cacheKey, response, CONFIG.cache.stdTTL);
    res.json(response);
    
  } catch (error) {
    console.error(`❌ Get category news error:`, error);
    
    res.status(500).json({
      success: false,
      error: "Failed to fetch category news"
    });
  }
});

/**
 * 🔍 GET /api/news/search?q=keyword
 * Search news by keyword in title/description
 */
router.get("/search", async (req, res) => {
  try {
    const { q, category, page, limit } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: "Search query must be at least 2 characters"
      });
    }
    
    const { skip } = parsePagination({ page, limit });
    const searchTerm = q.trim();
    
    // ✅ FIX: Validate category if provided
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: "Invalid category",
        validCategories: VALID_CATEGORIES
      });
    }
    
    // Build search query
    const searchQuery = {
      $text: { $search: searchTerm },
      ...(category && VALID_CATEGORIES.includes(category) && { category })
    };
    
    // Fallback to regex if text index not available
    const fallbackQuery = {
      $or: [
        { title: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } }
      ],
      ...(category && VALID_CATEGORIES.includes(category) && { category })
    };
    
    let news = [];
    try {
      // Try text search first
      news = await News.find(searchQuery, {
        title: 1,
        description: 1,
        image: 1,
        category: 1,
        source: 1,
        publishedAt: 1
      })
        .sort({ score: { $meta: "textScore" } })
        .skip(skip)
        .limit(CONFIG.pagination.maxLimit)
        .lean();
    } catch {
      // ✅ FIX: Add timeout + limit to regex fallback
      news = await News.find(fallbackQuery, {
        title: 1,
        description: 1,
        image: 1,
        category: 1,
        source: 1,
        publishedAt: 1
      })
        .maxTimeMS(5000)  // 5 second timeout
        .limit(100)       // Cap results for performance
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(CONFIG.pagination.maxLimit)
        .lean();
    }
    
    const total = news.length;
    
    res.json({
      success: true,
      query: searchTerm,
      category: category || 'all',
      total,
      data: news.map(formatArticleResponse)
    });
    
  } catch (error) {
    console.error("❌ Search error:", error);
    
    res.status(500).json({
      success: false,
      error: "Search failed"
    });
  }
});

/**
 * 📄 GET /api/news/:id
 * Get single article by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: "Invalid article ID"
      });
    }
    
    // ✅ FIX: Safe cache key
    const cacheKey = `article_${safeCacheKey(id)}`;
    
    // Return cached response
    if (cache.has(cacheKey)) {
      return res.json(cache.get(cacheKey));
    }
    
    const article = await News.findById(id).lean();
    
    if (!article) {
      return res.status(404).json({
        success: false,
        error: "Article not found"
      });
    }
    
    const response = {
      success: true,
      data: {
        ...formatArticleResponse(article),
        content: article.content,
        referenceType: article.referenceType
      }
    };
    
    // Cache single article longer (5 minutes)
    cache.set(cacheKey, response, 300);
    
    res.json(response);
    
  } catch (error) {
    console.error("❌ Get article error:", error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: "Invalid article ID format"
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Failed to fetch article"
    });
  }
});

/**
 * 🗑️ DELETE /api/news/:id
 * Delete an article (admin only - add auth middleware in production)
 */
router.delete("/:id", async (req, res) => {
  try {
    // 🔐 TODO: Add authentication middleware here for production
    // if (!req.user?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
    
    const { id } = req.params;
    
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: "Invalid article ID"
      });
    }
    
    const result = await News.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Article not found"
      });
    }
    
    // Invalidate cache
    cache.keys().forEach(key => {
      if (key.startsWith('news_') || key.startsWith('article_')) {
        cache.del(key);
      }
    });
    
    res.json({
      success: true,
      message: "Article deleted successfully",
      deletedId: id
    });
    
  } catch (error) {
    console.error("❌ Delete article error:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: "Invalid article ID format"
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Failed to delete article"
    });
  }
});

/**
 * 📊 GET /api/news/stats
 * Get news statistics (for admin dashboard)
 */
router.get("/stats", async (req, res) => {
  try {
    const [total, byCategory, recentCount] = await Promise.all([
      News.countDocuments(),
      News.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      News.countDocuments({
        publishedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);
    
    res.json({
      success: true,
      stats: {
        total,
        last24Hours: recentCount,
        byCategory: byCategory.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        lastUpdated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error("❌ Stats error:", error);
    
    res.status(500).json({
      success: false,
      error: "Failed to fetch stats"
    });
  }
});

/* ===================================================
   🎁 EXPORTS
=================================================== */

// Export cache for external invalidation if needed
export { cache, VALID_CATEGORIES };

export default router;

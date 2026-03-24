// backend/services/autoNewsUpdater.js

import cron from "node-cron";
import pLimit from "p-limit";
import { fetchRSSByCategory } from "../services/rssService.js";
import { RSS_SOURCES } from "../config/rssSources.js";
import { scrapeArticle } from "./scraperService.js";
import { fetchAndSaveNews } from "./newsAPIService.js";
import News from "../models/News.js";
// ✅ FIX #1: Use named import (newsCleaner.js exports named functions)
import { cleanNewsData } from "../utils/newsCleaner.js";

/* ======================
   🔧 Configuration
====================== */
const CONFIG = {
  cronSchedule: "*/5 * * * *",           // Run every 5 minutes
  maxRssItems: 50,                        // Limit RSS items to process
  maxConcurrentScrapes: 5,                // Concurrent scraping limit
  newsApiLimit: 10,                       // News API fetch limit
  maxRetries: 3,                          // Retry attempts for failures
  retryDelayMs: 1000,                     // Base retry delay
  maxRetryDelayMs: 30000,                 // ✅ FIX: Cap max retry delay (30s)
  logSampleSize: 3,                       // Number of articles to log as sample
  batchSize: 20,                          // ✅ FIX: Batch size for memory safety
};

/* ======================
   🔧 Utilities
====================== */

/**
 * Safe date formatter - prevents toISOString() errors
 */
const safeDateISO = (date) => {
  if (!date) return new Date().toISOString();
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

/**
 * Normalize category safely with fallback
 * Note: The cleaner will re-categorize using Bangla NLP.
 * This RSS category is kept as reference but may be overwritten.
 */
function normalizeCategory(category) {
  if (!category) return "General";
  if (typeof category === "string") {
    const trimmed = category.trim();
    return trimmed || "General";
  }
  if (typeof category === "object") {
    if (category?.name) return String(category.name).trim() || "General";
    if (category?.slug) return String(category.slug).trim() || "General";
  }
  return "General";
}

/**
 * Retry wrapper with exponential backoff (capped)
 */
async function withRetry(fn, label, retries = CONFIG.maxRetries) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ ${label} attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt < retries) {
        // ✅ FIX: Cap exponential backoff to prevent extreme delays
        const delay = Math.min(
          CONFIG.retryDelayMs * Math.pow(2, attempt - 1),
          CONFIG.maxRetryDelayMs
        );
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Validate article has minimum required fields
 */
function isValidArticle(article) {
  return (
    article?.title?.trim() &&
    article?.url?.trim() &&
    typeof article.url === "string" &&
    article.url.startsWith("http")
  );
}

/* ======================
   🚀 Start Auto News Updater
====================== */
export function startAutoNewsUpdater() {
  console.log("📰 Auto updater service initialized");

  let jobRunning = false;
  let lastRunStats = null;
  let isShuttingDown = false;

  // Handle graceful shutdown
  const shutdownHandler = () => {
    console.log("🛑 Auto updater: shutting down gracefully...");
    isShuttingDown = true;
  };
  
  process.on("SIGTERM", shutdownHandler);
  process.on("SIGINT", shutdownHandler);

  const job = cron.schedule(CONFIG.cronSchedule, async () => {
    // Skip if shutting down or already running
    if (isShuttingDown) {
      console.log("⚠️ Auto updater: skipping run (shutting down)");
      return;
    }
    
    if (jobRunning) {
      console.log("⚠️ Auto updater: previous job still running, skipping...");
      return;
    }

    jobRunning = true;
    const runId = Date.now();
    const startTime = new Date();
    
    console.log(`\n🔄 [Run #${runId}] Starting at ${safeDateISO(startTime)}`);
    console.log("=".repeat(50));

    const stats = {
      runId,
      startTime: safeDateISO(startTime),
      rssFetched: 0,
      scraped: 0,
      apiSaved: 0,
      cleaned: 0,
      inserted: 0,
      updated: 0,
      errors: [],
    };

    try {
      let allArticles = [];

      /* ======================
         1️⃣ FETCH RSS (with retry)
      ====================== */
      try {
        const results = await Promise.allSettled(
          Object.keys(RSS_SOURCES).map(cat => 
            withRetry(() => fetchRSSByCategory(cat), `RSS fetch: ${cat}`)
          )
        );

        const rssItems = results
          .filter(r => r.status === "fulfilled" && Array.isArray(r.value))
          .flatMap(r => r.value)
          .filter(i => i?.link?.trim());

        // Dedupe by URL early + take latest
        const seenUrls = new Set();
        const uniqueItems = rssItems.filter(item => {
          if (!item.link || seenUrls.has(item.link)) return false;
          seenUrls.add(item.link);
          return true;
        });

        stats.rssFetched = uniqueItems.slice(0, CONFIG.maxRssItems).length;
        console.log(`📰 RSS fetched: ${stats.rssFetched} unique items`);
        
        allArticles.push(...uniqueItems.slice(0, CONFIG.maxRssItems));
      } catch (err) {
        stats.errors.push(`RSS fetch failed: ${err.message}`);
        console.error("❌ RSS fetch error:", err.message);
      }

      /* ======================
         2️⃣ SCRAPE CONTENT (rate-limited + safe)
      ====================== */
      const limit = pLimit(CONFIG.maxConcurrentScrapes);
      const scrapePromises = allArticles.map(item =>
        limit(async () => {
          try {
            let content = null;
            let image = null;

            if (item.link) {
              try {
                const scraped = await withRetry(
                  () => scrapeArticle(item.link),
                  `Scrape: ${item.link}`,
                  2 // Fewer retries for scraping
                );
                content = scraped?.content?.trim() || null;
                image = scraped?.image || null;
              } catch (scraperErr) {
                // ✅ FIX: Use console.warn for production visibility
                console.warn(`⚠️ Scraper skipped for ${item.link}: ${scraperErr.message}`);
              }
            }

            // ✅ FIX #3: Use `publishedAt` (standard field name expected by cleaner)
            const article = {
              title: item.title?.trim() || "Untitled",
              description: item.shortDescription?.trim() || "",
              content: content || item.shortDescription || item.title || "",
              image: image || item.image || null,
              source: item.source || "RSS",
              url: item.link.trim(),
              publishedAt: item.publishDate ? new Date(item.publishDate) : new Date(),
              category: normalizeCategory(item.category), // RSS category (may be overwritten by cleaner)
              referenceType: "rss",
              updatedAt: new Date(),
              scrapedAt: content ? new Date() : null,
            };

            return isValidArticle(article) ? article : null;
          } catch {
            return null;
          }
        })
      );

      const scrapedResults = await Promise.all(scrapePromises);
      const validScraped = scrapedResults.filter(Boolean);
      stats.scraped = validScraped.length;
      console.log(`🔍 Scraped successfully: ${stats.scraped}`);
      
      allArticles = validScraped;

      /* ======================
         3️⃣ NEWS API INTEGRATION
      ====================== */
      try {
        const apiSaved = await withRetry(
          () => fetchAndSaveNews({ limit: CONFIG.newsApiLimit }),
          "NewsAPI fetch"
        );
        stats.apiSaved = typeof apiSaved === "number" ? apiSaved : 0;
        console.log(`✅ NewsAPI saved: ${stats.apiSaved}`);
      } catch (err) {
        stats.errors.push(`NewsAPI failed: ${err.message}`);
        console.warn("⚠️ News API error (non-fatal):", err.message);
      }

      /* ======================
         4️⃣ CLEAN & VALIDATE (BATCHED FOR MEMORY SAFETY)
      ====================== */
      console.log(`🧹 Cleaning articles (before: ${allArticles.length})`);
      
      // ✅ FIX #2 + #4: Add await + batch processing + options
      let cleanedArticles = [];
      
      // Process in batches to avoid memory issues with large feeds
      for (let i = 0; i < allArticles.length; i += CONFIG.batchSize) {
        const batch = allArticles.slice(i, i + CONFIG.batchSize);
        const batchCleaned = await cleanNewsData(batch, {
          enableDedupe: true,      // Let cleaner handle internal deduplication
          batchSize: 10,           // Internal batching for embeddings
          minConfidence: 0.3,      // Filter low-confidence categorizations
          enableDedupe: true       // Remove duplicates within batch
        });
        cleanedArticles.push(...batchCleaned);
        
        // Optional: Small delay between batches to prevent CPU spike
        if (i + CONFIG.batchSize < allArticles.length) {
          await new Promise(res => setTimeout(res, 50));
        }
      }
      
      // Final validation + normalization
      cleanedArticles = cleanedArticles
        .filter(isValidArticle)
        .map(article => ({
          ...article,
          title: article.title.trim(),
          url: article.url.trim(),
          updatedAt: new Date(),
        }));

      stats.cleaned = cleanedArticles.length;
      console.log(`✨ After cleaning: ${stats.cleaned} valid articles`);

      /* ======================
         5️⃣ BULK UPSERT (with error isolation)
         ✅ FIX: Removed redundant pre-cleaner DB deduplication
         - cleanNewsData already dedupes internally
         - bulkWrite with upsert handles DB-level duplicates
      ====================== */
      if (cleanedArticles.length > 0) {
        const operations = cleanedArticles.map(article => ({
          updateOne: {
            filter: { url: article.url }, // Match by URL only (requires unique index)
            update: { 
              $set: { 
                ...article, 
                updatedAt: new Date() 
              } 
            },
            upsert: true,
          },
        }));

        try {
          const result = await News.bulkWrite(operations, { 
            ordered: false, // Continue on error
            writeConcern: { w: 1 }
          });

          stats.inserted = result.upsertedCount || 0;
          stats.updated = result.modifiedCount || 0;
          
          console.log(`✅ Database: ${stats.inserted} inserted, ${stats.updated} updated`);

          // Safe sample logging
          if (cleanedArticles.length > 0) {
            console.log("\n📋 Sample processed articles:");
            cleanedArticles
              .slice(0, CONFIG.logSampleSize)
              .forEach((a, i) => {
                console.log(
                  `  ${i + 1}. "${a.title.substring(0, 60)}${a.title.length > 60 ? '...' : ''}"` +
                  ` | Category: ${a.category}` +  // Will be Bangla from cleaner (e.g., "রাজনীতি")
                  ` | Confidence: ${(a.confidence * 100).toFixed(0)}%` +
                  ` | Updated: ${safeDateISO(a.updatedAt)}`
                );
              });
          }
        } catch (dbErr) {
          stats.errors.push(`Bulk write failed: ${dbErr.message}`);
          console.error("❌ Database bulk write error:", dbErr.message);
          
          // Fallback: try saving one by one
          console.log("🔄 Falling back to individual saves...");
          let fallbackSaved = 0;
          for (const article of cleanedArticles) {
            try {
              await News.findOneAndUpdate(
                { url: article.url },
                { $set: { ...article, updatedAt: new Date() } },
                { upsert: true, new: true }
              );
              fallbackSaved++;
            } catch (singleErr) {
              console.warn(`⚠️ Failed to save ${article.url}: ${singleErr.message}`);
            }
          }
          console.log(`✅ Fallback saved: ${fallbackSaved} articles`);
        }
      } else {
        console.log("ℹ️ No valid articles to save this run");
      }

      /* ======================
         6️⃣ RUN COMPLETE
      ====================== */
      const endTime = new Date();
      const duration = endTime - startTime;
      
      stats.endTime = safeDateISO(endTime);
      stats.durationMs = duration;
      lastRunStats = stats;

      console.log("\n" + "=".repeat(50));
      console.log(`✅ [Run #${runId}] Completed in ${duration}ms`);
      console.log(`📊 Summary: ${stats.rssFetched} RSS → ${stats.scraped} scraped → ${stats.cleaned} cleaned → ${stats.inserted} new`);
      if (stats.errors.length > 0) {
        console.warn(`⚠️ Warnings: ${stats.errors.join("; ")}`);
      }
      console.log("=".repeat(50) + "\n");

    } catch (error) {
      stats.errors.push(`Critical error: ${error.message}`);
      console.error(`❌ [Run #${runId}] Auto updater critical error:`, {
        message: error.message,
        stack: error.stack,
      });
    } finally {
      jobRunning = false;
    }
  });

  // Expose status for health checks
  return {
    job,
    getStatus: () => ({
      running: jobRunning,
      shuttingDown: isShuttingDown,
      lastRun: lastRunStats,
      nextScheduled: job.nextDates ? job.nextDates(1)[0] : null,
    }),
    stop: () => {
      console.log("🛑 Stopping auto updater cron job...");
      job.stop();
      isShuttingDown = true;
    },
  };
}

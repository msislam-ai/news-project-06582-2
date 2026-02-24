import Parser from "rss-parser";
import { RSS_SOURCES } from "../config/rssSources.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0"
  },
  customFields: {
    item: [
      ["media:content", "media"],
      ["media:thumbnail", "thumbnail"]
    ]
  }
});

/* ======================
   🔧 Safe Helpers
====================== */
function safeString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "object") {
    if (value._text) return String(value._text);
    if (value.href) return String(value.href);
    return JSON.stringify(value); // fallback
  }
  return String(value);
}

function safeDate(value) {
  const d = new Date(value || Date.now());
  return isNaN(d.getTime()) ? new Date() : d;
}

/* ======================
   🚀 Fetch RSS by Category
====================== */
export async function fetchRSSByCategory(category) {
  try {
    const feeds = RSS_SOURCES[category];
    if (!feeds) return [];

    let allArticles = [];

    for (const feedSource of feeds) {
      try {
        const feed = await parser.parseURL(feedSource.url);

        const articles = feed.items.map(item => ({
          title: safeString(item.title || "No Title"),
          shortDescription: safeString(
            item.contentSnippet ||
            item.content ||
            item.summary ||
            ""
          ),
          link: safeString(item.link),
          publishDate: safeDate(item.pubDate),
          image: safeString(
            item.enclosure?.url ||
            item.media?.url ||
            item.thumbnail?.url ||
            ""
          ),
          category: safeString(category),
          source: safeString(feedSource.source)
        }));

        allArticles.push(...articles);

      } catch (err) {
        console.log(`RSS Error (${feedSource.source}):`, err.message);
      }
    }

    return allArticles;

  } catch (error) {
    console.log("RSS Category Error:", error.message);
    return [];
  }
}

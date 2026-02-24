// backend/services/newsAPIService.js
import axios from "axios";
import News from "../models/News.js";
import cleanNewsData from "../utils/newsCleaner.js";

export async function fetchAndSaveNews({ query = "", limit = 10, lang = "en" } = {}) {
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) throw new Error("NEWS_API_KEY not found in .env");

  try {
    const finalLimit = limit > 10 ? 10 : limit;
    let url = `
https://gnews.io/api/v4/top-headlines?country=bd&category=general&apikey=${NEWS_API_KEY}&lang=${lang}&max=${finalLimit}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;

    console.log("Requesting URL:", url);

    const { data } = await axios.get(url);

    if (!data.articles || data.articles.length === 0) {
      console.log("No articles fetched from API");
      return 0;
    }

    const rawArticles = data.articles.map(item => ({
      title: item.title,
      description: item.description,
      content: item.content,
      image: item.image,
      source: item.source.name,
      url: item.url,
      pubDate: item.publishedAt,
    }));

    const cleanedArticles = cleanNewsData(rawArticles);

    let savedCount = 0;
    for (const article of cleanedArticles) {
      const exists = await News.findOne({ url: article.url });
      if (!exists) {
        await News.create(article);
        savedCount++;
      }
    }

    console.log(`✅ ${savedCount} new articles saved to DB`);
    return savedCount;

  } catch (error) {
    console.log("News API fetch/save error:", error.response?.data || error.message);
    return 0;
  }
}

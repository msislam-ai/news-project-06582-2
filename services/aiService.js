// backend/puterService.js
import express from "express";
import { puter } from "@heyputer/puter.js";
import dotenv from "dotenv";

dotenv.config();

class PuterAIService {
  constructor() {
    this.isAvailable = true;
    console.log("✅ Puter.js backend service initialized");
  }

  // 🔁 Retry system for Puter.js AI calls
  async callAIWithRetry(payload, retries = 2) {
    try {
      const response = await puter.ai.chat(payload);

      // ❗ Detect HTML error (502 etc.)
      if (typeof response === "string" && response.includes("<html")) {
        throw new Error("Invalid HTML response (502 Bad Gateway)");
      }

      return response;
    } catch (err) {
      console.warn(`⚠️ AI call failed: ${err.message}`);

      if (retries > 0) {
        console.log(`🔁 Retrying... (${retries})`);
        return this.callAIWithRetry(payload, retries - 1);
      }

      throw err;
    }
  }

  // 📰 Rewrite Article
  async rewriteArticle(articleText) {
    if (!articleText || articleText.length < 10) return articleText;

    const textToProcess =
      articleText.length > 3000
        ? articleText.substring(0, 3000) + "..."
        : articleText;

    const prompt = `
You are a professional Bangla news writer. Rewrite the following news article in Bangla:
1. Keep all facts accurate
2. Make it engaging and structured
3. Use professional tone
4. Output only Bangla text

${textToProcess}
`;

    try {
      const response = await this.callAIWithRetry({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-3.5-turbo",
        max_tokens: 1500,
        temperature: 0.7,
      });

      if (!response) return articleText;

      if (response.choices && Array.isArray(response.choices)) {
        return response.choices[0]?.message?.content || articleText;
      }

      if (typeof response.content === "string") return response.content;

      return articleText;
    } catch (err) {
      console.error("❌ AI Rewrite Error:", err.message);
      return articleText;
    }
  }

  // ✂️ Summarize Article
  async summarizeArticle(articleText, maxLength = 200) {
    if (!articleText) return "";

    const prompt = `Summarize this in ${maxLength} characters in Bangla:\n${articleText.substring(
      0,
      1000
    )}`;

    try {
      const response = await this.callAIWithRetry({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-3.5-turbo",
        max_tokens: 300,
        temperature: 0.3,
      });

      if (!response) return articleText.substring(0, maxLength);

      if (response.choices && Array.isArray(response.choices)) {
        return response.choices[0]?.message?.content || articleText.substring(0, maxLength);
      }

      if (typeof response.content === "string") return response.content;

      return articleText.substring(0, maxLength);
    } catch (err) {
      console.error("❌ Summarization error:", err.message);
      return articleText.substring(0, maxLength);
    }
  }
}

// ✅ Singleton instance
const puterAIService = new PuterAIService();

// ==========================
// Express backend API
// ==========================
const app = express();
app.use(express.json());

// Rewrite endpoint
app.post("/api/rewrite", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Text is required" });

  const rewritten = await puterAIService.rewriteArticle(text);
  res.json({ rewritten });
});

// Summarize endpoint
app.post("/api/summarize", async (req, res) => {
  const { text, maxLength } = req.body;
  if (!text) return res.status(400).json({ error: "Text is required" });

  const summary = await puterAIService.summarizeArticle(text, maxLength || 200);
  res.json({ summary });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Puter.js backend running on port ${PORT}`));

export default puterAIService;

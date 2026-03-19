import { MongoClient } from "mongodb";
import { puter } from "@heyputer/puter.js";
import dotenv from "dotenv";

dotenv.config();

/* =============================
   Mongo Setup
============================= */
const MONGO = process.env.MONGO_URI;
const DB_NAME = "newsDB";
const COLLECTION_NAME = "news";

const clientDB = new MongoClient(MONGO);

/* =============================
   Keyword Maps (Bangla only)
============================= */
const keywordMap = {
  politics: [
    "রাজনীতি","সরকার","মন্ত্রী","প্রধানমন্ত্রী","রাষ্ট্রপতি","সংসদ","নির্বাচন","ভোট",
    "বিএনপি","আওয়ামী লীগ","রাজনৈতিক","মিছিল","সমাবেশ","দলীয়","ক্যাম্পেইন","নীতিমালা",
    "মন্ত্রিসভা","কংগ্রেস","সংশোধন","সংসদ সদস্য","প্রেসিডেন্ট","গণতন্ত্র","প্রশাসন",
    "চলমান আইন","রাজ্য","রাজনীতি সংবাদ","রাজনৈতিক দল","ভোটাধিকার","উপনির্বাচন",
    "প্রার্থী","নির্বাচনী প্রচারণা","পদাধিকার","মহানগর","উপনেতা","গণপ্রজাতন্ত্রী"
  ],
  sports: [
    "খেলা","ক্রীড়া","ক্রিকেট","ফুটবল","ম্যাচ","বিশ্বকাপ","গোল","রান","খেলোয়াড়","টুর্নামেন্ট",
    "চ্যাম্পিয়ন","লিগ","স্কোর","অলিম্পিক","বিসিসিআই","ট্রফি","প্রতিযোগিতা","জেতা",
    "পরাজয়","দল","প্রশিক্ষক","মাঠ","স্টেডিয়াম","ফাইনাল","সিরিজ","সাব-লিগ","ইনিংস",
    "ক্লাব","নেশনাল টিম","ম্যাচ রেজাল্ট","টুর্নামেন্ট শিরোপা","রেকর্ড","ব্যাটিং","বোলিং"
  ],
  entertainment: [
    "বিনোদন","সিনেমা","চলচ্চিত্র","নাটক","তারকা","অভিনেতা","অভিনেত্রী","গান","মিউজিক",
    "শোবিজ","টেলিভিশন","সিরিজ","কনসার্ট","ডিজে","নাট্য","পরিচালক","প্রযোজক","স্টার",
    "অভিনয়","সংগীত","গান লেখা","শিল্পী","সেলিব্রিটি","ভক্ত","ব্যান্ড","স্টেজ শো",
    "ফ্যান","মিউজিক ভিডিও","মঞ্চ","ব্লকবাস্টার","অ্যাওয়ার্ড","ফিল্ম ফেস্টিভাল"
  ],
  technology: [
    "প্রযুক্তি","ডিজিটাল","ইন্টারনেট","এআই","কম্পিউটার","সফটওয়্যার","অ্যাপ","স্টার্টআপ",
    "ডেটা","স্মার্টফোন","ট্যাবলেট","গ্যাজেট","প্রোগ্রামিং","কোডিং","অ্যালগরিদম",
    "নেটওয়ার্ক","সাইবার","ইনোভেশন","রোবট","অটোমেশন","টেকনোলজি নিউজ","ডিজিটালাইজেশন",
    "ই-কমার্স","অ্যাপ ডেভেলপমেন্ট","ওয়েবসাইট","ক্লাউড","ডেটা সায়েন্স","মেশিন লার্নিং",
    "ডিজিটাল মার্কেটিং","আইটি সলিউশন"
  ],
  national: [
    "বাংলাদেশ","ঢাকা","একুশে","শহীদ মিনার","স্বাধীনতা","মুক্তিযুদ্ধ","জাতীয়","দেশব্যাপী",
    "সংস্কৃতি","শহর","জেলা","উপজেলা","গ্রাম","জনগণ","জাতীয় দিবস","সরকারি ঘোষণা",
    "প্রশাসন","নাগরিক","শিক্ষা প্রতিষ্ঠান","স্বাস্থ্য প্রতিষ্ঠান","বাংলাদেশী","সরকারি প্রকল্প",
    "নাগরিক অধিকার","জাতীয় নীতি","নির্বাচনী ফলাফল","রাজধানী","জাতীয় অনুষ্ঠান","উন্নয়ন"
  ],
  international: [
    "আন্তর্জাতিক","বিশ্ব","যুক্তরাষ্ট্র","চীন","রাশিয়া","ইউক্রেন","জাতিসংঘ","গ্লোবাল",
    "পররাষ্ট্রনীতি","বিদেশ","আন্তঃরাষ্ট্রীয়","আন্তর্জাতিক সম্পর্ক","সংঘ","জাতিসংঘ সংবাদ",
    "দূতাবাস","বৈশ্বিক","আন্তর্জাতিক সম্মেলন","শীর্ষ সম্মেলন","সাংবাদিক সম্মেলন",
    "আন্তর্জাতিক সংস্থা","বৈশ্বিক ঘটনা","আন্তর্জাতিক অর্থনীতি","পর্যটন","বিদেশী বিনিয়োগ"
  ],
  economy: [
    "অর্থনীতি","ব্যাংক","ডলার","মুদ্রাস্ফীতি","বাজার","বাণিজ্য","বাজেট","শেয়ারবাজার",
    "বিনিয়োগ","আর্থিক","কর","ট্যাক্স","পুঁজিবাজার","মুদ্রা","অর্থনৈতিক নীতি","বৈদেশিক বিনিয়োগ",
    "মুদ্রানীতি","বাণিজ্য চুক্তি","বাজেট আলোচনা","শিল্প","ব্যবসা","লাভ","ক্ষতি","কৃষি অর্থনীতি",
    "বাজারমূল্য","মূল্যস্ফীতি","মুদ্রানীতি পর্যালোচনা","ধনবান","বিনিয়োগকারী","কোম্পানি"
  ],
  education: [
    "শিক্ষা","বিশ্ববিদ্যালয়","স্কুল","কলেজ","পরীক্ষা","এইচএসসি","এসএসসি","শিক্ষার্থী",
    "শিক্ষক","শিক্ষা প্রতিষ্ঠান","শিক্ষা নীতি","শিক্ষাব্যবস্থা","শিক্ষার্থী উন্নয়ন","কারিকুলাম",
    "পাঠ্যক্রম","শিক্ষা সংবাদ","পরীক্ষার ফলাফল","শিক্ষা সম্প্রসারণ","স্কলারশিপ","শিক্ষা পরিকল্পনা",
    "শিক্ষা মান","শিক্ষাগত","শিক্ষা অধিদপ্তর","বিদ্যালয় পরিদর্শন"
  ],
  health: [
    "স্বাস্থ্য","হাসপাতাল","ডাক্তার","রোগী","ডেঙ্গু","করোনা","চিকিৎসা","টিকা",
    "মেডিকেল","রোগ","সংক্রমণ","ডায়াগনোসিস","হেলথকেয়ার","স্বাস্থ্যবিধি","ভ্যাকসিন",
    "চিকিৎসা সেবা","ডেন্টাল","ফিজিওথেরাপি","স্বাস্থ্য সচেতনতা","প্রদাহ","সংক্রমণ প্রতিরোধ",
    "হাসপাতাল সেবা","স্বাস্থ্যনীতি","স্বাস্থ্য কেন্দ্র","ডাক্তার পরামর্শ"
  ]
};

/* =============================
   Normalize Text
============================= */
function normalizeText(text = "") {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").normalize("NFC");
}

/* =============================
   Keyword Categorizer
============================= */
function categorizeWithKeywords(textInput) {
  const text = normalizeText(textInput);
  const words = text.split(/\s+/);

  let scores = {};
  for (const [category, keywords] of Object.entries(keywordMap)) {
    scores[category] = keywords.filter(kw => words.includes(normalizeText(kw))).length;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

/* =============================
   AI Fallback
============================= */
async function categorizeWithPuter(text) {
  try {
    const response = await puter.ai.chat({
      prompt: `
You are an expert Bangla news classifier.
Classify the news into ONE category:
politics, sports, technology, entertainment, national, international, economy, education, health, general.
News:
${text}
`,
      max_tokens: 3,
      temperature: 0
    });

    const raw = response?.toString() || "";
    const cleaned = raw.toLowerCase().replace(/[^a-z]/g, "").trim();
    const allowed = Object.keys(keywordMap).concat(["general"]);
    return allowed.includes(cleaned) ? cleaned : "general";
  } catch (error) {
    console.error("AI Categorization Error:", error);
    return "general";
  }
}

/* =============================
   Category Mapping
============================= */
function mapCategory(cat) {
  const allowed = Object.keys(keywordMap).concat(["general"]);
  if (!cat) return "general";
  cat = cat.toLowerCase().trim();
  return allowed.includes(cat) ? cat : "general";
}

/* =============================
   MAIN DATA MANAGER
============================= */
export async function manageData() {
  try {
    await clientDB.connect();
    const db = clientDB.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    console.log("✅ Connected to DB");

    // Delete old news (>10 days)
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    await collection.deleteMany({ createdAt: { $lt: tenDaysAgo } });

    // Remove duplicate titles
    const duplicates = await collection.aggregate([
      { $group: { _id: "$title", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    for (const doc of duplicates) {
      doc.ids.shift(); // keep one
      await collection.deleteMany({ _id: { $in: doc.ids } });
    }

    // Remove broken images
    await collection.deleteMany({
      $or: [
        { image: null },
        { image: "" },
        { image: { $exists: false } },
        { image: { $regex: /placeholder/i } }
      ]
    });

    // Fetch all news, sorted newest → oldest
    const allNews = await collection.find({}).sort({ createdAt: -1 }).toArray();
    console.log(`🧠 Items to categorize: ${allNews.length}`);

    // Categorize all
    for (const item of allNews) {
      const combinedText = `${item.title || ""} ${item.shortDescription || ""}`;
      let category = categorizeWithKeywords(combinedText);
      if (!category) category = await categorizeWithPuter(combinedText);
      const finalCategory = mapCategory(category);

      const result = await collection.updateOne(
        { _id: item._id },
        { $set: { category: finalCategory } }
      );
      console.log(`✅ ${item.title} → ${finalCategory} (matched: ${result.matchedCount}, modified: ${result.modifiedCount})`);
    }

    console.log("🎯 All news categorized successfully");

  } catch (error) {
    console.error("Manage Data Error:", error);
  } finally {
    await clientDB.close();
    console.log("🔌 DB Connection Closed");
  }
}

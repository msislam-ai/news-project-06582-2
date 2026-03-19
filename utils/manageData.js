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
   Keyword Maps (Bangla + English)
============================= */
const keywordMap = {

  politics: [
    "রাজনীতি","সরকার","মন্ত্রী","প্রধানমন্ত্রী","রাষ্ট্রপতি",
    "সংসদ","নির্বাচন","ভোট","বিএনপি","আওয়ামী লীগ",
    "রাজনৈতিক","মিছিল","সমাবেশ",

    "politics","government","minister","prime minister","president",
    "parliament","election","vote","political","rally","protest"
  ],

  sports: [
    "খেলা","ক্রীড়া","ক্রিকেট","ফুটবল","ম্যাচ",
    "বিশ্বকাপ","গোল","রান","খেলোয়াড়","টুর্নামেন্ট",

    "sports","cricket","football","match","world cup",
    "goal","run","player","tournament","game"
  ],

  entertainment: [
    "বিনোদন","সিনেমা","চলচ্চিত্র","নাটক","তারকা",
    "অভিনেতা","অভিনেত্রী","গান","মিউজিক","শোবিজ",

    "entertainment","movie","film","cinema","drama",
    "actor","actress","music","song","celebrity","showbiz"
  ],

  technology: [
    "প্রযুক্তি","ডিজিটাল","ইন্টারনেট","এআই",
    "কম্পিউটার","সফটওয়্যার","অ্যাপ","স্টার্টআপ",

    "technology","tech","digital","internet","ai",
    "computer","software","app","startup","it","innovation"
  ],

  national: [
    "বাংলাদেশ","ঢাকা","একুশে","শহীদ মিনার",
    "স্বাধীনতা","মুক্তিযুদ্ধ","জাতীয়","দেশব্যাপী",

    "bangladesh","dhaka","national","countrywide",
    "independence","liberation war"
  ],

  international: [
    "আন্তর্জাতিক","বিশ্ব","যুক্তরাষ্ট্র","চীন",
    "রাশিয়া","ইউক্রেন","জাতিসংঘ","গ্লোবাল",

    "international","world","usa","china","russia",
    "ukraine","un","global","foreign"
  ],

  economy: [
    "অর্থনীতি","ব্যাংক","ডলার","মুদ্রাস্ফীতি",
    "বাজার","বাণিজ্য","বাজেট","শেয়ারবাজার",

    "economy","bank","dollar","inflation",
    "market","trade","budget","stock market","finance"
  ],

  education: [
    "শিক্ষা","বিশ্ববিদ্যালয়","স্কুল","কলেজ",
    "পরীক্ষা","এইচএসসি","এসএসসি","শিক্ষার্থী",

    "education","university","school","college",
    "exam","student","hsc","ssc","academic"
  ],

  health: [
    "স্বাস্থ্য","হাসপাতাল","ডাক্তার","রোগী",
    "ডেঙ্গু","করোনা","চিকিৎসা","টিকা",

    "health","hospital","doctor","patient",
    "dengue","covid","treatment","vaccine","medical"
  ]
};

/* =============================
   Normalize Text
============================= */
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .normalize("NFC");
}

/* =============================
   Smart Keyword Categorizer
   (Word-based matching)
============================= */
function categorizeWithKeywords(textInput) {

  const text = normalizeText(textInput);
  const words = text.split(/\s+/);

  let scores = {};

  for (const [category, keywords] of Object.entries(keywordMap)) {
    scores[category] = keywords.filter(kw =>
      words.includes(normalizeText(kw))
    ).length;
  }

  const best = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0];

  return best && best[1] > 0 ? best[0] : null;
}

/* =============================
   AI Categorization (Fallback)
============================= */
async function categorizeWithPuter(text) {

  try {
    const response = await puter.ai.chat({
      prompt: `
You are an expert multilingual news classifier.

Classify the news into EXACTLY ONE category.

Allowed categories:
politics
sports
technology
entertainment
national
international
economy
education
health
general

Rules:
- Understand Bangla and English
- Focus on MAIN topic
- Bangladesh internal → national
- World/global → international
- If unsure → general
- Reply ONLY one lowercase word

News:
${text}
`,
      max_tokens: 3,
      temperature: 0
    });

    const raw = response?.toString() || "";

    const cleaned = raw
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .trim();

    const allowed = [
      "politics","sports","technology","entertainment",
      "national","international","economy",
      "education","health","general"
    ];

    return allowed.includes(cleaned)
      ? cleaned
      : "general";

  } catch (error) {
    console.error("AI Categorization Error:", error);
    return "general";
  }
}

/* =============================
   Category Safety Mapping
============================= */
function mapCategory(cat) {

  const allowed = [
    "politics","sports","technology","entertainment",
    "national","international","economy",
    "education","health","general"
  ];

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

    /* =============================
       Delete Old News
    ============================= */
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const deleted = await collection.deleteMany({
      createdAt: { $exists: true, $lt: tenDaysAgo }
    });

    console.log(`🧹 Old news removed: ${deleted.deletedCount}`);

    /* =============================
       Remove Duplicate Titles
    ============================= */
    const duplicates = await collection.aggregate([
      {
        $group: {
          _id: "$title",
          ids: { $push: "$_id" },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    for (const doc of duplicates) {
      doc.ids.shift();
      await collection.deleteMany({ _id: { $in: doc.ids } });
    }

    console.log("🧹 Duplicate news cleaned");

    /* =============================
       Remove Broken Image News
    ============================= */
    const broken = await collection.deleteMany({
      $or: [
        { image: null },
        { image: "" },
        { image: { $exists: false } },
        { image: { $regex: /placeholder/i } }
      ]
    });

    console.log("🧹 Broken images:", broken.deletedCount);

    /* =============================
       Recategorize All News
       (Sorted latest first)
    ============================= */
    const allNews = await collection
      .find({})
      .sort({ createdAt: -1 }) // 🔥 latest first
      .toArray();

    console.log(`🧠 Items to categorize: ${allNews.length}`);

    for (const item of allNews) {

      const combinedText = `
        ${item.title || ""}
        ${item.shortDescription || ""}
      `;

      let category = categorizeWithKeywords(combinedText);

      if (!category) {
        category = await categorizeWithPuter(combinedText);
      }

      const finalCategory = mapCategory(category);

      await collection.updateOne(
        { _id: item._id },
        { $set: { category: finalCategory } }
      );

      console.log(`✅ ${item.title} → ${finalCategory}`);
    }

    console.log("🎯 All news categorized successfully");

  } catch (error) {
    console.error("Manage Data Error:", error);
  } finally {
    await clientDB.close();
    console.log("🔌 DB Connection Closed");
  }

}

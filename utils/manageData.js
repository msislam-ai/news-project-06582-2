// backend/utils/newsCleaner.js

import { MongoClient } from "mongodb";
import { puter } from "@heyputer/puter.js";
import dotenv from "dotenv";

dotenv.config();

/* ===================================================
   📦 OPTIONAL DEPENDENCY LOADING (Graceful Degradation)
=================================================== */
const OPTIONAL_DEPS = {
  stemmer: null,
  transformer: null,
  ner: null
};

async function loadOptionalDeps() {
  // 🔤 Bengali Stemmer
  try {
    const { stem } = await import('bangla-stemmer');
    OPTIONAL_DEPS.stemmer = stem;
    console.log('✅ Bengali stemmer loaded');
  } catch (e) {
    console.log('ℹ️  Stemmer not available - using fallback');
    OPTIONAL_DEPS.stemmer = (word) => word.toLowerCase();
  }

  // 🧠 BanglaBERT via Transformers.js (optional for semantic scoring)
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    
    OPTIONAL_DEPS.transformer = await pipeline(
      'feature-extraction',
      'sagorsarker/bangla-bert-base',
      { quantized: true }
    );
    console.log('✅ BanglaBERT loaded (quantized)');
  } catch (e) {
    console.log('ℹ️  BanglaBERT not available - using keyword fallback');
    OPTIONAL_DEPS.transformer = null;
  }

  // 🏷️ NER Fallback (regex-based, no external deps required)
  OPTIONAL_DEPS.ner = {
    extract: (text) => regexEntityExtractor(text)
  };
  console.log('🏷️  NER initialized (regex fallback)');
  
  return OPTIONAL_DEPS;
}

/* ===================================================
   🏷️ REGEX-BASED ENTITY EXTRACTOR (No Dependencies)
=================================================== */
function regexEntityExtractor(text) {
  const entities = { people: [], organizations: [], locations: [], all: [] };
  const normalized = text.toLowerCase();
  
  // 📍 Bangladeshi locations
  const locations = [
    'ঢাকা', 'চট্টগ্রাম', 'খুলনা', 'রাজশাহী', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ',
    'পদ্মা সেতু', 'সুন্দরবন', 'কক্সবাজার', 'বঙ্গবন্ধু', 'শাহজালাল'
  ];
  
  // 🏢 Organizations
  const orgPatterns = [
    /\b(বিএনপি|আওয়ামী লীগ|জামায়াত|বাংলাদেশ ব্যাংক|র‍্যাব|পুলিশ|হাইকোর্ট|সুপ্রিম কোর্ট|জাতিসংঘ|ন্যাটো)/g,
    /\b(বাংলাদেশ|জাতীয়|আন্তর্জাতিক)\s+[\u0980-\u09FF]{2,15}(ব্যাংক|বোর্ড|কমিশন|মন্ত্রণালয়|ইউনিভার্সিটি)/g
  ];
  
  // 👤 Person patterns
  const personPatterns = [
    /\b(শেখ|মোঃ|মোহাম্মদ|ডঃ|প্রফেসর|জনাব|বেগম)\s+[\u0980-\u09FF]{2,20}/g,
    /\b[\u0980-\u09FF]{3,15}\s+(হোসেন|হাসান|আলী|খান|চৌধুরী|রহমান)\b/g
  ];
  
  // Extract locations
  for (const loc of locations) {
    if (normalized.includes(loc.toLowerCase())) {
      entities.locations.push(loc);
      entities.all.push({ text: loc, type: 'LOC' });
    }
  }
  
  // Extract organizations
  for (const pattern of orgPatterns) {
    const matches = normalized.match(pattern);
    if (matches) {
      matches.forEach(m => {
        const text = m.trim();
        if (!entities.organizations.includes(text)) {
          entities.organizations.push(text);
          entities.all.push({ text, type: 'ORG' });
        }
      });
    }
  }
  
  // Extract people
  for (const pattern of personPatterns) {
    const matches = normalized.match(pattern);
    if (matches) {
      matches.forEach(m => {
        const text = m.trim();
        if (!entities.people.includes(text)) {
          entities.people.push(text);
          entities.all.push({ text, type: 'PERSON' });
        }
      });
    }
  }
  
  return entities;
}

/* ===================================================
   🧠 CONFIGURATION
=================================================== */
const CONFIG = {
  // Database
  MONGO_URI: process.env.MONGO_URI,
  DB_NAME: "newsDB",
  COLLECTION_NAME: "news",
  
  // Categorization
  confidenceThreshold: 0.3,
  minKeywordMatches: 1,
  enableStemming: true,
  enableSemanticScoring: true,
  enableNER: true,
  useAIFallback: true,
  
  // Performance
  batchSize: 20,
  embeddingCacheSize: 500,
  maxRetries: 3,
  
  // Data retention
  deleteOlderThanDays: 5,
  minDescriptionLength: 40,
  
  // Debug
  debugMode: false
};

/* ===================================================
   🔤 TEXT NORMALIZATION & STEMMING
=================================================== */
const normalizationCache = new Map();

function normalizeText(text = "") {
  if (!text) return "";
  const key = `norm:${text}`;
  
  if (normalizationCache.has(key)) {
    return normalizationCache.get(key);
  }
  
  const result = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")  // Keep letters, numbers, spaces
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
  
  // LRU cache management
  if (normalizationCache.size > 10000) {
    normalizationCache.delete(normalizationCache.keys().next().value);
  }
  normalizationCache.set(key, result);
  
  return result;
}

function stemWord(word) {
  if (!CONFIG.enableStemming || !OPTIONAL_DEPS.stemmer) return normalizeText(word);
  return OPTIONAL_DEPS.stemmer(normalizeText(word));
}

function stemSentence(sentence) {
  if (!CONFIG.enableStemming) return normalizeText(sentence);
  return sentence
    .split(/(\s+|[^\u0980-\u09FF\w])/)
    .map(token => /^[\s\W]+$/.test(token) ? token : stemWord(token))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ===================================================
   📊 ENHANCED KEYWORD MAP WITH WEIGHTS & STEMS
=================================================== */
const keywordMap = {
  politics: {
    keywords: [
      { word: "রাজনীতি", weight: 3, stem: "রাজনীতি" },
      { word: "সরকার", weight: 3, stem: "সরকার" },
      { word: "মন্ত্রী", weight: 2, stem: "মন্ত্র" },
      { word: "প্রধানমন্ত্রী", weight: 4, stem: "প্রধানমন্ত্র" },
      { word: "রাষ্ট্রপতি", weight: 3, stem: "রাষ্ট্রপতি" },
      { word: "সংসদ", weight: 3, stem: "সংসদ" },
      { word: "নির্বাচন", weight: 4, stem: "নির্বাচন" },
      { word: "ভোট", weight: 2, stem: "ভোট" },
      { word: "বিএনপি", weight: 3, stem: "বিএনপি" },
      { word: "আওয়ামী লীগ", weight: 3, stem: "আওয়ামী লীগ" },
      { word: "বিক্ষোভ", weight: 2, stem: "বিক্ষোভ" },
      { word: "মিছিল", weight: 2, stem: "মিছিল" },
      { word: "সমাবেশ", weight: 2, stem: "সমাবেশ" },
      { word: "আইন পাস", weight: 3, stem: "আইন পাস" },
      { word: "সংবিধান", weight: 3, stem: "সংবিধান" }
    ],
    negative: ["খেলা", "ক্রিকেট", "ফুটবল", "সিনেমা"],
    semanticExamples: [
      "সংসদে নতুন আইন পাস হয়েছে",
      "প্রধানমন্ত্রী জাতির উদ্দেশ্যে ভাষণ দিয়েছেন",
      "বিরোধী দল সংসদ বর্জন করেছে"
    ]
  },
  
  sports: {
    keywords: [
      { word: "খেলা", weight: 2, stem: "খেলা" },
      { word: "ক্রীড়া", weight: 2, stem: "ক্রীড়া" },
      { word: "ক্রিকেট", weight: 4, stem: "ক্রিকেট" },
      { word: "ফুটবল", weight: 4, stem: "ফুটবল" },
      { word: "ম্যাচ", weight: 3, stem: "ম্যাচ" },
      { word: "বিশ্বকাপ", weight: 4, stem: "বিশ্বকাপ" },
      { word: "গোল", weight: 2, stem: "গোল" },
      { word: "রান", weight: 2, stem: "রান" },
      { word: "উইকেট", weight: 2, stem: "উইকেট" },
      { word: "সেঞ্চুরি", weight: 3, stem: "সেঞ্চুরি" },
      { word: "খেলোয়াড়", weight: 2, stem: "খেলোয়াড়" },
      { word: "টুর্নামেন্ট", weight: 3, stem: "টুর্নামেন্ট" },
      { word: "লিগ", weight: 2, stem: "লিগ" },
      { word: "বাংলাদেশ দল", weight: 3, stem: "বাংলাদেশ দল" }
    ],
    semanticExamples: [
      "বাংলাদেশ দল বিশ্বকাপে জয়লাভ করেছে",
      "শাকিব আল হাসান সেঞ্চুরি করেছেন",
      "ফুটবল ম্যাচে গোল হয়েছে"
    ]
  },
  
  entertainment: {
    keywords: [
      { word: "বিনোদন", weight: 3, stem: "বিনোদন" },
      { word: "সিনেমা", weight: 3, stem: "সিনেমা" },
      { word: "চলচ্চিত্র", weight: 3, stem: "চলচ্চিত্র" },
      { word: "নাটক", weight: 3, stem: "নাটক" },
      { word: "তারকা", weight: 2, stem: "তারকা" },
      { word: "অভিনেতা", weight: 2, stem: "অভিনেতা" },
      { word: "অভিনেত্রী", weight: 2, stem: "অভিনেত্রী" },
      { word: "গান", weight: 2, stem: "গান" },
      { word: "মিউজিক", weight: 2, stem: "মিউজিক" },
      { word: "শোবিজ", weight: 2, stem: "শোবিজ" },
      { word: "ওটিটি", weight: 2, stem: "ওটিটি" },
      { word: "চরকি", weight: 2, stem: "চরকি" },
      { word: "হইচই", weight: 2, stem: "হইচই" }
    ],
    semanticExamples: [
      "নতুন নাটক ওটিটি প্ল্যাটফর্মে মুক্তি পেয়েছে",
      "জনপ্রিয় অভিনেত্রী নতুন সিনেমায় অভিনয় করছেন",
      "সঙ্গীত অনুষ্ঠানে হাজারো দর্শক"
    ]
  },
  
  technology: {
    keywords: [
      { word: "প্রযুক্তি", weight: 4, stem: "প্রযুক্তি" },
      { word: "ডিজিটাল", weight: 2, stem: "ডিজিটাল" },
      { word: "ইন্টারনেট", weight: 2, stem: "ইন্টারনেট" },
      { word: "এআই", weight: 3, stem: "এআই" },
      { word: "কৃত্রিম বুদ্ধিমত্তা", weight: 4, stem: "কৃত্রিম বুদ্ধিমত্তা" },
      { word: "কম্পিউটার", weight: 2, stem: "কম্পিউটার" },
      { word: "সফটওয়্যার", weight: 2, stem: "সফটওয়্যার" },
      { word: "অ্যাপ", weight: 2, stem: "অ্যাপ" },
      { word: "স্টার্টআপ", weight: 3, stem: "স্টার্টআপ" },
      { word: "সাইবার", weight: 2, stem: "সাইবার" },
      { word: "হ্যাক", weight: 2, stem: "হ্যাক" },
      { word: "5জি", weight: 3, stem: "5জি" },
      { word: "ব্লকচেইন", weight: 2, stem: "ব্লকচেইন" }
    ],
    semanticExamples: [
      "নতুন এআই মডেল বাংলা ভাষায় কাজ করবে",
      "সাইবার হামলায় ব্যাংকিং সেবা ব্যাহত",
      "স্টার্টআপ নতুন ফান্ডিং পেয়েছে"
    ]
  },
  
  national: {
    keywords: [
      { word: "বাংলাদেশ", weight: 4, stem: "বাংলাদেশ" },
      { word: "ঢাকা", weight: 3, stem: "ঢাকা" },
      { word: "একুশে", weight: 3, stem: "একুশে" },
      { word: "শহীদ মিনার", weight: 3, stem: "শহীদ মিনার" },
      { word: "স্বাধীনতা", weight: 3, stem: "স্বাধীনতা" },
      { word: "মুক্তিযুদ্ধ", weight: 4, stem: "মুক্তিযুদ্ধ" },
      { word: "জাতীয়", weight: 2, stem: "জাতীয়" },
      { word: "দেশব্যাপী", weight: 3, stem: "দেশব্যাপী" },
      { word: "পুলিশ", weight: 2, stem: "পুলিশ" },
      { word: "র‍্যাব", weight: 2, stem: "র‍্যাব" },
      { word: "আদালত", weight: 2, stem: "আদালত" },
      { word: "দুর্ঘটনা", weight: 2, stem: "দুর্ঘটনা" },
      { word: "বন্যা", weight: 2, stem: "বন্যা" },
      { word: "ঘূর্ণিঝড়", weight: 3, stem: "ঘূর্ণিঝড়" }
    ],
    semanticExamples: [
      "দেশব্যাপী বন্যা পরিস্থিতি অবনতি",
      "ঢাকায় নতুন মেট্রো রেল উদ্বোধন",
      "পুলিশ নতুন নিরাপত্তা ব্যবস্থা চালু করেছে"
    ]
  },
  
  international: {
    keywords: [
      { word: "আন্তর্জাতিক", weight: 3, stem: "আন্তর্জাতিক" },
      { word: "বিশ্ব", weight: 2, stem: "বিশ্ব" },
      { word: "যুক্তরাষ্ট্র", weight: 3, stem: "যুক্তরাষ্ট্র" },
      { word: "চীন", weight: 3, stem: "চীন" },
      { word: "রাশিয়া", weight: 3, stem: "রাশিয়া" },
      { word: "ইউক্রেন", weight: 3, stem: "ইউক্রেন" },
      { word: "জাতিসংঘ", weight: 3, stem: "জাতিসংঘ" },
      { word: "গ্লোবাল", weight: 2, stem: "গ্লোবাল" },
      { word: "যুদ্ধ", weight: 3, stem: "যুদ্ধ" },
      { word: "সংঘাত", weight: 3, stem: "সংঘাত" },
      { word: "নিষেধাজ্ঞা", weight: 3, stem: "নিষেধাজ্ঞা" },
      { word: "কূটনীতি", weight: 2, stem: "কূটনীতি" },
      { word: "পররাষ্ট্র", weight: 2, stem: "পররাষ্ট্র" }
    ],
    semanticExamples: [
      "জাতিসংঘে নতুন রেজোলিউশন পাস",
      "আমেরিকা ও চীনের বাণিজ্যিক চুক্তি",
      "ইউক্রেনে যুদ্ধ পরিস্থিতি"
    ]
  },
  
  economy: {
    keywords: [
      { word: "অর্থনীতি", weight: 4, stem: "অর্থনীতি" },
      { word: "ব্যাংক", weight: 2, stem: "ব্যাংক" },
      { word: "বাংলাদেশ ব্যাংক", weight: 4, stem: "বাংলাদেশ ব্যাংক" },
      { word: "ডলার", weight: 2, stem: "ডলার" },
      { word: "মুদ্রাস্ফীতি", weight: 3, stem: "মুদ্রাস্ফীতি" },
      { word: "বাজার", weight: 2, stem: "বাজার" },
      { word: "বাণিজ্য", weight: 2, stem: "বাণিজ্য" },
      { word: "বাজেট", weight: 4, stem: "বাজেট" },
      { word: "শেয়ারবাজার", weight: 3, stem: "শেয়ারবাজার" },
      { word: "ডিএসই", weight: 3, stem: "ডিএসই" },
      { word: "রপ্তানি", weight: 3, stem: "রপ্তানি" },
      { word: "আমদানি", weight: 3, stem: "আমদানি" },
      { word: "রিমিট্যান্স", weight: 3, stem: "রিমিট্যান্স" },
      { word: "জিডিপি", weight: 3, stem: "জিডিপি" }
    ],
    semanticExamples: [
      "বাংলাদেশ ব্যাংক সুদের হার বাড়িয়েছে",
      "রপ্তানি আয় রেকর্ড পরিমাণ বেড়েছে",
      "শেয়ার বাজারে বড় পতন"
    ]
  },
  
  education: {
    keywords: [
      { word: "শিক্ষা", weight: 4, stem: "শিক্ষা" },
      { word: "বিশ্ববিদ্যালয়", weight: 3, stem: "বিশ্ববিদ্যালয়" },
      { word: "স্কুল", weight: 2, stem: "স্কুল" },
      { word: "কলেজ", weight: 2, stem: "কলেজ" },
      { word: "পরীক্ষা", weight: 3, stem: "পরীক্ষা" },
      { word: "এইচএসসি", weight: 3, stem: "এইচএসসি" },
      { word: "এসএসসি", weight: 3, stem: "এসএসসি" },
      { word: "শিক্ষার্থী", weight: 2, stem: "শিক্ষার্থী" },
      { word: "ভর্তি", weight: 2, stem: "ভর্তি" },
      { word: "মেধাতালিকা", weight: 2, stem: "মেধাতালিকা" },
      { word: "শিক্ষক", weight: 2, stem: "শিক্ষক" },
      { word: "কারিকুলাম", weight: 2, stem: "কারিকুলাম" }
    ],
    semanticExamples: [
      "এইচএসসি পরীক্ষার ফলাফল প্রকাশ",
      "বিশ্ববিদ্যালয়ে নতুন কোর্স চালু",
      "শিক্ষার্থীদের জন্য নতুন বৃত্তি কর্মসূচি"
    ]
  },
  
  health: {
    keywords: [
      { word: "স্বাস্থ্য", weight: 4, stem: "স্বাস্থ্য" },
      { word: "হাসপাতাল", weight: 3, stem: "হাসপাতাল" },
      { word: "ডাক্তার", weight: 2, stem: "ডাক্তার" },
      { word: "রোগী", weight: 2, stem: "রোগী" },
      { word: "ডেঙ্গু", weight: 3, stem: "ডেঙ্গু" },
      { word: "করোনা", weight: 4, stem: "করোনা" },
      { word: "চিকিৎসা", weight: 3, stem: "চিকিৎসা" },
      { word: "টিকা", weight: 3, stem: "টিকা" },
      { word: "ভ্যাকসিন", weight: 4, stem: "ভ্যাকসিন" },
      { word: "মহামারী", weight: 4, stem: "মহামারী" },
      { word: "ঔষধ", weight: 2, stem: "ঔষধ" },
      { word: "মানসিক স্বাস্থ্য", weight: 3, stem: "মানসিক স্বাস্থ্য" }
    ],
    semanticExamples: [
      "নতুন ভ্যাকসিন অনুমোদন পেয়েছে",
      "ডেঙ্গু আক্রান্তের সংখ্যা বাড়ছে",
      "হাসপাতালে আইসিইউ বেড সংকট"
    ]
  }
};

// Allowed categories for output
const ALLOWED_CATEGORIES = [
  "politics", "sports", "technology", "entertainment", 
  "national", "international", "economy", "education", "health", "general"
];

/* ===================================================
   🧠 SEMANTIC SIMILARITY ENGINE (BanglaBERT)
=================================================== */
const embeddingCache = new Map();

async function getCosineSimilarity(text1, text2) {
  if (!CONFIG.enableSemanticScoring || !OPTIONAL_DEPS.transformer) return 0;
  
  const key = `sim:${hashString(text1)}:${hashString(text2)}`;
  if (embeddingCache.has(key)) return embeddingCache.get(key);
  
  try {
    const [emb1, emb2] = await Promise.all([
      getEmbedding(text1),
      getEmbedding(text2)
    ]);
    
    if (!emb1 || !emb2) return 0;
    
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < emb1.length; i++) {
      dot += emb1[i] * emb2[i];
      norm1 += emb1[i] ** 2;
      norm2 += emb2[i] ** 2;
    }
    
    if (norm1 === 0 || norm2 === 0) return 0;
    const similarity = dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
    
    // Cache with LRU
    if (embeddingCache.size > CONFIG.embeddingCacheSize) {
      embeddingCache.delete(embeddingCache.keys().next().value);
    }
    embeddingCache.set(key, similarity);
    
    return similarity;
  } catch {
    return 0;
  }
}

async function getEmbedding(text) {
  if (!OPTIONAL_DEPS.transformer) return null;
  
  const normalized = normalizeText(text).slice(0, 512);
  const cacheKey = `emb:${hashString(normalized)}`;
  
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }
  
  try {
    const output = await OPTIONAL_DEPS.transformer(normalized, {
      pooling: 'mean',
      normalize: true
    });
    
    const embedding = Array.from(output.data.slice(0, 768));
    
    if (embeddingCache.size > CONFIG.embeddingCacheSize) {
      embeddingCache.delete(embeddingCache.keys().next().value);
    }
    embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  } catch {
    return null;
  }
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

/* ===================================================
   🎯 HYBRID CATEGORIZATION ENGINE
=================================================== */
async function categorizeNews(textInput, existingCategory = null) {
  const text = normalizeText(textInput);
  const stemmed = CONFIG.enableStemming ? stemSentence(text) : text;
  
  // 📊 Phase 1: Keyword scoring with stemming
  let scores = {};
  let matches = {};
  
  for (const [category, config] of Object.entries(keywordMap)) {
    let score = 0;
    const categoryMatches = [];
    
    for (const { word, weight, stem: stemWord } of config.keywords) {
      const normalizedKw = normalizeText(word);
      const stemmedKw = CONFIG.enableStemming ? stemWord : normalizedKw;
      
      // Try exact match first
      let found = text.includes(normalizedKw);
      
      // Try stemmed match if enabled
      if (CONFIG.enableStemming && !found && stemmedKw && stemmedKw !== normalizedKw) {
        found = stemmed.includes(stemmedKw);
      }
      
      if (found) {
        score += weight;
        categoryMatches.push({ keyword: word, weight, matchedAs: stemmedKw !== normalizedKw ? 'stemmed' : 'exact' });
      }
    }
    
    // ⛔ Negative keyword penalty
    if (config.negative) {
      for (const neg of config.negative) {
        if (text.includes(normalizeText(neg))) {
          score *= 0.3; // Strong penalty
          break;
        }
      }
    }
    
    if (score > 0) {
      scores[category] = score;
      matches[category] = categoryMatches;
    }
  }
  
  // 🧠 Phase 2: Semantic similarity boost
  if (CONFIG.enableSemanticScoring && OPTIONAL_DEPS.transformer) {
    for (const [category, config] of Object.entries(keywordMap)) {
      if (config.semanticExamples?.length > 0) {
        let bestSemanticScore = 0;
        
        for (const example of config.semanticExamples) {
          const sim = await getCosineSimilarity(text, example);
          if (sim > bestSemanticScore) bestSemanticScore = sim;
        }
        
        // Add semantic boost (scaled to match keyword weights)
        if (bestSemanticScore > 0.5) {
          scores[category] = (scores[category] || 0) + (bestSemanticScore * 5);
        }
      }
    }
  }
  
  // 🏷️ Phase 3: Entity-based boost
  if (CONFIG.enableNER) {
    const entities = regexEntityExtractor(text);
    
    const entityCategoryBoost = {
      politics: ['আওয়ামী লীগ', 'বিএনপি', 'প্রধানমন্ত্রী', 'সংসদ', 'নির্বাচন কমিশন'],
      sports: ['বাংলাদেশ দল', 'বিসিবি', 'ফিফা', 'আইসিসি'],
      national: ['বাংলাদেশ', 'ঢাকা', 'পুলিশ', 'র‍্যাব'],
      international: ['জাতিসংঘ', 'ন্যাটো', 'হোয়াইট হাউস']
    };
    
    for (const [category, boostEntities] of Object.entries(entityCategoryBoost)) {
      const matchedEntities = entities.all.filter(e => 
        boostEntities.some(be => normalizeText(e.text).includes(normalizeText(be)) || 
                              normalizeText(be).includes(normalizeText(e.text)))
      );
      
      if (matchedEntities.length > 0) {
        scores[category] = (scores[category] || 0) + (matchedEntities.length * 1.5);
      }
    }
  }
  
  // 📈 Calculate confidence & select best
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(scores)
    .map(([cat, score]) => ({
      category: cat,
      score,
      confidence: totalScore > 0 ? score / totalScore : 0,
      matches: matches[cat] || []
    }))
    .sort((a, b) => b.confidence - a.confidence);
  
  const best = sorted[0];
  
  // 🎯 Decision logic
  if (best && best.confidence >= CONFIG.confidenceThreshold && best.score >= CONFIG.minKeywordMatches) {
    return {
      category: best.category,
      confidence: best.confidence,
      method: 'hybrid',
      breakdown: {
        keyword: best.score,
        matches: best.matches.slice(0, 3)
      }
    };
  }
  
  // 🤖 Fallback to Puter AI if enabled
  if (CONFIG.useAIFallback) {
    const aiCategory = await categorizeWithPuterAI(textInput);
    return {
      category: aiCategory,
      confidence: 0.5, // AI fallback confidence
      method: 'ai-fallback'
    };
  }
  
  // 🔙 Final fallback: keep existing or general
  return {
    category: mapCategory(existingCategory) || "general",
    confidence: 0,
    method: 'fallback'
  };
}

/* ===================================================
   🤖 PUTER AI CATEGORIZATION (Smart Fallback)
=================================================== */
async function categorizeWithPuterAI(text, retries = 0) {
  if (!CONFIG.useAIFallback) return "general";
  
  try {
    const response = await puter.ai.chat({
      prompt: `
You are an expert Bengali/English news classifier.
Classify into EXACTLY ONE category from: politics, sports, technology, entertainment, national, international, economy, education, health, general

Rules:
- Bangladesh internal affairs → national
- World/global events → international  
- Political parties, government, elections → politics
- Cricket, football, matches → sports
- If unsure or mixed → general
- Reply ONLY the category name in lowercase

News text:
${text.slice(0, 2000)}
`,
      max_tokens: 3,
      temperature: 0
    });

    const raw = response?.toString() || "";
    const cleaned = raw.toLowerCase().replace(/[^a-z]/g, "").trim();
    
    return ALLOWED_CATEGORIES.includes(cleaned) ? cleaned : "general";

  } catch (error) {
    console.warn(`⚠️  AI categorization failed (attempt ${retries + 1}):`, error.message);
    
    if (retries < CONFIG.maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * (retries + 1))); // Exponential backoff
      return categorizeWithPuterAI(text, retries + 1);
    }
    
    return "general";
  }
}

/* ===================================================
   🗂️ CATEGORY MAPPING & VALIDATION
=================================================== */
function mapCategory(cat) {
  if (!cat) return "general";
  const normalized = cat.toLowerCase().trim();
  return ALLOWED_CATEGORIES.includes(normalized) ? normalized : "general";
}

/* ===================================================
   🔍 ENHANCED DUPLICATE DETECTION - ✅ FIXED $trim SYNTAX
=================================================== */
async function removeDuplicates(collection) {
  console.log("🔍 Checking for duplicates...");
  
  // Group by normalized title
  const groups = await collection.aggregate([
    { 
      $addFields: { 
        // ✅ FIX: $trim now uses proper object syntax with "input" field
        normalizedTitle: { 
          $toLower: { 
            $trim: { 
              input: { $ifNull: ["$title", ""] },  // Handle null values safely
              chars: " \t\n\r"                      // Optional: specify chars to trim
            } 
          } 
        } 
      } 
    },
    { 
      $group: { 
        _id: "$normalizedTitle", 
        ids: { $push: "$_id" }, 
        count: { $sum: 1 },
        titles: { $first: "$title" }
      } 
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  
  let removed = 0;
  
  for (const group of groups) {
    // Keep the most recent, remove others
    const docs = await collection.find({ _id: { $in: group.ids } })
      .sort({ publishedAt: -1 })
      .toArray();
    
    if (docs.length > 1) {
      const toDelete = docs.slice(1).map(d => d._id);
      const result = await collection.deleteMany({ _id: { $in: toDelete } });
      removed += result.deletedCount;
      
      if (CONFIG.debugMode) {
        console.log(`🗑️  Removed ${result.deletedCount} duplicates of: "${group.titles}"`);
      }
    }
  }
  
  console.log(`🗑️  Total duplicates removed: ${removed}`);
  return removed;
}

/* ===================================================
   🧹 DATA CLEANING UTILITIES
=================================================== */
async function cleanOldData(collection) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.deleteOlderThanDays);

  const result = await collection.deleteMany({
    createdAt: { $exists: true, $lt: cutoffDate }
  });
  
  console.log(`🧹 Old news removed: ${result.deletedCount} (older than ${CONFIG.deleteOlderThanDays} days)`);
  return result.deletedCount;
}

async function cleanBrokenImages(collection) {
  const result = await collection.deleteMany({
    $or: [
      { image: null },
      { image: "" },
      { image: { $exists: false } },
      { image: { $regex: /placeholder|default|missing/i } }
    ]
  });
  
  console.log(`🧹 Broken images removed: ${result.deletedCount}`);
  return result.deletedCount;
}

async function cleanShortDescriptions(collection) {
  const result = await collection.updateMany(
    { 
      $or: [
        { description: null },
        { description: "" },
        { description: { $exists: false } }
      ]
    },
    { $set: { description: "No description available." } }
  );
  
  console.log(`🧹 Short descriptions fixed: ${result.modifiedCount}`);
  return result.modifiedCount;
}

/* ===================================================
   📊 CATEGORIZATION LOGGING & ANALYTICS
=================================================== */
const categorizationLog = [];

function logCategorization(item, result) {
  categorizationLog.push({
    timestamp: new Date().toISOString(),
    itemId: item._id?.toString(),
    title: item.title?.slice(0, 100),
    previousCategory: item.category,
    newCategory: result.category,
    confidence: result.confidence,
    method: result.method,
    breakdown: result.breakdown
  });
  
  // Keep log manageable
  if (categorizationLog.length > 1000) {
    categorizationLog.shift();
  }
}

function getAnalytics() {
  const evaluated = categorizationLog.filter(l => l.previousCategory !== l.newCategory);
  const total = evaluated.length;
  
  const byMethod = {};
  const byCategory = {};
  
  categorizationLog.forEach(log => {
    // By method
    byMethod[log.method] = (byMethod[log.method] || 0) + 1;
    
    // By category
    if (!byCategory[log.newCategory]) {
      byCategory[log.newCategory] = { total: 0, avgConfidence: 0 };
    }
    byCategory[log.newCategory].total++;
    byCategory[log.newCategory].avgConfidence += log.confidence;
  });
  
  // Calculate averages
  Object.values(byCategory).forEach(data => {
    data.avgConfidence = data.total > 0 
      ? (data.avgConfidence / data.total * 100).toFixed(1) + '%' 
      : 'N/A';
  });
  
  return {
    totalProcessed: categorizationLog.length,
    categoriesChanged: total,
    byMethod,
    byCategory,
    recentChanges: categorizationLog.slice(-10)
  };
}

/* ===================================================
   🚀 MAIN DATA MANAGER
=================================================== */
export async function manageData(options = {}) {
  const {
    skipCleanup = false,
    skipRecategorize = false,
    forceRecategorize = false, // Override "keep existing" logic
    debugMode = false
  } = options;
  
  CONFIG.debugMode = debugMode;
  
  console.log("🚀 Starting enhanced news data manager...");
  console.log(`📦 Features: Stemming=${CONFIG.enableStemming}, Semantic=${!!OPTIONAL_DEPS.transformer}, NER=${CONFIG.enableNER}, AI=${CONFIG.useAIFallback}`);
  
  // Load optional dependencies
  await loadOptionalDeps();
  
  let client;
  
  try {
    // Connect to MongoDB
    client = new MongoClient(CONFIG.MONGO_URI);
    await client.connect();
    const db = client.db(CONFIG.DB_NAME);
    const collection = db.collection(CONFIG.COLLECTION_NAME);
    
    console.log("✅ Connected to MongoDB");
    
    const stats = {
      cleaned: {},
      recategorized: { total: 0, byCategory: {}, byMethod: {} }
    };
    
    /* =============================
       PHASE 1: DATA CLEANUP
    ============================= */
    if (!skipCleanup) {
      console.log("\n🧹 Phase 1: Cleaning data...");
      
      stats.cleaned.oldNews = await cleanOldData(collection);
      stats.cleaned.duplicates = await removeDuplicates(collection);
      stats.cleaned.brokenImages = await cleanBrokenImages(collection);
      stats.cleaned.shortDescriptions = await cleanShortDescriptions(collection);
      
      console.log("✅ Cleanup complete");
    }
    
    /* =============================
       PHASE 2: RE-CATEGORIZATION
    ============================= */
    if (!skipRecategorize) {
      console.log("\n🧠 Phase 2: Recategorizing news...");
      
      // Build query: items needing categorization
      const query = forceRecategorize 
        ? {} 
        : { 
            $or: [
              { category: { $exists: false } },
              { category: null },
              { category: "general" },
              { category: { $nin: ALLOWED_CATEGORIES } }
            ] 
          };
      
      const totalCount = await collection.countDocuments(query);
      console.log(`📋 Items to process: ${totalCount}`);
      
      if (totalCount > 0) {
        // Process in batches for memory efficiency
        const cursor = collection.find(query).batchSize(CONFIG.batchSize);
        let processed = 0;
        
        while (await cursor.hasNext()) {
          const batch = [];
          
          // Fill batch
          while (batch.length < CONFIG.batchSize && await cursor.hasNext()) {
            batch.push(await cursor.next());
          }
          
          // Process batch in parallel
          const results = await Promise.allSettled(
            batch.map(async (item) => {
              try {
                const combinedText = `${item.title || ""} ${item.description || ""} ${item.content || ""}`.trim();
                
                // Skip if text too short
                if (combinedText.length < 10) {
                  return { _id: item._id, skipped: 'too-short' };
                }
                
                // Run hybrid categorization
                const result = await categorizeNews(combinedText, item.category);
                
                // Update if category changed or forcing
                if (result.category !== item.category || forceRecategorize) {
                  await collection.updateOne(
                    { _id: item._id },
                    { 
                      $set: { 
                        category: result.category,
                        categorizationMeta: {
                          confidence: result.confidence,
                          method: result.method,
                          breakdown: result.breakdown,
                          updatedAt: new Date().toISOString()
                        }
                      } 
                    }
                  );
                  
                  logCategorization(item, result);
                  
                  // Track stats
                  stats.recategorized.total++;
                  stats.recategorized.byCategory[result.category] = 
                    (stats.recategorized.byCategory[result.category] || 0) + 1;
                  stats.recategorized.byMethod[result.method] = 
                    (stats.recategorized.byMethod[result.method] || 0) + 1;
                  
                  if (debugMode) {
                    console.log(`✅ ${item.title?.slice(0, 50)}... → ${result.category} (${result.method}, ${(result.confidence*100).toFixed(0)}%)`);
                  }
                }
                
                return { _id: item._id, success: true, category: result.category };
                
              } catch (error) {
                console.error(`❌ Error processing ${item._id}:`, error.message);
                return { _id: item._id, error: error.message };
              }
            })
          );
          
          processed += batch.length;
          
          // Progress update
          if (processed % 50 === 0 || !await cursor.hasNext()) {
            console.log(`📊 Progress: ${processed}/${totalCount} processed`);
          }
        }
        
        await cursor.close();
      }
      
      console.log("✅ Recategorization complete");
    }
    
    /* =============================
       PHASE 3: INDEX OPTIMIZATION
    ============================= */
    console.log("\n🔧 Phase 3: Optimizing indexes...");
    
    await collection.createIndex({ title: "text", description: "text", content: "text" }, { 
      name: "text_search", 
      default_language: "english" // MongoDB doesn't support Bengali stemming natively
    });
    
    await collection.createIndex({ category: 1, publishedAt: -1 }, { name: "category_sort" });
    await collection.createIndex({ createdAt: -1 }, { name: "recent_news" });
    
    console.log("✅ Indexes optimized");
    
    /* =============================
       FINAL REPORT
    ============================= */
    console.log("\n📊 FINAL REPORT");
    console.log("═".repeat(50));
    
    if (stats.cleaned) {
      console.log("🧹 Cleanup:");
      console.log(`   • Old news: ${stats.cleaned.oldNews}`);
      console.log(`   • Duplicates: ${stats.cleaned.duplicates}`);
      console.log(`   • Broken images: ${stats.cleaned.brokenImages}`);
      console.log(`   • Fixed descriptions: ${stats.cleaned.shortDescriptions}`);
    }
    
    if (stats.recategorized) {
      console.log("\n🧠 Recategorization:");
      console.log(`   • Total processed: ${stats.recategorized.total}`);
      console.log(`   • By category:`, stats.recategorized.byCategory);
      console.log(`   • By method:`, stats.recategorized.byMethod);
    }
    
    // Analytics summary
    const analytics = getAnalytics();
    console.log("\n📈 Analytics:");
    console.log(`   • Total logged: ${analytics.totalProcessed}`);
    console.log(`   • Categories changed: ${analytics.categoriesChanged}`);
    console.log(`   • Methods used:`, analytics.byMethod);
    
    console.log("\n🎯 News management complete!");
    
    return {
      success: true,
      stats,
      analytics: getAnalytics()
    };
    
  } catch (error) {
    console.error("❌ Manage Data Error:", error);
    
    return {
      success: false,
      error: error.message,
      stack: CONFIG.debugMode ? error.stack : undefined
    };
    
  } finally {
    if (client) {
      await client.close();
      console.log("🔌 MongoDB connection closed");
    }
  }
}

/* ===================================================
   🎁 EXPORTS FOR EXTERNAL USE
=================================================== */
export {
  categorizeNews,
  categorizeWithPuterAI,
  normalizeText,
  stemWord,
  regexEntityExtractor,
  getAnalytics,
  logCategorization,
  CONFIG,
  keywordMap,
  ALLOWED_CATEGORIES,
  loadOptionalDeps
};

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    manageData,
    categorizeNews,
    normalizeText,
    getAnalytics,
    CONFIG
  };
}

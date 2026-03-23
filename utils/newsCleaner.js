/* ===================================================
   🇧🇩 BANGLA NEWS CLEANER & CATEGORIZER
   With Built-in Stemmer + Optional BanglaBERT + NER
=================================================== */

// 📦 Import local Bengali stemmer (no external dependency)
import { stemBengaliWord, stemBengaliSentence, isBengaliText } from './bengaliStemmer.js';

/* ===================================================
   📦 OPTIONAL DEPENDENCY MANAGEMENT
=================================================== */
/**
 * Optional dependencies for enhanced features:
 * - @xenova/transformers: Semantic similarity via BanglaBERT
 * - @bnlp/nlp-toolkit: Advanced NER (falls back to regex)
 * 
 * Install optionally:
 * npm install @xenova/transformers @bnlp/nlp-toolkit
 */

const OPTIONAL_DEPS = {
  transformer: null,  // @xenova/transformers (BanglaBERT)
  ner: null           // @bnlp/nlp-toolkit or custom NER
};

// Lazy-load optional dependencies when needed
async function loadOptionalDeps() {
  const loaded = {};
  
  // 🧠 BanglaBERT Embeddings (via Transformers.js) - OPTIONAL
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    
    loaded.transformer = await pipeline(
      'feature-extraction',
      'sagorsarker/bangla-bert-base',
      { quantized: true }
    );
    console.log('✅ BanglaBERT loaded (quantized)');
  } catch (e) {
    console.log('ℹ️  BanglaBERT not installed - using keyword fallback');
    loaded.transformer = null;
  }
  
  // 🏷️ Named Entity Recognition - OPTIONAL
  try {
    const { NER } = await import('@bnlp/nlp-toolkit');
    loaded.ner = new NER();
    console.log('✅ BNLP NER loaded');
  } catch (e) {
    console.log('ℹ️  Advanced NER not available - using regex fallback');
    loaded.ner = { extract: (text) => regexEntityFallback(text) };
  }
  
  Object.assign(OPTIONAL_DEPS, loaded);
  return loaded;
}

/* ===================================================
   🏷️ REGEX-BASED NER FALLBACK (No Dependencies)
=================================================== */
function regexEntityFallback(text) {
  const entities = [];
  const normalized = text.toLowerCase();
  
  // Person patterns (common Bengali titles + names)
  const personPatterns = [
    /\b(শেখ|মোঃ|মোহাম্মদ|ডঃ|ডক্টর|প্রফেসর|জনাব|বেগম|মিসেস|মিস)\s+[\u0980-\u09FF]{2,20}/g,
    /\b[\u0980-\u09FF]{3,15}\s+(হোসেন|হাসান|আলী|খান|চৌধুরী|রহমান|ইসলাম)\b/g
  ];
  
  // Organization patterns
  const orgPatterns = [
    /\b(বাংলাদেশ|জাতীয়|আন্তর্জাতিক|বিশ্ব)\s+[\u0980-\u09FF]{2,15}(সংস্থা|ব্যাংক|বোর্ড|কমিশন|দপ্তর|মন্ত্রণালয়|ইনস্টিটিউট|ইউনিভার্সিটি|কলেজ|স্কুল)/g,
    /\b(বিএনপি|আওয়ামী লীগ|জামায়াত|বাংলাদেশ ব্যাংক|র‍্যাব|পুলিশ|হাইকোর্ট|সুপ্রিম কোর্ট)/g
  ];
  
  // Location patterns (Bangladeshi districts + landmarks)
  const locations = [
    'ঢাকা', 'চট্টগ্রাম', 'খুলনা', 'রাজশাহী', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ',
    'পদ্মা সেতু', 'শাহজালাল', 'হযরত শাহজালাল', 'বঙ্গবন্ধু', 'সুন্দরবন', 'কক্সবাজার'
  ];
  
  for (const pattern of personPatterns) {
    const matches = normalized.match(pattern);
    if (matches) matches.forEach(m => entities.push({ text: m.trim(), type: 'PERSON' }));
  }
  
  for (const pattern of orgPatterns) {
    const matches = normalized.match(pattern);
    if (matches) matches.forEach(m => entities.push({ text: m.trim(), type: 'ORG' }));
  }
  
  for (const loc of locations) {
    if (normalized.includes(loc.toLowerCase())) {
      entities.push({ text: loc, type: 'LOC' });
    }
  }
  
  // Deduplicate entities
  return [...new Map(entities.map(e => [e.text, e])).values()];
}

/* ===================================================
   🧠 CONFIGURATION & GLOBAL STATE
=================================================== */
const CONFIG = {
  // Categorization
  minDescriptionLength: 40,
  confidenceThreshold: 0.3,
  maxCategories: 2,
  
  // NLP Features
  enableStemming: true,
  enableSemanticSimilarity: true,
  enableNER: true,
  embeddingCacheSize: 1000,
  
  // Performance
  cacheNormalization: true,
  batchEmbeddingSize: 8,
  debugMode: false
};

// Global caches
const caches = {
  normalization: new Map(),
  stemming: new Map(),
  embeddings: new Map(),
  ner: new Map()
};

// Utility: Simple hash for cache keys
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

/* ===================================================
   🔤 TEXT NORMALIZATION & STEMMING UTILS
=================================================== */
function safeString(text) {
  if (!text && text !== 0) return "";
  if (typeof text === "string") return text.trim();
  return String(text).trim();
}

function cleanHTML(text = "") {
  return safeString(text)
    .replace(/<[^>]*>?/gm, "")
    .replace(/&[a-z0-9]+;/gi, (m) => {
      const entities = { 
        '&amp;': '&', '&lt;': '<', '&gt;': '>', 
        '&nbsp;': ' ', '&quot;': '"', '&apos;': "'" 
      };
      return entities[m.toLowerCase()] || m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(date) {
  if (!date) return new Date().toISOString();
  try {
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function normalizeText(text = "", useCache = CONFIG.cacheNormalization) {
  if (!text) return "";
  const key = `norm:${text}`;
  
  if (useCache && caches.normalization.has(key)) {
    return caches.normalization.get(key);
  }
  
  const result = safeString(text)
    .toLowerCase()
    .replace(/[^\u0980-\u09FF\u0041-\u007A\u0061-\u007A\u0030-\u0039\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
    
  if (useCache) {
    caches.normalization.set(key, result);
    if (caches.normalization.size > 10000) {
      caches.normalization.delete(caches.normalization.keys().next().value);
    }
  }
  return result;
}

/* ===================================================
   🔤 BENGALI STEMMER WRAPPER (Using Local Module)
=================================================== */
class BengaliStemmer {
  constructor() {
    this.ready = true;
  }
  
  stem(word) {
    if (!word || typeof word !== 'string') return '';
    const key = `stem:${word.toLowerCase()}`;
    
    if (CONFIG.cacheNormalization && caches.stemming.has(key)) {
      return caches.stemming.get(key);
    }
    
    const stemmed = stemBengaliWord(word.toLowerCase().trim());
    
    if (CONFIG.cacheNormalization) {
      caches.stemming.set(key, stemmed);
      if (caches.stemming.size > 5000) {
        caches.stemming.delete(caches.stemming.keys().next().value);
      }
    }
    
    return stemmed;
  }
  
  stemSentence(sentence) {
    if (!CONFIG.enableStemming) return normalizeText(sentence);
    return stemBengaliSentence(sentence);
  }
  
  isBengali(text) {
    return isBengaliText(text);
  }
}

const stemmer = new BengaliStemmer();

/* ===================================================
   🧠 SEMANTIC EMBEDDINGS (BanglaBERT - Optional)
=================================================== */
class SemanticEngine {
  constructor() {
    this.model = null;
    this.ready = false;
    this.dimension = 768;
  }
  
  async init() {
    if (this.ready) return this.ready;
    
    if (!OPTIONAL_DEPS.transformer) {
      console.log('⚠️  Semantic engine unavailable (transformers not installed)');
      this.ready = false;
      return false;
    }
    
    this.model = OPTIONAL_DEPS.transformer;
    this.ready = true;
    console.log('🧠 BanglaBERT semantic engine ready');
    return true;
  }
  
  async getEmbedding(text, maxLength = 128) {
    if (!this.ready || !this.model) return null;
    
    const normalized = normalizeText(text).slice(0, 512);
    const cacheKey = `emb:${hashString(normalized)}`;
    
    if (caches.embeddings.has(cacheKey)) {
      return caches.embeddings.get(cacheKey);
    }
    
    try {
      const output = await this.model(normalized, {
        pooling: 'mean',
        normalize: true,
        max_length: maxLength
      });
      
      const embedding = Array.from(output.data.slice(0, this.dimension));
      
      if (CONFIG.cacheNormalization) {
        caches.embeddings.set(cacheKey, embedding);
        if (caches.embeddings.size > CONFIG.embeddingCacheSize) {
          caches.embeddings.delete(caches.embeddings.keys().next().value);
        }
      }
      
      return embedding;
    } catch (e) {
      console.warn('⚠️  Embedding extraction failed:', e.message);
      return null;
    }
  }
  
  async getEmbeddingsBatch(texts) {
    if (!this.ready || !this.model) return texts.map(() => null);
    
    const results = [];
    
    for (let i = 0; i < texts.length; i += CONFIG.batchEmbeddingSize) {
      const batch = texts.slice(i, i + CONFIG.batchEmbeddingSize);
      const normalized = batch.map(t => normalizeText(t).slice(0, 512));
      
      try {
        const outputs = await this.model(normalized, {
          pooling: 'mean',
          normalize: true,
          padding: true
        });
        
        const batchSize = normalized.length;
        for (let j = 0; j < batchSize; j++) {
          const start = j * this.dimension;
          const end = start + this.dimension;
          const embedding = Array.from(outputs.data.slice(start, end));
          results.push(embedding);
        }
      } catch (e) {
        console.warn('⚠️  Batch embedding failed:', e.message);
        for (const text of batch) {
          results.push(await this.getEmbedding(text));
        }
      }
    }
    
    return results;
  }
  
  static cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
    
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < vec1.length; i++) {
      dot += vec1[i] * vec2[i];
      norm1 += vec1[i] ** 2;
      norm2 += vec2[i] ** 2;
    }
    
    if (norm1 === 0 || norm2 === 0) return 0;
    return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
  
  async findSimilarCategory(text, categoryExamples) {
    const textEmbedding = await this.getEmbedding(text);
    if (!textEmbedding) return null;
    
    let bestMatch = null;
    let bestScore = -1;
    
    for (const [category, examples] of Object.entries(categoryExamples)) {
      for (const example of examples) {
        const exampleEmbedding = await this.getEmbedding(example);
        if (!exampleEmbedding) continue;
        
        const similarity = SemanticEngine.cosineSimilarity(textEmbedding, exampleEmbedding);
        if (similarity > bestScore) {
          bestScore = similarity;
          bestMatch = { category, similarity, example };
        }
      }
    }
    
    return bestScore > 0.5 ? bestMatch : null;
  }
}

const semanticEngine = new SemanticEngine();

/* ===================================================
   🏷️ NAMED ENTITY RECOGNITION
=================================================== */
class EntityExtractor {
  constructor() {
    this.ready = false;
    this.extractFn = null;
  }
  
  async init() {
    if (this.ready) return;
    
    if (OPTIONAL_DEPS.ner?.extract) {
      this.extractFn = async (text) => {
        try {
          return await OPTIONAL_DEPS.ner.extract(text);
        } catch {
          return regexEntityFallback(text);
        }
      };
      console.log('🏷️  NER initialized');
    } else {
      this.extractFn = (text) => Promise.resolve(regexEntityFallback(text));
      console.log('🏷️  Using regex NER fallback');
    }
    
    this.ready = true;
  }
  
  async extract(text, options = {}) {
    const { 
      types = ['PERSON', 'ORG', 'LOC'],
      minLength = 2
    } = options;
    
    if (!text || typeof text !== 'string') return [];
    
    const cacheKey = `ner:${hashString(text)}`;
    if (CONFIG.cacheNormalization && caches.ner.has(cacheKey)) {
      return caches.ner.get(cacheKey);
    }
    
    let entities = await this.extractFn(text);
    
    entities = entities
      .filter(e => types.includes(e.type) && e.text?.length >= minLength)
      .map(e => ({
        text: e.text.trim(),
        type: e.type,
        confidence: e.confidence || 0.8,
        position: e.position || null
      }));
    
    const unique = [...new Map(entities.map(e => [`${e.type}:${e.text}`, e])).values()];
    
    if (CONFIG.cacheNormalization) {
      caches.ner.set(cacheKey, unique);
      if (caches.ner.size > 2000) {
        caches.ner.delete(caches.ner.keys().next().value);
      }
    }
    
    return unique;
  }
  
  async extractForArticle(article) {
    const text = `${article.title || ''} ${article.description || ''}`.trim();
    if (!text) return { people: [], organizations: [], locations: [], all: [] };
    
    const entities = await this.extract(text);
    
    return {
      people: entities.filter(e => e.type === 'PERSON').map(e => e.text),
      organizations: entities.filter(e => e.type === 'ORG').map(e => e.text),
      locations: entities.filter(e => e.type === 'LOC').map(e => e.text),
      all: entities
    };
  }
}

const entityExtractor = new EntityExtractor();

/* ===================================================
   📊 CATEGORY DEFINITIONS WITH SEMANTIC EXAMPLES
=================================================== */
const categoryKeywords = {
  "রাজনীতি": {
    priority: 1,
    keywords: [
      { word: "প্রধানমন্ত্রী", weight: 4 },
      { word: "মন্ত্রী", weight: 3 },
      { word: "সরকার", weight: 3 },
      { word: "সংসদ", weight: 3 },
      { word: "নির্বাচন", weight: 4 },
      { word: "ভোট", weight: 2 },
      { word: "বিএনপি", weight: 3 },
      { word: "আওয়ামী লীগ", weight: 3 },
      { word: "বিক্ষোভ", weight: 3 },
      { word: "আইন পাস", weight: 3 },
      { word: "সংবিধান", weight: 3 },
      { word: "বিরোধী দল", weight: 3 },
      { word: "রাষ্ট্রপতি", weight: 3 },
      { word: "নির্বাচন কমিশন", weight: 3 }
    ],
    negative: ["খেলা", "ক্রিকেট", "ফুটবল", "সিনেমা", "গান"],
    semanticExamples: [
      "সংসদে নতুন আইন পাস হয়েছে",
      "প্রধানমন্ত্রী আজ জাতির উদ্দেশ্যে ভাষণ দিয়েছেন",
      "বিরোধী দল সংসদ বর্জন করেছে",
      "নির্বাচন কমিশন তফসিল ঘোষণা করেছে"
    ]
  },
  "খেলা": {
    priority: 3,
    keywords: [
      { word: "ক্রিকেট", weight: 4 },
      { word: "ফুটবল", weight: 4 },
      { word: "ম্যাচ", weight: 3 },
      { word: "বিশ্বকাপ", weight: 4 },
      { word: "রান", weight: 2 },
      { word: "উইকেট", weight: 2 },
      { word: "সেঞ্চুরি", weight: 3 },
      { word: "খেলোয়াড়", weight: 2 },
      { word: "বাংলাদেশ দল", weight: 3 }
    ],
    semanticExamples: [
      "বাংলাদেশ দল বিশ্বকাপে জয়লাভ করেছে",
      "শাকিব আল হাসান সেঞ্চুরি করেছেন",
      "ফুটবল ম্যাচে গোল হয়েছে"
    ]
  },
  "আন্তর্জাতিক": {
    priority: 4,
    keywords: [
      { word: "আন্তর্জাতিক", weight: 3 },
      { word: "যুক্তরাষ্ট্র", weight: 3 },
      { word: "চীন", weight: 3 },
      { word: "ভারত", weight: 3 },
      { word: "যুদ্ধ", weight: 3 },
      { word: "জাতিসংঘ", weight: 3 },
      { word: "নিষেধাজ্ঞা", weight: 3 }
    ],
    semanticExamples: [
      "জাতিসংঘে নতুন রেজোলিউশন পাস",
      "আমেরিকা ও চীনের বাণিজ্যিক চুক্তি",
      "ইউক্রেনে যুদ্ধ পরিস্থিতি"
    ]
  },
  "অর্থনীতি": {
    priority: 5,
    keywords: [
      { word: "অর্থনীতি", weight: 4 },
      { word: "বাংলাদেশ ব্যাংক", weight: 4 },
      { word: "মুদ্রাস্ফীতি", weight: 3 },
      { word: "বাজেট", weight: 4 },
      { word: "রপ্তানি", weight: 3 },
      { word: "শেয়ার বাজার", weight: 3 },
      { word: "রিমিট্যান্স", weight: 3 }
    ],
    semanticExamples: [
      "বাংলাদেশ ব্যাংক সুদের হার বাড়িয়েছে",
      "রপ্তানি আয় রেকর্ড পরিমাণ বেড়েছে",
      "শেয়ার বাজারে বড় পতন"
    ]
  },
  "প্রযুক্তি": {
    priority: 6,
    keywords: [
      { word: "প্রযুক্তি", weight: 4 },
      { word: "এআই", weight: 3 },
      { word: "কৃত্রিম বুদ্ধিমত্তা", weight: 4 },
      { word: "স্মার্টফোন", weight: 2 },
      { word: "সাইবার", weight: 2 },
      { word: "ই-কমার্স", weight: 2 }
    ],
    semanticExamples: [
      "নতুন এআই মডেল বাংলাদেশি ভাষায় কাজ করবে",
      "সাইবার হামলায় ব্যাংকিং সেবা ব্যাহত",
      "ই-কমার্স প্ল্যাটফর্মে নতুন ফিচার"
    ]
  },
  "স্বাস্থ্য": {
    priority: 7,
    keywords: [
      { word: "স্বাস্থ্য", weight: 4 },
      { word: "হাসপাতাল", weight: 3 },
      { word: "ভ্যাকসিন", weight: 4 },
      { word: "করোনা", weight: 4 },
      { word: "মহামারী", weight: 4 },
      { word: "ডেঙ্গু", weight: 3 }
    ],
    semanticExamples: [
      "নতুন ভ্যাকসিন অনুমোদন পেয়েছে",
      "ডেঙ্গু আক্রান্তের সংখ্যা বাড়ছে",
      "হাসপাতালে আইসিইউ বেড সংকট"
    ]
  },
  "আরও": {
    priority: 99,
    keywords: [
      { word: "লাইফস্টাইল", weight: 2 },
      { word: "ভ্রমণ", weight: 2 },
      { word: "সংস্কৃতি", weight: 2 },
      { word: "ঈদ", weight: 3 },
      { word: "পরিবেশ", weight: 2 }
    ],
    semanticExamples: [
      "ঈদ উৎসবে নতুন ফ্যাশন ট্রেন্ড",
      "সুন্দরবন ভ্রমণের নতুন প্যাকেজ",
      "পরিবেশ দূষণ রোধে নতুন উদ্যোগ"
    ]
  }
};

/* ===================================================
   🎯 ADVANCED KEYWORD ENGINE WITH STEMMING
=================================================== */
class AdvancedKeywordEngine {
  constructor() {
    this.compiledPatterns = new Map();
    this.stemmedIndex = new Map();
    this._compilePatterns();
  }
  
  _compilePatterns() {
    for (const [category, config] of Object.entries(categoryKeywords)) {
      const patterns = config.keywords.map(({ word, weight }) => {
        const normalized = normalizeText(word);
        const stemmed = CONFIG.enableStemming ? stemmer.stem(word) : normalized;
        
        if (CONFIG.enableStemming) {
          if (!this.stemmedIndex.has(category)) {
            this.stemmedIndex.set(category, new Map());
          }
          this.stemmedIndex.get(category).set(stemmed, { original: word, weight });
        }
        
        const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gu');
        
        return { regex, weight, original: word, stemmed };
      });
      this.compiledPatterns.set(category, patterns);
    }
  }
  
  async scoreText(text, category) {
    const normalized = normalizeText(text);
    const stemmed = CONFIG.enableStemming ? stemmer.stemSentence(normalized) : normalized;
    const patterns = this.compiledPatterns.get(category) || [];
    
    let score = 0;
    const matches = [];
    
    for (const { regex, weight, original, stemmed: stemWord } of patterns) {
      regex.lastIndex = 0;
      
      let found = normalized.match(regex);
      
      if (CONFIG.enableStemming && !found && stemWord && stemWord !== normalized) {
        const stemRegex = new RegExp(`\\b${stemWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gu');
        found = stemmed.match(stemRegex);
      }
      
      if (found) {
        const count = found.length;
        const contribution = count * weight;
        score += contribution;
        matches.push({ 
          keyword: original, 
          matchedAs: stemWord !== original ? `${original}→${stemWord}` : original,
          count, 
          weight, 
          contribution 
        });
      }
    }
    
    const negative = categoryKeywords[category]?.negative || [];
    for (const neg of negative) {
      const negNormalized = normalizeText(neg);
      const negStemmed = CONFIG.enableStemming ? stemmer.stem(neg) : negNormalized;
      
      if (normalized.includes(negNormalized) || stemmed.includes(negStemmed)) {
        score *= 0.25;
        matches.push({ keyword: `⛔${neg}`, count: 1, weight: -1, contribution: -score * 0.75 });
        break;
      }
    }
    
    return { score, matches };
  }
}

const keywordEngine = new AdvancedKeywordEngine();

/* ===================================================
   🎯 HYBRID CATEGORIZATION ENGINE
=================================================== */
async function categorizeArticle(article, options = {}) {
  const { 
    returnAll = false, 
    minConfidence = CONFIG.confidenceThreshold,
    useSemantics = CONFIG.enableSemanticSimilarity,
    useEntities = CONFIG.enableNER
  } = options;
  
  const title = article.title || '';
  const description = article.description || '';
  const content = article.content || '';
  const fullText = normalizeText(`${title} ${description} ${content}`);
  
  if (!fullText || fullText.length < 5) {
    const result = { category: "আরও", confidence: 0, score: 0, matches: [], method: 'fallback' };
    return returnAll ? [result] : "আরও";
  }
  
  const results = [];
  
  for (const [category, config] of Object.entries(categoryKeywords)) {
    const { score, matches } = await keywordEngine.scoreText(fullText, category);
    if (score > 0) {
      results.push({
        category,
        keywordScore: score,
        semanticScore: 0,
        entityScore: 0,
        matches,
        priority: config.priority || 99
      });
    }
  }
  
  if (useSemantics && semanticEngine.ready) {
    for (const result of results) {
      const examples = categoryKeywords[result.category]?.semanticExamples || [];
      if (examples.length > 0) {
        const semanticMatch = await semanticEngine.findSimilarCategory(fullText, { [result.category]: examples });
        if (semanticMatch) {
          result.semanticScore = semanticMatch.similarity * 10;
          result.semanticExample = semanticMatch.example;
        }
      }
    }
  }
  
  if (useEntities && entityExtractor.ready) {
    const entities = await entityExtractor.extract(fullText);
    
    const entityCategoryBoost = {
      'রাজনীতি': ['আওয়ামী লীগ', 'বিএনপি', 'প্রধানমন্ত্রী', 'সংসদ', 'নির্বাচন কমিশন'],
      'খেলা': ['বাংলাদেশ দল', 'বিসিবি', 'ফিফা', 'আইসিসি'],
      'আন্তর্জাতিক': ['জাতিসংঘ', 'ন্যাটো', 'হোয়াইট হাউস', 'ক্রেমলিন'],
      'অর্থনীতি': ['বাংলাদেশ ব্যাংক', 'ডিএসই', 'আইএমএফ', 'বিশ্বব্যাংক']
    };
    
    for (const result of results) {
      const boostEntities = entityCategoryBoost[result.category] || [];
      const matchedEntities = entities.filter(e => 
        boostEntities.some(be => normalizeText(e.text).includes(normalizeText(be)) || 
                              normalizeText(be).includes(normalizeText(e.text)))
      );
      
      if (matchedEntities.length > 0) {
        result.entityScore = matchedEntities.length * 2;
        result.matchedEntities = matchedEntities.map(e => e.text);
      }
    }
  }
  
  let totalScore = 0;
  results.forEach(result => {
    result.totalScore = result.keywordScore + result.semanticScore + result.entityScore;
    totalScore += result.totalScore;
  });
  
  results.forEach(result => {
    let confidence = totalScore > 0 ? result.totalScore / totalScore : 0;
    
    const signalCount = [
      result.keywordScore > 0,
      result.semanticScore > 0,
      result.entityScore > 0
    ].filter(Boolean).length;
    
    confidence *= Math.min(1 + (signalCount - 1) * 0.2, 1.3);
    
    const highWeightMatches = result.matches?.filter(m => m.weight >= 3).length || 0;
    confidence *= Math.min(1 + highWeightMatches * 0.1, 1.2);
    
    result.confidence = Math.min(Math.max(confidence, 0), 1);
  });
  
  results.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.totalScore - a.totalScore;
  });
  
  const qualified = results.filter(r => r.confidence >= minConfidence);
  
  if (returnAll) {
    return qualified.length > 0 ? qualified.map(r => ({
      category: r.category,
      confidence: r.confidence,
      score: r.totalScore,
      breakdown: {
        keyword: r.keywordScore,
        semantic: r.semanticScore,
        entity: r.entityScore
      },
      matches: r.matches?.slice(0, 5),
      semanticExample: r.semanticExample,
      matchedEntities: r.matchedEntities
    })) : [{ category: "আরও", confidence: 0, score: 0, breakdown: {}, matches: [] }];
  }
  
  return qualified.length > 0 ? qualified[0].category : "আরও";
}

/* ===================================================
   🧹 ENHANCED ARTICLE CLEANING
=================================================== */
async function cleanArticle(article = {}) {
  const title = cleanHTML(article.title || "No Title");
  const description = cleanHTML(article.description || article.contentSnippet || "");
  const content = cleanHTML(article.content || "");
  
  const categoryResult = await categorizeArticle({ title, description, content }, { returnAll: true });
  const primaryCategory = categoryResult[0]?.category || "আরও";
  
  let entities = { people: [], organizations: [], locations: [], all: [] };
  if (CONFIG.enableNER && entityExtractor.ready) {
    entities = await entityExtractor.extractForArticle({ title, description });
  }
  
  const allText = `${title} ${description}`;
  const stemmedKeywords = CONFIG.enableStemming 
    ? allText.split(/[\s\W]+/).filter(w => w.length > 2).map(w => stemmer.stem(w))
    : [];
  
  return {
    id: article.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title,
    description,
    content,
    image: article.image || article.thumbnail || "https://via.placeholder.com/300",
    source: safeString(article.source || article.publisher || "Unknown"),
    author: safeString(article.author || ""),
    url: safeString(article.url || article.link || ""),
    publishedAt: formatDate(article.pubDate || article.publishedAt || article.date),
    
    category: primaryCategory,
    allCategories: categoryResult.slice(0, CONFIG.maxCategories),
    confidence: categoryResult[0]?.confidence || 0,
    categorizationBreakdown: categoryResult[0]?.breakdown || {},
    matchedKeywords: categoryResult[0]?.matches?.slice(0, 5).map(m => m.keyword) || [],
    
    entities,
    stemmedKeywords: [...new Set(stemmedKeywords)].slice(0, 20),
    
    embeddingAvailable: semanticEngine.ready,
    
    language: 'bn',
    processedAt: new Date().toISOString(),
    processingFlags: {
      stemmed: CONFIG.enableStemming,
      semantic: CONFIG.enableSemanticSimilarity && semanticEngine.ready,
      ner: CONFIG.enableNER && entityExtractor.ready
    }
  };
}

/* ===================================================
   🔍 SIMILARITY CHECK FOR DEDUPLICATION
=================================================== */
function isSimilar(title1, title2, threshold = 0.85) {
  const t1 = normalizeText(title1);
  const t2 = normalizeText(title2);
  
  if (t1 === t2 || t1.includes(t2) || t2.includes(t1)) return true;
  
  const set1 = new Set(t1.split(' '));
  const set2 = new Set(t2.split(' '));
  const intersection = [...set1].filter(x => set2.has(x)).length;
  const union = new Set([...set1, ...set2]).size;
  
  return union > 0 ? intersection / union >= threshold : false;
}

/* ===================================================
   🔍 ENHANCED DUPLICATE DETECTION
=================================================== */
async function removeDuplicatesEnhanced(newsArray, options = {}) {
  const { 
    compareFields = ['title', 'url'],
    timeWindowHours = 24,
    useEntities = true,
    entitySimilarityThreshold = 0.6
  } = options;
  
  const unique = [];
  const seenUrls = new Map();
  
  for (const article of newsArray) {
    let isDuplicate = false;
    
    if (article.url && seenUrls.has(article.url)) {
      const existing = seenUrls.get(article.url);
      const timeDiff = Math.abs(new Date(article.publishedAt) - new Date(existing.publishedAt)) / 36e5;
      if (timeDiff <= timeWindowHours) {
        isDuplicate = true;
      }
    }
    
    if (!isDuplicate) {
      for (const existing of unique) {
        for (const field of compareFields) {
          if (article[field] && existing[field] && isSimilar(article[field], existing[field])) {
            isDuplicate = true;
            break;
          }
        }
        
        if (!isDuplicate && useEntities && CONFIG.enableNER) {
          const aEntities = new Set(article.entities?.all?.map(e => e.text.toLowerCase()) || []);
          const bEntities = new Set(existing.entities?.all?.map(e => e.text.toLowerCase()) || []);
          
          if (aEntities.size > 0 && bEntities.size > 0) {
            const intersection = [...aEntities].filter(e => bEntities.has(e)).length;
            const union = new Set([...aEntities, ...bEntities]).size;
            const entitySimilarity = union > 0 ? intersection / union : 0;
            
            if (entitySimilarity >= entitySimilarityThreshold) {
              isDuplicate = true;
            }
          }
        }
        
        if (isDuplicate) break;
      }
    }
    
    if (!isDuplicate) {
      unique.push(article);
      if (article.url) seenUrls.set(article.url, article);
    }
  }
  
  return unique;
}

/* ===================================================
   🚀 MAIN PIPELINE
=================================================== */
async function cleanNewsData(rawNews = [], options = {}) {
  const {
    enableDedupe = true,
    sortBy = 'publishedAt',
    sortOrder = 'desc',
    minConfidence = CONFIG.confidenceThreshold,
    onProgress = null,
    batchSize = 10
  } = options;
  
  console.log(`🧹 Starting enhanced pipeline with ${rawNews.length} articles...`);
  if (!Array.isArray(rawNews)) return [];
  
  const startTime = Date.now();
  
  await Promise.all([
    CONFIG.enableSemanticSimilarity ? semanticEngine.init() : Promise.resolve(),
    CONFIG.enableNER ? entityExtractor.init() : Promise.resolve()
  ]);
  
  let cleaned = [];
  
  for (let i = 0; i < rawNews.length; i += batchSize) {
    const batch = rawNews.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (article, idx) => {
        if (onProgress && (i + idx) % 20 === 0) {
          onProgress({ 
            step: 'processing', 
            progress: (i + idx) / rawNews.length, 
            processed: i + idx,
            total: rawNews.length 
          });
        }
        return await cleanArticle(article);
      })
    );
    
    cleaned.push(...batchResults);
  }
  
  cleaned = cleaned.filter(article => 
    article.description.length >= CONFIG.minDescriptionLength &&
    article.confidence >= minConfidence
  );
  
  if (enableDedupe) {
    const before = cleaned.length;
    cleaned = await removeDuplicatesEnhanced(cleaned, { 
      timeWindowHours: 48,
      useEntities: CONFIG.enableNER
    });
    console.log(`🗑️ Removed ${before - cleaned.length} duplicates`);
  }
  
  cleaned.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'confidence':
        comparison = b.confidence - a.confidence;
        break;
      case 'relevance':
        comparison = (b.confidence * 0.6 + (b.allCategories?.length || 0) * 0.2 + (b.entities?.all?.length || 0) * 0.2) - 
                     (a.confidence * 0.6 + (a.allCategories?.length || 0) * 0.2 + (a.entities?.all?.length || 0) * 0.2);
        break;
      case 'publishedAt':
      default:
        comparison = new Date(b.publishedAt) - new Date(a.publishedAt);
    }
    return sortOrder === 'desc' ? comparison : -comparison;
  });
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Enhanced pipeline complete: ${cleaned.length} articles in ${duration}s`);
  console.log(`📊 Features: Stemming=${CONFIG.enableStemming}, Semantic=${semanticEngine.ready}, NER=${entityExtractor.ready}`);
  
  if (CONFIG.debugMode && cleaned[0]) {
    console.log('🔍 Sample:', JSON.stringify({
      title: cleaned[0].title,
      category: cleaned[0].category,
      confidence: cleaned[0].confidence,
      entities: cleaned[0].entities,
      keywords: cleaned[0].matchedKeywords
    }, null, 2));
  }
  
  return cleaned;
}

/* ===================================================
   📈 ANALYTICS & LEARNING
=================================================== */
const categorizationLog = [];

function logCategorization(article, predicted, actual = null, metadata = {}) {
  categorizationLog.push({
    timestamp: new Date().toISOString(),
    articleId: article.id,
    predicted,
    actual,
    confidence: article.confidence,
    breakdown: article.categorizationBreakdown,
    entities: article.entities?.all?.map(e => e.text) || [],
    keywords: article.matchedKeywords,
    features: metadata,
    correct: actual ? predicted === actual : null
  });
  
  if (categorizationLog.length > 1000) {
    categorizationLog.shift();
  }
}

function getAnalytics() {
  const evaluated = categorizationLog.filter(l => l.correct !== null);
  const total = evaluated.length;
  const correct = evaluated.filter(l => l.correct).length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;
  
  const byCategory = {};
  evaluated.forEach(log => {
    if (!byCategory[log.predicted]) {
      byCategory[log.predicted] = { total: 0, correct: 0, avgConfidence: 0 };
    }
    byCategory[log.predicted].total++;
    if (log.correct) byCategory[log.predicted].correct++;
    byCategory[log.predicted].avgConfidence += log.confidence;
  });
  
  return {
    totalEvaluations: total,
    overallAccuracy: `${accuracy}%`,
    avgConfidence: evaluated.length > 0 
      ? (evaluated.reduce((sum, l) => sum + l.confidence, 0) / evaluated.length * 100).toFixed(2) + '%'
      : 'N/A',
    byCategory: Object.entries(byCategory).map(([cat, data]) => ({
      category: cat,
      accuracy: data.total > 0 ? ((data.correct / data.total) * 100).toFixed(2) + '%' : 'N/A',
      avgConfidence: data.total > 0 ? (data.avgConfidence / data.total * 100).toFixed(2) + '%' : 'N/A',
      evaluations: data.total
    })),
    featureUsage: {
      stemming: categorizationLog.filter(l => l.features?.stemmed).length,
      semantic: categorizationLog.filter(l => l.features?.semantic).length,
      ner: categorizationLog.filter(l => l.features?.ner).length
    }
  };
}

/* ===================================================
   🎁 DYNAMIC CONFIGURATION HELPERS (Defined as Functions)
=================================================== */

/**
 * Add a new category dynamically
 */
export function addCategory(name, config) {
  if (!name || !config) return;
  categoryKeywords[name] = config;
  keywordEngine._compilePatterns();
  console.log(`✅ Added category: ${name}`);
}

/**
 * Update keyword weight for a category
 */
export function updateKeywordWeight(category, keyword, newWeight) {
  const cat = categoryKeywords[category];
  if (!cat?.keywords) return;
  
  const kw = cat.keywords.find(k => k.word === keyword);
  if (kw) {
    kw.weight = newWeight;
    console.log(`✅ Updated weight: ${keyword} → ${newWeight} in ${category}`);
  }
}

/**
 * Reset all caches (useful for testing)
 */
export function resetCaches() {
  caches.normalization.clear();
  caches.stemming.clear();
  caches.embeddings.clear();
  caches.ner.clear();
  console.log('🗑️  All caches cleared');
}

/* ===================================================
   🎁 FINAL EXPORTS (Valid ES Module Syntax)
=================================================== */
export {
  // Main pipeline
  cleanNewsData,
  cleanArticle,
  categorizeArticle,
  
  // NLP components
  stemmer,
  semanticEngine,
  entityExtractor,
  
  // Utilities
  normalizeText,
  cleanHTML,
  formatDate,
  safeString,
  isSimilar,
  
  // Configuration
  CONFIG,
  categoryKeywords,
  
  // Analytics
  logCategorization,
  getAnalytics,
  
  // Dynamic config helpers (defined as functions above)
  addCategory,
  updateKeywordWeight,
  
  // Dependency management
  loadOptionalDeps,
  OPTIONAL_DEPS
};

// CommonJS compatibility for older tooling
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanNewsData,
    cleanArticle,
    categorizeArticle,
    normalizeText,
    getAnalytics,
    logCategorization,
    loadOptionalDeps,
    addCategory,
    updateKeywordWeight,
    resetCaches,
    CONFIG,
    stemmer,
    categoryKeywords
  };
}

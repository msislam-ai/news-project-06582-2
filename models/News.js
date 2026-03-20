import mongoose from "mongoose";

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    content: {
      type: String
    },

    image: {
      type: String
    },

    source: {
      type: String,
      trim: true
    },

    url: {
      type: String,
      required: true,
      unique: true,   // ✅ PREVENT DUPLICATES
      index: true
    },

    category: {
      type: String,
      index: true     // ✅ faster category queries
    },

    publishedAt: {
      type: Date,
      index: true     // ✅ VERY IMPORTANT for sorting
    }
  },
  {
    timestamps: true
  }
);

// ✅ EXTRA INDEX (best for sorting performance)
newsSchema.index({ publishedAt: -1, createdAt: -1 });

const News = mongoose.model("News", newsSchema);

export default News;

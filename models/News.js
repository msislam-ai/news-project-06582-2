import mongoose from "mongoose";

const newsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },

  description: String,

  content: String,

  image: String,

  source: String,

  url: String,

  category: String,

  publishedAt: Date

}, { timestamps: true });

const News = mongoose.model("News", newsSchema);

export default News;

import mongoose from "mongoose";

const ListingSchema = new mongoose.Schema({
  title: String,
  price: String,
  image: String,
  productLink: { type: String, unique: true },
  sellerName: String,
  sellerProfile: String,
  sellerContact: String,
  sellerEmail: String,
  postedDate: String,
  description: String,
  siteName: String,
  scrapedAt: Date,
  expiresAt: Date,
  meta: Object,
});

export default mongoose.models.Listing || mongoose.model("Listing", ListingSchema);

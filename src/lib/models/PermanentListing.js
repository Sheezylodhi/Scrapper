import mongoose from "mongoose";

const PermanentListingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  price: String,
  sellerName: String,
  sellerEmail: String,
  sellerContact: String,
  productLink: { type: String, required: true, unique: true },
  sellerProfile: String,
  scrapedAt: Date,
  image: String,
}, { timestamps: true });

export default mongoose.models.PermanentListing || mongoose.model("PermanentListing", PermanentListingSchema);

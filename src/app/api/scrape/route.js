import { NextResponse } from "next/server";
import { scrapeEbayCars } from "@/lib/scraper";
import { connectToDatabase } from "@/lib/dbConnect";
import Listing from "@/lib/models/Listing";

export async function POST(req) {
  try {
    const { searchUrl, keyword, fromDate, toDate, siteName } = await req.json();
    await connectToDatabase();

    const results = await scrapeEbayCars(searchUrl, 50, keyword, fromDate, toDate, siteName);

    const now = new Date();
    const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const docs = results.map(r => ({ ...r, scrapedAt: now, expiresAt: expireAt }));

    await Listing.deleteMany({ expiresAt: { $lte: new Date() } });
    await Promise.all(docs.map(d => Listing.updateOne({ productLink: d.productLink }, { $set: d }, { upsert: true })));

    return NextResponse.json({ success: true, count: docs.length, results: docs });
  } catch (err) {
    console.error("❌ Error:", err);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

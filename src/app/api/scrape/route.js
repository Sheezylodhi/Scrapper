import { NextResponse } from "next/server";
import { scrapeEbayCars } from "@/lib/scraper";
import { connectToDatabase } from "@/lib/dbConnect";
import Listing from "@/lib/models/Listing";

export async function POST(req) {
  try {
    const body = await req.json();
    const { searchUrl, keyword, fromDate, toDate, siteName } = body;

    if (!searchUrl) return NextResponse.json({ error: "searchUrl required" }, { status: 400 });

    console.log("🌐 Scrape request received:", { searchUrl, keyword, fromDate, toDate, siteName });

    await connectToDatabase();

    const results = await scrapeEbayCars(searchUrl, 50, keyword || "", fromDate, toDate, siteName || "eBay");
    console.log(`🧾 Scraped ${results.length} listings`);

    if (!results || results.length === 0) {
      return NextResponse.json({ success: true, count: 0, results: [] });
    }

    const now = new Date();
    const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const docs = results.map(r => ({ ...r, scrapedAt: now, expiresAt: expireAt }));

    await Listing.deleteMany({ expiresAt: { $lte: new Date() } });

    const ops = docs.map(d =>
      Listing.updateOne({ productLink: d.productLink }, { $set: d }, { upsert: true })
    );
    await Promise.all(ops);

    console.log(`💾 ${docs.length} listings saved (expires in 48h)`);

    return NextResponse.json({ success: true, count: docs.length, results: docs });
  } catch (err) {
    console.error("❌ Scraper Route Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

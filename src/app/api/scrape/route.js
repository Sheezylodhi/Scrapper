import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/dbConnect";
import Listing from "@/lib/models/Listing";

import { scrapeEbayCars } from "@/lib/scraper";
import { scrapeHemmingCars } from "@/lib/hemmingScraper";
import { scrapeCraigslist } from "@/lib/scraperCraigslist";
import { scrapeKarkisCars } from "@/lib/scraperKarkis";


export async function POST(req) {
  try {
    const { searchUrl, keyword, fromDate, toDate, siteName, maxPages } = await req.json();

    if (!searchUrl || !siteName)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    console.log("🔍 Starting scrape for:", siteName);

    await connectToDatabase();

    let results = [];

    if (siteName === "eBay (US)") {
      results = await scrapeEbayCars(searchUrl, 50, keyword, fromDate, toDate, siteName);
    } else if (siteName === "Hemming") {
      results = await scrapeHemmingCars(searchUrl, 50, keyword, fromDate, toDate, siteName);
    } else if (siteName === "Craigslist (Chicago)") {
      results = await scrapeCraigslist(searchUrl, keyword, fromDate, toDate);
    }else if (siteName === "Craigslist (NewYork)") {
      results = await scrapeCraigslist(searchUrl, keyword, fromDate, toDate);
    } else  if (siteName === "eBay (UK)") {
      results = await scrapeEbayCars(searchUrl, 50, keyword, fromDate, toDate, siteName);
    }  else  if (siteName === "eBay (Aus)") {
      results = await scrapeEbayCars(searchUrl, 50, keyword, fromDate, toDate, siteName);
    } 
   else if (siteName === "Karkis") {
  results = await scrapeKarkisCars(searchUrl, 50, keyword, fromDate, toDate, siteName);
}

     else {
      return NextResponse.json({ error: "Unsupported site" }, { status: 400 });
    }

    const now = new Date();
    const expireAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const docs = results.map((r) => ({ ...r, scrapedAt: now, expiresAt: expireAt }));

    await Listing.deleteMany({ expiresAt: { $lte: new Date() } });

    await Promise.all(
      docs.map((d) =>
        Listing.updateOne({ productLink: d.productLink }, { $set: d }, { upsert: true })
      )
    );

    console.log(`✅ ${siteName} scrape completed — saved ${docs.length} records`);
    return NextResponse.json({ success: true, count: docs.length, results: docs });
  } catch (err) {
    console.error("❌ Scrape Error:", err);
    return NextResponse.json({ error: err.message || "Server Error" }, { status: 500 });
  }
}

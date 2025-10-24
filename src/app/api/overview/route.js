// /app/api/overview/route.js
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/dbConnect";
import Listing from "@/lib/models/Listing"; // Temporary
import PermanentListing from "@/lib/models/PermanentListing";

export async function GET(req) {
  await connectToDatabase();
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from"); // yyyy-mm-dd
    const to = url.searchParams.get("to");     // yyyy-mm-dd

    const now = new Date();
    const expireTime = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    await Listing.deleteMany({ scrapedAt: { $lt: expireTime } });

    const filter = {};
    if (from) filter.scrapedAt = { $gte: new Date(from) };
    if (to) filter.scrapedAt = filter.scrapedAt ? { ...filter.scrapedAt, $lte: new Date(to) } : { $lte: new Date(to) };

    const tempCount = await Listing.countDocuments(filter);
    const permCount = await PermanentListing.countDocuments(filter);
    const exportedCount = permCount;

    return NextResponse.json({ tempCount, permCount, exportedCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch overview" }, { status: 500 });
  }
}

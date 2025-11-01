import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/dbConnect";
import Listing from "@/lib/models/Listing";

export async function GET() {
  await connectToDatabase();

  const now = new Date();
  const listings = await Listing.find({ expiresAt: { $gt: now } })
    .sort({ scrapedAt: -1 })
    .lean();

  return NextResponse.json({ results: listings });
}

export async function DELETE(req, { params }) {
  await connectToDatabase();
  const { id } = params;
  await Listing.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}

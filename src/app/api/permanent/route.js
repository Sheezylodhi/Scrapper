import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/dbConnect";
import PermanentListing from "@/lib/models/PermanentListing";

export async function GET() {
  await connectToDatabase();
  try {
    const listings = await PermanentListing.find({}).sort({ scrapedAt: -1 }).lean();
    return NextResponse.json({ results: listings });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch permanent data" }, { status: 500 });
  }
}

export async function POST(req) {
  await connectToDatabase();
  try {
    const data = await req.json();

    // If array -> bulk save
    if (Array.isArray(data)) {
      const links = data.map(d => d.productLink);
      const existing = await PermanentListing.find({ productLink: { $in: links } }).select("productLink");
      const existingLinks = new Set(existing.map(e => e.productLink));

      const newItems = data.filter(d => !existingLinks.has(d.productLink));
      if (newItems.length > 0) await PermanentListing.insertMany(
        newItems.map(d => ({
          title: d.title,
          price: d.price,
          sellerName: d.sellerName,
          sellerEmail: d.sellerEmail,
          sellerContact: d.sellerContact,
          productLink: d.productLink,
          sellerProfile: d.sellerProfile,
          scrapedAt: d.scrapedAt ? new Date(d.scrapedAt) : new Date(),
          image: d.image || "",
        }))
      );

      return NextResponse.json({ savedCount: newItems.length });
    }

    // Single save
    const exists = await PermanentListing.findOne({ productLink: data.productLink });
    if (exists) return NextResponse.json({ exists: true });

    const newListing = await PermanentListing.create({
      title: data.title,
      price: data.price,
      sellerName: data.sellerName,
      sellerEmail: data.sellerEmail,
      sellerContact: data.sellerContact,
      productLink: data.productLink,
      sellerProfile: data.sellerProfile,
      scrapedAt: data.scrapedAt ? new Date(data.scrapedAt) : new Date(),
      image: data.image || "",
    });

    return NextResponse.json({ success: true, data: newListing });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save permanently" }, { status: 500 });
  }
}

// DELETE /api/permanent/:id
export async function DELETE(req, { params }) {
  await connectToDatabase();
  try {
    const { id } = params;
    await PermanentListing.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete permanent record" }, { status: 500 });
  }
}

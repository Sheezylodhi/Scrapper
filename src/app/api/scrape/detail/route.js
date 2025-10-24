import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function POST(req) {
  try {
    const { productUrl } = await req.json();
    if (!productUrl) return NextResponse.json({ error: "productUrl required" }, { status: 400 });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(productUrl, { waitUntil: "networkidle2" });

    // try clicking "Show phone" buttons
    try {
      const btn = await page.$("button, a");
      if (btn) await btn.click().catch(() => {});
      await page.waitForTimeout(1500);
    } catch {}

    const data = await page.evaluate(() => {
      const text = (s) => document.querySelector(s)?.innerText?.trim() || "";
      const attr = (s, a) => document.querySelector(s)?.getAttribute(a) || "";

      const title = text("h1") || text("h2") || "";
      const price = text(".price, .amount, .product-price") || "";
      const sellerName =
        text(".seller-name, .username, .user-name, .contact-name") || "";
      const description =
        text(".description, #description, .product-desc") || "";
      const image = document.querySelector("img")?.src || "";
      const productId = attr("meta[name='product_id']", "content") || location.pathname.split("/").pop();

      // extract phone/email
      const phoneMatch = document.body.innerText.match(
        /(\+?\d{3,4}[-\s]?\d{3,4}[-\s]?\d{3,6})/
      );
      const emailMatch = document.body.innerText.match(
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
      );

      return {
        title,
        price,
        sellerName,
        sellerEmail: emailMatch ? emailMatch[0] : "",
        sellerPhone: phoneMatch ? phoneMatch[0] : "",
        description,
        productId,
        image,
        fetchedAt: new Date().toISOString(),
      };
    });

    await browser.close();
    return NextResponse.json({ ok: true, product: data });
  } catch (err) {
    console.error("❌ Detail scrape error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

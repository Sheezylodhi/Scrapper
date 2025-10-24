import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractFirstMatch(text, regex) {
  if (!text) return null;
  const m = text.match(regex);
  return m ? m[0] : null;
}

async function launchBrowser() {
  return await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(), // ✅ FIXED
    headless: chromium.headless,
    defaultViewport: null,
  });
}

export async function scrapeEbayCars(
  searchUrl,
  maxPages = 50,
  keyword = "",
  fromDate,
  toDate,
  siteName = "eBay"
) {
  if (!searchUrl) throw new Error("searchUrl required");

  const useKeyword = keyword?.trim()?.length > 0;
  const useDate = fromDate && toDate;
  const from = useDate ? new Date(fromDate) : null;
  const to = useDate ? new Date(toDate) : null;

  console.log("✅ Scrape:", { searchUrl, maxPages, keyword, from, to });

  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );

  function parseCardDate(text) {
    if (!text) return null;
    const match = text.match(/([A-Za-z]+)-(\d{1,2})\s+(\d{2}):(\d{2})/);
    if (match) {
      const [_, mon, day, hour, min] = match;
      return new Date(`${mon} ${day}, ${new Date().getFullYear()} ${hour}:${min}`);
    }
    return null;
  }

  let currentPage = 1;
  const collected = [];
  let stopPaging = false;

  while (!stopPaging && currentPage <= maxPages) {
    const urlObj = new URL(searchUrl);
    urlObj.searchParams.set("_pgn", currentPage);
    const pageUrl = urlObj.toString();

    console.log(`🌐 Page ${currentPage}: ${pageUrl}`);

    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await delay(250);

    let pageCards = [];
    try {
      await page.waitForSelector("li.s-item, li.s-card", { timeout: 8000 });
      pageCards = await page.$$eval("li.s-item, li.s-card", (nodes) =>
        nodes.map((n) => ({
          title: n.querySelector(".s-card__title span, .s-item__title, .s-item__title span")?.innerText?.trim() || "",
          link: n.querySelector("a.s-item__link, a[href*='/itm/']")?.href || "",
          price: n.querySelector(".s-item__price, .s-card__price")?.innerText?.trim() || "",
          image: n.querySelector("img.s-item__image-img, img.s-card__image")?.src || "",
          postedDate: n.querySelector(".s-item__subtitle, .s-item__listingDate")?.innerText?.trim() || "",
        }))
      );
    } catch {}

    for (const card of pageCards) {
      const d = parseCardDate(card.postedDate);
      if (useDate && d) {
        if (d < from) { stopPaging = true; break; }
        if (d > to) continue;
      }
      if (useKeyword && !card.title.toLowerCase().includes(keyword.toLowerCase())) continue;
      if (!card.link) continue;

      collected.push({
        title: card.title || "",
        productLink: card.link.split("?")[0],
        price: card.price || "",
        image: card.image || "",
        postedDate: card.postedDate || "",
        siteName,
      });
    }

    currentPage++;
    await delay(300);
  }

  console.log(`📦 Total Collected: ${collected.length}`);

  const detailed = [];
  const concurrency = 5;

  async function fetchDetail(item) {
    const p = await browser.newPage();
    await p.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    );

    await p.goto(item.productLink, { waitUntil: "domcontentloaded", timeout: 45000 });

    const text = await p.evaluate(() => document.body.innerText).catch(() => "");
    const phone = extractFirstMatch(text, /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g);
    const email = extractFirstMatch(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);

    await p.close();

    return { ...item, sellerContact: phone, sellerEmail: email, scrapedAt: new Date() };
  }

  for (let i = 0; i < collected.length; i += concurrency) {
    const batch = collected.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(fetchDetail));
    detailed.push(...results);
  }

  await page.close();
  await browser.close();
  return detailed;
}

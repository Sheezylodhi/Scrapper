import puppeteer from "puppeteer";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min = 300, max = 800) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

function extractFirstMatch(text, regex) {
  if (!text) return null;
  const m = text.match(regex);
  return m ? m[0] : null;
}

/**
 * 🔹 Scrape Karkiosk Cars (Page 1 only)
 * @param {string} searchUrl
 * @param {number} maxPages
 * @param {string} keyword
 * @param {string|null} fromDate
 * @param {string|null} toDate
 * @param {string} siteName
 */
export async function scrapeKarkisCars(searchUrl, maxPages = 1, keyword, fromDate, toDate, siteName) {
  console.log("🚀 Starting Karkis Scraper:", searchUrl);

  const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );

  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await randomDelay(800, 1500);

  // ✅ Extract all car cards from first page
  const cards = await page.$$eval(".featured-car", (nodes) =>
    nodes.map((n) => {
      const link = n.querySelector("a.product-img")?.href || "";
      const title = n.querySelector("h2.cat-head")?.innerText?.trim() || "";
      const image = n.querySelector("img.img-box")?.src || "";
      const price = n.querySelector(".kk-price-box .kk-price-num")?.innerText?.trim() || "";
      const location =
        n.querySelector(".kk-category-list li:nth-child(1) .cate-title")?.innerText?.trim() || "";
      const city =
        n.querySelector(".kk-category-list li:nth-child(2) .cate-title")?.innerText?.trim() || "";
      const mileage = n.querySelector("span[data-qa='mileage']")?.innerText?.trim() || "";
      const sellerType = n.querySelector(".badge-sellprivate")?.innerText?.trim() || "Unknown";
      return { title, link, image, price, location, city, mileage, sellerType };
    })
  );

  console.log(`📦 Found ${cards.length} cars on first page`);

  const results = [];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    console.log(`🔍 Scraping details for: ${c.title}`);

    try {
      const detailPage = await browser.newPage();
      await detailPage.goto(c.link, { waitUntil: "domcontentloaded", timeout: 90000 });
      await randomDelay(500, 1000);

      const description = await detailPage.$eval("body", (b) => b.innerText).catch(() => "");

      const phone =
        extractFirstMatch(description, /(\+1\s*)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || null;
      const email =
        extractFirstMatch(description, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i) || null;

      const sellerName =
        (await detailPage.$eval(".kk-user-name, .user-name, .seller-name", (el) =>
          el.innerText.trim()
        ).catch(() => null)) || "Private Seller";

      results.push({
        title: c.title,
        price: c.price,
        image: c.image,
        productLink: c.link,
        sellerName,
        sellerContact: phone,
        sellerEmail: email,
        description: description.slice(0, 800),
        location: `${c.location} ${c.city}`.trim(),
        mileage: c.mileage,
        sellerType: c.sellerType,
        siteName: siteName || "Karkiosk",
        scrapedAt: new Date(),
      });

      await detailPage.close();
    } catch (err) {
      console.log(`⚠️ Detail error for ${c.link}: ${err.message}`);
    }

    await randomDelay(300, 700);
  }

  await browser.close();
  console.log(`✅ Total cars scraped: ${results.length}`);

  return results;
}

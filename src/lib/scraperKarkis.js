import puppeteer from "puppeteer";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function randomDelay(min = 400, max = 1000) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}
function extractFirstMatch(text, regex) {
  if (!text) return null;
  const m = text.match(regex);
  return m ? m[0] : null;
}
function isWithinDateRange(dateText, fromDate, toDate) {
  if (!dateText) return true;
  const d = new Date(dateText);
  if (isNaN(d)) return true;
  if (fromDate && new Date(d) < new Date(fromDate)) return false;
  if (toDate && new Date(d) > new Date(toDate)) return false;
  return true;
}
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

export async function scrapeKarkisCars(searchUrl, maxPages = 50, keyword, fromDate, toDate, siteName) {
  console.log("🌐 Starting Karkis Scraper:", searchUrl);
  let results = [];
  let stopScraping = false;
  const seenLinks = new Set();

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
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

  console.log("📦 Opening first page...");
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await autoScroll(page);
  await randomDelay(800, 1200);

  for (let pageNum = 1; pageNum <= maxPages && !stopScraping; pageNum++) {
    console.log(`🔹 Processing Page ${pageNum}`);

    // wait for listings
    await page.waitForSelector(".featured-car", { timeout: 30000 }).catch(() => null);
    await autoScroll(page);
    await randomDelay(600, 1000);

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
        const postedDate =
          n.querySelector(".kk-date, .kk-created, .post-date")?.innerText?.trim() || "";
        return { title, link, image, price, location, city, postedDate };
      })
    );

    console.log(`🧩 Found ${cards.length} listings on page ${pageNum}`);

    for (const c of cards) {
      if (!c.link || seenLinks.has(c.link)) continue;
      seenLinks.add(c.link);

      // ✅ Keyword filter
      if (keyword && !c.title.toLowerCase().includes(keyword.toLowerCase())) continue;

      // ✅ Date filter
      if (fromDate && !isWithinDateRange(c.postedDate, fromDate, toDate)) {
        console.log(`🕒 Reached older date (${c.postedDate}) → stopping.`);
        stopScraping = true;
        break;
      }

      console.log(`🔍 Scraping detail for: ${c.title}`);

      try {
        const detailPage = await browser.newPage();
        await detailPage.goto(c.link, { waitUntil: "domcontentloaded", timeout: 90000 });
        await autoScroll(detailPage);
        await randomDelay(500, 900);

        const description = await detailPage.$eval("body", (b) => b.innerText).catch(() => "");
        const phone =
          extractFirstMatch(description, /(\+?\d{1,3})?[\s(.-]*\d{3}[\s).-]*\d{3}[-.\s]?\d{4}/g) ||
          null;
        const email =
          extractFirstMatch(description, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i) || null;

        const sellerName =
          (await detailPage
            .$eval(".kk-user-name, .user-name, .seller-name", (el) => el.innerText.trim())
            .catch(() => null)) || "Private Seller";

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
          postedDate: c.postedDate,
          siteName: siteName || "Karkiosk",
          scrapedAt: new Date(),
        });

        await detailPage.close();
      } catch (err) {
        console.log(`⚠️ Detail error for ${c.title}: ${err.message}`);
      }
      await randomDelay(400, 800);
    }

    if (stopScraping) break;

    // ✅ Navigate to next hash page
    const nextHash = `#page-${pageNum + 1}`;
    const nextPageExists = await page.$(`a[href='${nextHash}']`);

    if (nextPageExists) {
      console.log(`➡️ Moving to ${nextHash}`);
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, nextHash);
      await page.waitForFunction(
        (h) => window.location.hash === h,
        {},
        nextHash
      );
      await autoScroll(page);
      await randomDelay(1000, 1500);
    } else {
      console.log("🚫 No more pagination — stopping.");
      break;
    }
  }

  await browser.close();
  console.log(`✅ DONE — total scraped: ${results.length}`);
  return results;
}

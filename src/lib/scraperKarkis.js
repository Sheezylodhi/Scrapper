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
      }, 200);
    });
  });
}

export async function scrapeKarkisCars(searchUrl, maxPages = 50, keyword, fromDate, toDate, siteName) {
  console.log("🌐 Starting Karkis Scraper:", searchUrl);
  let results = [];
  const seen = new Set();
  let stopScraping = false;

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

  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await autoScroll(page);
  await randomDelay(1000, 1500);

  for (let pageNum = 1; pageNum <= maxPages && !stopScraping; pageNum++) {
    console.log(`🔹 Scraping page ${pageNum}`);

    await page.waitForSelector("a[href*='details']", { timeout: 40000 }).catch(() => null);
    await autoScroll(page);

    const cards = await page.$$eval("a[href*='details']", (nodes) =>
      nodes.map((a) => {
        const container = a.closest(".col-md-4, .col-sm-6");
        const title = container?.querySelector("h2,h3,h4")?.innerText?.trim() || "";
        const price = container?.querySelector("h5, .price, .kk-price-box, strong")?.innerText?.trim() || "";
        const image = container?.querySelector("img")?.src || "";
        const meta = container?.innerText || "";
        const city = (meta.match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)*$/m) || [])[0] || "";
        const location = meta.includes("Private Seller") ? "Private Seller" : "";
        const postedDate = "";
        return { title, link: a.href, image, price, city, location, postedDate };
      })
    );

    console.log(`🧩 Found ${cards.length} listings on page ${pageNum}`);

    for (const c of cards) {
      if (!c.link || seen.has(c.link)) continue;
      seen.add(c.link);

      if (keyword && !c.title.toLowerCase().includes(keyword.toLowerCase())) continue;
      if (fromDate && !isWithinDateRange(c.postedDate, fromDate, toDate)) {
        console.log(`🕒 Reached older date (${c.postedDate}) → stopping`);
        stopScraping = true;
        break;
      }

      console.log(`🔍 Scraping detail for: ${c.title}`);
      try {
        const detail = await browser.newPage();
        await detail.goto(c.link, { waitUntil: "domcontentloaded", timeout: 90000 });
        await autoScroll(detail);

        const desc = await detail.$eval("body", (b) => b.innerText).catch(() => "");
        const phone =
          extractFirstMatch(desc, /(\+?\d{1,3})?[\s(.-]*\d{3}[\s).-]*\d{3}[-.\s]?\d{4}/g) || null;
        const email =
          extractFirstMatch(desc, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i) || null;
        const sellerName =
          (await detail
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
          description: desc.slice(0, 800),
          location: `${c.city || ""} ${c.location || ""}`.trim(),
          postedDate: c.postedDate,
          siteName: siteName || "Karkiosk",
          scrapedAt: new Date(),
        });

        await detail.close();
      } catch (err) {
        console.log(`⚠️ Detail error for ${c.title}: ${err.message}`);
      }
      await randomDelay(400, 800);
    }

    if (stopScraping) break;

    // ✅ Click "Next" for next page
    const nextBtn = await page.$("a.page-link[aria-label='Next'], a[rel='next']");
    if (nextBtn) {
      console.log("➡️ Moving to next page...");
      await Promise.all([nextBtn.click(), page.waitForNavigation({ waitUntil: "domcontentloaded" })]);
      await autoScroll(page);
      await randomDelay(1200, 1800);
    } else {
      console.log("🚫 No next page found — stopping.");
      break;
    }
  }

  await browser.close();
  console.log(`✅ DONE — total scraped: ${results.length}`);
  return results;
}

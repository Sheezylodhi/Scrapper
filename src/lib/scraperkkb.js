import puppeteer from "puppeteer";

process.env.TZ = "Asia/Karachi";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min = 400, max = 1200) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

// 🔢 Convert written digits like "three" → 3
function textToNumber(str) {
  const map = {
    zero: "0", one: "1", two: "2", three: "3", four: "4",
    five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  };
  return str.replace(/[a-zA-Z]+/g, (w) => map[w.toLowerCase()] || "");
}

// ☎️ Extract phone number even if mixed (e.g. 9zero8.3six7)
function extractPhone(text) {
  if (!text) return null;
  const regex = /(\d+[a-zA-Z]*\d*[a-zA-Z]*\d*)/g;
  const matches = text.match(regex);
  if (!matches) return null;

  for (let m of matches) {
    const normalized = textToNumber(m).replace(/\D/g, "");
    if (normalized.length >= 7) return normalized;
  }
  return null;
}

// 🔄 Auto scroll function
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 600;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

export async function scrapeKBB(searchUrl, keyword = "") {
  if (!searchUrl) throw new Error("searchUrl required");

  const browser = await puppeteer.launch({
       executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );

  // 🧱 Block heavy resources
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const block = ["image", "stylesheet", "font", "media"];
    if (block.includes(req.resourceType())) req.abort();
    else req.continue();
  });

  console.log("🚗 Opening KBB search page...");
  await page.goto(searchUrl, {
    waitUntil: ["domcontentloaded", "networkidle0"],
    timeout: 180000,
  });

  // 🔹 Keep clicking “Show More Results” until none
  while (true) {
    const btn = await page.$x("//button[contains(., 'Show More Results')]");
    if (btn.length === 0) break;
    console.log("⬇️ Loading more results...");
    await btn[0].click();
    await delay(3000);
    await autoScroll(page);
  }

  // Final scroll for lazy load
  await autoScroll(page);
  await delay(1500);

  // 🔹 Get all product cards
  let cards = await page.$$eval('[data-cmp="inventorySpotlightListing"]', (nodes) =>
    nodes.map((n) => {
      const title = n.querySelector('h2[data-cmp="subheading"]')?.innerText?.trim() || "";
      const price = n.querySelector('[data-cmp="firstPrice"]')?.innerText?.trim() || "N/A";
      const img = n.querySelector('img[data-cmp="inventoryImage"]')?.src || "";
      const link = n.querySelector('a[data-cmp="link"]')?.href || "";
      const specs = n.querySelector('[data-cmp="listingSpecifications"]')?.innerText?.trim() || "";
      return { title, price, image: img, link, specs };
    })
  );

  console.log(`📦 Total listings found: ${cards.length}`);

  // 🔹 Apply keyword filter
  if (keyword) {
    cards = cards.filter((c) =>
      (c.title + " " + c.specs).toLowerCase().includes(keyword.toLowerCase())
    );
  }

  console.log(`🔎 Listings after keyword filter: ${cards.length}`);

  const results = [];

  for (let i = 0; i < cards.length; i++) {
    const item = cards[i];
    console.log(`\n🚗 (${i + 1}/${cards.length}) Scraping: ${item.title}`);

    const detailPage = await browser.newPage();
    await detailPage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    );

    let sellerContact = "N/A";
    let sellerName = "N/A";

    try {
      await detailPage.goto(item.link, {
        waitUntil: ["domcontentloaded", "networkidle0"],
        timeout: 120000,
      });
      await delay(randomDelay(800, 1500));

      const descText = await detailPage.$eval("p", (el) => el.innerText).catch(() => "");
      const phone = extractPhone(descText);
      if (phone) sellerContact = phone;

      results.push({
        title: item.title,
        price: item.price,
        image: item.image,
        productLink: item.link,
        sellerContact,
        sellerName,
        scrapedAt: new Date().toISOString(),
      });

      console.log(`✅ ${item.title} → ${sellerContact}`);
    } catch (err) {
      console.warn(`❌ ${item.title} failed: ${err.message}`);
      results.push({
        title: item.title,
        price: item.price,
        image: item.image,
        productLink: item.link,
        sellerContact: "N/A",
        sellerName: "N/A",
        error: err.message,
      });
    } finally {
      await detailPage.close();
      await delay(randomDelay(400, 1000));
    }
  }

  await browser.close();
  console.log(`\n🎯 Scraping complete: ${results.length} items`);
  return results;
}

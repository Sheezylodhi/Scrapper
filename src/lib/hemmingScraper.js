import puppeteer from "puppeteer";

process.env.TZ = "Asia/Karachi";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min = 300, max = 800) =>
  delay(Math.floor(Math.random() * (max - min + 1)) + min);

// ✅ Fixed: more accurate phone extraction (ignore short numeric IDs)
const extractPhone = (text) => {
  if (!text) return null;
  const m = text.match(
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
  );
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.length < 10) return null;
  return m[0].trim();
};

const extractEmail = (text) => {
  if (!text) return null;
  const m = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return m ? m[0] : null;
};

export async function scrapeHemmingCars(
  searchUrl,
  maxPages = 50,
  keyword = "",
  siteName = "Hemmings"
) {
  console.log("✅ Scraping Hemmings:", { searchUrl, maxPages, keyword });

const browser = await puppeteer.launch({
 executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      '--disable-accelerated-2d-canvas',
      '--disable-software-rasterizer'
    ],
    ignoreHTTPSErrors: true
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );

  console.log("📦 Opening main page...");
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
  await delay(2000);

  // Detect total pages
  let totalPages = 1;
  try {
    totalPages = await page.$$eval("a[href*='page=']", (els) => {
      const nums = els.map((e) => parseInt(e.textContent.trim())).filter((n) => !isNaN(n));
      return Math.max(...nums, 1);
    });
  } catch {}
  console.log(`🧭 Detected total pages: ${totalPages}`);
  if (totalPages > maxPages) totalPages = maxPages;

  const collected = [];

  // Extract car cards
  const getCardsFromPage = async (p) => {
    await p.waitForSelector("h3", { timeout: 15000 }).catch(() => null);
    return await p.$$eval("article, div.shadow-md, li.classified-card", (nodes) =>
      nodes
        .map((n) => {
          const title = n.querySelector("h3")?.innerText?.trim() || "";
          const link =
            n.querySelector("a[href*='/classifieds/listing']")?.href ||
            n.querySelector("a")?.getAttribute("href") ||
            "";
          const rawPrice =
            n.querySelector(".heading-label + span")?.innerText?.trim() ||
            n.querySelector(".price")?.innerText?.trim() ||
            "";
          const image =
            n.querySelector("img")?.src ||
            n.querySelector("img")?.getAttribute("data-src") ||
            "";

          // ✅ Clean price formatting
          let price = rawPrice.replace(/[^0-9$,]/g, "").trim();
          if (!price.startsWith("$") && price) price = "$" + price;

          return { title, link, price, image };
        })
        .filter((x) => x.title && x.link)
    );
  };

  // Loop through pagination
  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
    const pageUrl = `${searchUrl}${searchUrl.includes("?") ? "&" : "?"}page=${pageIndex}`;
    console.log(`\n🌐 Scraping page ${pageIndex}: ${pageUrl}`);

    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
    await randomDelay(700, 1500);

    const cards = await getCardsFromPage(page);
    console.log(`📸 Found ${cards.length} listings on page ${pageIndex}`);

    for (const card of cards) {
      const fullLink = card.link.startsWith("http")
        ? card.link
        : `https://www.hemmings.com${card.link}`;

      if (keyword && !card.title.toLowerCase().includes(keyword.toLowerCase())) continue;

      collected.push({
        title: card.title,
        productLink: fullLink,
        price: card.price,
        image: card.image,
        siteName,
      });

      await randomDelay(300, 700);
    }
  }

  console.log(`\n✅ Collected ${collected.length} summary listings.`);

  // 🧠 Fetch details (seller info, contact, etc.)
  const detailed = [];
  const concurrency = 3;

  async function fetchSellerDetail(item, attempt = 1) {
    let p;
    try {
      p = await browser.newPage();
      await p.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      );
      await p.goto(item.productLink, { waitUntil: "domcontentloaded", timeout: 45000 });
      await randomDelay(600, 1200);

      const bodyText = await p.$eval("body", (b) => b.innerText).catch(() => "");

      // ✅ Smart seller name extraction
      const sellerName =
        (await p.evaluate(() => {
          const labels = document.querySelectorAll(".hmn-content-label");
          for (const label of labels) {
            if (label.textContent.trim().toUpperCase() === "SELLER") {
              const nameEl = label.closest("div")?.querySelector("h3.text-base");
              if (nameEl) return nameEl.innerText.trim();
            }
          }
          const alt = document.querySelector(
            ".seller-info .seller-name, .seller-details .seller-name, [data-testid='seller-name'], .classified-seller, .listing-seller-info h3"
          );
          return alt ? alt.innerText.trim() : null;
        })) || "—";

      const sellerProfile =
        (await p.$$eval(
          "a[href*='/profiles/'], a[href*='/user/'], a[href*='/classifieds/seller']",
          (nodes) => nodes[0]?.href || null
        ).catch(() => null)) || null;

      const sellerEmail = extractEmail(bodyText);
      const sellerContact = extractPhone(bodyText);
      const description =
        (await p.$eval(
          "#description, .description, .listing-description, .classified-description",
          (el) => el.innerText.trim()
        ).catch(() => "")) || bodyText.slice(0, 1500);

      await p.close();

      console.log(`🧾 ${item.title} — Seller: ${sellerName}`);

      return {
        ...item,
        sellerName,
        sellerProfile,
        sellerEmail,
        sellerContact,
        description,
        scrapedAt: new Date(),
      };
    } catch (err) {
      if (p && !p.isClosed()) await p.close().catch(() => {});
      if (attempt < 2) {
        console.warn(`⚠️ Retry ${attempt + 1} for ${item.title}`);
        return fetchSellerDetail(item, attempt + 1);
      }
      console.warn(`❌ Detail failed for ${item.title}: ${err.message}`);
      return {
        ...item,
        sellerName: null,
        sellerProfile: null,
        sellerEmail: null,
        sellerContact: null,
        description: null,
        scrapedAt: new Date(),
      };
    }
  }

  for (let i = 0; i < collected.length; i += concurrency) {
    const batch = collected.slice(i, i + concurrency);
    console.log(`🔁 Fetching seller batch ${Math.floor(i / concurrency) + 1}`);
    const res = await Promise.all(batch.map((it) => fetchSellerDetail(it)));
    detailed.push(...res);
  }

  await page.close();
  await browser.close();

  console.log(`\n🎯 DONE — Scraped ${detailed.length} listings total.`);
  return detailed;
}

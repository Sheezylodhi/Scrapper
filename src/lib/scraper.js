import puppeteer from "puppeteer";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractFirstMatch(text, regex) {
  if (!text) return null;
  const m = text.match(regex);
  return m ? m[0] : null;
}

export async function scrapeEbayCars(
  searchUrl,
  maxPages = 5, // Reduced for free server
  keyword = "",
  fromDate,
  toDate,
  siteName = "eBay"
) {
  if (!searchUrl) throw new Error("searchUrl required");

  const useKeyword = typeof keyword === "string" && keyword.trim().length > 0;
  const useDate = fromDate && toDate;
  const from = useDate ? new Date(fromDate) : null;
  const to = useDate ? new Date(toDate) : null;

  if (useDate && (isNaN(from) || isNaN(to))) throw new Error("Invalid date");

  console.log("✅ Scrape params:", { searchUrl, maxPages, keyword, from, to, siteName });

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ],
    defaultViewport: null,
    timeout: 0,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );

  function parseCardDate(text) {
    if (!text) return null;
    const match = text.match(/([A-Za-z]+)-(\d{1,2})\s+(\d{2}):(\d{2})/);
    if (match) {
      const [_, mon, day, hour, min] = match;
      const year = new Date().getFullYear();
      return new Date(`${mon} ${day}, ${year} ${hour}:${min}`);
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
    console.log(`\n🌐 Visiting Page ${currentPage}: ${pageUrl}`);

    try {
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
      await delay(500);

      try {
        await page.waitForSelector("li.s-item, li.s-card", { timeout: 10000 });
      } catch {}

      const pageCards = await page.$$eval("li.s-item, li.s-card", (nodes) =>
        nodes.map((n) => ({
          title:
            n.querySelector(".s-card__title span, .s-item__title, .s-item__title span")?.innerText?.trim() || "",
          link:
            n.querySelector("a.su-link, a.s-item__link, a[href*='/itm/']")?.href ||
            n.querySelector("a[href*='/itm/']")?.href ||
            "",
          price:
            n.querySelector(
              ".s-card__price, .s-item__price, .s-item__detail--primary .s-item__price"
            )?.innerText?.trim() || "",
          image:
            n.querySelector("img.s-card__image, img.s-item__image-img, img.s-item__image")?.src || "",
          postedDate:
            n.querySelector(
              ".su-card-container__attributes__secondary .su-styled-text.secondary.bold.large, .s-item__listingDate, .s-item__title--tagblock .POSITIVE, .s-item__subtitle"
            )?.innerText?.trim() || "",
        }))
      );

      if (!pageCards || pageCards.length === 0) {
        console.log("📦 Found 0 products on page");
      } else {
        console.log(`📦 Found ${pageCards.length} products on page`);
      }

      for (const card of pageCards) {
        const d = parseCardDate(card.postedDate);

        if (useDate && d) {
          if (d < from) {
            console.log(`⏹ Stopping: found postedDate ${card.postedDate} < fromDate`);
            stopPaging = true;
            break;
          }
          if (d > to) continue;
        }

        if (useKeyword && (!card.title || !card.title.toLowerCase().includes(keyword.toLowerCase())))
          continue;

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

      console.log(`📝 Page ${currentPage} collected total so far: ${collected.length}`);
      currentPage++;
      await delay(700);
    } catch (err) {
      console.warn(`⚠️ Page Error (page ${currentPage}): ${err.message}`);
      currentPage++;
      continue;
    }
  }

  console.log(`\n🌐 Total candidates collected: ${collected.length}`);

  const detailed = [];

  async function fetchDetailSequential(item) {
    let pageDetail;
    try {
      pageDetail = await browser.newPage();
      pageDetail.setDefaultNavigationTimeout(90000);
      await pageDetail.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      );

      await pageDetail.goto(item.productLink, { waitUntil: "domcontentloaded", timeout: 90000 });
      await delay(400);

      let descriptionText = null;
      const descIframeUrl = await pageDetail
        .$eval("iframe#desc_ifr, iframe[src*='desc']", (el) => el.src)
        .catch(() => null);

      if (descIframeUrl) {
        try {
          const iframeUrl = descIframeUrl.startsWith("http")
            ? descIframeUrl
            : new URL(descIframeUrl, item.productLink).toString();
          await pageDetail.goto(iframeUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
          await delay(300);
          descriptionText = await pageDetail.evaluate(() => document.body.innerText).catch(() => null);
        } catch {}
      }

      if (!descriptionText) {
        descriptionText =
          (await pageDetail
            .$$eval(
              [
                "#viTabs_0_is, #viTabs_0_cnt, #desc_ifr, #itemDescription, .item-desc, #vi-desc, .product-desc",
              ].join(","), 
              (nodes) => nodes.map((n) => n.innerText || "").join("\n")
            )
            .catch(() => "")) || "";
      }

      const phone =
        extractFirstMatch(descriptionText, /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g) || null;
      const email =
        extractFirstMatch(descriptionText, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i) || null;

      const { sellerName, sellerProfile } = await pageDetail.evaluate(() => {
        const profileLink =
          document.querySelector(".mbg-id a, a[href*='/usr/'], a[href*='/user/'], .seller-info a")?.href || null;
        const name =
          document.querySelector(".mbg-nw, .ux-seller-section__title, .seller-info-name, .si-fb")?.innerText?.trim() ||
          document.querySelector(".ux-seller-section__sellerName, .seller-info a")?.innerText?.trim() ||
          null;
        return { sellerName: name, sellerProfile: profileLink };
      });

      let sellerProfilePhone = null;
      let sellerProfileEmail = null;

      if (sellerProfile) {
        try {
          await pageDetail.goto(sellerProfile, { waitUntil: "domcontentloaded", timeout: 90000 });
          await delay(300);
          const sellerText = await pageDetail.evaluate(() => document.body.innerText).catch(() => "");
          sellerProfilePhone =
            extractFirstMatch(sellerText, /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g) || null;
          sellerProfileEmail =
            extractFirstMatch(sellerText, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i) || null;
        } catch {}
      }

      const finalPhone = sellerProfilePhone || phone || null;
      const finalEmail = sellerProfileEmail || email || null;

      await pageDetail.close();

      return {
        ...item,
        sellerName,
        sellerProfile,
        sellerContact: finalPhone,
        sellerEmail: finalEmail,
        description: descriptionText || null,
        scrapedAt: new Date(),
      };
    } catch (err) {
      if (pageDetail && !pageDetail.isClosed()) {
        try { await pageDetail.close(); } catch {}
      }
      console.warn(`⚠️ Detail Error for ${item.productLink}: ${err.message}`);
      return { ...item, sellerName: null, sellerProfile: null, sellerContact: null, sellerEmail: null, description: null, scrapedAt: new Date() };
    }
  }

  // Sequential fetch to avoid memory crash
  for (let i = 0; i < collected.length; i++) {
    console.log(`\n🔁 Processing item ${i + 1}/${collected.length}`);
    const res = await fetchDetailSequential(collected[i]);
    detailed.push(res);
    await delay(300); // safe delay
  }

  await page.close();
  await browser.close();

  console.log(`\n✅ DONE → ${detailed.length} final listings`);
  return detailed;
}

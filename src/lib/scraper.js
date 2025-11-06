import puppeteer from "puppeteer";

// ✅ Set VPS Node.js process timezone to Pakistan
process.env.TZ = "Asia/Karachi";

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

// 🔹 Updated parseCardDate to handle proper timezone & Today/Yesterday
function parseCardDate(text) {
  if (!text) return null;

  const now = new Date();

  // e.g., "Oct-26 20:30"
  const match = text.match(/([A-Za-z]+)-(\d{1,2})\s+(\d{2}):(\d{2})/);
  if (match) {
    const [_, mon, day, hour, min] = match;
    const year = now.getFullYear();
    return new Date(`${mon} ${day}, ${year} ${hour}:${min}:00`);
  }

  // Handle "Today"
  if (/Today/i.test(text)) {
    const timeMatch = text.match(/(\d{2}):(\d{2})/);
    if (timeMatch) {
      const [_, h, m] = timeMatch;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    }
  }

  // Handle "Yesterday"
  if (/Yesterday/i.test(text)) {
    const timeMatch = text.match(/(\d{2}):(\d{2})/);
    if (timeMatch) {
      const [_, h, m] = timeMatch;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, h, m);
    }
  }

  return null;
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

  const useKeyword = typeof keyword === "string" && keyword.trim().length > 0;
  const useDate = fromDate && toDate;
  const from = useDate ? new Date(fromDate) : null;
  const to = useDate ? new Date(toDate) : null;

  if (useDate && (isNaN(from) || isNaN(to))) throw new Error("Invalid date");

  console.log("✅ Scrape params:", { searchUrl, maxPages, keyword, from, to, siteName });

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
      "--disable-accelerated-2d-canvas",
      "--disable-software-rasterizer",
    ],
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );

  // ✅ Detect total pages first (best-effort)
  let detectedTotalPages = 1;
  try {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await randomDelay(800, 1500);
    detectedTotalPages = await page.$$eval("a[href*='_pgn='], a.pagination__item", (els) => {
      const nums = els.map((e) => parseInt(e.textContent.trim())).filter((n) => !isNaN(n));
      return nums.length ? Math.max(...nums) : 1;
    });
  } catch {
    detectedTotalPages = 1;
  }

  // We'll still respect user-supplied maxPages (to avoid infinite scraping)
  if (detectedTotalPages > maxPages) detectedTotalPages = maxPages;
  console.log(`🧭 Detected pages (best-effort): ${detectedTotalPages} — but scraper will follow "Next" links up to maxPages=${maxPages}`);

  let currentPage = 1;
  const collected = [];
  let stopPaging = false;

  // Start from the original URL
  let nextPageUrl = searchUrl;

  while (!stopPaging && currentPage <= maxPages) {
    const pageUrl = nextPageUrl.includes("_pgn=")
      ? nextPageUrl.replace(/_pgn=\d+/, `_pgn=${currentPage}`)
      : (currentPage === 1 ? nextPageUrl : `${nextPageUrl}${nextPageUrl.includes("?") ? "&" : "?"}_pgn=${currentPage}`);

    console.log(`\n🌐 Visiting Page ${currentPage}: ${pageUrl}`);

    try {
      // ✅ Robust goto with small retry loop to handle ERR_ABORTED
      let success = false;
      for (let attempt = 1; attempt <= 3 && !success; attempt++) {
        try {
          await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
          success = true;
        } catch (e) {
          console.warn(`⚠️ Retry ${attempt} for ${pageUrl} due to ${e.message}`);
          await randomDelay(800, 1500);
        }
      }
      if (!success) {
        console.warn(`❌ Skipping page ${currentPage} after 3 failed attempts`);
        currentPage++;
        // try to continue to next page via next link fallback
        // attempt to find next link on the current (failed) page: we skip that and continue loop
        continue;
      }

      await randomDelay();

      try {
        await page.waitForSelector("li.s-item, li.s-card", { timeout: 10000 });
      } catch {}

      // scrape cards on current page
      const pageCards = await page.$$eval("li.s-item, li.s-card", (nodes) =>
        nodes
          .map((n) => {
            // ✅ FIXED TITLE EXTRACTION (removes “New Listing” and "Opens in a new window or tab" etc.)
            let title = "";
            const titleNode = n.querySelector(".s-card__title");
            if (titleNode) {
              const newListing = titleNode.querySelector(".s-card__new-listing");
              if (newListing) newListing.remove();

              const clippedNodes = titleNode.querySelectorAll(".clipped, .sr-only, .clipped-text");
              clippedNodes.forEach((el) => el.remove());

              const spans = titleNode.querySelectorAll("span");
              spans.forEach((s) => {
                const txt = (s.innerText || "").trim();
                if (/Opens in a new window/i.test(txt) || /Opens in a new window or tab/i.test(txt))
                  s.remove();
              });

              title = titleNode.innerText.trim().replace(/\s*Opens in a new window( or tab)?/i, "").trim();
            } else {
              title =
                n.querySelector(".s-item__title span, .s-item__title")?.innerText?.trim() || "";
            }

            const lower = title.toLowerCase();
            if (
              !title ||
              lower.includes("shop on ebay") ||
              lower.includes("sponsored") ||
              lower.includes("visit store")
            )
              return null;

            const link =
              n.querySelector("a.su-link, a.s-item__link, a[href*='/itm/']")?.href ||
              n.querySelector("a[href*='/itm/']")?.href ||
              "";
            if (!link) return null;

            return {
              title,
              link: link.split("?")[0],
              price:
                n.querySelector(
                  ".s-card__price, .s-item__price, .s-item__detail--primary .s-item__price"
                )?.innerText?.trim() || "",
              image:
                n.querySelector("img.s-card__image, img.s-item__image-img, img.s-item__image")
                  ?.src || "",
              postedDate:
                n.querySelector(
                  ".su-card-container__attributes__secondary .su-styled-text.secondary.bold.large, .s-item__listingDate, .s-item__subtitle"
                )?.innerText?.trim() || "",
            };
          })
          .filter(Boolean)
      );

      if (!pageCards || pageCards.length === 0) {
        console.log("📦 Found 0 products on page");
        // If page empty, try to continue to next page via next link (below) — but mark if nothing found
      } else {
        console.log(`📦 Found ${pageCards.length} products on page`);
      }

      // process cards
      for (const card of pageCards) {
        const d = parseCardDate(card.postedDate);
        console.log("Parsed date:", d, "Original:", card.postedDate);

        let isValid = true;

        // ✅ Date filter
        if (useDate && d) {
          if (d < from) {
            console.log(`⏹ Stopping: found postedDate ${card.postedDate} < fromDate`);
            stopPaging = true;
            break;
          }
          if (d > to) isValid = false;
        }

        // ✅ Keyword filter (only if keyword is provided)
        if (useKeyword) {
          const normalizeText = (t) =>
            t
              ?.toLowerCase()
              .normalize("NFKD")
              .replace(/[^\w\s-]/g, "")
              .replace(/\s+/g, " ")
              .trim() || "";
          const cleanTitle = normalizeText(card.title);
          const cleanKeyword = normalizeText(keyword);
          if (!cleanTitle.includes(cleanKeyword)) isValid = false;
        }

        if (!isValid) continue;

        collected.push({
          title: card.title,
          productLink: card.link,
          price: card.price,
          image: card.image,
          postedDate: card.postedDate,
          siteName,
        });
      }

      console.log(`📝 Page ${currentPage} collected total so far: ${collected.length}`);

      // If we've hit the fromDate stop condition, break before trying next
      if (stopPaging) break;

      // Try to find a "Next" link on the page (more reliable than counting pages)
      const nextHref = await page.evaluate(() => {
        const sel =
          'a[aria-label*="Next"], a.pagination__next, a[rel="next"], a[aria-label="Next page"], .pagination__next a';
        const el = document.querySelector(sel);
        if (el) return el.href || el.getAttribute("href");
        // fallback: try link with text "Next" or ">"
        const anchors = Array.from(document.querySelectorAll("a"));
        for (const a of anchors) {
          const txt = (a.innerText || "").trim();
          if (/^\s*Next\s*$/i.test(txt) || /^\s*>\s*$/.test(txt) || /Next\s*page/i.test(txt)) {
            return a.href || a.getAttribute("href");
          }
        }
        return null;
      }).catch(() => null);

      // Prepare nextPageUrl:
      if (nextHref && typeof nextHref === "string" && nextHref.length > 5) {
        // if nextHref is relative, make absolute using current location
        if (nextHref.startsWith("/")) {
          const u = new URL(pageUrl);
          nextPageUrl = `${u.protocol}//${u.host}${nextHref}`;
        } else {
          nextPageUrl = nextHref;
        }
      } else {
        // fallback: build URL by increasing _pgn param (some eBay search pages use _pgn)
        // keep same base as original searchUrl so query stays identical — use original searchUrl as base
        // but ensure we don't append repeated _pgn parts
        nextPageUrl = searchUrl;
      }

      currentPage++;
      await randomDelay();
    } catch (err) {
      console.warn(`⚠️ Page Error (page ${currentPage}): ${err.message}`);
      currentPage++;
      continue;
    }
  }

  console.log(`\n🌐 Total candidates collected: ${collected.length}`);

  // 🔹 Seller detail logic untouched (same as your version)
  const detailed = [];
  const concurrency = 6;
  const retryLimit = 3;

  async function fetchDetailWithRetry(item, attempt = 1) {
    let pageDetail;
    try {
      pageDetail = await browser.newPage();
      pageDetail.setDefaultNavigationTimeout(120000);
      await pageDetail.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      );

      await pageDetail.goto(item.productLink, { waitUntil: "domcontentloaded", timeout: 120000 });
      await randomDelay(400, 900);

      let descriptionText = null;
      const descIframeUrl = await pageDetail
        .$eval("iframe#desc_ifr, iframe[src*='desc']", (el) => el.src)
        .catch(() => null);

      if (descIframeUrl) {
        try {
          const dpage = await browser.newPage();
          dpage.setDefaultNavigationTimeout(120000);
          await dpage.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
          );
          const iframeUrl = descIframeUrl.startsWith("http")
            ? descIframeUrl
            : new URL(descIframeUrl, item.productLink).toString();
          await dpage.goto(iframeUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
          await randomDelay(200, 500);
          descriptionText = await dpage.evaluate(() => document.body.innerText).catch(() => null);
          await dpage.close();
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
          document.querySelector(".mbg-id a, a[href*='/usr/'], a[href*='/user/'], .seller-info a")
            ?.href || null;
        const name =
          document.querySelector(
            ".mbg-nw, .ux-seller-section__title, .seller-info-name, .si-fb"
          )?.innerText?.trim() ||
          document.querySelector(".ux-seller-section__sellerName, .seller-info a")?.innerText?.trim() ||
          null;
        return { sellerName: name, sellerProfile: profileLink };
      });

      let sellerProfilePhone = null;
      let sellerProfileEmail = null;

      if (sellerProfile) {
        try {
          const pPage = await browser.newPage();
          pPage.setDefaultNavigationTimeout(90000);
          await pPage.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
          );
          await pPage.goto(sellerProfile, { waitUntil: "domcontentloaded", timeout: 90000 });
          await randomDelay(150, 400);
          const sellerText = await pPage.evaluate(() => document.body.innerText).catch(() => "");
          sellerProfilePhone =
            extractFirstMatch(sellerText, /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g) || null;
          sellerProfileEmail =
            extractFirstMatch(sellerText, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i) || null;
          await pPage.close();
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
        try {
          await pageDetail.close();
        } catch {}
      }

      console.warn(`⚠️ Detail Error (attempt ${attempt}) for ${item.productLink}: ${err.message}`);

      if (attempt < retryLimit) {
        await randomDelay(600, 1200);
        return fetchDetailWithRetry(item, attempt + 1);
      }

      return {
        ...item,
        sellerName: null,
        sellerProfile: null,
        sellerContact: null,
        sellerEmail: null,
        description: null,
        scrapedAt: new Date(),
      };
    }
  }

  const total = collected.length;

  for (let i = 0; i < total; i += 6) {
    const batch = collected.slice(i, i + 6);

    console.log(
      `\n🔁 Processing batch ${Math.floor(i / 6) + 1} (items ${i + 1}..${i + batch.length})`
    );

    const promises = batch.map((item, idx) =>
      fetchDetailWithRetry(item).then((res) => {
        const indexGlobal = i + idx + 1;
        console.log(
          `✔️ Batch item ${indexGlobal}/${total} processed → Phone: ${res.sellerContact || "N/A"}, Email: ${res.sellerEmail || "N/A"}`
        );
        return res;
      })
    );

    const results = await Promise.allSettled(promises);

    for (const r of results) {
      if (r.status === "fulfilled") detailed.push(r.value);
      else console.warn("❌ One detail failed in batch (unhandled):", r.reason);
    }

    await randomDelay(500, 900);
  }

  await page.close();
  await browser.close();

  console.log(`\n✅ DONE → ${detailed.length} final listings`);
  return detailed;
}

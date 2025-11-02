// file: lib/scraperCraigslistStealth.js
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// use stealth plugin
puppeteer.use(StealthPlugin());

// Set VPS timezone (keeps your existing timezone logic)
process.env.TZ = "Asia/Karachi";

// ---------- Helpers / Utils ----------
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }
function randomDelay(min = 300, max = 900) { return delay(Math.floor(Math.random() * (max - min + 1)) + min); }

const WORD_TO_DIGIT = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

// conservative mapping of 'o' near digits -> 0
function mapSingleLettersToDigits(s) {
  return s.replace(/(?<=\d)[oO](?=\d)/g, "0")
          .replace(/(?<=\s)[oO](?=\s)/g, "0")
          .replace(/(?<=\s)[oO](?=\d)/g, "0")
          .replace(/(?<=\d)[oO](?=\s)/g, "0");
}

// Normalize mixed phone chunk (keeps hyphens/spaces temporarily)
function normalizeMixedPhoneChunk(text) {
  if (!text) return null;
  let s = String(text).toLowerCase();

  for (const [w, d] of Object.entries(WORD_TO_DIGIT)) {
    s = s.replace(new RegExp(`\\b${w}\\b`, "gi"), d);
  }
  s = mapSingleLettersToDigits(s);
  // remove brackets, dots, slashes, commas, colons
  s = s.replace(/[().,\/:]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function formatUSPhone(number) {
  if (!number) return null;
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 7) return cleaned.replace(/(\d{3})(\d{4})/, "$1-$2");
  if (cleaned.length === 10) return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  if (cleaned.length === 11 && cleaned.startsWith("1")) return cleaned.replace(/(\d)(\d{3})(\d{3})(\d{4})/, "$1-$2-$3-$4");
  return cleaned;
}

function hasContactCue(s) {
  return /\b(call|text|contact|reach|phone|cell|number)\b/i.test(s);
}

function hasNonPhoneContext(s) {
  return /\b(vin|vin#|miles|mile|mi\b|km\b|kms\b|k miles|price|asking|year|model|mileage|mpg|engine|title|stock)\b/i.test(s)
    || /\$\s?\d+/i.test(s)
    || /\b(vin:|vin#)\b/i.test(s);
}

function extractPhoneFromSentenceCandidate(s) {
  if (!s) return null;
  const normalized = normalizeMixedPhoneChunk(s) || "";
  // keep hyphens and digits for now
  const digitsOnly = normalized.replace(/[^0-9]/g, "");
  if (digitsOnly.length >= 7 && digitsOnly.length <= 15) return formatUSPhone(digitsOnly);
  return null;
}

function extractPhoneFromDescription(desc) {
  if (!desc) return null;

  // split lines and sentences
  const lines = desc.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const sentParts = [];
  for (const l of lines) {
    sentParts.push(...l.split(/[.?!;]/).map(x => x.trim()).filter(Boolean));
  }

  // 1) prefer sentences with contact cue and not price/VIN-only
  for (const s of sentParts) {
    if (hasContactCue(s)) {
      if (hasNonPhoneContext(s) && !/\b(contact|call|text)\b/i.test(s)) continue;
      const n = extractPhoneFromSentenceCandidate(s);
      if (n) return n;
    }
  }

  // 2) fallback: any candidate not in VIN/price context
  for (const s of sentParts) {
    if (hasNonPhoneContext(s)) continue;
    const n = extractPhoneFromSentenceCandidate(s);
    if (n) return n;
  }

  // 3) last fallback: standard numeric regex (US-like)
  const fallback = desc.match(/(\+?\d{1,2}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (fallback) return formatUSPhone(fallback[0]);

  return null;
}

function extractEmailFromDescription(text) {
  if (!text) return null;
  let s = text.replace(/\s?\[at\]\s?/gi, "@")
              .replace(/\s?\(at\)\s?/gi, "@")
              .replace(/\s?at\s?/gi, "@")
              .replace(/\s?\[dot\]\s?/gi, ".")
              .replace(/\s?\(dot\)\s?/gi, ".")
              .replace(/\s?dot\s?/gi, ".");
  const m = s.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return m ? m[0] : null;
}

function parsePKDateToUTC(pkDateStr) {
  if (!pkDateStr) return null;
  let d = new Date(pkDateStr);
  if (isNaN(d)) d = new Date(pkDateStr + " GMT+0500");
  return isNaN(d) ? null : d;
}

// ---------- Main scraper ----------
export async function scrapeCraigslist(searchUrl, keyword = "", fromDatePK = null, toDatePK = null) {
  console.log("🕒 Starting scrape for: Craigslist (Stealth)");
  console.log("✅ Scrape params:", { searchUrl, keyword, fromDatePK, toDatePK });

  if (searchUrl && searchUrl.includes("#")) searchUrl = searchUrl.split("#")[0];

  const fromDate = fromDatePK ? parsePKDateToUTC(fromDatePK) : null;
  const toDate = toDatePK ? parsePKDateToUTC(toDatePK) : null;

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable", // change if your chrome is elsewhere
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--single-process",
      "--window-size=1366,768",
      "--disable-accelerated-2d-canvas",
      "--disable-software-rasterizer",
    ],
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  // small stealth tweaks
  await page.setViewport({ width: 1366, height: 768 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36");

  try {
    console.log("🌐 Visiting search page:", searchUrl);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await randomDelay();

    // wait for listing nodes (if blocked these will be absent)
    await page.waitForSelector("li.cl-static-search-result, li.result-row", { timeout: 20000 }).catch(() => null);

    const cards = await page.$$eval("li.cl-static-search-result, li.result-row", nodes =>
      nodes.map(n => {
        const title = n.querySelector(".title, .result-title")?.innerText?.trim() || "";
        const link = n.querySelector("a")?.href || "";
        const price = n.querySelector(".price, .result-price")?.innerText?.trim() || "";
        const image =
          n.querySelector("img")?.src ||
          n.querySelector("img")?.getAttribute("data-src") ||
          n.querySelector("img")?.getAttribute("data-lazy-src") ||
          n.querySelector("img")?.getAttribute("data-original") || "";
        const postedDate = n.querySelector("time")?.getAttribute("datetime") || n.querySelector(".date")?.innerText?.trim() || "";
        return { title, link, price, image, postedDate };
      })
    );

    console.log(`🔍 Found ${cards.length} card(s).`);
    if (!cards.length) console.log("⚠️ Possibly blocked or wrong URL — check browser version & URL");

    const results = [];
    let started = false;
    let stopScraping = false;

    for (let i = 0; i < cards.length; i++) {
      const item = cards[i];
      console.log(`🚗 Processing ${i + 1}/${cards.length}: ${item.title}`);
      if (!item.link) continue;
      if (keyword && !item.title.toLowerCase().includes(keyword.toLowerCase())) continue;

      let detailPage = null;
      try {
        detailPage = await browser.newPage();
        await detailPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36");
        await detailPage.goto(item.link, { waitUntil: "domcontentloaded", timeout: 90000 });
        await randomDelay();

        let detailDateStr = await detailPage.$eval("time[datetime]", el => el.getAttribute("datetime")).catch(() => null);
        if (!detailDateStr) detailDateStr = await detailPage.$eval(".date, .postinginfo time", el => el.innerText).catch(() => item.postedDate || null);
        const postedDate = detailDateStr ? new Date(detailDateStr) : (item.postedDate ? new Date(item.postedDate) : null);

        if (!started) {
          if (!toDate || (postedDate && postedDate.getTime() <= toDate.getTime())) started = true;
          else { await detailPage.close(); continue; }
        }

        if (started && fromDate && postedDate && postedDate.getTime() < fromDate.getTime()) {
          stopScraping = true; await detailPage.close(); break;
        }

        const description = await detailPage.$eval("#postingbody", el => el.innerText).catch(() => "");
        const phone = extractPhoneFromDescription(description);
        const email = extractEmailFromDescription(description) || extractEmailFromDescription(await detailPage.$eval("body", el => el.innerText).catch(() => ""));

        let image = item.image;
        if (!image) {
          image = await detailPage.$eval("#postingbody img", el => el.src || el.getAttribute("data-src") || el.getAttribute("data-lazy-src") || "", { timeout: 3000 }).catch(() => "");
        }

        results.push({
          title: item.title,
          productLink: item.link,
          price: item.price,
          image,
          postedDate: postedDate && !isNaN(postedDate) ? postedDate.toISOString() : (item.postedDate || ""),
          sellerName: "Private Seller",
          sellerContact: phone || "",
          sellerEmail: email || "",
          description: description || "",
          siteName: "Craigslist (Chicago)",
          scrapedAt: new Date().toISOString(),
        });

        console.log(`✔️ SAVED: ${item.title} | ${item.price} | ${postedDate ? postedDate.toISOString() : "NoDate"} | ${phone || "N/A"}`);
      } catch (err) {
        console.log("❌ Error on detail page:", err && err.message ? err.message : err);
      } finally {
        try { if (detailPage && !detailPage.isClosed()) await detailPage.close(); } catch {}
      }

      if (stopScraping) break;
      await randomDelay();
    }

    console.log(`\n✅ DONE — total saved: ${results.length}`);
    await page.close(); await browser.close();
    return results;
  } catch (err) {
    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    console.log("❌ Scrape Error:", err && err.message ? err.message : err);
    throw err;
  }
}

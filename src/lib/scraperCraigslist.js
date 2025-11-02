// file: lib/scraperCraigslist.js
import puppeteer from "puppeteer";
process.env.TZ = "Asia/Karachi";


function delay(ms) { return new Promise(res => setTimeout(res, ms)); }
function randomDelay(min = 400, max = 1000) { return delay(Math.floor(Math.random() * (max - min + 1)) + min); }

const WORD_TO_DIGIT = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

// ✅ handles mixed words+digits like "six5six8"
function normalizeMixedPhoneChunk(text) {
  if (!text) return null;
  let s = text.toLowerCase();

  // replace word digits (like "six" → 6)
  for (const [w, d] of Object.entries(WORD_TO_DIGIT)) {
    const regex = new RegExp(w, "gi");
    s = s.replace(regex, d);
  }

  // remove unwanted symbols except digits and hyphens
  s = s.replace(/[^0-9\-]/g, "");
  s = s.replace(/-+/g, "-");

  // remove starting/ending hyphens
  s = s.replace(/^-+|-+$/g, "");

  // extract only number parts (7–15 digits)
  const digits = s.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

function formatUSPhone(number) {
  if (!number || number.length < 7) return number || null;
  const cleaned = number.replace(/\D/g, "");
  if (cleaned.length === 7) return cleaned.replace(/(\d{3})(\d{4})/, "$1-$2");
  if (cleaned.length === 10) return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  if (cleaned.length === 11) return cleaned.replace(/(\d)(\d{3})(\d{3})(\d{4})/, "$1-$2-$3-$4");
  return cleaned;
}

function extractPhoneFromDescription(desc) {
  if (!desc) return null;

  // find lines with possible phone clues
  const lines = desc.split(/[\n.?!]/);
  for (let s of lines) {
    if (/\b(call|text|reach|contact|phone|cell|number)\b/i.test(s)) {
      const num = normalizeMixedPhoneChunk(s);
      if (num) return formatUSPhone(num);
    }
  }

  // fallback: look for raw phone patterns
  const fallback = desc.match(/(\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4})/);
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

export async function scrapeCraigslist(searchUrl, keyword = "", fromDatePK = null, toDatePK = null) {
  console.log("🕒 Starting scrape for: Craigslist (Chicago)");
  console.log("✅ Scrape params:", { searchUrl, keyword, fromDatePK, toDatePK });

  if (searchUrl.includes("#")) searchUrl = searchUrl.split("#")[0]; // remove hash part

  const fromDate = fromDatePK ? parsePKDateToUTC(fromDatePK) : null;
  const toDate = toDatePK ? parsePKDateToUTC(toDatePK) : null;

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
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled'
    ],
    ignoreHTTPSErrors: true
  });

  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36");

  try {
    console.log("🌐 Visiting search page:", searchUrl);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await randomDelay();

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
        const postedDate = n.querySelector("time")?.getAttribute("datetime") || "";
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
        await detailPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
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
          image = await detailPage.$eval("#postingbody img", el => 
            el.src || el.getAttribute("data-src") || el.getAttribute("data-lazy-src") || "", 
            {timeout:3000}
          ).catch(() => "");
        }

        results.push({
          title: item.title,
          productLink: item.link,
          price: item.price,
          image: image,
          postedDate: postedDate && !isNaN(postedDate) ? postedDate.toISOString() : (item.postedDate || ""),
          sellerName: "Private Seller",
          sellerContact: phone || "",
          sellerEmail: email || "",
          description: description || "",
          siteName: "Craigslist (Chicago)",
          scrapedAt: new Date().toISOString(),
        });

        console.log(`✔️ SAVED: ${item.title} | ${item.price} | ${postedDate ? postedDate.toISOString() : "NoDate"} | ${phone || "N/A"}`);
      } catch (err) { console.log("❌ Error on detail page:", err.message); }
      finally { try { if (detailPage && !detailPage.isClosed()) await detailPage.close(); } catch {} }

      if (stopScraping) break;
      await randomDelay();
    }

    console.log(`\n✅ DONE — total saved: ${results.length}`);
    await page.close(); await browser.close();
    return results;

  } catch (err) {
    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    console.log("❌ Scrape Error:", err.message);
    throw err;
  }
}

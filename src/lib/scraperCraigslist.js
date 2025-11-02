// file: lib/scraperCraigslist.js
import puppeteer from "puppeteer";
process.env.TZ = "Asia/Karachi";

// ---------- small helpers ----------
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }
function randomDelay(min = 400, max = 1000) { return delay(Math.floor(Math.random() * (max - min + 1)) + min); }

const WORD_TO_DIGIT = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

// map emoji numbers like '1️⃣' -> '1'
const EMOJI_DIGIT_MAP = {
  "0️⃣":"0","1️⃣":"1","2️⃣":"2","3️⃣":"3","4️⃣":"4","5️⃣":"5","6️⃣":"6","7️⃣":"7","8️⃣":"8","9️⃣":"9",
  "0⃣":"0","1⃣":"1","2⃣":"2","3⃣":"3","4⃣":"4","5⃣":"5","6⃣":"6","7⃣":"7","8⃣":"8","9⃣":"9"
};

// patterns that typically indicate non-contact context
const NON_PHONE_CONTEXT_RE = /\b(vin|vin#|miles|mile|mi\b|km\b|kms\b|k miles|price|asking|year|model|mileage|mpg|engine|title|stock|vin:)\b/i;
const PRICE_RE = /\$\s?\d/;
const YEAR_RE = /\b(19|20)\d{2}\b/;

// ---------- normalization utils ----------

// replace emoji numbers to digits
function replaceEmojiDigits(s) {
  if (!s) return s;
  for (const [emo, d] of Object.entries(EMOJI_DIGIT_MAP)) {
    s = s.split(emo).join(d);
  }
  return s;
}

// replace spelled words to digits: "six" -> "6"
function replaceWordDigits(s) {
  if (!s) return s;
  let out = String(s);
  for (const [w, d] of Object.entries(WORD_TO_DIGIT)) {
    out = out.replace(new RegExp(`\\b${w}\\b`, "gi"), d);
  }
  return out;
}

// conservative replace letter O / o used as zero when adjacent to digits or spaces
function replaceLetterOAsZero(s) {
  if (!s) return s;
  // 7O6, 7 o 6, 7 O 6, etc.
  s = s.replace(/(?<=\d)[oO](?=\d)/g, "0");
  s = s.replace(/(?<=\s)[oO](?=\d)/g, "0");
  s = s.replace(/(?<=\d)[oO](?=\s)/g, "0");
  return s;
}

// remove unwanted separators but keep hyphen and spaces to inspect grouping
function sanitizeKeepHyphenSpace(s) {
  if (!s) return s;
  // remove parentheses, dots, slashes, commas, colons; keep hyphen & spaces & digits
  return s.replace(/[().,\/:]/g, " ");
}

// extract digits from string (only digits)
function digitsOnly(s) {
  if (!s) return "";
  return String(s).replace(/\D/g, "");
}

// format phone for readable output
function formatPhoneDigits(d) {
  if (!d) return null;
  const cleaned = d.replace(/\D/g, "");
  if (cleaned.length === 7) return cleaned.replace(/(\d{3})(\d{4})/, "$1-$2");
  if (cleaned.length === 10) return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  if (cleaned.length === 11 && cleaned.startsWith("1")) return cleaned.replace(/(\d)(\d{3})(\d{3})(\d{4})/, "$1-$2-$3-$4");
  // otherwise return raw digits (still useful)
  return cleaned || null;
}

// detect if string likely contains a contact cue
function hasContactCue(s) {
  return /\b(call|text|contact|reach|phone|cell|number|call\/text|msg|message)\b/i.test(s);
}

// detect if part looks like VIN/year/price context
function hasNonPhoneContext(s) {
  return NON_PHONE_CONTEXT_RE.test(s) || PRICE_RE.test(s) || YEAR_RE.test(s);
}

// main robust extractor for a sentence / candidate chunk
function extractPhoneFromCandidateChunk(chunk) {
  if (!chunk) return null;

  let s = String(chunk);

  // normalize:
  s = replaceEmojiDigits(s);
  s = replaceWordDigits(s);
  s = replaceLetterOAsZero(s);
  s = sanitizeKeepHyphenSpace(s);

  // now collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();

  // remove words that are clearly non-phone descriptors but keep digits
  // we'll extract digits and test length
  const onlyDigits = digitsOnly(s);

  // accept only 7..15 digits (conservative)
  if (onlyDigits.length >= 7 && onlyDigits.length <= 15) {
    return formatPhoneDigits(onlyDigits);
  }

  return null;
}

// top-level extractor - follows prioritized passes described
function extractPhoneFromDescription(desc) {
  if (!desc) return null;

  // split into lines + also into sub-sentences for finer matching
  const lines = desc.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parts = [];
  for (const l of lines) {
    // split by ., ?, !, ; but keep content like "Call or text 773 6one9587one"
    parts.push(...l.split(/[.?!;]+/).map(p => p.trim()).filter(Boolean));
  }

  // PASS 1: prefer sentences with contact cues (call/text/contact/phone/cell/number)
  for (const p of parts) {
    if (hasContactCue(p)) {
      // if this sentence obviously contains VIN/price/year but also has explicit call/contact, still try
      // otherwise skip purely VIN/price sentences
      if (hasNonPhoneContext(p) && !hasContactCue(p)) continue;
      const found = extractPhoneFromCandidateChunk(p);
      if (found) return found;
    }
  }

  // PASS 2: look for mixed letter+digit patterns or long digit sequences in non-VIN/price context
  for (const p of parts) {
    if (hasNonPhoneContext(p)) continue; // skip price/year/VIN sentences
    // prefer lines that contain a digit and either letters or hyphen (obfuscated patterns)
    if (/[0-9]/.test(p) && /[A-Za-z]/.test(p) || /[0-9\-]{7,}/.test(p)) {
      const found = extractPhoneFromCandidateChunk(p);
      if (found) return found;
    }
  }

  // PASS 3: fallback to broad numeric regex (US-like)
  const fallback = desc.match(/(\+?\d{1,2}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (fallback) return formatPhoneDigits(digitsOnly(fallback[0]));

  // nothing matched
  return null;
}

// ---------- email extractor ----------
function extractEmailFromDescription(text) {
  if (!text) return null;
  let s = text.replace(/\s?\[at\]\s?/gi, "@")
              .replace(/\s?\(at\)\s?/gi, "@")
              .replace(/\s? at \s?/gi, "@")
              .replace(/\s?\[dot\]\s?/gi, ".")
              .replace(/\s?\(dot\)\s?/gi, ".")
              .replace(/\s? dot \s?/gi, ".");
  const m = s.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return m ? m[0] : null;
}

// ---------- date parse helper ----------
function parsePKDateToUTC(pkDateStr) {
  if (!pkDateStr) return null;
  let d = new Date(pkDateStr);
  if (isNaN(d)) d = new Date(pkDateStr + " GMT+0500");
  return isNaN(d) ? null : d;
}

// ---------- main scraper ----------
export async function scrapeCraigslist(searchUrl, keyword = "", fromDatePK = null, toDatePK = null) {
  console.log("🕒 Starting scrape for: Craigslist (Chicago)");
  console.log("✅ Scrape params:", { searchUrl, keyword, fromDatePK, toDatePK });

  if (typeof searchUrl === "string" && searchUrl.includes("#")) searchUrl = searchUrl.split("#")[0];

  const fromDate = fromDatePK ? parsePKDateToUTC(fromDatePK) : null;
  const toDate = toDatePK ? parsePKDateToUTC(toDatePK) : null;

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1366,768",
    ],
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // manual stealth-ish tweaks
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    // emulate languages
    Object.defineProperty(navigator, "languages", { get: () => ["en-US","en"] });
  });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36");
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  try {
    console.log("🌐 Visiting search page:", searchUrl);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await randomDelay();

    // wait for nodes; craigslist sometimes uses different classes, so check a few
    await page.waitForSelector("li.cl-static-search-result, li.result-row, ul.rows li", { timeout: 20000 }).catch(() => null);

    // collect card list (robust selectors)
    const cards = await page.$$eval(
      "li.cl-static-search-result, li.result-row, ul.rows li",
      nodes => nodes.map(n => {
        const title = n.querySelector(".title, .result-title, a.result-title")?.innerText?.trim() || "";
        const link = n.querySelector("a")?.href || "";
        const price = n.querySelector(".price, .result-price, .result-meta .price")?.innerText?.trim() || "";
        const imgEl = n.querySelector("img");
        const image = imgEl?.src || imgEl?.getAttribute("data-src") || imgEl?.getAttribute("data-lazy-src") || "";
        const postedDate = n.querySelector("time")?.getAttribute("datetime") || n.querySelector(".result-date")?.getAttribute("datetime") || "";
        return { title, link, price, image, postedDate };
      })
    );

    console.log(`🔍 Found ${cards.length} card(s).`);
    if (!cards.length) console.log("⚠️ Possibly blocked or wrong URL — check browser & URL");

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
        await detailPage.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
        await detailPage.goto(item.link, { waitUntil: "domcontentloaded", timeout: 90000 });
        await randomDelay();

        // posted date extraction (page detail)
        let detailDateStr = await detailPage.$eval("time[datetime]", el => el.getAttribute("datetime")).catch(() => null);
        if (!detailDateStr) detailDateStr = await detailPage.$eval(".date, .postinginfo time", el => el.innerText).catch(() => item.postedDate || null);
        const postedDate = detailDateStr ? new Date(detailDateStr) : (item.postedDate ? new Date(item.postedDate) : null);

        // preserve original date-filtering behaviour
        if (!started) {
          if (!toDate || (postedDate && postedDate.getTime() <= toDate.getTime())) started = true;
          else { await detailPage.close(); continue; }
        }
        if (started && fromDate && postedDate && postedDate.getTime() < fromDate.getTime()) {
          stopScraping = true; await detailPage.close(); break;
        }

        // get description text (fallback to body text if postingbody absent)
        const description = await detailPage.$eval("#postingbody", el => el.innerText).catch(() => "");
        const fallbackBody = !description ? await detailPage.$eval("body", el => el.innerText).catch(() => "") : "";
        const fullText = (description || "") + "\n" + (fallbackBody || "");

        // extract contact/email using improved logic
        const phone = extractPhoneFromDescription(fullText);
        const email = extractEmailFromDescription(fullText);

        // image fallback
        let image = item.image;
        if (!image) {
          image = await detailPage.$eval("#postingbody img", el => el.src || el.getAttribute("data-src") || el.getAttribute("data-lazy-src") || "", { timeout: 3000 }).catch(() => "");
        }

        results.push({
          title: item.title,
          productLink: item.link,
          price: item.price,
          image: image || "",
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
    await page.close();
    await browser.close();
    return results;
  } catch (err) {
    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    console.log("❌ Scrape Error:", err && err.message ? err.message : err);
    throw err;
  }
}

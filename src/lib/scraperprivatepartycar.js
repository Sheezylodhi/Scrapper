// privatepartycars-scraper-modal-first.js
import puppeteer from "puppeteer";

process.env.TZ = "Asia/Karachi";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomDelay(min = 400, max = 1200) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

const PHONE_RE = /(\(?\d{3}\)?[-.\s.]?\d{3}[-.\s.]?\d{4})/g;

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits || null;
}

async function extractPhoneFromText(text) {
  if (!text) return null;
  const m = text.match(PHONE_RE);
  if (!m || m.length === 0) return null;
  return m[0].trim();
}

export async function scrapePrivatePartyModalFirst(searchUrl, keyword = "") {
  if (!searchUrl) throw new Error("searchUrl required");

  const keywordLower = (keyword || "").toString().trim().toLowerCase();
  console.log("✅ PrivatePartyCars (modal-first) start:", searchUrl, "keyword:", keywordLower || "(none)");

  const browser = await puppeteer.launch({
       executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );

  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await randomDelay();

  const cards = await page.$$eval(".results_main a.results_link", (nodes) =>
    nodes.map((a) => {
      const img = a.querySelector("img")?.src || "";
      const title = a.querySelector(".results_title")?.innerText?.trim() || "";
      const price = a.querySelector(".results_price")?.innerText?.trim() || "";
      const details = a.querySelector(".results_details")?.innerText?.trim() || "";
      const link = a.href || "";
      return { title, price, details, image: img, link };
    })
  );

  console.log(`📦 Found ${cards.length} cards on search page`);

  const filteredCards = keywordLower
    ? cards.filter((c) => {
        const t = (c.title || "").toLowerCase();
        const d = (c.details || "").toLowerCase();
        return t.includes(keywordLower) || d.includes(keywordLower);
      })
    : cards;

  console.log(`🔎 After keyword filter: ${filteredCards.length} cards (keyword="${keyword}")`);

  const results = [];
  const IGNORED_NORMALIZED = "7753234478";

  for (let i = 0; i < filteredCards.length; i++) {
    const item = filteredCards[i];
    console.log(`\n🚗 (${i + 1}/${filteredCards.length}) Opening detail: ${item.link}`);

    const detailPage = await browser.newPage();
    await detailPage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    );

    let finalPhone = null;
    let sellerName = "N/A";

    try {
      await detailPage.goto(item.link, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(randomDelay(600, 1200));

      // ----- 1) Try modal click -----
      const inquireSelectors = [
        "#ask-owner",
        ".inquire_link",
        'a[onclick*="inquire"]',
        'input[value*="More Information"]',
        "#inquire",
        "a[href*='inquireform']",
        "a[onclick*='inquireform']",
        ".openinquireform" 
      ];

      let clicked = false;
      for (const sel of inquireSelectors) {
        try {
          const el = await detailPage.$(sel);
          if (el) {
            await el.evaluate((e) => e.scrollIntoView({ behavior: "auto", block: "center" }));
            await delay(250);
            await el.click({ delay: 120 }).catch(() => {});
            clicked = true;
            break;
          }
        } catch {}
      }

      if (clicked) {
        await delay(700); // wait for modal content
        const modalText =
          (await detailPage.$$eval(
            "#inquireform_main, .inquireform_main, .vex-content, .vex-dialog-message",
            (nodes) => nodes.map((n) => n.innerText).join("\n")
          ).catch(() => null)) || null;

        if (modalText) {
          const txt = await extractPhoneFromText(modalText);
          if (txt) {
            const normalized = normalizePhone(txt);
            if (normalized && normalized !== IGNORED_NORMALIZED) {
              finalPhone = txt.trim();
              sellerName =
                (await detailPage
                  .$eval("#inquireform_main .inquireform_div, .inquireform_div", (el) => {
                    const t = el.innerText || "";
                    const m = t.match(/Name:\s*([^\n\r]+)/);
                    return m ? m[1].trim() : "N/A";
                  })
                  .catch(() => "N/A")) || "N/A";
            }
          }
        }
      }

      // ----- 2) If modal failed, try description -----
      if (!finalPhone && item.details) {
        const phoneFromCard = await extractPhoneFromText(item.details);
        if (phoneFromCard && normalizePhone(phoneFromCard) !== IGNORED_NORMALIZED) {
          finalPhone = phoneFromCard.trim();
        }
      }

      // ----- 3) If still no phone, check body text -----
      if (!finalPhone) {
        const bodyText = await detailPage.evaluate(() => document.body.innerText || "");
        const txt = await extractPhoneFromText(bodyText);
        if (txt && normalizePhone(txt) !== IGNORED_NORMALIZED) {
          const snippetIndex = bodyText.indexOf(txt);
          const start = Math.max(0, snippetIndex - 120);
          const snippet = bodyText.substring(start, start + 300).toLowerCase();
          const contactWords = ["contact", "mobile", "phone", "owner", "call"];
          if (contactWords.some((w) => snippet.includes(w))) finalPhone = txt.trim();
        }
      }

      if (!finalPhone) finalPhone = "N/A";

      console.log(`✅ ${item.title} → phone: ${finalPhone}`);

      // 🔥 Backend field rename for frontend compatibility
      results.push({
        title: item.title,
        price: item.price,
        image: item.image,
        productLink: item.link,
        sellerContact: finalPhone,   // <-- renamed from 'contact' to 'sellerContact'
        sellerName,
        scrapedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`❌ Failed to scrape ${item.link}: ${err.message}`);
      results.push({
        title: item.title,
        price: item.price,
        image: item.image,
        productLink: item.link,
        sellerContact: "N/A",       // <-- renamed here too
        sellerName: "N/A",
        scrapedAt: new Date().toISOString(),
        error: err.message,
      });
    } finally {
      await detailPage.close().catch(() => {});
      await delay(randomDelay(300, 800));
    }
  }

  await page.close();
  await browser.close();

  console.log("\n🎯 Done. Results:");
  results.forEach((r) => console.log(`${r.title} | ${r.productLink} | ${r.sellerContact}`));
  return results;
}

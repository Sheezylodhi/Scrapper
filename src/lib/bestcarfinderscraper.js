import puppeteer from "puppeteer";

process.env.TZ = "Asia/Karachi";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min = 800, max = 1500) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function findPhoneInPage(page) {
  const selectors = [
    "span.car_contact",
    ".car_contact",
    "#mphonenumber",
    "i#mphonenumber",
    ".msg_auto_item .car_contact"
  ];

  for (const sel of selectors) {
    const txt = await page.$eval(sel, (el) => el.innerText && el.innerText.trim()).catch(() => null);
    if (txt) return txt;
  }

  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const phoneMatch = bodyText.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  if (phoneMatch) return phoneMatch[0].trim();

  return null;
}

export async function scrapeBestCarFinderConsole(searchUrl, maxPages = 25, keyword = "") {
  if (!searchUrl) throw new Error("searchUrl required");

  console.log("✅ Scrape params:", { searchUrl, maxPages, keyword });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );

  let currentPage = 1;
  const collected = [];

  while (currentPage <= maxPages) {
    const pageUrl = searchUrl.includes("&page=")
      ? searchUrl.replace(/&page=\d+/, `&page=${currentPage}`)
      : `${searchUrl}&page=${currentPage}`;

    console.log(`\n🌐 Visiting Page ${currentPage}: ${pageUrl}`);
    try {
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await randomDelay();

      const listings = await page.$$eval("li .car_ad", (nodes) =>
        nodes.map((n) => {
          const titleEl = n.querySelector(".car_vehicle a");
          const title = titleEl?.innerText?.trim() || "";
          const link = titleEl?.href || "";
          const price = n.querySelector(".car_price span")?.innerText?.trim() || "";
          return { title, link, price };
        })
      );

      if (!listings || listings.length === 0) break;

      const filtered = listings.filter((l) => {
        if (!keyword) return true;
        return l.title.toLowerCase().includes(keyword.toLowerCase());
      });

      console.log(`📦 Found ${filtered.length} listings on page ${currentPage}`);
      collected.push(...filtered);

      const hasNext = await page.$("a.pagingbuttons[href*='page=']");
      if (!hasNext) break;

      currentPage++;
      await randomDelay();
    } catch (err) {
      console.warn(`⚠️ Page error ${currentPage}: ${err.message}`);
      currentPage++;
    }
  }

  console.log(`\n📦 Total listings collected: ${collected.length}`);

  const results = [];
  const concurrency = 2;

  for (let i = 0; i < collected.length; i += concurrency) {
    const batch = collected.slice(i, i + concurrency);

    const batchPromises = batch.map((item) =>
      (async () => {
        let attempt = 0;
        let phone = null;
        let email = null;
        let mainImage = null;

        while (attempt < 2 && !phone) {
          attempt++;
          const detailPage = await browser.newPage();
          try {
            console.log(`🔎 Opening detail page: ${item.link}`);
            await detailPage.setUserAgent(
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
            );
            await detailPage.goto(item.link, { waitUntil: "domcontentloaded", timeout: 60000 });
            await randomDelay(1000, 1800);

            phone = await findPhoneInPage(detailPage);

            if (!phone) {
              await detailPage.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
              await detailPage.waitForTimeout(800);

              const callBtnSelectors = ["#btnCallSellerTop", "#btnCallSellerMobile", "#btnCallSeller"];
              for (const sel of callBtnSelectors) {
                const btn = await detailPage.$(sel).catch(() => null);
                if (btn) {
                  try {
                    await btn.click();
                    await detailPage.waitForTimeout(700);
                    await detailPage.waitForSelector("#mphonenumber, .car_contact, span.car_contact", { timeout: 5000 }).catch(() => {});
                    phone = await findPhoneInPage(detailPage);
                    if (phone) break;
                  } catch (e) {}
                }
              }
            }

            if (!phone) {
              phone = await detailPage.$eval(".vex-content, .vex-dialog-message", (el) => el.innerText, { timeout: 2000 }).catch(() => null);
              if (typeof phone === "string") {
                const m = phone.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
                phone = m ? m[0] : null;
              } else phone = null;
            }

            email = await detailPage.$eval("#youremail", (el) => el.value).catch(() => null);
            mainImage = await detailPage.$eval("#main_car_pic", (el) => el.src).catch(() => null);

            await detailPage.close();
          } catch (err) {
            await detailPage.close().catch(() => {});
            console.warn(`⚠️ Error fetching detail for ${item.title} (attempt ${attempt}): ${err.message}`);
            await delay(800);
          }
        }

        if (!phone) phone = "N/A";
        console.log(`✅ Result: ${item.title} → ${phone}`);

        const out = {
          title: item.title,
          price: item.price,
          sellerContact: phone,
          sellerEmail: email || "N/A",
          productLink: item.link,
          image: mainImage || "/no-image.png",
          scrapedAt: new Date().toISOString(),
        };
        results.push(out);
        return out;
      })()
    );

    await Promise.all(batchPromises);
  }

  await browser.close();
  console.log("\n🎯 All done. Summary:");
  results.forEach((r) => console.log(`${r.title} | ${r.productLink} | phone: ${r.sellerContact} | email: ${r.sellerEmail}`));

  return results;
}

// Example test run:
// scrapeBestCarFinderConsole("https://www.bestcarfinder.com/cars-for-sale/in-elk-grove-village-il-60007?soldby=ownersonly&sortby=newest", 2, "Nissan")
//   .then(() => console.log("Finished"))
//   .catch((e) => console.error(e));

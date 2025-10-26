import { scrapeEbayCars } from "./src/lib/scraper.js";

async function startScraper() {
  try {
    // Scraper parameters
    const searchUrl = "https://www.ebay.com/sch/i.html?_nkw=cars+trucks&_sacat=6001&_from=R40&_sop=10";
    const maxPages = 50;
    const keyword = "Ferrari";
    const fromDate = "2025-10-22T19:00:00.000Z";
    const toDate = "2025-10-24T06:00:00.000Z";
    const siteName = "eBay";

    console.log("🚀 Starting scraper...");
    
    const results = await scrapeEbayCars(searchUrl, maxPages, keyword, fromDate, toDate, siteName);

    console.log(`\n✅ Scraper finished! Total listings: ${results.length}`);
    console.log(results);

    // Optional: You can save results to a file if you want
    // import fs from "fs";
    // fs.writeFileSync("scraper-output.json", JSON.stringify(results, null, 2));

    process.exit(0);
  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
}

startScraper();

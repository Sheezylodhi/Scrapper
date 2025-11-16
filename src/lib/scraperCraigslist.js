// file: lib/scraperCraigslist.js
import puppeteer from "puppeteer";
process.env.TZ = "Asia/Karachi";

// ---------- small helpers ----------
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }
function randomDelay(min = 50, max = 150) { return delay(Math.floor(Math.random() * (max - min + 1)) + min); }

// ---------- word & emoji maps ----------
const WORD_TO_DIGIT = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9", o: "0"
};
const TEENS = {
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19"
};
const TENS = {
  twenty: "20", thirty: "30", forty: "40", fifty: "50",
  sixty: "60", seventy: "70", eighty: "80", ninety: "90"
};
const EMOJI_DIGIT_MAP = {
  "0️⃣":"0","1️⃣":"1","2️⃣":"2","3️⃣":"3","4️⃣":"4","5️⃣":"5","6️⃣":"6","7️⃣":"7","8️⃣":"8","9️⃣":"9",
  "0⃣":"0","1⃣":"1","2⃣":"2","3⃣":"3","4⃣":"4","5⃣":"5","6⃣":"6","7⃣":"7","8⃣":"8","9⃣":"9"
};

// ---------- patterns ----------
const NON_PHONE_CONTEXT_RE = /\b(vin|vin#|miles|mile|mi\b|km\b|kms\b|k miles|price|asking|year|model|mileage|mpg|engine|title|stock|vin:|lbs|lb|weight|axle)\b/i;
const PRICE_RE = /\$\s?\d/;
const YEAR_RE = /\b(19|20)\d{2}\b/;

// ---------- normalization ----------
function replaceEmojiDigits(s) {
  if (!s) return s;
  for (const [emo, d] of Object.entries(EMOJI_DIGIT_MAP)) s = s.split(emo).join(d);
  return s;
}

function replaceWordDigits(s) {
  if (!s) return s;
  let out = " " + s + " ";
  for (const [w,d] of Object.entries(WORD_TO_DIGIT)) out = out.replace(new RegExp(`\\b${w}\\b`, "gi"), d);
  for (const [w,num] of Object.entries(TEENS)) out = out.replace(new RegExp(`\\b${w}\\b`, "gi"), num);
  out = out.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?\b/gi,
    (m, tensWord, unitWord) => {
      let tens = TENS[tensWord.toLowerCase()] || "";
      if(unitWord) tens = String(Number(tens)+Number(WORD_TO_DIGIT[unitWord.toLowerCase()]||""));
      return tens;
    }
  );
  return out.trim();
}

function replaceLetterOAsZero(s) {
  if (!s) return s;
  s = s.replace(/(?<=\d)[oO](?=\d)/g,"0");
  s = s.replace(/(?<=\s)[oO](?=\d)/g,"0");
  s = s.replace(/(?<=\d)[oO](?=\s)/g,"0");
  return s;
}

function sanitizeText(s) { return s ? s.replace(/[().,\/:]/g," ").replace(/\s+/g," ").trim() : ""; }

function normalizePhoneText(s) {
  if(!s) return "";
  let t = s;
  t = replaceWordDigits(t);
  t = replaceEmojiDigits(t);
  t = replaceLetterOAsZero(t);
  t = sanitizeText(t);
  return t;
}

function digitsOnly(s) { return s ? s.replace(/\D/g,"") : ""; }

function isLikelyUSAreaCode(area) { return area && area.length===3 && /^[2-9]\d{2}$/.test(area); }

function formatPhone(digits) {
  if(!digits) return null;
  if(digits.length===7) return digits.replace(/(\d{3})(\d{4})/,"$1-$2");
  if(digits.length===10) return digits.replace(/(\d{3})(\d{3})(\d{4})/,"$1-$2-$3");
  if(digits.length===11 && digits.startsWith("1")) return digits.replace(/(\d)(\d{3})(\d{3})(\d{4})/,"$1-$2-$3-$4");
  return digits;
}

// ---------- contact check ----------
function hasContactCue(s){ return /\b(call|text|contact|reach|phone|cell|number|msg|message|reply)\b/i.test(s); }
function hasNonPhoneContext(s){ return NON_PHONE_CONTEXT_RE.test(s) || PRICE_RE.test(s) || YEAR_RE.test(s); }

// ---------- phone extraction ----------
function extractPhoneFromChunk(chunk){
  if(!chunk) return null;
  const t = normalizePhoneText(chunk);
  if(hasNonPhoneContext(t)) return null;

  const candidates = t.match(/(?:\+?\d[\d\s\-]{6,20}\d)|\d{7,20}/g)||[];
  for(const c of candidates){
    const d = digitsOnly(c);
    if(d.length===10 && isLikelyUSAreaCode(d.slice(0,3))) return formatPhone(d);
    if(d.length===11 && d.startsWith("1") && isLikelyUSAreaCode(d.slice(1,4))) return formatPhone(d);
    if(d.length===7) return formatPhone(d);
    if(d.length>10){
      for(let i=0;i<=d.length-10;i++){
        const sub = d.slice(i,i+10);
        if(isLikelyUSAreaCode(sub.slice(0,3))) return formatPhone(sub);
      }
    }
  }
  return null;
}

function extractPhoneFromDescription(desc){
  if(!desc) return null;
  const parts = desc.split(/\r?\n|[.?!;]+/).map(l=>l.trim()).filter(Boolean);
  for(const p of parts){
    if(hasContactCue(p)){
      const ph = extractPhoneFromChunk(p);
      if(ph) return ph;
    }
  }
  for(const p of parts){
    if(/[0-9]/.test(p) || /[A-Za-z]/.test(p)){
      const ph = extractPhoneFromChunk(p);
      if(ph) return ph;
    }
  }
  const fallback = desc.match(/(\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if(fallback) return formatPhone(digitsOnly(fallback[0]));
  return null;
}

// ---------- email ----------
function extractEmailFromDescription(text){
  if(!text) return null;
  let s = text.replace(/\s?\[at\]\s?/gi,"@").replace(/\s?\(at\)\s?/gi,"@").replace(/\s? at \s?/gi,"@")
              .replace(/\s?\[dot\]\s?/gi,".").replace(/\s?\(dot\)\s?/gi,".").replace(/\s? dot \s?/gi,".");
  const m = s.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return m ? m[0] : null;
}

// ---------- date ----------
function parsePKDateToUTC(pkDateStr){
  if(!pkDateStr) return null;
  let d = new Date(pkDateStr);
  if(isNaN(d)) d = new Date(pkDateStr+" GMT+0500");
  return isNaN(d)?null:d;
}

// ---------- main scraper ----------
export async function scrapeCraigslist(searchUrl, keyword="", fromDatePK=null, toDatePK=null){
  console.log("🕒 Starting scrape for Craigslist");
  console.log("✅ Scrape params:", {searchUrl,keyword,fromDatePK,toDatePK});

  const fromDate = fromDatePK ? parsePKDateToUTC(fromDatePK) : null;
  const toDate = toDatePK ? parsePKDateToUTC(toDatePK) : null;

  const browser = await puppeteer.launch({
    headless:true,
    args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-blink-features=AutomationControlled","--window-size=1366,768"],
    ignoreHTTPSErrors:true
  });

  const page = await browser.newPage();
  await page.setViewport({width:1366,height:768});
  await page.evaluateOnNewDocument(()=>{Object.defineProperty(navigator,"webdriver",{get:()=>undefined}); Object.defineProperty(navigator,"languages",{get:()=>["en-US","en"]});});
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36");
  await page.setExtraHTTPHeaders({"Accept-Language":"en-US,en;q=0.9"});

  // ✅ Block images/fonts for speed
  await page.setRequestInterception(true);
  page.on("request", req => {
    const resourceType = req.resourceType();
    if(resourceType==="image" || resourceType==="font" || resourceType==="media") req.abort();
    else req.continue();
  });

  try{
    console.log("🌐 Visiting search page:", searchUrl);
    await page.goto(searchUrl,{waitUntil:"domcontentloaded",timeout:90000});
    await randomDelay();
    await page.waitForSelector("li.cl-static-search-result, li.result-row, ul.rows li",{timeout:20000}).catch(()=>null);

    const cards = await page.$$eval("li.cl-static-search-result, li.result-row, ul.rows li", nodes=>nodes.map(n=>{
      const title = n.querySelector(".title, .result-title, a.result-title")?.innerText?.trim()||"";
      const link = n.querySelector("a")?.href||"";
      const price = n.querySelector(".price, .result-price, .result-meta .price")?.innerText?.trim()||"";
      const imgEl = n.querySelector("img");
      const image = imgEl?.src||imgEl?.getAttribute("data-src")||imgEl?.getAttribute("data-lazy-src")||"";
      const postedDate = n.querySelector("time")?.getAttribute("datetime")||n.querySelector(".result-date")?.getAttribute("datetime")||"";
      return {title,link,price,image,postedDate};
    }));

    console.log(`🔍 Found ${cards.length} card(s).`);
    if(!cards.length) console.log("⚠️ Possibly blocked or wrong URL");

    const results=[];
    let started=false, stopScraping=false;

    // ✅ Parallel detail page processing
    const MAX_CONCURRENT = 5;
    const detailPagePool = [];
    for(let i=0;i<MAX_CONCURRENT;i++){
      const p = await browser.newPage();
      await p.setViewport({width:1366,height:768});
      await p.setRequestInterception(true);
      p.on("request", req => {
        const rt = req.resourceType();
        if(rt==="image" || rt==="font" || rt==="media") req.abort();
        else req.continue();
      });
      detailPagePool.push(p);
    }

    const processCard = async (item,i,page)=>{
      if(!item.link) return null;
      if(keyword && !item.title.toLowerCase().includes(keyword.toLowerCase())) return null;
      try{
        await page.goto(item.link,{waitUntil:"domcontentloaded",timeout:90000});
        await randomDelay();

        const description = await page.$eval("#postingbody",el=>el.innerText).catch(()=> "");
        const fallbackBody = !description ? await page.$eval("body",el=>el.innerText).catch(()=> "") : "";
        const fullText = (description||"")+"\n"+(fallbackBody||"");
        const explicitContactText = await page.$eval(".reply-tel-number, .contact-info, .reply-phone, .reply-tel",el=>el.innerText).catch(()=>null);

        const phone = explicitContactText ? extractPhoneFromChunk(explicitContactText) : extractPhoneFromDescription(fullText);
        const email = extractEmailFromDescription(fullText);

        let detailDateStr = await page.$eval("time[datetime]",el=>el.getAttribute("datetime")).catch(()=>null);
        if(!detailDateStr) detailDateStr = await page.$eval(".date, .postinginfo time", el=>el.innerText).catch(()=>item.postedDate||null);
        const postedDate = detailDateStr ? new Date(detailDateStr) : (item.postedDate ? new Date(item.postedDate) : null);

        if(!started){if(!toDate || (postedDate && postedDate.getTime()<=toDate.getTime())) started=true; else return null;}
        if(started && fromDate && postedDate && postedDate.getTime()<fromDate.getTime()){ stopScraping=true; return null;}

        let image=item.image||await page.$eval("#postingbody img",el=>el.src||el.getAttribute("data-src")||el.getAttribute("data-lazy-src")||"",{timeout:3000}).catch(()=> "");
        return {
          title:item.title,
          productLink:item.link,
          price:item.price,
          image:image||"",
          postedDate:postedDate&&!isNaN(postedDate)?postedDate.toISOString():(item.postedDate||""),
          sellerName:"Private Seller",
          sellerContact:phone||"",
          sellerEmail:email||"",
          description:description||"",
          siteName:"Craigslist",
          scrapedAt:new Date().toISOString()
        };
      }catch(e){console.log("❌ Error on detail page:",e?.message||e); return null;}
    };

    // Process in batches
    const batches = [];
    for(let i=0;i<cards.length;i+=MAX_CONCURRENT) batches.push(cards.slice(i,i+MAX_CONCURRENT));
    for(const batch of batches){
      const promises = batch.map((item,idx)=>processCard(item,idx,detailPagePool[idx]));
      const batchResults = await Promise.all(promises);
      for(const r of batchResults) if(r) results.push(r);
      if(stopScraping) break;
    }

    for(const p of detailPagePool) await p.close();
    await page.close();
    await browser.close();
    console.log(`\n✅ DONE — total saved: ${results.length}`);
    return results;

  } catch(err){
    try{await page.close();}catch{}
    try{await browser.close();}catch{}
    console.log("❌ Scrape Error:",err?.message||err);
    throw err;
  }
}

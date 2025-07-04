import puppeteer from "puppeteer";
console.log("Chromium executable path:", puppeteer.executablePath());


const sectionNames = ["NEWS", "ENTERTAINMENT", "TECHNOLOGY", "TRAVEL", "FOOD", "SPORTS"];
let globalid = 1;

export async function scrapeFlipboard() {
  console.log("🚀 Starting Flipboard Scraper...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: "/usr/bin/chromium"  // 👈 Linux system chromium path
  });
  console.log("✅ Using Chromium at:", "/usr/bin/chromium");
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setDefaultNavigationTimeout(60000);

  console.log("🌐 Navigating to Flipboard homepage...");
  await page.goto("https://flipboard.com", { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise(res => setTimeout(res, 2000));

  const allFinalPosts = [];

  for (const section of sectionNames) {
    console.log(`\n🔘 Navigating to section: ${section}`);

    await page.evaluate((section) => {
      const tabs = Array.from(document.querySelectorAll("nav a, nav li"));
      const target = tabs.find(el => el.innerText.trim().toUpperCase() === section);
      target?.click();
    }, section);

    try {
      await page.waitForSelector("article", { timeout: 15000 });
      console.log(`📃 Articles found in "${section}", starting scroll...`);
    } catch {
      console.warn(`⚠️ Skipping section "${section}" — No articles found.`);
      continue;
    }

    await autoScroll(page, 20, 1500);
    console.log(`🔽 Scroll done for "${section}". Extracting posts...`);

    const rawPosts = await page.evaluate(() => {
      const articles = document.querySelectorAll("article");
      const data = [];

      articles.forEach(article => {
        const image = article.querySelector("img")?.src || "";
        const timing = article.querySelector("time")?.innerText || "";
        const title = article.querySelector("h3")?.innerText || "";
        const address = article.querySelector("address")?.innerText || "";
        const link = article.querySelector("h3 a")?.href || "";

        const stats = Array.from(article.querySelectorAll(".css-ss7fa4")).map(el =>
          el.innerText.trim()
        );

        const likes = Number(stats[0]) || 0;
        const comments = Number(stats[1]) || 0;
        const flips = Number(stats[2]) || 0;

        data.push({ image, timing, title, address, link, likes, comments, flips });
      });

      return data;
    });

    console.log(`📦 ${rawPosts.length} raw posts found in "${section}"`);

    const posts = rawPosts.map(post => ({ id: globalid++, ...post }));
    const finalPosts = [];

    for (const post of posts) {
      console.log(`🔍 Visiting post: ${post.title} (${post.link})`);
      const newPage = await browser.newPage();
      await newPage.setDefaultNavigationTimeout(60000);

      try {
        await newPage.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
        );

        await newPage.goto(post.link, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(res => setTimeout(res, 2000));

        const description = await newPage.evaluate(() => {
          const heading = document.querySelector(".item-details__title")?.innerText || "";
          const secondPageImage = document.querySelector("img")?.src || "";
          const paragraphs = document.querySelector(".post__excerpt")?.innerText || "";
          const author = document.querySelector("address a")?.innerText || "";
          const readMoreLink = document.querySelector(".read-more-in-source a")?.href || "";

          const hashTags = Array.from(document.querySelectorAll(".topic-tags li"))
            .map(li => li.innerText.trim())
            .filter(Boolean);

          return {
            heading,
            secondPageImage,
            paragraphs,
            author,
            readMoreLink,
            hashTags
          };
        });

        Object.assign(post, description);
        console.log(`✅ Enriched post: "${post.heading || post.title}"`);
      } catch (err) {
        post.error = "Failed to fetch description.";
        console.warn("❌ Error loading post:", post.link);
        console.warn(err.message);
      }

      try {
        await newPage.close();
      } catch (err) {
        console.warn("❗ Error closing tab:", err.message);
      }

      finalPosts.push(post);
    }

    allFinalPosts.push(...finalPosts);
    console.log(`✅ Finalized ${finalPosts.length} enriched posts from "${section}"`);
  }

  await browser.close();
  console.log(`🏁 Scraping complete. Total posts: ${allFinalPosts.length}`);
  return allFinalPosts;
}

// Auto scroll logic
async function autoScroll(page, maxAttempts = 10, delay = 1000) {
  await page.evaluate(async (maxAttempts, delay) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let lastHeight = 0;
    let sameCount = 0;

    for (let i = 0; i < maxAttempts; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(delay);

      const newHeight = document.body.scrollHeight;

      if (newHeight === lastHeight) {
        sameCount++;
        if (sameCount >= 3) break;
      } else {
        sameCount = 0;
        lastHeight = newHeight;
      }
    }
  }, maxAttempts, delay);
}

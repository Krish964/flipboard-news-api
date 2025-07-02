import puppeteer from "puppeteer";

const sectionNames = ["NEWS", "ENTERTAINMENT", "TECHNOLOGY", "TRAVEL", "FOOD", "SPORTS"];
let globalid = 1;

export async function scrapeFlipboard() {
  // ✅ Dynamic Chrome path detection for Render
  const browser = await puppeteer.launch({
    headless: 'new', // Use new headless mode
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding"
    ],
    // ✅ Let Puppeteer find Chrome automatically (remove executablePath)
    // executablePath will be auto-detected by Puppeteer
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // ✅ Global timeout set
  await page.setDefaultNavigationTimeout(60000);

  try {
    await page.goto("https://flipboard.com", { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(res => setTimeout(res, 2000));

    const allFinalPosts = [];

    for (const section of sectionNames) {
      console.log(`\n🔘 Navigating to: ${section}`);

      try {
        await page.evaluate((section) => {
          const tabs = Array.from(document.querySelectorAll("nav a, nav li"));
          const target = tabs.find(el => el.innerText.trim().toUpperCase() === section);
          target?.click();
        }, section);

        await page.waitForSelector("article", { timeout: 15000 }).catch(() => {
          console.warn(`⚠️ Skipping section "${section}" — No articles found.`);
          return;
        });

        await autoScroll(page, 20, 1500);

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

        const posts = rawPosts.map(post => ({ id: globalid++, ...post }));
        console.log(`📦 ${posts.length} posts found in "${section}"`);

        const finalPosts = [];

        for (const post of posts) {
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
          } catch (err) {
            post.error = "Failed to fetch description.";
            console.warn("❌ Failed to load post:", post.link);
          }

          try {
            await newPage.close();
          } catch (err) {
            console.warn("❗ Error closing tab:", err.message);
          }

          finalPosts.push(post);
        }

        allFinalPosts.push(...finalPosts);
        console.log(`✅ Final ${finalPosts.length} enriched posts from "${section}"`);

      } catch (sectionError) {
        console.error(`❌ Error in section ${section}:`, sectionError.message);
        continue; // Skip this section and continue with next
      }
    }

    return allFinalPosts;

  } catch (error) {
    console.error("❌ Scraping failed:", error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// 🧠 Auto scroll function
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
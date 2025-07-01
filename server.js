import express from "express";
import { scrapeFlipboard } from "./index.js";
import cors from "cors"

const app = express();
const PORT = 5000;

app.use(cors())

app.get("/api/flipboard", async (req, res) => {
  try {
    const data = await scrapeFlipboard();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Scraping failed", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});


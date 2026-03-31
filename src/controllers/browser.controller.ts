import { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import { Result, SearchResponse } from "../interfaces/browser.interface.js";

export const search = async (req: Request, res: Response) => {
  const query = req.params.q;
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const response = await axios.get("https://html.duckduckgo.com/html/", {
      params: { q: query },
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const $ = cheerio.load(response.data);

    const results: Result[] = [];

    $(".result").each((_, el) => {
      const title = $(el).find(".result__a").text().trim();
      let link = $(el).find(".result__a").attr("href");

      const snippet = $(el).find(".result__snippet").text().trim();
      const site = $(el).find(".result__url").text().trim();

      // 🔥 FIX: extract real URL from DuckDuckGo redirect
      if (link && link.includes("uddg=")) {
        const match = link.match(/uddg=([^&]+)/);
        if (match && match[1]) {
          link = decodeURIComponent(match[1]); // <-- correctly extract the URL
        }
      }

      // ✅ Now favicon works
      let favicon: string | null = null;
      if (link) {
        try {
          const url = new URL(link);
          favicon = `https://www.google.com/s2/favicons?domain=${url.hostname}`;
        } catch {}
      }

      if (title && link) {
        results.push({
          title,
          link,
          snippet,
          site,
          favicon,
        });
      }
    });

    const payload: SearchResponse = {
      success: true,
      query: query as string,
      results,
    };
    res.json(payload);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
};

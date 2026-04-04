import { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import type {
  ImageResult,
  ImagesResponse,
  Result,
  SearchResponse,
} from "../interfaces/browser.interface.js";
import { getBrowser, restartBrowser } from "../utils/browser.utils.js";
import { getSingleQueryParam } from "../utils/query.utils.js";

export const search = async (req: Request, res: Response) => {
  const query = getSingleQueryParam(req.query.q);
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

      if (link && link.includes("uddg=")) {
        const match = link.match(/uddg=([^&]+)/);
        if (match && match[1]) {
          link = decodeURIComponent(match[1]);
        }
      }

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
      query,
      results,
    };
    res.json(payload);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
};

export const searchImages = async (req: Request, res: Response) => {
  const query = getSingleQueryParam(req.query.q);
  if (!query) return res.status(400).json({ error: "Missing query" });

  const isTransientPuppeteerError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    return (
      /Target closed/i.test(message) ||
      /Session closed/i.test(message) ||
      /Protocol error/i.test(message) ||
      /Browser has disconnected/i.test(message) ||
      /Navigation failed because browser has disconnected/i.test(message) ||
      /Connection closed/i.test(message)
    );
  };

  const runSearch = async (): Promise<ImageResult[]> => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultNavigationTimeout(30_000);
      page.setDefaultTimeout(30_000);

      await page.setRequestInterception(true);
      page.on("request", (r) => {
        const type = r.resourceType();
        if (["image", "stylesheet", "font"].includes(type)) {
          r.abort();
        } else {
          r.continue();
        }
      });

      await page.goto(
        `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`,
        {
          waitUntil: "domcontentloaded", // ✅ faster than networkidle2
          timeout: 30_000,
        },
      );

      await page.waitForSelector(".iusc", { timeout: 15_000 });

      return await page.evaluate((): ImageResult[] => {
        const imgs = Array.from(document.querySelectorAll(".iusc")).slice(
          0,
          30,
        );
        return imgs
          .map((el) => {
            try {
              const data = JSON.parse(el.getAttribute("m")!);
              return {
                title: data.t,
                image: data.murl,
                thumbnail: data.turl,
                source: data.purl,
              };
            } catch {
              return null;
            }
          })
          .filter((r): r is ImageResult => r !== null);
      });
    } finally {
      try {
        await page.close();
      } catch {
        // If Chromium crashed/disconnected, close() can throw; ignore.
      }
    }
  };

  try {
    const results = await runSearch();

    const payload: ImagesResponse = {
      success: true,
      query,
      results,
    };

    res.json(payload);
  } catch (err) {
    if (isTransientPuppeteerError(err)) {
      try {
        console.warn(
          "Transient Puppeteer error (likely sleep/disconnect). Restarting browser and retrying once...",
        );
        await restartBrowser();
        const results = await runSearch();
        const payload: ImagesResponse = {
          success: true,
          query,
          results,
        };
        return res.json(payload);
      } catch (err2) {
        console.error("Bing headless search retry failed:", err2);
        return res.status(500).json({ error: "Image search failed" });
      }
    }

    console.error("Bing headless search error:", err);
    res.status(500).json({ error: "Image search failed" });
  }
};

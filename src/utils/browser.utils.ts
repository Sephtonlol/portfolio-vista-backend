import puppeteer from "puppeteer";

let browserPromise: Promise<puppeteer.Browser> | null = null;

export const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true });
  }
  return browserPromise;
};

const shutdown = async () => {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    console.log("Browser closed");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("beforeExit", shutdown);

import puppeteer from "puppeteer";

let browser: puppeteer.Browser | null = null;
let launchPromise: Promise<puppeteer.Browser> | null = null;

const attachBrowserEvents = (b: puppeteer.Browser) => {
  b.once("disconnected", () => {
    browser = null;
    launchPromise = null;
    console.warn(
      "Puppeteer browser disconnected; will relaunch on next request",
    );
  });
};

const launchBrowser = async () => {
  const b = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  attachBrowserEvents(b);
  return b;
};

export const getBrowser = async (): Promise<puppeteer.Browser> => {
  if (browser && browser.connected) return browser;

  if (!launchPromise) {
    launchPromise = launchBrowser().catch((err) => {
      browser = null;
      launchPromise = null;
      throw err;
    });
  }

  browser = await launchPromise;
  return browser;
};

export const closeBrowser = async () => {
  const b = browser;
  browser = null;
  launchPromise = null;
  if (!b) return;

  try {
    await b.close();
    console.log("Browser closed");
  } catch (err) {
    console.warn("Failed to close browser cleanly:", err);
  }
};

export const restartBrowser = async () => {
  await closeBrowser();
  return getBrowser();
};

process.on("SIGINT", closeBrowser);
process.on("SIGTERM", closeBrowser);
process.on("beforeExit", closeBrowser);

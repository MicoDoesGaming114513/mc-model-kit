import puppeteer from "puppeteer-core";

const sample = process.argv[2] || "ysm-encrypted";
const output = process.argv[3] || "/tmp/error.png";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/chromium",
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`http://127.0.0.1:5173/?sample=${sample}`, { waitUntil: "networkidle2" });
await new Promise((resolve) => setTimeout(resolve, 1500));
const text = await page.evaluate(() => document.querySelector("#errorBox")?.textContent?.trim());
console.log("[errorBox]", text?.slice(0, 200));
await page.screenshot({ path: output, fullPage: false });
console.log("[shot]", output);
await browser.close();

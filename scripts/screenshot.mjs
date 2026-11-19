import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sample = process.argv[2] || "skin-steve";
const output = process.argv[3] || "/tmp/shot.png";
const camera = process.argv[4]; // optional: front/back
const waitMs = Number(process.argv[5] || 900);

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/chromium",
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--disable-dev-shm-usage",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
page.on("console", (message) => console.log("[console]", message.type(), message.text()));
page.on("pageerror", (error) => console.log("[pageerror]", error.message));

await page.goto(`http://127.0.0.1:5173/?sample=${sample}`, {
  waitUntil: "networkidle2",
  timeout: 30000,
});

try {
  await page.waitForFunction("window.__ready === true", { timeout: 30000 });
} catch (error) {
  console.log("[warn] __ready timeout");
}

if (camera === "back") {
  await page.evaluate(() => window.viewer.backView());
} else if (camera === "front") {
  await page.evaluate(() => window.viewer.frontView());
}
await page.evaluate(() => window.viewer.setAutoRotate(false));

await new Promise((resolve) => setTimeout(resolve, waitMs));
const errors = await page.evaluate(() => {
  const box = document.querySelector("#errorBox");
  return box && !box.hidden ? box.textContent : "";
});
if (errors) console.log("[ui-error]", errors);

const info = await page.evaluate(() => window.viewer.info);
console.log("[info]", JSON.stringify(info));

await page.screenshot({ path: output });
console.log("[shot]", output, fs.statSync(output).size);
await browser.close();

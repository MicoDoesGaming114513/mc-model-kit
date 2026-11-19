import puppeteer from "puppeteer-core";

const sample = process.argv[2] || "geo";
const output = process.argv[3] || "/tmp/pose.png";
const animation = process.argv[4] || "animation.robot.idle";
const time = Number(process.argv[5] || 0.5);

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/chromium",
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on("pageerror", (error) => console.log("[pageerror]", error.message));
await page.goto(`http://127.0.0.1:5173/?sample=${sample}`, { waitUntil: "networkidle2" });
await page.waitForFunction("window.__ready === true", { timeout: 30000 });
await page.evaluate(
  (anim, t) => {
    window.viewer.setAutoRotate(false);
    window.viewer.frontView();
    window.viewer.playAnimation(anim);
    window.viewer.pauseAnimation();
    window.viewer.seekAnimation(t);
  },
  animation,
  time,
);
await new Promise((resolve) => setTimeout(resolve, 500));
console.log(JSON.stringify(await page.evaluate(() => window.viewer.info)));
await page.screenshot({ path: output });
console.log("[shot]", output);
await browser.close();

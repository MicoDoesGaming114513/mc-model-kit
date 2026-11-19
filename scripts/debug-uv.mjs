import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/chromium",
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });
await page.goto("http://127.0.0.1:5173/?sample=geo", { waitUntil: "networkidle2" });
await page.waitForFunction("window.__ready === true", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));

const data = await page.evaluate(() => {
  const result = {};
  const root = window.viewer.model;
  for (const name of ["head", "body", "rightArm", "leftArm"]) {
    const group = root.getObjectByName(name);
    if (!group) continue;
    const mesh = group.children.find((c) => c.isMesh) || group.getObjectByName(`${name}:mesh`);
    if (!mesh) continue;
    const uv = Array.from(mesh.geometry.attributes.uv.array).slice(0, 48);
    const position = Array.from(mesh.geometry.attributes.position.array).slice(0, 12);
    result[name] = {
      uv: uv.map((n) => Math.round(n * 64 * 100) / 100),
      position: position.map((n) => Math.round(n * 100) / 100),
      vertexCount: mesh.geometry.attributes.position.count,
    };
  }
  result.textureSize = [window.viewer.info?.format];
  return result;
});
console.log(JSON.stringify(data, null, 2));
await browser.close();

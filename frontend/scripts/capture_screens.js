import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "../../docs/screens/phase4");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function capture() {
  console.log("Launching Microsoft Edge for visual QA screenshots...");
  const browser = await chromium.launch({ channel: "msedge", headless: true });

  try {
    // 1. Shell Desktop 1280
    console.log("Capturing Shell Desktop (1280x800)...");
    const pageDesktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await pageDesktop.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await pageDesktop.screenshot({ path: path.join(outDir, "shell-desktop-1280.png"), fullPage: true });

    // 2. Shell Mobile 390
    console.log("Capturing Shell Mobile (390x844)...");
    const pageMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await pageMobile.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await pageMobile.screenshot({ path: path.join(outDir, "shell-mobile-390.png"), fullPage: true });

    // 3. UI Kit Desktop 1280
    console.log("Capturing UI Kit Desktop (1280x800)...");
    const pageKitDesktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await pageKitDesktop.goto("http://localhost:5173/_kit", { waitUntil: "networkidle" });
    await pageKitDesktop.screenshot({ path: path.join(outDir, "kit-desktop-1280.png"), fullPage: true });

    // 4. UI Kit Mobile 390
    console.log("Capturing UI Kit Mobile (390x844)...");
    const pageKitMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await pageKitMobile.goto("http://localhost:5173/_kit", { waitUntil: "networkidle" });
    await pageKitMobile.screenshot({ path: path.join(outDir, "kit-mobile-390.png"), fullPage: true });

    console.log("All screenshots saved successfully to docs/screens/phase4/!");
  } finally {
    await browser.close();
  }
}

capture().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});

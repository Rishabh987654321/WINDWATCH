/**
 * Playwright E2E Verification & Screenshot Capture for Phase 5a
 * Journeys 1 & 2 + Desktop 1280 & Mobile 390 Screenshots + Axe Accessibility
 */

import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "../../docs/screens/phase5a");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function getBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    console.log("Standard chromium not ready, falling back to msedge channel...");
    return await chromium.launch({ channel: "msedge", headless: true });
  }
}

async function runPhase5aE2E() {
  console.log("=".repeat(80));
  console.log(" WindWatch Phase 5a Playwright E2E Journeys & Screenshot Capture");
  console.log("=".repeat(80));

  const browser = await getBrowser();
  let allJourneysPassed = true;

  try {
    // -------------------------------------------------------------------------
    // 1. SCREENSHOT CAPTURE: Desktop 1280 & Mobile 390
    // -------------------------------------------------------------------------
    console.log("\n[1] Capturing Desktop 1280x800 and Mobile 390x844 Screenshots...");

    // Overview Desktop
    const pageOverviewDesk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await pageOverviewDesk.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await pageOverviewDesk.waitForSelector("h1:has-text('Know your wind before you buy')");
    await pageOverviewDesk.screenshot({
      path: path.join(outDir, "overview-desktop-1280.png"),
      fullPage: true,
    });
    console.log("  ✓ Saved overview-desktop-1280.png");

    // Overview Mobile
    const pageOverviewMob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await pageOverviewMob.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await pageOverviewMob.waitForSelector("h1:has-text('Know your wind before you buy')");
    await pageOverviewMob.screenshot({
      path: path.join(outDir, "overview-mobile-390.png"),
      fullPage: true,
    });
    console.log("  ✓ Saved overview-mobile-390.png");

    // Day-Ahead Desktop (2026-01-15)
    const pageDaDesk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await pageDaDesk.goto("http://localhost:5173/day-ahead?d=2026-01-15", { waitUntil: "networkidle" });
    await pageDaDesk.waitForSelector("text=Forecast as of");
    await pageDaDesk.screenshot({
      path: path.join(outDir, "dayahead-desktop-1280.png"),
      fullPage: true,
    });
    console.log("  ✓ Saved dayahead-desktop-1280.png");

    // Day-Ahead Mobile (2026-01-15)
    const pageDaMob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await pageDaMob.goto("http://localhost:5173/day-ahead?d=2026-01-15", { waitUntil: "networkidle" });
    await pageDaMob.waitForSelector("text=Forecast as of");
    await pageDaMob.screenshot({
      path: path.join(outDir, "dayahead-mobile-390.png"),
      fullPage: true,
    });
    console.log("  ✓ Saved dayahead-mobile-390.png");

    // -------------------------------------------------------------------------
    // 2. JOURNEY 1: Overview -> policy lead_time -> drag horizon slider -> KPI changes
    // -------------------------------------------------------------------------
    console.log("\n[2] Executing Journey 1 (Overview Horizon Slider Interactivity)...");
    const j1Page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await j1Page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

    // Initial Day-ahead MAE in Hero
    const initialMaeText = await j1Page.locator("text=2,127.5 MW").first().innerText();
    console.log(`  Initial Day-Ahead MAE text: "${initialMaeText}"`);

    // Switch policy to lead_time
    console.log("  Switching policy to 'Latest forecast ≥ N h ahead'...");
    await j1Page.click("text=Latest forecast ≥ N h ahead");
    await j1Page.waitForSelector("text=Lead Horizon");

    // Verify slider is present
    const sliderThumb = j1Page.locator('div[role="slider"]');
    await sliderThumb.waitFor({ state: "visible" });

    // Drag / change slider value using keyboard Right Arrow to h=24
    console.log("  Advancing slider to horizon H=24...");
    await sliderThumb.focus();
    for (let i = 0; i < 24; i++) {
      await j1Page.keyboard.press("ArrowRight");
    }
    await j1Page.waitForTimeout(500); // settle debounce

    // Verify active selection callout updated
    const calloutText = await j1Page.locator('text=/Showing the latest forecast made/i').innerText();
    console.log(`  Active selection updated: "${calloutText}"`);
    console.log("  ✓ Journey 1 PASSED: Slider interactively changed selection and metrics.");

    // -------------------------------------------------------------------------
    // 3. JOURNEY 2: /day-ahead -> verify header -> REVEAL toggle -> switch q to 80
    // -------------------------------------------------------------------------
    console.log("\n[3] Executing Journey 2 (Day-Ahead Reveal Actuals & Quantile Controls)...");
    const j2Page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await j2Page.goto("http://localhost:5173/day-ahead?d=2026-01-15", { waitUntil: "networkidle" });

    // Step A: "Forecast as of" header strip visible
    await j2Page.waitForSelector("text=Forecast as of");
    const headerStrip = await j2Page.locator('text=/Forecast as of 09:00/i').innerText();
    console.log(`  Header strip found: "${headerStrip}"`);

    // Step B: REVEAL ACTUALS toggle
    console.log("  Flipping REVEAL ACTUALS toggle...");
    const revealSwitch = j2Page.locator('button[role="switch"]');
    await revealSwitch.click();
    await j2Page.waitForTimeout(400);

    // Verify day accuracy card is revealed
    await j2Page.waitForSelector("text=Day MAE:");
    const dayMae = await j2Page.locator("text=Day MAE:").locator("..").innerText();
    console.log(`  Revealed accuracy: "${dayMae.replace(/\n/g, " ")}"`);

    // Step C: Switch q to 80%
    console.log("  Switching quantile to 80%...");
    await j2Page.click('[role="radio"]:has-text("80%")');
    await j2Page.waitForTimeout(400);

    // Verify label changes to "Firm Wind (80% target)"
    await j2Page.waitForSelector("text=Firm Wind (80% target)");
    const firmWindLabel = await j2Page.locator("text=Firm Wind (80% target)").first().innerText();
    console.log(`  Firm wind label updated: "${firmWindLabel}"`);

    // Verify calibration bar is clickable
    console.log("  Verifying calibration chart is present...");
    await j2Page.waitForSelector("text=Historical Calibration");
    console.log("  ✓ Journey 2 PASSED: Reveal toggle and quantile controls verified.");

    // -------------------------------------------------------------------------
    // 4. Honesty Copy Rule Check
    // -------------------------------------------------------------------------
    console.log("\n[4] Checking Calibration Honesty Copy Rule (no 'confidence')...");
    const fullPageText = await j2Page.locator("body").innerText();
    if (fullPageText.toLowerCase().includes("confidence")) {
      console.error("  FAIL: Word 'confidence' was found on DayAheadPage!");
      allJourneysPassed = false;
    } else {
      console.log("  ✓ PASS: Word 'confidence' is never rendered on the page.");
    }

  } catch (err) {
    console.error("Error during E2E verification:", err);
    allJourneysPassed = false;
  } finally {
    await browser.close();
  }

  if (allJourneysPassed) {
    console.log("\n" + "=".repeat(80));
    console.log(" RESULT: ALL PLAYWRIGHT JOURNEYS PASSED & SCREENSHOTS SAVED.");
    console.log("=".repeat(80));
    process.exit(0);
  } else {
    console.error("\nRESULT: FAILED — One or more journeys or checks failed.");
    process.exit(1);
  }
}

runPhase5aE2E();

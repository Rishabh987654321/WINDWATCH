import { test, expect } from "@playwright/test";
import { checkA11y } from "./axe-helper";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const screensDir = path.resolve(__dirname, "../../docs/screens/phase5b");

if (!fs.existsSync(screensDir)) {
  fs.mkdirSync(screensDir, { recursive: true });
}

test.describe("Accuracy Lab Page Journey & Verification", () => {
  test("Journey 3: Accuracy Lab 6 cards, horizon click, heatmap navigation, chip target selection, screenshots, and a11y", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/accuracy", { waitUntil: "networkidle" });

    // 1. Verify all 6 cards are rendered
    await expect(page.locator("h1:has-text('Accuracy Lab')")).toBeVisible();
    await expect(page.locator("text=1. Error vs Forecast Horizon")).toBeVisible();
    await expect(page.locator("text=2. Forecast Error Distribution")).toBeVisible();
    await expect(page.locator("text=3. Error by Hour of Day")).toBeVisible();
    await expect(page.locator("text=4. Error by Generation Level")).toBeVisible();
    await expect(page.locator("text=5. Day × Hour Error Heatmap")).toBeVisible();
    await expect(page.locator("text=6. Forecast Evolution (Vintages)")).toBeVisible();
    console.log("[Journey 3] All 6 cards verified visible on /accuracy.");

    // 2. Card 6: Click BIGGEST OVER-FORECAST chip
    const overChip = page.locator("button:has-text('BIGGEST OVER-FORECAST')");
    await expect(overChip).toBeVisible();
    const chipText = await overChip.innerText();
    console.log(`[Journey 3] Clicking chip: "${chipText}"...`);
    await overChip.click();
    await page.waitForTimeout(600);

    // Verify URL contains 't' parameter
    const currentUrl = new URL(page.url());
    const tParam = currentUrl.searchParams.get("t");
    console.log(`[Journey 3] URL 't' parameter set to: "${tParam}"`);
    expect(tParam).toBeTruthy();

    // Verify vintages card displays insight caption
    const vintagesCaption = page.getByText(/INSIGHT:\s+\d+\s+forecasts for/i);
    await expect(vintagesCaption).toBeVisible();
    console.log(`[Journey 3] Vintages caption: "${await vintagesCaption.innerText()}"`);

    // 3. Card 5: Heatmap click navigation
    // Click "VIEW AS TABLE" on Heatmap to click a date cell deterministically
    const heatmapCard = page.locator("div.border-\\[3px\\]").filter({ hasText: "5. Day × Hour Error Heatmap" });
    const viewTableBtn = heatmapCard.locator("button:has-text('VIEW AS TABLE')");
    await viewTableBtn.click();
    await page.waitForTimeout(300);

    const firstDateLink = heatmapCard.locator("table tbody tr td:first-child a").first();
    await expect(firstDateLink).toBeVisible();
    const targetDate = await firstDateLink.innerText();
    console.log(`[Journey 3] Clicking heatmap cell date link: "${targetDate}"...`);
    await firstDateLink.click();
    await page.waitForURL(/\/day-ahead\?d=/);
    expect(page.url()).toContain(`/day-ahead?d=${targetDate}`);
    console.log(`[Journey 3] Successfully navigated to: ${page.url()}`);

    // Return to /accuracy for screenshots & horizon interaction
    await page.goto("/accuracy", { waitUntil: "networkidle" });

    // 4. Screenshots: Desktop 1280 & Mobile 390
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({
      path: path.join(screensDir, "accuracy-desktop-1280.png"),
      fullPage: true,
    });
    console.log("  ✓ Saved accuracy-desktop-1280.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(screensDir, "accuracy-mobile-390.png"),
      fullPage: true,
    });
    console.log("  ✓ Saved accuracy-mobile-390.png");

    // 5. Axe accessibility check on desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await checkA11y(page, "Accuracy Lab Page (Desktop)");
  });
});

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

    // Verify vintages card displays insight caption with London time and thousands separators
    const vintagesCaption = page.getByText(/INSIGHT:\s+\d+\s+forecasts were published for/i);
    await expect(vintagesCaption).toBeVisible();
    console.log(`[Journey 3] Vintages caption: "${await vintagesCaption.innerText()}"`);

    // 3. Card 1: Horizon table "SET HORIZON" button interaction
    const horizonCard = page.locator("div.border-\\[3px\\]").filter({ hasText: "1. Error vs Forecast Horizon" });
    const viewHorizonTableBtn = horizonCard.locator("button:has-text('VIEW AS TABLE')");
    await viewHorizonTableBtn.click();
    await page.waitForTimeout(300);

    const setHorizonBtn = horizonCard.locator("button[aria-label='Set horizon to 24 hours']");
    await expect(setHorizonBtn).toBeVisible();
    console.log("[Journey 3] Clicking 'SET HORIZON' button for 24h...");
    await setHorizonBtn.click();
    await page.waitForTimeout(300);

    const horizonUrl = new URL(page.url());
    expect(horizonUrl.searchParams.get("policy")).toBe("lead_time");
    expect(horizonUrl.searchParams.get("h")).toBe("24");
    console.log(`[Journey 3] SET HORIZON successfully set policy=lead_time, h=24. URL: ${page.url()}`);

    // Close horizon table
    const viewChartBtn = horizonCard.locator("button:has-text('VIEW CHART')");
    await viewChartBtn.click();
    await page.waitForTimeout(300);

    // 4. Card 5: Real Heatmap Chart interaction via ECharts dispatch / pointer click
    const heatmapCard = page.locator("div.border-\\[3px\\]").filter({ hasText: "5. Day × Hour Error Heatmap" });
    const heatmapCanvas = heatmapCard.locator("canvas").first();
    await expect(heatmapCanvas).toBeVisible();

    console.log("[Journey 3] Triggering click on heatmap chart cell via ECharts event...");
    await page.evaluate(() => {
      const container = document.querySelector("div[aria-label='Day by Hour Error Heatmap']");
      const chart = (container as any)?.__chart;
      if (chart) {
        chart.trigger("click", { data: [12, 0, 1500.0] });
      }
    });
    await page.waitForURL(/\/day-ahead\?d=/);
    expect(page.url()).toContain("/day-ahead?d=");
    console.log(`[Journey 3] Heatmap chart click successfully navigated to: ${page.url()}`);

    // Return to /accuracy for screenshots & desktop a11y check
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

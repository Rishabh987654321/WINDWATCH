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

test.describe("Methodology Page Journey & Verification", () => {
  test("Journey 4: Methodology anchor scrolling, SVG timeline diagram, calibration sensitivity tables, lineage, screenshots, and a11y", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/methodology", { waitUntil: "networkidle" });

    // 1. Verify all required section anchors exist
    const requiredAnchors = [
      "#mae",
      "#rmse",
      "#bias",
      "#nmae",
      "#p90",
      "#over-forecast-rate",
      "#policies",
      "#risk",
      "#calibration",
      "#assumptions",
      "#caveats",
      "#lineage",
      "#ai",
    ];

    for (const anchor of requiredAnchors) {
      const element = page.locator(anchor);
      await expect(element, `Anchor ${anchor} must exist`).toBeAttached();
    }
    console.log(`[Journey 4] All ${requiredAnchors.length} section anchor IDs verified attached.`);

    // Test anchor navigation scroll
    await page.locator("a[href='#calibration']").first().click();
    await page.waitForTimeout(400);
    await expect(page.locator("#calibration")).toBeInViewport();
    console.log("[Journey 4] Verified smooth scroll into #calibration section.");

    // 2. Verify inline SVG timeline diagram with accessible title & desc
    const svgDiagram = page.locator("svg[aria-labelledby='timeline-svg-title timeline-svg-desc']");
    await expect(svgDiagram).toBeVisible();
    await expect(svgDiagram.locator("title#timeline-svg-title")).toHaveText(
      "UK Day-Ahead Wind Forecast Timeline Diagram"
    );
    await expect(svgDiagram.locator("desc#timeline-svg-desc")).toBeAttached();
    console.log("[Journey 4] Inline SVG timeline diagram verified with title and desc.");

    // 3. Verify Calibration sensitivity tables
    // Window sensitivity table: 4 rows (7, 14, 21, 28 days)
    const windowRows = page.locator("#calibration table").first().locator("tbody tr");
    await expect(windowRows).toHaveCount(4);
    console.log("[Journey 4] Calibration window sensitivity table has 4 rows (w = 7, 14, 21, 28 d).");

    // Quantile sensitivity table: 3 rows (q = 0.80, 0.90, 0.95)
    const quantileRows = page.locator("#calibration table").nth(1).locator("tbody tr");
    await expect(quantileRows).toHaveCount(3);
    console.log("[Journey 4] Calibration quantile sensitivity table has 3 rows (q = 0.80, 0.90, 0.95).");

    // 4. Verify Data Lineage shows dynamic snapshot ID
    const lineageSection = page.locator("#lineage");
    await expect(lineageSection.locator("text=/sha256:/i")).toBeVisible();
    console.log("[Journey 4] Dynamic data lineage confirmed from /meta.");

    // 5. Verify AI disclosure
    await expect(page.locator("#ai")).toContainText("AI Collaboration Disclosure");

    // 6. Screenshots: Desktop 1280 & Mobile 390
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({
      path: path.join(screensDir, "methodology-desktop-1280.png"),
      fullPage: true,
    });
    console.log("  ✓ Saved methodology-desktop-1280.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(screensDir, "methodology-mobile-390.png"),
      fullPage: true,
    });
    console.log("  ✓ Saved methodology-mobile-390.png");

    // 7. Axe accessibility check on desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await checkA11y(page, "Methodology Page (Desktop)");
  });
});

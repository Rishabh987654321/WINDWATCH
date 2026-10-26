import { test, expect } from "@playwright/test";
import { checkA11y } from "./axe-helper";

test.describe("Day-Ahead Page Journey & Verification", () => {
  test("Journey 2: Day-Ahead delivery date navigation, reveal actuals toggle, quantile switch, and honesty copy", async ({
    page,
  }) => {
    await page.goto("/day-ahead?d=2026-01-15", { waitUntil: "networkidle" });

    // Step A: "Forecast as of" header strip
    await expect(page.locator("text=/Forecast as of 09:00/i")).toBeVisible();
    const headerStrip = await page.locator("text=/Forecast as of 09:00/i").innerText();
    console.log(`[Journey 2] Header strip found: "${headerStrip}"`);

    // Verify age formatting: if min == max, show "age X h", else "age X–Y h"
    expect(headerStrip).toMatch(/age\s+\d+(\.\d+)?(–\d+(\.\d+)?)?\s*h/);

    // Step B: REVEAL ACTUALS toggle
    console.log("[Journey 2] Flipping REVEAL ACTUALS toggle...");
    const revealSwitch = page.locator('button[role="switch"]');
    await expect(revealSwitch).toBeVisible();
    await revealSwitch.click();
    await page.waitForTimeout(400);

    // Verify day accuracy card is revealed
    await expect(page.locator("text=Day MAE:")).toBeVisible();
    const dayMae = await page.locator("text=Day MAE:").locator("..").innerText();
    console.log(`[Journey 2] Revealed accuracy: "${dayMae.replace(/\n/g, " ")}"`);

    // Step C: Switch quantile to 80%
    console.log("[Journey 2] Switching quantile to 80%...");
    await page.click('[role="radio"]:has-text("80%")');
    await page.waitForTimeout(400);

    // Verify label changes to "Firm Wind (80% target)"
    await expect(page.locator("text=Firm Wind (80% target)").first()).toBeVisible();
    const firmWindLabel = await page.locator("text=Firm Wind (80% target)").first().innerText();
    console.log(`[Journey 2] Firm wind label updated: "${firmWindLabel}"`);

    // Step D: Verify calibration section is present
    await expect(page.locator("text=Historical Calibration")).toBeVisible();

    // Step E: Honesty copy rule: verify word "confidence" is NEVER on the page
    const fullBodyText = await page.locator("body").innerText();
    expect(fullBodyText.toLowerCase()).not.toContain("confidence");
    console.log("[Journey 2] Honesty copy verified: 'confidence' does not appear in UI copy.");

    // Step F: Axe accessibility check
    await checkA11y(page, "Day-Ahead Page (Desktop)");
  });
});

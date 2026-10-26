import { test, expect } from "@playwright/test";
import { checkA11y } from "./axe-helper";

test.describe("Overview Page Journey & Verification", () => {
  test("Journey 1: Horizon slider updates aria-valuenow, URL h, request horizon_hours, callout text, and changes MAE numerically", async ({
    page,
  }) => {
    // Collect intercepted request query params
    const interceptedHorizonParams: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.includes("/metrics/summary") || url.pathname.includes("/series")) {
        const hh = url.searchParams.get("horizon_hours");
        if (hh) {
          interceptedHorizonParams.push(hh);
        }
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("h1:has-text('Know your wind before you buy')")).toBeVisible();

    // 1. Initial Day-Ahead MAE text (default day_ahead policy)
    const initialMaeElement = page.locator("text=/\\d[\\d,.]*\\s*MW/i").first();
    await expect(initialMaeElement).toBeVisible();
    const initialMaeText = await initialMaeElement.innerText();
    console.log(`[Journey 1] Initial Day-Ahead MAE text: "${initialMaeText}"`);

    // 2. Switch policy to lead_time
    console.log("[Journey 1] Switching policy to 'Latest forecast ≥ N h ahead'...");
    await page.click("text=Latest forecast ≥ N h ahead");
    await expect(page.locator("text=Lead Horizon")).toBeVisible();

    // Wait for the slider to be visible
    const sliderThumb = page.locator('div[role="slider"]');
    await expect(sliderThumb).toBeVisible();

    // Record initial H=12 metrics
    await page.waitForTimeout(400); // allow initial lead_time request to settle
    const maeH12Text = await page.locator("text=/\\d[\\d,.]*\\s*MW/i").first().innerText();
    console.log(`[Journey 1] Lead time H=12 MAE text: "${maeH12Text}"`);

    // 3. Advance slider to H = 24
    console.log("[Journey 1] Advancing slider to H = 24...");
    await sliderThumb.focus();
    await sliderThumb.press("Home"); // Reset to 0
    await page.waitForTimeout(100);

    // 24 key presses from 0 to 24
    for (let i = 0; i < 24; i++) {
      await sliderThumb.press("ArrowRight");
      await page.waitForTimeout(30);
    }

    // Wait for debounce and network to settle
    await page.waitForTimeout(800);

    // 4. Inspect the four values
    // (a) slider aria-valuenow
    const ariaValueNow = await sliderThumb.getAttribute("aria-valuenow");
    // (b) URL h param
    const currentUrl = new URL(page.url());
    const urlH = currentUrl.searchParams.get("h");
    // (c) latest request horizon_hours query param
    const lastRequestH = interceptedHorizonParams[interceptedHorizonParams.length - 1];
    // (d) Callout text
    const callout = page.locator("text=/Showing the latest forecast made/i");
    await expect(callout).toBeVisible();
    const calloutText = await callout.innerText();

    console.log("--------------------------------------------------");
    console.log(`(a) Slider aria-valuenow:            ${ariaValueNow}`);
    console.log(`(b) URL 'h' parameter:              ${urlH}`);
    console.log(`(c) Request 'horizon_hours' param:  ${lastRequestH}`);
    console.log(`(d) Callout text:                   "${calloutText}"`);
    console.log("--------------------------------------------------");

    // Assert that all four agree on H = 24
    expect(ariaValueNow).toBe("24");
    expect(urlH).toBe("24");
    expect(lastRequestH).toBe("24");
    expect(calloutText).toContain("≥ 24 h");

    // 5. Assert MAE text numerically differs between horizons
    const maeH24Text = await page.locator("text=/\\d[\\d,.]*\\s*MW/i").first().innerText();
    console.log(`[Journey 1] Lead time H=24 MAE text: "${maeH24Text}"`);

    const parseMw = (t: string) => parseFloat(t.replace(/[^\d.]/g, ""));
    const h12Num = parseMw(maeH12Text);
    const h24Num = parseMw(maeH24Text);

    console.log(`[Journey 1] Numerical comparison: H=12 (${h12Num} MW) vs H=24 (${h24Num} MW)`);
    expect(h12Num).not.toBeNaN();
    expect(h24Num).not.toBeNaN();
    expect(h24Num).not.toEqual(h12Num);

    // 6. Axe accessibility check on Overview
    await checkA11y(page, "Overview Page (Desktop)");
  });
});

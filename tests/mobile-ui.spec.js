import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(metrics.docWidth, `document width ${metrics.docWidth} should fit viewport ${metrics.innerWidth}`).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyWidth, `body width ${metrics.bodyWidth} should fit viewport ${metrics.innerWidth}`).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

test.describe("mobile ui", () => {
  test("bottom nav stays visible on demo pages", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "ルック生成" })).toBeVisible();

    await expect(page.getByTestId("mobile-nav-products")).toBeVisible();
    await expect(page.getByTestId("mobile-nav-upload")).toBeVisible();
    await expect(page.getByTestId("mobile-nav-history")).toBeVisible();
    await expect(page.getByTestId("mobile-nav-edit")).toBeVisible();
    await expect(page.getByTestId("mobile-nav-models")).toBeVisible();
    await expect(page.getByTestId("mobile-nav-more")).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("look generation settings open as a right sheet on mobile", async ({ page }) => {
    await page.goto("/demo");
    const sheet = page.getByTestId("upload-mobile-settings-sheet");
    await expect(sheet).toHaveAttribute("data-open", "false");
    await page.getByRole("button", { name: /‹\s*ルック生成/ }).click();

    await expect(sheet).toHaveAttribute("data-open", "true");
    await expect(sheet.getByText("スタイル", { exact: true })).toBeVisible();
    await expect(sheet.getByText("対象", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "×" }).first().click();
    await expect(sheet).toHaveAttribute("data-open", "false");
    await expectNoHorizontalOverflow(page);
  });

  test("models page uses the same mobile settings sheet", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("mobile-nav-models").click();

    await expect(page.getByRole("heading", { name: "モデル" })).toBeVisible();
    const sheet = page.getByTestId("models-mobile-settings-sheet");
    await expect(sheet).toHaveAttribute("data-open", "false");
    await page.getByRole("button", { name: /‹\s*モデル生成/ }).click();
    await expect(sheet).toHaveAttribute("data-open", "true");
    await expect(sheet.getByText("モデル生成", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "×" }).first().click();
    await expect(sheet).toHaveAttribute("data-open", "false");
    await expectNoHorizontalOverflow(page);
  });

  test("more sheet items follow the requested order", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("mobile-nav-more").click();

    const sheet = page.getByTestId("mobile-more-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("[data-testid='mobile-more-item-studio']")).toBeVisible();
    await expect(sheet.locator("[data-testid='mobile-more-item-pricing']")).toBeVisible();
    await expect(sheet.locator("[data-testid='mobile-more-item-credit-history']")).toBeVisible();
    await expect(sheet.locator("[data-testid='mobile-more-item-guide']")).toBeVisible();
    await expect(sheet.locator("[data-testid='mobile-more-item-settings']")).toBeVisible();

    const itemOrder = await sheet.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-testid")),
    );
    expect(itemOrder).toEqual([
      "mobile-more-item-studio",
      "mobile-more-item-pricing",
      "mobile-more-item-credit-history",
      "mobile-more-item-guide",
      "mobile-more-item-settings",
      "mobile-more-item-logout",
    ]);
  });

  test("opening more highlights only the more tab", async ({ page }) => {
    await page.goto("/demo");
    const editTab = page.getByTestId("mobile-nav-edit");
    const moreTab = page.getByTestId("mobile-nav-more");

    await editTab.click();
    const editBorderBefore = await editTab.evaluate((node) => getComputedStyle(node).borderTopColor);
    expect(editBorderBefore).not.toBe("rgba(0, 0, 0, 0)");

    await moreTab.click();
    const moreBorderAfter = await moreTab.evaluate((node) => getComputedStyle(node).borderTopColor);
    const editBorderAfter = await editTab.evaluate((node) => getComputedStyle(node).borderTopColor);
    expect(moreBorderAfter).not.toBe("rgba(0, 0, 0, 0)");
    expect(editBorderAfter).toBe("rgba(0, 0, 0, 0)");
  });
});

import { expect, test } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("dashboard loads with KPI data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("main-nav")).toBeVisible();
    await expect(page.getByTestId("dashboard")).toBeVisible();
    const kpi = page.getByTestId("kpi-total-certs");
    await expect(kpi).toBeVisible();
    // KPI should contain a number (at least one digit)
    await expect(kpi).toHaveText(/\d/);
  });

  test("certificates table loads", async ({ page }) => {
    await page.goto("/certificates");
    await expect(page.getByRole("heading", { name: /certificates/i })).toBeVisible();
    // Table should have at least one data row
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test("navigation between pages", async ({ page }) => {
    await page.goto("/");
    // Navigate to Certificates
    await page.getByTestId("main-nav").getByRole("link", { name: "Certificates" }).click();
    await expect(page).toHaveURL(/\/certificates/);
    await expect(page.getByRole("heading", { name: /certificates/i })).toBeVisible();

    // Navigate to Validate
    await page.getByTestId("main-nav").getByRole("link", { name: "Validate" }).click();
    await expect(page).toHaveURL(/\/validate/);
    await expect(page.getByRole("heading", { name: /validate/i })).toBeVisible();
  });

  test("validate form renders", async ({ page }) => {
    await page.goto("/validate");
    const input = page.getByPlaceholder(/domain/i);
    await expect(input).toBeVisible();
    const button = page.getByRole("button", { name: /validate/i });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });

  test("logo gallery loads", async ({ page }) => {
    await page.goto("/logos");
    await expect(page.getByRole("heading", { name: /logo/i })).toBeVisible();
    // At least one image should render
    const images = page.locator("img");
    await expect(images.first()).toBeVisible({ timeout: 10_000 });
  });
});

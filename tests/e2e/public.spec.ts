import { expect, test } from "@playwright/test";

test("home, catalog and property pages render in every language", async ({ page }) => {
  for (const [path, lang] of [
    ["/", "es-AR"],
    ["/en", "en-US"],
    ["/pt", "pt-BR"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  // The last language chosen is remembered, so this may open /pt/propiedades: match cards in any language.
  await page.goto("/propiedades");
  const cards = page.locator('main a[href*="/propiedades/"]');
  await expect(cards.first()).toBeVisible();
  await cards.first().click();
  await expect(page).toHaveURL(/\/propiedades\/[a-z0-9-]+/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("unknown pages answer 404 and the panel asks for a login", async ({ page }) => {
  const missing = await page.goto("/esta-pagina-no-existe");
  expect(missing?.status()).toBe(404);

  await page.goto("/admin/reservas");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("the SEO files are served", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  expect(await robots.text()).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).toContain("/propiedades/");
});

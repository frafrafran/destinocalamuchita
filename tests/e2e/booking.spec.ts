import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { removeTestBookings } from "./cleanup";

/**
 * The whole direct-booking loop, as a guest and as staff:
 * request dates -> upload the transfer receipt -> staff approves -> confirmed -> staff cancels (frees the dates).
 * Dates are picked far ahead so the demo calendar is never touched.
 */

const PROPERTY = "loft-belgrano-centro";

// Leftovers from an interrupted run would hold nights; remove them before and after.
test.beforeAll(async () => {
  await removeTestBookings();
});
test.afterAll(async () => {
  await removeTestBookings();
});

function isoInDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function receiptPng(): Promise<Buffer> {
  return sharp({ create: { width: 480, height: 320, channels: 3, background: { r: 236, g: 240, b: 238 } } }).png().toBuffer();
}

async function signIn(page: Page) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  test.skip(!email || !password, "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  // The first visit to the panel may compile it in development.
  await expect(page).toHaveURL(/\/admin/, { timeout: 60_000 });
}

test("a guest books, uploads the receipt and staff confirms", async ({ page, browser }) => {
  const offset = 420 + Math.floor(Math.random() * 90);
  const checkIn = isoInDays(offset);
  const checkOut = isoInDays(offset + 4);
  const email = `e2e+${Date.now()}@example.com`;

  // 1. Guest: dates are prefilled from the property page link.
  await page.goto(`/reservar/${PROPERTY}?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
  await page.getByRole("button", { name: "Continuar" }).click();

  // 2. Guest details and terms.
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Prueba");
  await page.getByRole("textbox", { name: "Apellido", exact: true }).fill("Automatizada");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Teléfono o WhatsApp", exact: true }).fill("+54 9 351 555 0101");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Solicitar reserva" }).click();

  // 3. The reservation page shows the code and asks for the receipt.
  await expect(page).toHaveURL(/\/reserva\/RMS-[A-Z0-9]+/);
  const code = page.url().match(/RMS-[A-Z0-9]+/)![0];
  await expect(page.getByRole("heading", { name: "Subí el comprobante" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "transferencia.png", mimeType: "image/png", buffer: await receiptPng() });
  await page.getByRole("button", { name: "Enviar comprobante" }).click();
  await expect(page.getByText("¡Comprobante recibido!").first()).toBeVisible();

  // 4. Staff, in a separate session: find the booking and approve the receipt.
  const staff = await browser.newPage();
  await signIn(staff);
  await staff.goto(`/admin/reservas?q=${code}`);
  await staff.getByRole("link", { name: new RegExp(code) }).first().click();
  await staff.getByRole("button", { name: "Aprobar y confirmar" }).click();
  await expect(staff.getByText("Pago aprobado y reserva confirmada")).toBeVisible();

  // 5. The guest sees the confirmation.
  await page.reload();
  await expect(page.getByText(/confirmada/i).first()).toBeVisible();

  // 6. Clean up: cancel without emailing, which releases the nights again.
  await staff.getByRole("button", { name: "Más acciones" }).click();
  await staff.getByRole("menuitem", { name: "Cancelar reserva" }).click();
  const dialog = staff.getByRole("dialog");
  await dialog.getByLabel("Motivo").fill("Prueba automática");
  await dialog.getByRole("switch").click();
  await dialog.getByRole("button", { name: "Cancelar reserva" }).click();
  await expect(staff.getByText("Cancelada").first()).toBeVisible();
});

test("two guests racing for the same nights: only one gets them", async ({ page, browser }) => {
  const offset = 520 + Math.floor(Math.random() * 15);
  const checkIn = isoInDays(offset);
  const checkOut = isoInDays(offset + 3);
  const url = `/reservar/${PROPERTY}?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`;

  // Both guests load the form while the nights are still free.
  const rival = await browser.newPage();
  for (const [tab, name] of [
    [page, "Primera"],
    [rival, "Segunda"],
  ] as const) {
    await tab.goto(url);
    await tab.getByRole("button", { name: "Continuar" }).click();
    await tab.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
    await tab.getByRole("textbox", { name: "Apellido", exact: true }).fill("Carrera");
    await tab.getByRole("textbox", { name: "Email", exact: true }).fill(`e2e+${name.toLowerCase()}${Date.now()}@example.com`);
    await tab.getByRole("textbox", { name: "Teléfono o WhatsApp", exact: true }).fill("+54 9 351 555 0102");
    await tab.getByRole("checkbox").check();
  }

  // The first one submits and gets the reservation...
  await page.getByRole("button", { name: "Solicitar reserva" }).click();
  await expect(page).toHaveURL(/\/reserva\/RMS-[A-Z0-9]+/);
  const code = page.url().match(/RMS-[A-Z0-9]+/)![0];

  // ...the second one, with a stale screen, is refused by the server.
  await rival.getByRole("button", { name: "Solicitar reserva" }).click();
  await expect(rival.getByText("Esas fechas acaban de ocuparse. Elegí otras.")).toBeVisible();
  await expect(rival).toHaveURL(/\/reservar\//);

  // Clean up: staff rejects the request, which releases the nights.
  const staff = await browser.newPage();
  await signIn(staff);
  await staff.goto(`/admin/reservas?q=${code}`);
  await staff.getByRole("link", { name: new RegExp(code) }).first().click();
  await staff.getByRole("button", { name: "Más acciones" }).click();
  await staff.getByRole("menuitem", { name: "Rechazar solicitud" }).click();
  const dialog = staff.getByRole("dialog");
  await dialog.getByLabel("Motivo").fill("Prueba automática");
  await dialog.getByRole("button", { name: "Rechazar solicitud" }).click();
  await expect(staff.getByText("Rechazada").first()).toBeVisible();
});

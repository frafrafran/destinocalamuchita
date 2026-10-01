# DestinoCalamuchita: alquileres temporarios con reserva directa

Sitio de reservas y panel de gestión para una administradora de alquileres temporarios del Valle de
Calamuchita (Córdoba). Los huéspedes eligen fechas, reservan online, pagan por transferencia al
propietario y suben el comprobante; el equipo lo verifica y confirma. Se sincroniza con Airbnb (y otros
canales) por iCal para que nunca haya reservas superpuestas. Español, inglés y portugués.

- **Cómo usarla y administrarla, paso a paso:** [docs/GUIA-DE-USO.md](docs/GUIA-DE-USO.md)
- **Arquitectura, modelo de datos y seguridad:** [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)

## Inicio rápido (desarrollo)

Requiere Node.js 22 o superior. La base PostgreSQL local viene incluida.

```bash
npm install
```

Copiá `.env.example` a `.env` y completá `APP_SECRET`, `CRON_SECRET` y `SEED_ADMIN_PASSWORD`. Luego, en
una terminal:

```bash
npm run db:local
```

Y en otra:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Sitio: <http://localhost:3000> · Panel: <http://localhost:3000/admin> (usuario `SEED_ADMIN_EMAIL`).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run db:local` | PostgreSQL local (puerto 5433, datos en `.data/`) |
| `npm run db:migrate` | Crear una migración tras cambiar `prisma/schema.prisma` |
| `npm run db:deploy` | Aplicar migraciones pendientes |
| `npm run db:seed` | Datos de demostración (o solo el administrador con `SEED_DEMO_DATA=false`) |
| `npm run db:studio` | Editor visual de la base |
| `npm run typecheck` / `npm run lint` | Tipos y estilo |
| `npm test` | Pruebas unitarias y de integración (incluye reservas simultáneas) |
| `npm run test:e2e` | Pruebas de punta a punta con Microsoft Edge (reserva, comprobante, aprobación) |
| `npm run check:messages` | Verifica que las traducciones tengan las mismas claves |
| `npm run cf:preview` | Arma el Worker de Cloudflare y lo corre localmente (Linux/WSL) |
| `npm run cf:deploy` | Arma y publica en Cloudflare (Linux/WSL o CI) |

## Tecnología

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 7 · next-intl ·
Radix UI · Motion · MapLibre · ical.js. Producción en **Cloudflare Workers** (OpenNext) con Hyperdrive + Neon
(PostgreSQL), R2, Images y Cron Triggers; emails con Resend. Ver la sección 3 de la guía.

Las superposiciones se impiden en la base de datos (restricción `EXCLUDE` sobre rangos de fechas y bloqueo
por propiedad), no solo en la interfaz.

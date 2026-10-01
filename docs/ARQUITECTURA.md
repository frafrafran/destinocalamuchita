# DestinoCalamuchita: arquitectura y decisiones

Plataforma de reservas directas para alquileres temporarios. Este documento resume el análisis previo
(fases 1 a 3 del brief) y las decisiones técnicas. La guía operativa paso a paso está en
[`GUIA-DE-USO.md`](./GUIA-DE-USO.md).

---

## 1. Product discovery

### Usuarios y roles

| Rol | Quién es | Acceso |
| --- | --- | --- |
| `ADMIN` | Dueño de la agencia | Todo, incluidos usuarios, configuración y auditoría |
| `MANAGER` | Operador de la agencia | Propiedades, reservas, calendario, pagos, huéspedes, canales iCal |
| `OWNER` | Propietario de una o más casas | Solo lectura de *sus* propiedades, reservas y calendario |
| `GUEST` | Huésped | No necesita cuenta: accede a su reserva con un enlace seguro enviado por email |

### Flujos principales

1. **Reserva directa**: fechas y huéspedes → verificación de disponibilidad → cotización → datos del huésped →
   se crea la reserva en `AWAITING_PAYMENT` con una retención de fechas (24 h configurable) → instrucciones de
   transferencia → subida de comprobante (`PROOF_RECEIVED`) → revisión (`UNDER_REVIEW`) → aprobación
   (`CONFIRMED`) o rechazo / pedido de nuevo comprobante (vuelve a `AWAITING_PAYMENT`).
2. **Operación diaria**: bloquear fechas, crear reservas manuales, revisar comprobantes, cancelar, modificar fechas.
3. **Sincronización de canales**: importación iCal (Airbnb, Booking, Vrbo, Google u otros) cada N minutos y
   exportación iCal propia para que Airbnb bloquee lo reservado en la web.
4. **Notificaciones**: outbox transaccional; los emails se generan en la misma transacción que el cambio de estado
   y se envían después del commit (con reintentos por cron).

### Estados de reserva

| Estado | Etiqueta | ¿Bloquea fechas? |
| --- | --- | --- |
| `PENDING` | Reserva pendiente (reservas manuales tentativas) | Sí |
| `AWAITING_PAYMENT` | Pago pendiente | Sí, hasta que vence la retención |
| `PROOF_RECEIVED` | Comprobante recibido | Sí (no vence) |
| `UNDER_REVIEW` | En revisión | Sí |
| `CONFIRMED` | Confirmada | Sí |
| `COMPLETED` | Finalizada | Sí (histórico) |
| `REJECTED` | Rechazada | No |
| `CANCELLED` | Cancelada | No |
| `EXPIRED` | Vencida (no llegó el comprobante a tiempo) | No |

"Disponible" es un estado del calendario, no de la reserva.

### Casos límite contemplados

| Caso | Tratamiento |
| --- | --- |
| Dos personas reservan a la vez | Bloqueo de fila `SELECT … FOR UPDATE` sobre la propiedad dentro de la transacción + restricción `EXCLUDE USING gist` en PostgreSQL. La segunda solicitud recibe "fechas no disponibles". |
| Cambio de precio durante la reserva | El cliente envía el total que vio; el servidor recalcula. Si difiere, devuelve la cotización nueva y pide confirmación. El precio queda congelado en la reserva (`priceBreakdown`). |
| Retención vencida | Barrido dentro de cada transacción de reserva (no depende del cron) + cron periódico. Pasa a `EXPIRED` y libera fechas. |
| Comprobante incorrecto, duplicado o por otro monto | Hash SHA-256 por archivo: el panel avisa si el mismo archivo ya se usó en otra reserva. El panel muestra diferencia entre monto declarado y monto a pagar. El admin puede aprobar, rechazar o pedir otro comprobante. |
| Archivo demasiado grande o malicioso | Límite de 10 MB, verificación por *magic bytes* (no por extensión), re-codificación de imágenes con `sharp` (elimina metadatos y payloads), rechazo de PDF con JavaScript/acciones embebidas, almacenamiento privado y descarga solo para staff. |
| Airbnb reserva mientras hay una reserva local pendiente | La sincronización marca el conflicto (`hasConflict`) en ambos lados, notifica al admin y el sistema **impide confirmar** la reserva local hasta resolverlo. |
| iCal de Airbnb caído o con error | Se conservan los últimos eventos conocidos, se registra el error y a los 3 fallos seguidos se avisa al admin. Nunca se borra disponibilidad por un fallo de red. |
| Propiedad despublicada con reservas | Las reservas existentes siguen vigentes. Una propiedad con reservas no se borra: se archiva. |
| Modificación de fechas | Acción de admin: vuelve a validar disponibilidad bajo el mismo bloqueo y permite recalcular o mantener el precio. |
| Fechas pasadas | Validación en cliente y servidor (zona horaria de la propiedad, `America/Argentina/Cordoba`). |

---

## 2. Arquitectura

```
Next.js 16 (App Router, Server Components, Server Actions, Route Handlers)
 ├─ src/app/[locale]/(site)     Web pública traducible (es, en, pt)
 ├─ src/app/[locale]/admin      Panel de administración (mismo idioma que el usuario)
 ├─ src/app/api                 Subidas, descargas protegidas, iCal export, cron
 ├─ src/server/*                Dominio (solo servidor): reservas, precios, disponibilidad, iCal, auth, storage, notificaciones
 ├─ src/lib/*                   Utilidades puras compartidas (fechas, dinero, estados)
 └─ prisma/                     Esquema, migraciones (incluye SQL de restricciones) y seed de demostración
PostgreSQL (Prisma 7 + driver adapter `pg`)
Almacenamiento: driver `local` (desarrollo), `r2` (Cloudflare R2 por bindings, producción) o `s3` (cualquier API S3)
Email: driver `console` (desarrollo), `resend` (producción en Cloudflare) o `smtp` (solo hosting Node.js)
Cron: Cron Trigger de Cloudflare cada 15 min (`cloudflare/worker.js` → `/api/cron` con `CRON_SECRET`)
```

### Por qué este stack

- **Next.js + React + TypeScript**: una sola base de código para web pública (SEO con render en servidor) y panel.
- **PostgreSQL**: es la única opción razonable que ofrece `EXCLUDE USING gist` con rangos de fechas; la
  prevención de doble reserva no depende de la aplicación sino de la base de datos.
- **Prisma 7**: tipado de punta a punta y migraciones versionadas; el SQL que Prisma no modela (restricciones de
  exclusión y `CHECK`) vive en la migración inicial.
- **Autenticación propia con sesiones en base de datos** (patrón Lucia): contraseñas con scrypt (parámetros OWASP), token aleatorio
  de 256 bits en cookie `httpOnly`, solo el hash SHA-256 se guarda. Permite revocar sesiones y no depende de un
  proveedor externo.
- **next-intl**: traducciones de interfaz y rutas con prefijo de idioma (`/`, `/en`, `/pt`). El contenido de cada
  propiedad se traduce desde el panel (`PropertyTranslation`).
- **Componentes propios sobre Radix** (accesibilidad resuelta) + Tailwind v4 + Motion para animaciones.
  El calendario de rango es propio porque la lógica de "día de salida disponible aunque esa noche esté ocupada"
  no la resuelve ninguna librería genérica.

### Extensibilidad prevista

| Futuro | Punto de extensión |
| --- | --- |
| Mercado Pago / Stripe | `PaymentMethod` y la entidad `Payment` (1:N con reserva) ya separan el cobro de la reserva |
| Booking, Vrbo, Google Calendar | `CalendarChannel` + adaptadores en `src/server/calendar/channels.ts` |
| WhatsApp / SMS | `NotificationChannel` + interfaz `ChannelSender` en `src/server/notifications` |
| Multi-moneda | `Currency` por propiedad y por reserva |
| Multi-idioma | `messages/*.json` + `PropertyTranslation` |
| Reviews | `ratingAverage` / `ratingCount` en propiedad |
| Multiagencia | Los datos de agencia están en `Setting`; se puede agregar `agencyId` sin romper relaciones |

---

## 3. Modelo de datos

Entidades principales (ver `prisma/schema.prisma`):

```
User ─┬─ Session
      └─ (opcional) Owner ── Property ─┬─ PropertyImage
                                       ├─ PropertyTranslation
                                       ├─ PropertyAmenity ── Amenity
                                       ├─ Season
                                       ├─ PriceRule
                                       ├─ Availability            (bloqueos manuales)
                                       ├─ CalendarIntegration ── CalendarEvent (eventos importados)
                                       └─ Reservation ─┬─ Guest
                                                       └─ Payment ── PaymentProof
Notification (outbox)   AuditLog   Setting   RateLimit
```

**Convención de fechas**: todas las fechas de estadía son `DATE` (sin hora) y los rangos son semiabiertos
`[inicio, fin)`. Una reserva del 10 al 13 ocupa las noches 10, 11 y 12; el 13 queda libre para otro ingreso.
Los bloqueos del panel se muestran como rango inclusivo ("del 15 al 20") y se guardan como `[15, 21)`.

**Integridad de disponibilidad**: la disponibilidad real es la unión de

1. `Reservation` en estados que bloquean (restricción de exclusión en PostgreSQL),
2. `Availability` (bloqueos manuales),
3. `CalendarEvent` activos (Airbnb y otros canales).

Toda escritura que afecte disponibilidad (crear reserva, confirmar, modificar fechas, bloquear, sincronizar iCal)
toma primero el bloqueo de fila de la propiedad, así que las verificaciones entre tablas son consistentes.

---

## 4. Seguridad

- Contraseñas con scrypt (N=2^14, r=8, p=5); sesiones con token aleatorio, cookie `httpOnly`, `SameSite=Lax`, `Secure` en producción.
- Autorización por permisos (`src/server/auth/permissions.ts`) verificada en cada Server Action y Route Handler,
  no solo en la navegación. Los propietarios (`OWNER`) solo ven datos filtrados por su `ownerId`.
- Validación con Zod en el servidor para toda entrada. Las Server Actions tienen verificación de origen de Next.js;
  las rutas de subida verifican el encabezado `Origin`.
- Rate limiting persistente en base de datos (funciona en Workers, sin memoria compartida): login, reservas, subidas, consultas.
- Protección SSRF al descargar iCal: solo `https`, se resuelven los DNS y se rechazan IPs privadas, límite de
  tamaño y tiempo.
- Enlaces de huésped firmados con HMAC-SHA256 (`APP_SECRET` + id de la reserva + versión de acceso). No se guarda
  ningún token: el panel puede reenviar el enlace cuando quiera y "revocar" sube la versión, lo que invalida todos
  los enlaces anteriores. El token se intercambia por una cookie `httpOnly` y la URL queda limpia.
- Registro de auditoría de cada acción administrativa y de cada cambio de estado.
- Encabezados de seguridad (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  HSTS en producción).
- Ningún secreto en el código: todo se lee de variables de entorno validadas al iniciar (`src/server/env.ts`).

---

## 5. Sistema de diseño

- **Lectura del brief**: plataforma de hospitality premium para viajeros, con lenguaje sereno y de confianza.
  Web pública espaciosa (variación 6, movimiento 5, densidad 3); panel sobrio y denso (3 / 3 / 6).
- **Paleta**: base neutra fría con un verde pino como único acento (sierras y lagos de Calamuchita). Los colores de
  estado (ámbar, azul, verde, rojo) solo se usan en badges y siempre acompañados de texto.
- **Tipografía**: Geist (interfaz y titulares con tracking cerrado) + Geist Mono con cifras tabulares para montos.
- **Formas**: botones tipo píldora, campos de 12 px, tarjetas e imágenes de 16 px.
- **Movimiento**: entradas suaves con resortes, revelado de imágenes, microinteracciones en tarjetas y botones.
  Todo respeta `prefers-reduced-motion`.
- **Modo oscuro**: tokens semánticos en CSS con variante clara y oscura (sigue al sistema, con selector manual).

## Despliegue en Cloudflare Workers

- **Adaptador:** `@opennextjs/cloudflare` (soporta Next.js 16). `proxy.ts` corre con el soporte de
  middleware Node.js de OpenNext (marcado experimental por OpenNext; verificado con las pruebas de punta a
  punta en workerd).
- **Base de datos:** Prisma 7 genera dos clientes del mismo esquema: `src/generated/prisma` (Node.js:
  desarrollo, pruebas, seed) y `src/generated/prisma-cf` (`runtime = "cloudflare"`, compilador de consultas
  como módulo WASM). `npm run cf:build` usa el segundo mediante un alias. En el Worker se crea **un cliente
  por pedido** (Workers no permite compartir sockets entre pedidos) sobre Hyperdrive, que mantiene el pool
  de conexiones cerca de la base.
- **Módulos nativos:** `sharp` se reemplaza por el binding de Cloudflare Images (`src/server/images.ts`) y
  Argon2 por `scrypt` (`src/lib/password.ts`, parámetros OWASP N=2^14, r=8, p=5), disponible de forma nativa
  en ambos entornos. SMTP y el SDK de AWS no se incluyen en el Worker.
- **DNS:** la protección SSRF del iCal usa `resolve4`/`resolve6` (DNS sobre HTTPS en Workers; `lookup` no
  existe ahí).
- **Variables:** `env.ts` valida en el primer uso (en Cloudflare las variables existen recién al atender un
  pedido). OpenNext copia el contenido de los archivos `.env` al Worker, por eso `scripts/cf-build.mjs` los
  aparta durante el armado; los valores de producción son `vars` y secretos de Cloudflare.
- **Windows:** OpenNext necesita Linux para armar (crea enlaces simbólicos). Se arma en WSL o en CI.


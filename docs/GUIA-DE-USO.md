# Guía de uso: cómo poner en marcha y controlar la web

Esta guía explica, paso a paso, cómo usar y administrar la plataforma de alquileres temporarios.
Está pensada para quien la maneja día a día, sin necesidad de saber programar. Las partes técnicas
(instalar, publicar en internet) están marcadas y se hacen una sola vez.

**Índice**

1. [Qué hay en la plataforma](#1-qué-hay-en-la-plataforma)
2. [Ponerla en marcha en tu computadora](#2-ponerla-en-marcha-en-tu-computadora-técnico-una-vez)
3. [Publicarla en internet](#3-publicarla-en-internet-técnico-una-vez)
4. [Primer ingreso al panel](#4-primer-ingreso-al-panel)
5. [Agregar una propiedad](#5-agregar-una-propiedad)
6. [Conectar con Airbnb](#6-conectar-con-airbnb-y-otros-canales)
7. [Administrar las transferencias](#7-administrar-las-transferencias)
8. [Reservas manuales, bloqueos y cambios](#8-reservas-manuales-bloqueos-y-cambios)
9. [Propietarios y cuentas bancarias](#9-propietarios-y-cuentas-bancarias)
10. [Configuración, usuarios y permisos](#10-configuración-usuarios-y-permisos)
11. [Cambiar datos de la base de datos](#11-cambiar-datos-de-la-base-de-datos)
12. [Traducciones](#12-traducciones)
13. [Antes de lanzar: lista de control](#13-antes-de-lanzar-lista-de-control)
14. [Problemas frecuentes](#14-problemas-frecuentes)

---

## 1. Qué hay en la plataforma

**Sitio público** (en español, inglés y portugués):

- Portada con buscador por fechas y huéspedes, destacados, destinos, cómo reservar y testimonios.
- Catálogo con filtros (lugar, fechas, huéspedes, tipo, precio, servicios) y orden.
- Página de cada propiedad: galería a pantalla completa, video, servicios, reglas, mapa, calendario de
  disponibilidad y calculadora de precio en vivo.
- Reserva en 5 pasos: fechas → datos → pago → comprobante → confirmación.
- Área del huésped (`/reserva`): con el código y su email ve el estado, los datos bancarios y sube el comprobante.

**Panel de administración** (`/admin`): Inicio (métricas y gráficos), Reservas, Calendario, Propiedades,
Pagos, Huéspedes, Propietarios, Canales y bloqueos, Configuración y Mi cuenta.

**Cómo funciona una reserva directa**

```
Huésped elige fechas ─► Pago pendiente (fechas retenidas 24 h)
                           │ sube comprobante
                           ▼
                     Comprobante recibido (fechas retenidas hasta que decidas)
                           │ vos revisás
          ┌────────────────┼──────────────────────┐
          ▼                ▼                      ▼
     Confirmada     Pedís otro comprobante   Rechazás la solicitud
          │         (vuelve a Pago pendiente)  (fechas liberadas)
          ▼
     Finalizada (automático, después de la salida)
```

Si el huésped no sube el comprobante a tiempo, la reserva **vence sola** y las fechas se liberan.

**Nunca hay dos reservas en las mismas noches.** Lo garantiza la base de datos (no solo la pantalla):
aunque dos personas aprieten "Solicitar reserva" en el mismo segundo, solo una obtiene las fechas y la otra
ve "Esas fechas acaban de ocuparse". Las fechas ocupadas en Airbnb (u otro canal conectado) también bloquean.

---

## 2. Ponerla en marcha en tu computadora (técnico, una vez)

Necesitás [Node.js 22 o superior](https://nodejs.org). No hace falta instalar PostgreSQL: el proyecto trae uno.

1. Abrí una terminal en la carpeta del proyecto e instalá las dependencias:

   ```bash
   npm install
   ```

2. Copiá `.env.example` como `.env` y completá `APP_SECRET` y `CRON_SECRET` con valores aleatorios.
   Para generarlos:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   En `SEED_ADMIN_PASSWORD` poné la contraseña que quieras para el administrador (mínimo 10 caracteres).
   Si la dejás vacía, se genera una y se muestra **una sola vez** al cargar los datos.

3. En una terminal, iniciá la base de datos local y dejala abierta:

   ```bash
   npm run db:local
   ```

4. En otra terminal, creá las tablas y cargá los datos de demostración (6 propiedades, reservas en todos
   los estados, huéspedes y propietarios ficticios):

   ```bash
   npx prisma migrate deploy
   ```

   ```bash
   npm run db:seed
   ```

5. Iniciá la web:

   ```bash
   npm run dev
   ```

   Abrí <http://localhost:3000>. El panel está en <http://localhost:3000/admin>.

Los emails, en esta etapa, no se envían: se muestran en la terminal (`EMAIL_DRIVER="console"`).

**Verificaciones automáticas** (opcionales):

```bash
npm test
```

```bash
npm run test:e2e
```

`npm test` corre las pruebas de precios, fechas, calendarios iCal y reservas simultáneas.
`npm run test:e2e` usa Microsoft Edge para reservar como huésped, subir un comprobante y aprobarlo como
administrador (necesita la web corriendo y la contraseña del administrador en `.env`; borra sus reservas de prueba al terminar).

**Probar como en Cloudflare** (opcional, en Linux o WSL): con la base local corriendo, creá un archivo
`.dev.vars` con `APP_SECRET`, `CRON_SECRET`, `APP_URL="http://localhost:8787"` y `EMAIL_DRIVER="console"`,
y ejecutá `npm run cf:preview`. Levanta el sitio en el mismo motor que usa Cloudflare (workerd), con R2 e
imágenes simuladas. Las pruebas de punta a punta corren contra esa copia con
`E2E_BASE_URL=http://localhost:8787 npm run test:e2e`.

---

## 3. Publicarla en internet (técnico, una vez)

La web se publica en **Cloudflare Workers** (con el adaptador OpenNext para Next.js):

| Qué | Servicio | Para qué | Costo |
| --- | --- | --- | --- |
| Web y panel | Cloudflare Workers | Ejecuta el sitio | **Plan Workers Paid: USD 5/mes** (ver nota) |
| Base de datos | [Neon](https://neon.tech) (PostgreSQL) + Cloudflare Hyperdrive | Datos y reservas | Neon tiene plan gratuito; Hyperdrive incluido |
| Archivos | Cloudflare R2 | Fotos y comprobantes | 10 GB gratis por mes |
| Imágenes | Cloudflare Images (binding) | Achica y optimiza fotos | Incluye transformaciones gratis por mes |
| Emails | [Resend](https://resend.com) | Avisos a huéspedes y al equipo | Plan gratuito: 3.000 emails/mes |
| Tarea periódica | Cron de Cloudflare | Vencimientos, recordatorios, Airbnb cada 15 min | Incluido |

**Nota sobre el plan:** el plan gratuito de Workers documenta un límite de 10 ms de procesador por pedido.
Medido en producción, la mayoría de las páginas usan entre 7 y 50 ms, la primera carga del login unos
500 ms y el inicio de sesión unos 200 ms (cifra la contraseña con scrypt, como recomienda OWASP). Hoy
Cloudflare los deja pasar, pero en el plan gratuito puede cortarlos. Para que funcione siempre, activá
**Workers Paid (USD 5/mes)**, que permite hasta 30 segundos por pedido e incluye 10 millones de visitas.

**En Windows:** el armado para Cloudflare tiene que hacerse en Linux. Usá **WSL (Ubuntu)** o los deploys
automáticos desde GitHub (sección 3.6). Los comandos de abajo se ejecutan en una terminal de Ubuntu, dentro
de una copia del proyecto (`git clone https://github.com/frafrafran/destinocalamuchita.git`), con
[Node.js 22 o superior](https://nodejs.org) instalado.

### 3.1 Base de datos (Neon)

1. Creá un proyecto en Neon, región **AWS São Paulo** (la más cercana a Córdoba).
2. Copiá la cadena de conexión **directa** (la que *no* dice `-pooler`).
3. Creá las tablas y el usuario administrador **sin datos de ejemplo** (reemplazá los valores):

   ```bash
   export DATABASE_URL="postgresql://usuario:clave@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require"
   ```

   ```bash
   npx prisma migrate deploy
   ```

   ```bash
   SEED_DEMO_DATA=false SEED_ADMIN_EMAIL="tu@email.com" SEED_ADMIN_PASSWORD="una-clave-larga" npm run db:seed
   ```

### 3.2 Conectar la cuenta de Cloudflare

```bash
npx wrangler login
```

Se abre el navegador para autorizar. El ID de cuenta ya está en `wrangler.jsonc`.

### 3.3 Crear los recursos (una sola vez)

```bash
npx wrangler r2 bucket create destinocalamuchita-media
```

```bash
npx wrangler r2 bucket create destinocalamuchita-receipts
```

```bash
npx wrangler hyperdrive create destinocalamuchita-db --connection-string="$DATABASE_URL"
```

El último comando muestra un `id`: copialo en `wrangler.jsonc`, en `hyperdrive` → `id`.
El bucket de comprobantes es privado: nadie puede verlo desde internet, solo el panel.

### 3.4 Claves secretas y configuración

Las claves se guardan cifradas en Cloudflare (nunca en el código ni en archivos):

```bash
npx wrangler secret put APP_SECRET
```

```bash
npx wrangler secret put CRON_SECRET
```

```bash
npx wrangler secret put RESEND_API_KEY
```

Cada comando pide el valor. Para `APP_SECRET` y `CRON_SECRET` generá valores aleatorios con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

En `wrangler.jsonc` → `vars` completá `APP_URL` (la dirección final, por ejemplo
`https://destinocalamuchita.com.ar`) y `EMAIL_FROM` (por ejemplo `DestinoCalamuchita <reservas@tudominio.com>`,
con el dominio verificado en Resend: agregá los registros DNS que te indica, sin eso los emails van a spam).

### 3.5 Publicar

```bash
npm run cf:deploy
```

Arma el sitio y lo sube. La primera vez queda en `https://destinocalamuchita.<tu-subdominio>.workers.dev`.
Para usar tu dominio: en el panel de Cloudflare, **Workers & Pages → destinocalamuchita → Settings →
Domains & Routes → Add → Custom domain** (el dominio tiene que estar administrado por Cloudflare). Después
actualizá `APP_URL` y volvé a publicar.

El armado deja afuera los archivos `.env` de tu computadora (scripts/cf-build.mjs), así ninguna clave local
termina dentro del sitio publicado.

### 3.6 Deploys automáticos desde GitHub (opcional, recomendado)

En Cloudflare: **Workers & Pages → destinocalamuchita → Settings → Builds → Connect** y elegí el repositorio.
Configurá:

- Comando de build: `npm run cf:build` (también funciona el que propone Cloudflare, `npx opennextjs-cloudflare build`)
- Comando de deploy: `npx opennextjs-cloudflare deploy`

Desde ahí, cada cambio que se sube a la rama `main` se publica solo.

### 3.7 Tarea periódica

No hay que configurar nada: Cloudflare ejecuta la tarea cada 15 minutos (`triggers` en `wrangler.jsonc`).
Vence reservas sin pago, marca estadías finalizadas, envía recordatorios, reintenta emails y trae los
calendarios de Airbnb. Los registros se ven en **Workers & Pages → destinocalamuchita → Logs**.

---

## 4. Primer ingreso al panel

1. Entrá a `https://tudominio.com/login` con el email y la contraseña del administrador.
2. Andá a **Mi cuenta** (menú de tu avatar, arriba a la derecha) y cambiá la contraseña.
3. Completá **Configuración** (ver [sección 10](#10-configuración-usuarios-y-permisos)): datos de la
   agencia, cuenta bancaria general, emails de aviso y políticas.

---

## 5. Agregar una propiedad

**Propiedades → Nueva propiedad.** El asistente tiene 7 pasos; cada uno se guarda por separado y podés
volver cuando quieras. La propiedad no se ve en el sitio hasta que la publiques.

1. **Información**: nombre, tipo (casa, departamento, cabaña, villa, loft), descripción, localidad,
   dirección (no se muestra completa al público), coordenadas para el mapa, capacidad, dormitorios, camas,
   baños, video (YouTube o Vimeo), propietario, si es destacada y, opcionalmente, la calificación y
   cantidad de opiniones que tiene en Airbnb (si la dejás vacía, no se muestra ninguna). Abajo, las traducciones al inglés y
   portugués (si no las cargás, se muestra el texto en español).
2. **Fotografías**: arrastrá varias a la vez (JPG, PNG, WebP o AVIF, hasta 15 MB; las fotos HEIC del iPhone exportalas antes como JPG). Se optimizan solas.
   Ordenalas, elegí la portada y escribí un texto alternativo (ayuda a buscadores y a personas ciegas).
   Se necesitan al menos 3.
3. **Servicios**: marcá wifi, pileta, parrilla, estacionamiento, mascotas, etc. Si falta alguno, creálo ahí.
4. **Precios**:
   - Precio por noche (domingo a jueves) y de fin de semana (viernes y sábado), moneda (pesos o dólares),
     limpieza (una vez por estadía) y noches mínimas / máximas.
   - **Temporadas**: rango de fechas con precio propio y mínimo de noches (verano, vacaciones de invierno).
   - **Fechas especiales**: feriados o eventos (por ejemplo, la Fiesta de la Cerveza). Tienen prioridad
     sobre las temporadas.
   - **Descuentos por estadía larga**: porcentaje desde X noches (por ejemplo, 10 % desde 7 noches).
   - **Cargos**: por estadía, por noche, por huésped o por huésped y noche (tasa turística, ropa blanca).

   Orden de prioridad: fecha especial › temporada › fin de semana › precio base. El huésped ve el detalle
   noche por noche antes de reservar.
5. **Reglas y llegada**: horario de ingreso y salida, reglas de la casa, instrucciones de llegada (solo las
   recibe el huésped confirmado) y política de cancelación propia si difiere de la general.
6. **Airbnb e iCal**: ver [sección 6](#6-conectar-con-airbnb-y-otros-canales).
7. **Publicar**: una lista te muestra qué falta (fotos, precio, descripción…). Cuando está todo en verde,
   tocá **Publicar**. Podés **Pausar** (deja de verse y de recibir reservas, conserva todo) o **Archivar**.

---

## 6. Conectar con Airbnb (y otros canales)

La conexión funciona en los dos sentidos con calendarios iCal, el método que Airbnb, Booking, Vrbo y
Google Calendar usan para compartir disponibilidad.

### 6.1 Traer las reservas de Airbnb a la web (importar)

1. En Airbnb: **Calendario** → elegí el anuncio → **Disponibilidad** → **Conectar calendarios** →
   **Exportar calendario**. Copiá el enlace (termina en `.ics`).
2. En el panel: **Propiedades** → la propiedad → paso **Airbnb e iCal** → en *Calendarios de otros
   canales* elegí **Airbnb**, pegá el enlace y tocá **Conectar**.
3. Se sincroniza en el momento y te dice cuántos eventos importó. Después se actualiza cada 30 minutos
   (con la tarea periódica) y **siempre justo antes de cada reserva web**.

Esas fechas aparecen en el calendario del panel en color "Otro canal" y el sitio no las ofrece.

### 6.2 Llevar las reservas de la web a Airbnb (exportar)

1. En el mismo paso, copiá el enlace de *Tu calendario para otros canales*.
2. En Airbnb: **Disponibilidad** → **Conectar calendarios** → **Importar calendario**. Pegá el enlace y
   poné un nombre, por ejemplo "Web directa".

Airbnb lo lee cada pocas horas (no lo controlamos nosotros). Por eso, además, las reservas web quedan
retenidas mientras se revisa el pago. El enlace no muestra nombres de huéspedes: solo "Reservado".
Si alguna vez se filtra, tocá **Generar un enlace nuevo** y reemplazalo en cada canal.

### 6.3 Si aparece un conflicto

Si Airbnb trae una reserva sobre fechas que ya tenía una solicitud web pendiente, la reserva web se marca
con **Conflicto con otro canal** y el sistema **no deja confirmarla**. Te llega un aviso. Resolvelo
moviendo la reserva web de fechas o cancelándola.

**Canales y bloqueos** muestra el estado de todos los calendarios conectados (al día, con errores,
pausado) y permite sincronizar todo de una vez. Si un calendario falla varias veces seguidas, te avisa por email.

Booking, Vrbo y otros se conectan igual: cada uno tiene su opción de "exportar/importar calendario".

---

## 7. Administrar las transferencias

### 7.1 Qué ve el huésped

Al reservar recibe un email y ve en su página: el total, **los datos bancarios** (los del propietario
de esa casa, o los de la agencia si no tiene), el plazo para transferir y un botón para subir el
comprobante (foto o PDF). Puede volver cuando quiera desde **Mi reserva** con su código y email.

### 7.2 Qué hacés vos

1. Cuando llega un comprobante recibís un email y aparece la campana del panel con un número.
2. Entrá a **Pagos** (o a la reserva). La lista muestra primero los más antiguos.
3. Abrí el comprobante (vista previa o **Descargar**). El panel te avisa si:
   - el monto declarado **no coincide** con el total, o
   - el **mismo archivo** ya se usó en otra reserva (posible reutilización).
4. **Verificá en tu banco** que el dinero esté acreditado. La web no puede comprobarlo por vos.
5. Elegí:
   - **Aprobar y confirmar**: escribí el monto recibido. La reserva queda Confirmada y el huésped recibe
     el email de confirmación con las instrucciones de llegada.
   - **Pedir otro comprobante**: si la imagen no se ve o falta parte del pago. Escribí el motivo (lo lee el
     huésped). Vuelve a *Pago pendiente* con un plazo nuevo.
   - **Rechazar comprobante**: si no corresponde. También requiere motivo.
6. Opcional: **Marcar en revisión** para que el huésped sepa que lo estás mirando.

Si el pago viene en partes, el huésped puede subir hasta 5 comprobantes.

**Cancelaciones y devoluciones**: *Más acciones → Cancelar reserva* libera las fechas y avisa al
huésped (podés desactivar el aviso). La devolución de dinero la hacés vos por transferencia, según la política.

---

## 8. Reservas manuales, bloqueos y cambios

- **Reserva por teléfono o WhatsApp**: **Reservas → Nueva reserva**. Elegí propiedad, fechas y cargá los
  datos del huésped (si su email ya existe, se usa su ficha). El precio se calcula solo y podés escribir
  otro total. Elegís si queda confirmada, esperando pago o pendiente.
- **Bloquear fechas** (uso del propietario, mantenimiento): **Calendario** → tocá un día libre o
  **Bloquear fechas**. Indicá desde, hasta (inclusive) y motivo. No se pueden bloquear noches con reservas.
  Para liberar: tocá el bloqueo → **Desbloquear**.
- **Cambiar fechas**: en la reserva → *Más acciones → Cambiar fechas*. Se verifica que estén libres;
  elegís mantener el precio o recalcularlo, y si avisar al huésped.
- **Reenviar el enlace al huésped** si perdió el email; **Invalidar enlaces** si sospechás que alguien más
  lo tiene (el anterior deja de funcionar).
- **Notas internas** en cada reserva y en la ficha de cada huésped (solo las ve el equipo).

El **Calendario** tiene vista mes, semana y lista, y filtro por propiedad. Las reservas se ven en verde
(confirmada), amarillo (pendiente), rojo claro (otro canal) y gris (bloqueo).

---

## 9. Propietarios y cuentas bancarias

**Propietarios → Nuevo propietario**: nombre, contacto, CUIT, comisión de la agencia (para tus
liquidaciones; no cambia el precio al huésped) y **cuenta para transferencias** (banco, titular,
CBU/CVU de 22 números, alias, CUIT del titular).

Después asigná el propietario a sus casas en el paso *Información* de cada propiedad. Los huéspedes de
esas casas verán **esa** cuenta. Si una casa no tiene propietario (o este no cargó cuenta), se muestra la
**cuenta general** de *Configuración → Cuenta general*.

Revisá bien el CBU: es lo que el huésped copia para pagar. Cada cambio queda registrado en la auditoría.

Si querés que un propietario vea sus reservas, creale un usuario con rol **Propietario** (sección 10):
solo ve sus propiedades, en modo lectura.

---

## 10. Configuración, usuarios y permisos

**Configuración** tiene estas pestañas:

| Pestaña | Qué se define |
| --- | --- |
| Agencia | Nombre comercial (aparece en todo el sitio y los emails), razón social, CUIT, email, teléfono, WhatsApp, dirección, Instagram |
| Reservas | Horas para transferir (1 a 168, por defecto 24) y días de anticipación del recordatorio |
| Cuenta general | Datos bancarios de la agencia |
| Notificaciones | Emails que reciben los avisos del equipo |
| Políticas | Cancelación y términos, en los 3 idiomas (un punto por línea) |
| Portada | Imagen principal, imagen del cierre, fotos de destinos y **testimonios** |

**Sobre la portada animada:** al bajar, la página "entra al valle": las siluetas de los cerros se abren, la
foto principal se acerca y aparece una frase; al final una loma del color de la página da paso al resto.
La **imagen principal** es el fondo de esa escena: usá una foto horizontal de sierras con cielo arriba
(mínimo 2000 px de ancho); la parte de abajo queda tapada por las siluetas. Las siluetas se dibujan solas y
se adaptan al modo claro u oscuro. Quien tenga activado "reducir movimiento" en su dispositivo ve una
portada fija, sin animaciones.
| Usuarios | Alta, rol, activación y cambio de contraseña del equipo |
| Auditoría | Quién hizo qué y cuándo |

**Roles:**

- **Administrador**: todo, incluida la configuración y los usuarios.
- **Gestión**: reservas, calendario, pagos, propiedades, huéspedes y propietarios. No toca configuración ni usuarios.
- **Propietario**: solo lectura de sus propias propiedades y reservas.

Para dar de baja a alguien, desactivalo (se cierran sus sesiones al instante). Nadie puede quitarse a sí
mismo el rol de administrador, para no quedar sin acceso.

---

## 11. Cambiar datos de la base de datos

**Primero, siempre desde el panel.** Todo lo cotidiano (propiedades, precios, reservas, huéspedes,
propietarios, textos, usuarios) se edita ahí, con validaciones y registro de auditoría.

**Para casos excepcionales**, existe Prisma Studio, un editor visual de la base:

```bash
npm run db:studio
```

Se abre en el navegador (<http://localhost:5555>) y permite ver y editar cada tabla. Para usarlo con la base
de producción, poné en `DATABASE_URL` la cadena de producción antes de ejecutarlo. Precauciones:

- **Hacé una copia antes.** Neon y Supabase tienen copias automáticas y "restaurar a un momento"; también
  podés crear una rama (*branch*) de prueba.
- No cambies a mano el estado de una reserva ni sus fechas: usá el panel, que revisa superposiciones y
  envía los emails. La base igualmente rechaza cualquier superposición.
- Los importes están en pesos con 2 decimales (por ejemplo `120000.00`).
- No borres propiedades con reservas: pausalas o archivalas.

**Cambios de estructura** (agregar un campo nuevo) son tarea de programación: se modifica
`prisma/schema.prisma`, se crea una migración con `npm run db:migrate` y se aplica a la base con `npx prisma migrate deploy` (sección 3.1) antes de publicar.

**Empezar de cero en tu computadora** (borra todo lo local y vuelve a cargar la demo):

```bash
npx prisma migrate reset
```

Nunca lo ejecutes con la base de producción configurada.

---

## 12. Traducciones

- **Textos de la interfaz** (botones, títulos, emails): archivos `messages/es.json`, `messages/en.json` y
  `messages/pt.json`. Cada texto tiene la misma clave en los tres. Después de editarlos, verificá que no
  falte ninguno:

  ```bash
  npm run check:messages
  ```

- **Contenido de cada propiedad** (título, descripción, reglas): en el panel, paso *Información*,
  sección de traducciones. Lo que quede vacío se muestra en español.
- **Políticas y testimonios**: en *Configuración*, con un campo por idioma.
- **Emails**: se envían en el idioma en que el huésped reservó.

El visitante elige el idioma arriba a la derecha y el sitio lo recuerda. Para sumar otro idioma hace
falta programación: agregarlo en `src/i18n/config.ts` y crear su archivo en `messages/`.

---

## 13. Antes de lanzar: lista de control

- [ ] En producción usaste `SEED_DEMO_DATA="false"` (sin propiedades, huéspedes ni reservas ficticias).
- [ ] Datos reales en *Configuración → Agencia* (nombre, CUIT, WhatsApp, email).
- [ ] Cuenta general y cuentas de cada propietario revisadas (CBU y alias).
- [ ] **Testimonios reales** en *Configuración → Portada*. Si no hay, dejá la lista vacía: la sección se oculta sola.
- [ ] Fotos propias en la portada y los destinos (las de muestra son de Unsplash).
- [ ] Calificaciones solo si son reales (paso *Información* de cada propiedad).
- [ ] Políticas de cancelación y términos revisados por quien corresponda, en los 3 idiomas.
- [ ] Emails de aviso configurados y probados (hacé una reserva de prueba y cancelala).
- [ ] Tarea periódica funcionando: en los Logs del Worker aparece "Scheduled run" cada 15 minutos (sección 3.7).
- [ ] Airbnb conectado en ambos sentidos para cada propiedad que esté publicada allí.
- [ ] Contraseña del administrador cambiada y usuarios del equipo creados con el rol justo.
- [ ] Dominio propio conectado al Worker (sección 3.5) y `APP_URL` con esa dirección.

---

## 14. Problemas frecuentes

| Qué pasa | Qué hacer |
| --- | --- |
| No llegan los emails | Revisá *Notificaciones*, que el dominio esté verificado en Resend y la carpeta de spam. En cada reserva, *Emails enviados* muestra si falló. Los fallidos se reintentan en la tarea periódica. |
| Airbnb no se sincroniza | *Canales y bloqueos* muestra el error. Verificá que el enlace sea el de **exportar** y que empiece con `https://`. Probá **Sincronizar**. |
| Una fecha libre en Airbnb figura ocupada | Mirá en el calendario si es un bloqueo manual o un evento de otro canal (tocándolo ves el origen). |
| El huésped perdió su enlace | En la reserva, *Más acciones → Reenviar enlace al huésped*. También puede entrar desde **Mi reserva** con código y email. |
| La reserva venció pero el huésped dice que pagó | Creá una reserva manual con esas fechas (si siguen libres) y confirmala. |
| "No se puede confirmar: conflicto con otro canal" | Airbnb ocupó esas fechas. Cambiá la reserva de fechas o cancelala. |
| Olvidé la contraseña del administrador | Otro administrador puede cambiarla en *Configuración → Usuarios*. Si no hay otro, desde tu computadora con la base de producción configurada, en Prisma Studio desactivá el usuario y creá uno nuevo con `npm run db:seed` usando otro `SEED_ADMIN_EMAIL`. |

Más detalles técnicos (modelo de datos, seguridad, decisiones de diseño) en [ARQUITECTURA.md](ARQUITECTURA.md).

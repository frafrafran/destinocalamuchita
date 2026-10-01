/**
 * Demo data: fictional properties, owners, guests and reservations in every status so the whole
 * platform (site, booking flow, dashboard, calendar) can be explored right away.
 *
 *   npm run db:seed
 *
 * Staff accounts use SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (and SEED_DEMO_PASSWORD for the
 * manager and owner demo users) from .env. If a password is missing a random one is generated and
 * printed once. The demo data is only inserted into an empty database.
 */
import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { type Prisma, PrismaClient } from "../src/generated/prisma/client";
import { addDays, todayISO, toDbDate } from "../src/lib/dates";
import { centsToDecimalString } from "../src/lib/money";
import { hashPassword } from "../src/lib/password";
import { calculateQuote, type PricingConfig } from "../src/lib/pricing";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=2000&h=1334&q=80`;
const img = (id: string, alt: string) => ({ url: photo(id), alt, width: 2000, height: 1334 });

async function staffPassword(envKey: string): Promise<{ value: string; generated: boolean }> {
  const fromEnv = process.env[envKey];
  if (fromEnv && fromEnv.length >= 10) return { value: fromEnv, generated: false };
  return { value: randomBytes(12).toString("base64url"), generated: true };
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const AMENITIES: [key: string, label: string, icon: string, category: string][] = [
  ["wifi", "Wifi", "WifiHigh", "essentials"],
  ["linens", "Ropa de cama y toallas", "TShirt", "essentials"],
  ["heating", "Calefacción", "Thermometer", "essentials"],
  ["air_conditioning", "Aire acondicionado", "Snowflake", "essentials"],
  ["kitchen", "Cocina equipada", "CookingPot", "kitchen"],
  ["oven", "Horno", "Oven", "kitchen"],
  ["coffee_maker", "Cafetera", "Coffee", "kitchen"],
  ["dishwasher", "Lavavajillas", "Drop", "kitchen"],
  ["fireplace", "Hogar a leña", "Fire", "comfort"],
  ["tv", "Smart TV", "Television", "comfort"],
  ["workspace", "Espacio de trabajo", "Desktop", "comfort"],
  ["washer", "Lavarropas", "WashingMachine", "comfort"],
  ["bathtub", "Bañera", "Bathtub", "comfort"],
  ["hair_dryer", "Secador de pelo", "HairDryer", "comfort"],
  ["pool", "Piscina", "SwimmingPool", "outdoor"],
  ["grill", "Parrilla", "Campfire", "outdoor"],
  ["garden", "Jardín", "Flower", "outdoor"],
  ["mountain_view", "Vista a las sierras", "Mountains", "outdoor"],
  ["lake_access", "Acceso al lago", "Waves", "outdoor"],
  ["bikes", "Bicicletas", "Bicycle", "outdoor"],
  ["parking", "Estacionamiento", "Car", "services"],
  ["crib", "Cuna", "Baby", "family"],
  ["pets", "Se admiten mascotas", "PawPrint", "family"],
  ["first_aid", "Botiquín", "FirstAid", "safety"],
  ["smart_lock", "Ingreso autónomo", "Lock", "safety"],
];

const POLICIES = {
  cancellation: {
    es: "Cancelación gratuita hasta 30 días antes del ingreso: devolvemos el 100% de lo abonado.\nEntre 29 y 15 días antes: devolvemos el 50%.\nCon menos de 15 días: no hay devolución, pero podés reprogramar una vez dentro de los 6 meses siguientes, sujeto a disponibilidad.\nLas devoluciones se hacen por transferencia a la misma cuenta de origen dentro de los 7 días hábiles.",
    en: "Free cancellation up to 30 days before check-in: we refund 100% of what you paid.\nBetween 29 and 15 days before: we refund 50%.\nLess than 15 days before: no refund, but you can reschedule once within the next 6 months, subject to availability.\nRefunds are sent by bank transfer to the original account within 7 business days.",
    pt: "Cancelamento gratuito até 30 dias antes da entrada: devolvemos 100% do valor pago.\nEntre 29 e 15 dias antes: devolvemos 50%.\nCom menos de 15 dias: não há devolução, mas você pode reagendar uma vez nos 6 meses seguintes, sujeito a disponibilidade.\nAs devoluções são feitas por transferência para a mesma conta de origem em até 7 dias úteis.",
  },
  terms: {
    es: "1. La reserva queda confirmada únicamente cuando verificamos la transferencia del total. Hasta entonces las fechas quedan retenidas por el plazo indicado.\n2. El precio incluye las noches, la limpieza final y los cargos detallados en el resumen. No hay costos ocultos.\n3. La cantidad de huéspedes no puede superar la capacidad publicada.\n4. El ingreso es desde el horario de check-in y la salida hasta el horario de check-out indicados en cada propiedad.\n5. Los daños ocasionados durante la estadía serán evaluados y cobrados según su costo de reparación.\n6. Tus datos se usan solo para gestionar la reserva y no se comparten con terceros.",
    en: "1. A booking is confirmed only once we verify the transfer of the full amount. Until then the dates are held for the stated period.\n2. The price includes the nights, final cleaning and the charges listed in the summary. There are no hidden costs.\n3. The number of guests cannot exceed the published capacity.\n4. Check-in is from and check-out is until the times listed for each property.\n5. Damage caused during the stay will be assessed and charged at repair cost.\n6. Your data is used only to manage the booking and is never shared with third parties.",
    pt: "1. A reserva só é confirmada quando verificamos a transferência do valor total. Até lá as datas ficam retidas pelo prazo indicado.\n2. O preço inclui as noites, a limpeza final e as taxas detalhadas no resumo. Não há custos ocultos.\n3. O número de hóspedes não pode exceder a capacidade publicada.\n4. A entrada é a partir do horário de check-in e a saída até o horário de check-out de cada imóvel.\n5. Danos causados durante a estadia serão avaliados e cobrados pelo custo do reparo.\n6. Seus dados são usados apenas para gerenciar a reserva e nunca são compartilhados com terceiros.",
  },
};

interface DemoProperty {
  slug: string;
  title: string;
  type: "HOUSE" | "APARTMENT" | "CABIN" | "VILLA" | "LOFT";
  ownerKey: "olga" | "tomas" | "ines";
  city: string;
  address: string;
  lat: number;
  lng: number;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: string;
  areaM2: number;
  basePrice: number;
  weekendPrice: number | null;
  cleaningFee: number;
  minNights: number;
  featured: boolean;
  rating: [string, number] | null;
  publishedDaysAgo: number;
  amenities: string[];
  images: ReturnType<typeof img>[];
  summary: string;
  description: string;
  houseRules: string;
  arrival: string;
  en: { summary: string; description: string };
  pt: { summary: string; description: string };
}

const PROPERTIES: DemoProperty[] = [
  {
    slug: "casa-alta-del-valle",
    title: "Casa Alta del Valle",
    type: "VILLA",
    ownerKey: "olga",
    city: "Villa General Belgrano",
    address: "Camino a Los Reartes km 3,5, lote 14",
    lat: -31.9712,
    lng: -64.5486,
    maxGuests: 8,
    bedrooms: 4,
    beds: 5,
    bathrooms: "3.5",
    areaM2: 320,
    basePrice: 285_000,
    weekendPrice: 320_000,
    cleaningFee: 45_000,
    minNights: 2,
    featured: true,
    rating: ["4.96", 41],
    publishedDaysAgo: 240,
    amenities: ["wifi", "linens", "heating", "air_conditioning", "kitchen", "oven", "coffee_maker", "dishwasher", "fireplace", "tv", "workspace", "washer", "bathtub", "hair_dryer", "pool", "grill", "garden", "mountain_view", "parking", "first_aid", "smart_lock"],
    images: [
      img("1743465832721-208d5b2e4609", "Piscina con vista abierta a las sierras"),
      img("1782795799287-a3ca32de0d72", "Estar y comedor con ventanales hacia las sierras"),
      img("1783125127053-db9f268a847b", "Living con hogar de piedra"),
      img("1771371282665-545256b20dca", "Cocina de madera con isla"),
      img("1779648596385-bac45f45d1ed", "Dormitorio principal"),
      img("1770941450515-50f2b8ca380b", "Baño con bañera exenta"),
      img("1743510922877-2017642229e9", "Piscina al atardecer"),
    ],
    summary: "Casa de autor sobre una loma, con piscina infinita y el valle entero frente a los ventanales.",
    description:
      "Casa Alta está a diez minutos del centro de Villa General Belgrano, sobre una loma con vista abierta a las sierras de Comechingones.\n\nLa planta baja es un solo ambiente de estar, comedor y cocina que se abre a la galería y a la piscina infinita. Arriba hay cuatro dormitorios, tres de ellos en suite, con ropa de cama de algodón y blackout.\n\nPensada para familias o grupos de amigos que buscan silencio sin resignar comodidad: calefacción por losa radiante, hogar a leña, wifi por fibra y un escritorio frente al valle.",
    houseRules: "No se permiten fiestas ni eventos.\nSilencio a partir de las 23 h.\nNo se permite fumar dentro de la casa.\nLa piscina no tiene guardavidas: los menores deben estar acompañados.",
    arrival:
      "El ingreso es autónomo con cerradura digital: te enviamos el código el día anterior.\nDesde la ruta 5, tomá el camino a Los Reartes y seguí 3,5 km. El portón es de madera oscura con el número 14.\nLa leña está en el depósito junto a la galería.",
    en: {
      summary: "Architect-designed house on a hilltop, with an infinity pool and the whole valley in front of its windows.",
      description:
        "Casa Alta sits ten minutes from the centre of Villa General Belgrano, on a hilltop with open views of the Comechingones range.\n\nThe ground floor is a single living, dining and kitchen space that opens onto the veranda and the infinity pool. Upstairs there are four bedrooms, three of them en suite, with cotton linens and blackout curtains.\n\nDesigned for families or groups of friends looking for silence without giving up comfort: underfloor heating, a wood fireplace, fibre wifi and a desk facing the valley.",
    },
    pt: {
      summary: "Casa de autor sobre uma colina, com piscina de borda infinita e o vale inteiro diante das janelas.",
      description:
        "A Casa Alta fica a dez minutos do centro de Villa General Belgrano, sobre uma colina com vista aberta para as serras de Comechingones.\n\nO térreo é um único ambiente de estar, jantar e cozinha que se abre para a varanda e a piscina de borda infinita. Em cima há quatro quartos, três deles suítes, com roupa de cama de algodão e blackout.\n\nPensada para famílias ou grupos de amigos que buscam silêncio sem abrir mão do conforto: piso aquecido, lareira a lenha, wifi de fibra e uma escrivaninha de frente para o vale.",
    },
  },
  {
    slug: "departamento-costanera-santa-rosa",
    title: "Departamento Costanera",
    type: "APARTMENT",
    ownerKey: "tomas",
    city: "Santa Rosa de Calamuchita",
    address: "Costanera Río Santa Rosa 215, piso 2",
    lat: -32.0697,
    lng: -64.5372,
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: "1",
    areaM2: 78,
    basePrice: 95_000,
    weekendPrice: 110_000,
    cleaningFee: 18_000,
    minNights: 2,
    featured: false,
    rating: ["4.88", 63],
    publishedDaysAgo: 400,
    amenities: ["wifi", "linens", "heating", "air_conditioning", "kitchen", "coffee_maker", "tv", "workspace", "washer", "hair_dryer", "parking", "smart_lock"],
    images: [
      img("1682184805271-11671b7ecf4c", "Living luminoso con ventanal"),
      img("1757924461488-ef9ad0670978", "Sala de estar con vista"),
      img("1759147960461-b74a7e9a75d4", "Cocina integrada con isla"),
      img("1653974123177-fe9c05fb79e6", "Dormitorio principal"),
      img("1763485956243-50068d04a1ad", "Baño moderno"),
    ],
    summary: "Dos ambientes nuevos frente al río, a una cuadra de la avenida principal.",
    description:
      "Un departamento de diseño simple y luminoso en la costanera de Santa Rosa de Calamuchita. Desde el balcón se ve el río y en cinco minutos caminando estás en la avenida, los cafés y la feria de artesanos.\n\nTiene dos dormitorios (uno con cama queen y otro con dos camas individuales), cocina completa, lavarropas y un escritorio con buena luz para trabajar.\n\nIdeal para parejas o familias chicas que quieren moverse a pie.",
    houseRules: "No se permiten mascotas.\nNo se permite fumar.\nRespetá el descanso de los vecinos del edificio.",
    arrival: "El edificio tiene portero eléctrico: el código de la cerradura del departamento te llega por email el día anterior.\nLa cochera asignada es la número 7, en el subsuelo.",
    en: {
      summary: "Brand-new two-bedroom flat on the river front, one block from the main avenue.",
      description:
        "A simple, bright apartment on the riverside promenade of Santa Rosa de Calamuchita. You can see the river from the balcony and walk to the avenue, cafés and craft fair in five minutes.\n\nIt has two bedrooms (one queen bed and one with two singles), a full kitchen, a washing machine and a well-lit desk for working.\n\nIdeal for couples or small families who want to get around on foot.",
    },
    pt: {
      summary: "Apartamento novo de dois quartos em frente ao rio, a uma quadra da avenida principal.",
      description:
        "Um apartamento de design simples e luminoso na orla de Santa Rosa de Calamuchita. Da varanda se vê o rio e em cinco minutos a pé você está na avenida, nos cafés e na feira de artesanato.\n\nTem dois quartos (um com cama queen e outro com duas camas de solteiro), cozinha completa, máquina de lavar e uma escrivaninha bem iluminada para trabalhar.\n\nIdeal para casais ou famílias pequenas que querem fazer tudo a pé.",
    },
  },
  {
    slug: "cabana-bosque-de-pinos",
    title: "Cabaña Bosque de Pinos",
    type: "CABIN",
    ownerKey: "ines",
    city: "La Cumbrecita",
    address: "Sendero del Bosque s/n, lote 3",
    lat: -31.8981,
    lng: -64.7719,
    maxGuests: 4,
    bedrooms: 2,
    beds: 3,
    bathrooms: "1",
    areaM2: 70,
    basePrice: 120_000,
    weekendPrice: 138_000,
    cleaningFee: 20_000,
    minNights: 2,
    featured: true,
    rating: ["4.93", 57],
    publishedDaysAgo: 300,
    amenities: ["wifi", "linens", "heating", "kitchen", "coffee_maker", "fireplace", "grill", "garden", "mountain_view", "parking", "pets", "first_aid"],
    images: [
      img("1785867428020-309e923cfc17", "Cabaña de madera entre pinos"),
      img("1716908520076-4acd8a09f537", "Estufa a leña en el living"),
      img("1773423389979-b28b469967f8", "Dormitorio revestido en madera"),
      img("1631555542605-877a63b6e3a6", "Cocina con ventana al bosque"),
      img("1777322194102-d1b691a02515", "La cabaña desde el sendero"),
    ],
    summary: "Madera, estufa y bosque: una cabaña para desconectar en el pueblo peatonal de las sierras.",
    description:
      "La Cumbrecita es un pueblo peatonal rodeado de bosques de pinos y arroyos. La cabaña está en el borde del bosque, a diez minutos caminando del centro y a cinco de la cascada chica.\n\nPor dentro todo es madera: un living con estufa a leña, una cocina completa con ventana al bosque y dos dormitorios. Afuera hay una parrilla y una galería cubierta para los días de lluvia.\n\nAceptamos mascotas que convivan bien con la naturaleza.",
    houseRules: "Mascotas bienvenidas (máximo una).\nNo se permite fumar dentro de la cabaña.\nNo dejes fuego encendido sin supervisión.",
    arrival:
      "Los autos quedan en el estacionamiento de la entrada del pueblo: desde ahí son 10 minutos de caminata por el Sendero del Bosque.\nTe esperamos en la oficina de informes para entregarte las llaves.",
    en: {
      summary: "Wood, a stove and the forest: a cabin to unplug in the car-free mountain village.",
      description:
        "La Cumbrecita is a car-free village surrounded by pine forests and streams. The cabin sits on the edge of the forest, a ten-minute walk from the centre and five from the small waterfall.\n\nInside everything is wood: a living room with a wood stove, a full kitchen facing the forest and two bedrooms. Outside there is a grill and a covered porch for rainy days.\n\nPets that get along with nature are welcome.",
    },
    pt: {
      summary: "Madeira, lareira e floresta: uma cabana para desconectar na vila de pedestres das serras.",
      description:
        "La Cumbrecita é uma vila sem carros cercada por bosques de pinheiros e riachos. A cabana fica na borda do bosque, a dez minutos a pé do centro e a cinco da cascata pequena.\n\nPor dentro tudo é madeira: uma sala com lareira a lenha, cozinha completa com janela para o bosque e dois quartos. Do lado de fora há churrasqueira e uma varanda coberta para os dias de chuva.\n\nAceitamos animais de estimação que convivam bem com a natureza.",
    },
  },
  {
    slug: "casa-del-lago-embalse",
    title: "Casa del Lago",
    type: "HOUSE",
    ownerKey: "ines",
    city: "Embalse",
    address: "Costa del Lago, calle Los Aromos 1180",
    lat: -32.1934,
    lng: -64.4102,
    maxGuests: 8,
    bedrooms: 4,
    beds: 6,
    bathrooms: "2",
    areaM2: 190,
    basePrice: 210_000,
    weekendPrice: 240_000,
    cleaningFee: 35_000,
    minNights: 3,
    featured: true,
    rating: ["4.91", 29],
    publishedDaysAgo: 150,
    amenities: ["wifi", "linens", "heating", "air_conditioning", "kitchen", "oven", "coffee_maker", "dishwasher", "fireplace", "tv", "washer", "grill", "garden", "lake_access", "bikes", "parking", "crib", "first_aid"],
    images: [
      img("1763051339093-61c59f40ba28", "La casa y su deck sobre el agua"),
      img("1721222203980-9bd247e68588", "Mesa larga para toda la familia"),
      img("1680703486830-1b5af60635d7", "Living con hogar de piedra"),
      img("1768487422639-7ba3900d0f02", "Dormitorio con chimenea"),
      img("1763419161907-1e00b2f883c5", "Habitación con dos camas"),
      img("1784123207559-3194a83336dd", "El lago al atardecer desde el muelle"),
    ],
    summary: "Jardín con salida al lago, muelle propio y lugar para toda la familia.",
    description:
      "Una casa amplia a orillas del lago de Embalse, con jardín, parque de juegos y un muelle propio para kayak y pesca.\n\nTiene cuatro dormitorios pensados para familias: una suite, un cuarto con cama matrimonial, uno con dos camas y otro con cuchetas. La mesa del comedor tiene lugar para diez y la parrilla está a pocos pasos de la galería.\n\nHay dos kayaks y cuatro bicicletas para usar durante la estadía.",
    houseRules: "Los menores deben estar siempre acompañados en el muelle.\nNo se permiten fiestas.\nSilencio a partir de las 23 h.",
    arrival:
      "Te esperamos en la casa para hacer el ingreso y mostrarte el muelle y los kayaks.\nSi llegás de noche, avisanos por WhatsApp y te dejamos las luces del jardín encendidas.",
    en: {
      summary: "A garden that runs down to the lake, a private jetty and room for the whole family.",
      description:
        "A spacious house on the shore of Lake Embalse, with a garden, a play area and a private jetty for kayaking and fishing.\n\nIt has four bedrooms designed for families: a master suite, a double room, a twin room and a room with bunk beds. The dining table seats ten and the grill is a few steps from the porch.\n\nTwo kayaks and four bikes are included during your stay.",
    },
    pt: {
      summary: "Jardim com saída para o lago, píer próprio e espaço para toda a família.",
      description:
        "Uma casa ampla às margens do lago de Embalse, com jardim, parquinho e um píer próprio para caiaque e pesca.\n\nTem quatro quartos pensados para famílias: uma suíte, um quarto de casal, um com duas camas e outro com beliches. A mesa de jantar tem lugar para dez e a churrasqueira fica a poucos passos da varanda.\n\nHá dois caiaques e quatro bicicletas para usar durante a estadia.",
    },
  },
  {
    slug: "refugio-arroyo-claro",
    title: "Refugio Arroyo Claro",
    type: "CABIN",
    ownerKey: "tomas",
    city: "Los Reartes",
    address: "Camino al Arroyo El Durazno km 1",
    lat: -31.9186,
    lng: -64.5745,
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: "1",
    areaM2: 45,
    basePrice: 88_000,
    weekendPrice: 99_000,
    cleaningFee: 15_000,
    minNights: 2,
    featured: false,
    rating: ["4.98", 22],
    publishedDaysAgo: 25,
    amenities: ["wifi", "linens", "heating", "kitchen", "coffee_maker", "fireplace", "bathtub", "garden", "mountain_view", "parking"],
    images: [
      img("1788027025573-700ada0928bf", "Refugio a orillas del agua entre pinos"),
      img("1728649072511-bd946044a63b", "Rincón con estufa y vista al bosque"),
      img("1780662805447-36c9c1a6641e", "Ambiente único luminoso"),
      img("1754206351848-078ec2df7859", "Atardecer sobre el valle"),
    ],
    summary: "Un refugio para dos junto al arroyo, con hogar, bañera y cielo lleno de estrellas.",
    description:
      "Pensado para parejas: un solo ambiente con cama king, hogar a leña y una bañera frente al ventanal. Afuera, el arroyo pasa a pocos metros y de noche no hay luces que tapen las estrellas.\n\nLos Reartes es el pueblo más antiguo del valle: calles de tierra, almacenes de campo y senderos para caminar hasta los pozones.",
    houseRules: "Apto solo para adultos.\nNo se permite fumar.\nNo se admiten mascotas.",
    arrival: "Te enviamos la ubicación exacta y el código de la caja de llaves el día anterior.\nEl último kilómetro es de tierra: se transita bien con cualquier auto.",
    en: {
      summary: "A hideaway for two by the stream, with a fireplace, a bathtub and a sky full of stars.",
      description:
        "Designed for couples: a single open room with a king bed, a wood fireplace and a bathtub facing the window. Outside, the stream runs a few metres away and at night there are no lights to hide the stars.\n\nLos Reartes is the oldest village in the valley: dirt roads, country stores and trails that lead to natural pools.",
    },
    pt: {
      summary: "Um refúgio para dois junto ao riacho, com lareira, banheira e céu cheio de estrelas.",
      description:
        "Pensado para casais: um único ambiente com cama king, lareira a lenha e uma banheira de frente para a janela. Lá fora, o riacho passa a poucos metros e à noite não há luzes que escondam as estrelas.\n\nLos Reartes é a vila mais antiga do vale: ruas de terra, armazéns de campo e trilhas até os poços naturais.",
    },
  },
  {
    slug: "loft-belgrano-centro",
    title: "Loft Belgrano Centro",
    type: "LOFT",
    ownerKey: "olga",
    city: "Villa General Belgrano",
    address: "Av. San Martín 468, 1.º B",
    lat: -31.9779,
    lng: -64.5601,
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: "1",
    areaM2: 52,
    basePrice: 78_000,
    weekendPrice: 90_000,
    cleaningFee: 14_000,
    minNights: 1,
    featured: false,
    rating: null,
    publishedDaysAgo: 12,
    amenities: ["wifi", "linens", "heating", "air_conditioning", "kitchen", "coffee_maker", "tv", "workspace", "hair_dryer", "smart_lock"],
    images: [
      img("1738168246881-40f35f8aba0a", "Living con sofá verde"),
      img("1758957701419-2c6e266f7988", "Sala de estar con obras de arte"),
      img("1788217158679-5f7a52049ecc", "Cocina de nogal"),
      img("1789132782848-74945d8699a8", "Dormitorio con respaldo de madera"),
      img("1742134131017-44d377a611b1", "Baño con iluminación cálida"),
    ],
    summary: "Loft de diseño sobre la avenida, a pasos de las cervecerías y el paseo central.",
    description:
      "Un loft recién inaugurado en pleno centro de Villa General Belgrano. Todo queda a pie: el paseo, las cervecerías artesanales, las casas de té y la plaza donde se celebra la Fiesta de la Cerveza.\n\nTiene cama queen, cocina de nogal completa, escritorio y aislación acústica para descansar aun en temporada alta.",
    houseRules: "Máximo dos personas.\nNo se permite fumar.\nNo se admiten mascotas.",
    arrival: "El ingreso es autónomo: el código de la puerta del edificio y del loft te llegan por email el día anterior.\nEstacionamiento público a media cuadra.",
    en: {
      summary: "Design loft on the main avenue, steps from the breweries and the central promenade.",
      description:
        "A newly opened loft in the heart of Villa General Belgrano. Everything is within walking distance: the promenade, craft breweries, tea houses and the square where the Beer Festival is held.\n\nIt has a queen bed, a full walnut kitchen, a desk and acoustic insulation to rest well even in high season.",
    },
    pt: {
      summary: "Loft de design na avenida principal, a passos das cervejarias e do calçadão central.",
      description:
        "Um loft recém-inaugurado no centro de Villa General Belgrano. Tudo fica perto a pé: o calçadão, as cervejarias artesanais, as casas de chá e a praça onde acontece a Festa da Cerveja.\n\nTem cama queen, cozinha completa de nogueira, escrivaninha e isolamento acústico para descansar mesmo na alta temporada.",
    },
  },
];

const OWNERS = {
  olga: {
    firstName: "Olga",
    lastName: "Ferreyra",
    email: "olga.ferreyra@example.com",
    phone: "+54 9 3546 41-2208",
    taxId: "27-24561138-4",
    bankName: "Banco de la Provincia de Córdoba",
    accountHolder: "Olga Beatriz Ferreyra",
    cbu: "0200381611000030457821",
    alias: "CASA.ALTA.VALLE",
    accountTaxId: "27-24561138-4",
    commissionPercent: "15",
  },
  tomas: {
    firstName: "Tomás",
    lastName: "Aguirre",
    email: "tomas.aguirre@example.com",
    phone: "+54 9 351 612-4470",
    taxId: "20-31987442-6",
    bankName: "Banco Galicia",
    accountHolder: "Tomás Ignacio Aguirre",
    cbu: "0070188730004012845523",
    alias: "ARROYO.CLARO.RESERVAS",
    accountTaxId: "20-31987442-6",
    commissionPercent: "12",
  },
  ines: {
    firstName: "Inés",
    lastName: "Villalba",
    email: "ines.villalba@example.com",
    phone: "+54 9 3571 55-0931",
    taxId: "27-28113540-2",
    bankName: "Banco Nación",
    accountHolder: "María Inés Villalba",
    cbu: "0110599520000045128806",
    alias: "LAGO.PINOS.RESERVAS",
    accountTaxId: "27-28113540-2",
    commissionPercent: "15",
  },
};

const GUESTS = [
  ["Martina", "Ocampo", "martina.ocampo@example.com", "+54 9 11 5832-4410", "AR"],
  ["Julián", "Ibarra", "julian.ibarra@example.com", "+54 9 351 540-1128", "AR"],
  ["Carolina", "Benítez", "carolina.benitez@example.com", "+54 9 341 622-7093", "AR"],
  ["Facundo", "Lema", "facundo.lema@example.com", "+54 9 11 4470-3312", "AR"],
  ["Luana", "Figueiredo", "luana.figueiredo@example.com", "+55 11 98472-3310", "BR"],
  ["Henrik", "Larsen", "henrik.larsen@example.com", "+45 21 48 73 90", "DK"],
  ["Renata", "Albornoz", "renata.albornoz@example.com", "+54 9 261 488-2075", "AR"],
  ["Joaquín", "Pereyra", "joaquin.pereyra@example.com", "+54 9 351 377-9914", "AR"],
  ["Sofía", "Arancibia", "sofia.arancibia@example.com", "+54 9 223 519-0642", "AR"],
  ["Mateo", "Quiroga", "mateo.quiroga@example.com", "+598 94 318 225", "UY"],
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function code(): string {
  let value = "RMS-";
  for (let i = 0; i < 6; i++) value += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return value;
}

function pricingConfig(p: DemoProperty, seasons: PricingConfig["seasons"], rules: PricingConfig["rules"]): PricingConfig {
  return {
    property: {
      currency: "ARS",
      basePrice: p.basePrice * 100,
      weekendPrice: p.weekendPrice === null ? null : p.weekendPrice * 100,
      cleaningFee: p.cleaningFee * 100,
      minNights: p.minNights,
      maxNights: null,
      maxGuests: p.maxGuests,
    },
    seasons,
    rules,
  };
}

/** Amenity catalog used by the property wizard (safe to run again). */
async function seedAmenities(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [key, label, icon, category] of AMENITIES) {
    const amenity = await prisma.amenity.upsert({ where: { key }, create: { key, label, icon, category }, update: { label, icon, category } });
    ids.set(key, amenity.id);
  }
  return ids;
}

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@destinocalamuchita.local").toLowerCase();
  const adminPassword = await staffPassword("SEED_ADMIN_PASSWORD");
  const demoPassword = await staffPassword("SEED_DEMO_PASSWORD");

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: { email: adminEmail, name: "Administración", role: "ADMIN", passwordHash: await hashPassword(adminPassword.value) },
    });
    console.log(`✔ Admin user: ${adminEmail}${adminPassword.generated ? `  password: ${adminPassword.value}  (save it now)` : " (password from SEED_ADMIN_PASSWORD)"}`);
  }

  // Production start: no fictional properties, owners, guests or bank details. Agency data is loaded from the panel.
  if (process.env.SEED_DEMO_DATA === "false") {
    await seedAmenities();
    const defaults: [string, Prisma.InputJsonValue][] = [
      ["booking", { holdHours: 24, reminderDaysBefore: 2 }],
      ["notifications", { adminEmails: [adminEmail] }],
      ["policies", POLICIES],
      ["site", { heroImageUrl: photo("1705783500980-9e65f003f78d"), ctaImageUrl: photo("1694184023356-e1edfd130269") }],
    ];
    for (const [key, value] of defaults) await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} });
    console.log("✔ Clean start: admin user, amenity catalog and default rules ready. Complete Configuración in the panel.");
    return;
  }

  if ((await prisma.property.count()) > 0) {
    console.log("Database already has properties: demo data skipped. Run `npx prisma migrate reset` to start over.");
    return;
  }

  const today = todayISO();
  const year = Number(today.slice(0, 4));

  // Settings
  const settings: [string, Prisma.InputJsonValue][] = [
    [
      "agency",
      {
        name: "DestinoCalamuchita",
        legalName: "DestinoCalamuchita Alquileres Temporarios",
        taxId: "30-71845213-9",
        email: "reservas@destinocalamuchita.example",
        phone: "+54 9 3546 40-1122",
        whatsapp: "+54 9 3546 40-1122",
        address: "Av. San Martín 1250",
        city: "Villa General Belgrano, Córdoba",
        instagram: "@destinocalamuchita",
      },
    ],
    ["booking", { holdHours: 24, reminderDaysBefore: 2 }],
    ["site", { heroImageUrl: photo("1705783500980-9e65f003f78d"), ctaImageUrl: photo("1694184023356-e1edfd130269") }],
    [
      "testimonials",
      {
        // Demo quotes: replace them with real guest feedback from Settings → Home before going live.
        items: [
          {
            name: "Martina O.",
            origin: "Buenos Aires",
            quote: {
              es: "Reservamos directo por primera vez y fue más simple que en cualquier app. Nos respondieron cada duda en minutos.",
              en: "We booked direct for the first time and it was simpler than any app. Every question was answered within minutes.",
              pt: "Reservamos direto pela primeira vez e foi mais simples do que em qualquer app. Responderam cada dúvida em minutos.",
            },
          },
          {
            name: "Luana F.",
            origin: "São Paulo",
            quote: {
              es: "La casa era igual a las fotos. El muelle al atardecer vale el viaje entero.",
              en: "The house looked exactly like the photos. The jetty at sunset is worth the whole trip.",
              pt: "A casa era igual às fotos. O píer ao entardecer vale a viagem inteira.",
            },
          },
          {
            name: "Henrik L.",
            origin: "Copenhague",
            quote: {
              es: "Silencio, estrellas y una estufa que no se apagó en toda la semana. Volvemos en invierno.",
              en: "Silence, stars and a stove that never went out all week. We are coming back in winter.",
              pt: "Silêncio, estrelas e uma lareira que não apagou a semana inteira. Voltamos no inverno.",
            },
          },
        ],
      },
    ],
    [
      "bank",
      {
        bankName: "Banco de la Provincia de Córdoba",
        accountHolder: "DestinoCalamuchita Alquileres Temporarios",
        cbu: "0200381611000012345678",
        alias: "DESTINO.CALAMUCHITA",
        accountTaxId: "30-71845213-9",
      },
    ],
    ["notifications", { adminEmails: [adminEmail] }],
    ["policies", POLICIES],
    [
      "destinations",
      {
        images: [
          { city: "Villa General Belgrano", imageUrl: photo("1638114573701-fa2b8709a32a") },
          { city: "Santa Rosa de Calamuchita", imageUrl: photo("1637071985253-e5417fa2a47b") },
          { city: "La Cumbrecita", imageUrl: photo("1785663950452-d3c7fc60970e") },
          { city: "Embalse", imageUrl: photo("1646102083525-113ae0ce97f4") },
          { city: "Los Reartes", imageUrl: photo("1658164966579-4649c639ea3b") },
        ],
      },
    ],
  ];
  for (const [key, value] of settings) await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });

  const amenityIds = await seedAmenities();

  // Owners (+ an OWNER login for Olga and a MANAGER)
  const ownerIds: Record<string, string> = {};
  for (const [key, owner] of Object.entries(OWNERS)) {
    ownerIds[key] = (await prisma.owner.create({ data: owner })).id;
  }
  const demoHash = await hashPassword(demoPassword.value);
  await prisma.user.create({ data: { email: "gestion@destinocalamuchita.local", name: "Lucas Molina", role: "MANAGER", passwordHash: demoHash } });
  await prisma.user.create({ data: { email: "olga@destinocalamuchita.local", name: "Olga Ferreyra", role: "OWNER", ownerId: ownerIds.olga!, passwordHash: demoHash } });
  console.log(`✔ Demo users: gestion@destinocalamuchita.local (MANAGER), olga@destinocalamuchita.local (OWNER)${demoPassword.generated ? `  password: ${demoPassword.value}` : " (password from SEED_DEMO_PASSWORD)"}`);

  // Guests
  const guestIds: string[] = [];
  for (const [firstName, lastName, email, phone, country] of GUESTS) {
    guestIds.push((await prisma.guest.create({ data: { firstName, lastName, email, phone, country } })).id);
  }

  // Seasonal pricing shared pattern (summer, winter holidays), plus local events.
  const summerStart = `${today.slice(5) > "03-01" ? year : year - 1}-12-15`;
  const summerEnd = `${Number(summerStart.slice(0, 4)) + 1}-03-01`;
  const winterStart = `${today.slice(5) > "08-01" ? year + 1 : year}-07-06`;
  const winterEnd = `${winterStart.slice(0, 4)}-08-03`;
  const octoberfestYear = today.slice(5) > "10-15" ? year + 1 : year;

  const propertyIds = new Map<string, string>();
  const configs = new Map<string, PricingConfig>();

  for (const [index, p] of PROPERTIES.entries()) {
    const seasons = [
      { name: "Temporada de verano", startDate: summerStart, endDate: summerEnd, factor: 1.3, minNights: Math.max(p.minNights, 3) },
      { name: "Vacaciones de invierno", startDate: winterStart, endDate: winterEnd, factor: 1.2, minNights: Math.max(p.minNights, 2) },
    ].map((s) => ({
      ...s,
      nightlyPrice: Math.round((p.basePrice * s.factor) / 1000) * 1000,
      weekendPrice: p.weekendPrice ? Math.round((p.weekendPrice * s.factor) / 1000) * 1000 : null,
    }));

    const specialDates =
      p.city === "Villa General Belgrano"
        ? [{ name: "Fiesta Nacional de la Cerveza", startDate: `${octoberfestYear}-10-02`, endDate: `${octoberfestYear}-10-13`, amount: Math.round((p.basePrice * 1.5) / 1000) * 1000 }]
        : [];
    const fees = [{ name: "Tasa turística municipal", amount: 1_200, feeUnit: "PER_GUEST_NIGHT" as const }];
    const discounts = [
      { name: "Estadía de una semana", minNights: 7, percent: 10 },
      { name: "Estadía de dos semanas", minNights: 14, percent: 15 },
    ];

    const property = await prisma.property.create({
      data: {
        slug: p.slug,
        title: p.title,
        status: "PUBLISHED",
        type: p.type,
        summary: p.summary,
        description: p.description,
        houseRules: p.houseRules,
        arrivalInstructions: p.arrival,
        city: p.city,
        region: "Córdoba",
        address: p.address,
        latitude: p.lat.toFixed(6),
        longitude: p.lng.toFixed(6),
        maxGuests: p.maxGuests,
        bedrooms: p.bedrooms,
        beds: p.beds,
        bathrooms: p.bathrooms,
        areaM2: p.areaM2,
        basePrice: p.basePrice.toFixed(2),
        weekendPrice: p.weekendPrice?.toFixed(2) ?? null,
        cleaningFee: p.cleaningFee.toFixed(2),
        minNights: p.minNights,
        featured: p.featured,
        ratingAverage: p.rating?.[0] ?? null,
        ratingCount: p.rating?.[1] ?? 0,
        icalExportToken: randomBytes(24).toString("base64url"),
        publishedAt: new Date(Date.now() - p.publishedDaysAgo * 86_400_000),
        ownerId: ownerIds[p.ownerKey],
        images: { create: p.images.map((image, position) => ({ ...image, position })) },
        translations: {
          create: [
            { locale: "en", summary: p.en.summary, description: p.en.description },
            { locale: "pt", summary: p.pt.summary, description: p.pt.description },
          ],
        },
        amenities: { create: p.amenities.map((key) => ({ amenityId: amenityIds.get(key)! })) },
        seasons: {
          create: seasons.map((s) => ({
            name: s.name,
            startDate: toDbDate(s.startDate),
            endDate: toDbDate(s.endDate),
            nightlyPrice: s.nightlyPrice.toFixed(2),
            weekendPrice: s.weekendPrice?.toFixed(2) ?? null,
            minNights: s.minNights,
          })),
        },
        priceRules: {
          create: [
            ...specialDates.map((d) => ({ type: "SPECIAL_DATE" as const, name: d.name, startDate: toDbDate(d.startDate), endDate: toDbDate(d.endDate), amount: d.amount.toFixed(2) })),
            ...discounts.map((d) => ({ type: "LENGTH_DISCOUNT" as const, name: d.name, minNights: d.minNights, percent: String(d.percent) })),
            ...fees.map((f) => ({ type: "FEE" as const, name: f.name, amount: f.amount.toFixed(2), feeUnit: f.feeUnit })),
          ],
        },
      },
    });
    propertyIds.set(p.slug, property.id);
    configs.set(
      p.slug,
      pricingConfig(
        p,
        seasons.map((s, i) => ({ id: `s${index}-${i}`, name: s.name, startDate: s.startDate, endDate: s.endDate, nightlyPrice: s.nightlyPrice * 100, weekendPrice: s.weekendPrice === null ? null : s.weekendPrice * 100, minNights: s.minNights })),
        [
          ...specialDates.map((d, i) => ({ id: `sd${i}`, type: "SPECIAL_DATE" as const, name: d.name, startDate: d.startDate, endDate: d.endDate, amount: d.amount * 100 })),
          ...discounts.map((d, i) => ({ id: `d${i}`, type: "LENGTH_DISCOUNT" as const, name: d.name, minNights: d.minNights, percent: d.percent })),
          ...fees.map((f, i) => ({ id: `f${i}`, type: "FEE" as const, name: f.name, amount: f.amount * 100, feeUnit: f.feeUnit })),
        ],
      ),
    );
  }

  // Manual blocks
  await prisma.availability.create({
    data: { propertyId: propertyIds.get("casa-alta-del-valle")!, startDate: toDbDate(addDays(today, 38)), endDate: toDbDate(addDays(today, 44)), reason: "OWNER_USE", note: "Uso de la propietaria" },
  });
  await prisma.availability.create({
    data: { propertyId: propertyIds.get("cabana-bosque-de-pinos")!, startDate: toDbDate(addDays(today, 52)), endDate: toDbDate(addDays(today, 55)), reason: "MAINTENANCE", note: "Mantenimiento de la estufa y techo" },
  });

  // Reservations
  const bankOf = (slug: string) => {
    const p = PROPERTIES.find((x) => x.slug === slug)!;
    const o = OWNERS[p.ownerKey];
    return { bankName: o.bankName, accountHolder: o.accountHolder, cbu: o.cbu, alias: o.alias, accountTaxId: o.accountTaxId };
  };

  type Plan = {
    slug: string;
    guest: number;
    start: number;
    nights: number;
    guests: number;
    status: "AWAITING_PAYMENT" | "PROOF_RECEIVED" | "UNDER_REVIEW" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "EXPIRED";
    source?: "DIRECT" | "MANUAL";
    locale?: string;
    proof?: boolean;
    comments?: string;
  };

  const plans: Plan[] = [
    // Current and upcoming
    { slug: "refugio-arroyo-claro", guest: 5, start: -1, nights: 4, guests: 2, status: "CONFIRMED", locale: "en", comments: "We arrive around 6 pm." },
    { slug: "departamento-costanera-santa-rosa", guest: 1, start: 0, nights: 3, guests: 3, status: "CONFIRMED" },
    { slug: "casa-alta-del-valle", guest: 0, start: 9, nights: 4, guests: 6, status: "CONFIRMED", comments: "Viajamos con dos chicos de 8 y 11 años." },
    { slug: "departamento-costanera-santa-rosa", guest: 2, start: 6, nights: 3, guests: 2, status: "PROOF_RECEIVED", proof: true },
    { slug: "cabana-bosque-de-pinos", guest: 3, start: 18, nights: 3, guests: 3, status: "AWAITING_PAYMENT", comments: "¿Se puede ingresar con un perro mediano?" },
    { slug: "casa-del-lago-embalse", guest: 4, start: 14, nights: 5, guests: 7, status: "UNDER_REVIEW", locale: "pt", proof: true },
    { slug: "loft-belgrano-centro", guest: 6, start: 3, nights: 2, guests: 2, status: "CONFIRMED", source: "MANUAL" },
    { slug: "casa-alta-del-valle", guest: 7, start: 24, nights: 7, guests: 8, status: "CONFIRMED" },
    { slug: "loft-belgrano-centro", guest: 8, start: 30, nights: 3, guests: 2, status: "CANCELLED" },
    { slug: "cabana-bosque-de-pinos", guest: 9, start: 5, nights: 2, guests: 2, status: "EXPIRED" },
    // History (last months)
    ...[
      ["casa-alta-del-valle", 0, -170, 5, 6],
      ["casa-del-lago-embalse", 1, -160, 7, 8],
      ["cabana-bosque-de-pinos", 2, -140, 3, 2],
      ["departamento-costanera-santa-rosa", 3, -125, 4, 3],
      ["refugio-arroyo-claro", 4, -110, 3, 2],
      ["casa-alta-del-valle", 5, -95, 3, 4],
      ["casa-del-lago-embalse", 6, -80, 4, 6],
      ["cabana-bosque-de-pinos", 7, -66, 5, 4],
      ["departamento-costanera-santa-rosa", 8, -52, 3, 2],
      ["loft-belgrano-centro", 9, -40, 2, 2],
      ["casa-alta-del-valle", 1, -30, 4, 7],
      ["refugio-arroyo-claro", 2, -24, 2, 2],
      ["casa-del-lago-embalse", 3, -18, 3, 5],
      ["cabana-bosque-de-pinos", 0, -12, 4, 3],
      ["departamento-costanera-santa-rosa", 5, -9, 3, 2],
    ].map(([slug, guest, start, nights, guests], i): Plan => ({
      slug: slug as string,
      guest: guest as number,
      start: start as number,
      nights: nights as number,
      guests: guests as number,
      status: "COMPLETED",
      source: i % 4 === 3 ? "MANUAL" : "DIRECT",
    })),
  ];

  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  const proofPng = await sharp({ create: { width: 900, height: 1300, channels: 3, background: "#ffffff" } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="900" height="1300" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,sans-serif;fill:#1b2430}</style><rect width="900" height="150" fill="#0f5f4a"/><text x="60" y="95" font-size="44" style="fill:#fff">Comprobante de transferencia</text><text x="60" y="260" font-size="30">Operación n.º 48213377</text><text x="60" y="330" font-size="30">Fecha: ${today}</text><text x="60" y="440" font-size="26">Cuenta destino</text><text x="60" y="490" font-size="32">CBU 0110599520000045128806</text><text x="60" y="600" font-size="26">Importe</text><text x="60" y="665" font-size="56">Transferencia inmediata</text><text x="60" y="1200" font-size="22" style="fill:#6b7280">Documento de demostración</text></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  for (const plan of plans) {
    const checkIn = addDays(today, plan.start);
    const checkOut = addDays(checkIn, plan.nights);
    const config = configs.get(plan.slug)!;
    const quoted = calculateQuote({ checkIn, checkOut, guests: plan.guests, today: checkIn }, {
      ...config,
      property: { ...config.property, minNights: 1 },
      seasons: config.seasons.map((s) => ({ ...s, minNights: null })),
    });
    if (!quoted.ok) throw new Error(`Seed quote failed for ${plan.slug}: ${quoted.error.code}`);
    const quote = quoted.quote;
    const confirmed = plan.status === "CONFIRMED" || plan.status === "COMPLETED";
    const created = new Date(Date.now() + Math.min(plan.start - 12, -1) * 86_400_000);

    const reservation = await prisma.reservation.create({
      data: {
        code: code(),
        propertyId: propertyIds.get(plan.slug)!,
        guestId: guestIds[plan.guest]!,
        status: plan.status,
        source: plan.source ?? "DIRECT",
        checkIn: toDbDate(checkIn),
        checkOut: toDbDate(checkOut),
        nights: quote.nights,
        guestCount: plan.guests,
        comments: plan.comments ?? null,
        locale: plan.locale ?? "es",
        currency: "ARS",
        nightlySubtotal: centsToDecimalString(quote.nightlySubtotal),
        discountTotal: centsToDecimalString(quote.discount?.amount ?? 0),
        feesTotal: centsToDecimalString(quote.feesTotal),
        cleaningFee: centsToDecimalString(quote.cleaningFee),
        total: centsToDecimalString(quote.total),
        priceBreakdown: quote as unknown as Prisma.InputJsonValue,
        holdExpiresAt: plan.status === "AWAITING_PAYMENT" ? new Date(Date.now() + 20 * 3_600_000) : null,
        confirmedAt: confirmed ? created : null,
        completedAt: plan.status === "COMPLETED" ? toDbDate(checkOut) : null,
        cancelledAt: plan.status === "CANCELLED" ? new Date() : null,
        cancelReason: plan.status === "CANCELLED" ? "El huésped canceló por un cambio de planes." : null,
        createdById: plan.source === "MANUAL" ? adminUser.id : null,
        createdAt: created,
        payments: {
          create: {
            currency: "ARS",
            amountDue: centsToDecimalString(quote.total),
            amountReceived: confirmed ? centsToDecimalString(quote.total) : null,
            status: confirmed ? "VERIFIED" : plan.status === "EXPIRED" || plan.status === "CANCELLED" ? "REJECTED" : "PENDING",
            verifiedAt: confirmed ? created : null,
            verifiedById: confirmed ? adminUser.id : null,
            bankSnapshot: bankOf(plan.slug),
          },
        },
      },
      include: { payments: true },
    });

    if (plan.proof && process.env.STORAGE_DRIVER !== "s3") {
      const key = `proofs/${reservation.id}/${randomUUID()}.png`;
      const file = path.resolve("storage", "private", key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, proofPng);
      await writeFile(`${file}.meta`, "image/png");
      await prisma.paymentProof.create({
        data: {
          paymentId: reservation.payments[0]!.id,
          storageKey: key,
          fileName: "comprobante-transferencia.png",
          mimeType: "image/png",
          sizeBytes: proofPng.byteLength,
          sha256: createHash("sha256").update(`${reservation.id}`).digest("hex"),
          declaredAmount: centsToDecimalString(quote.total),
        },
      });
    }
  }

  // A welcome note in the bell.
  await prisma.notification.create({
    data: {
      channel: "IN_APP",
      template: "ADMIN_NEW_PROOF",
      userId: adminUser.id,
      status: "SENT",
      sentAt: new Date(),
      payload: { code: "RMS-DEMO01", propertyTitle: "Departamento Costanera", link: "/admin/pagos" },
    },
  });

  console.log(`✔ Demo data: ${PROPERTIES.length} properties, ${plans.length} reservations, ${GUESTS.length} guests.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

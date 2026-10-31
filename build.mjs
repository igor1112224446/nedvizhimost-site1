// Сборка сайта-каталога «Недвижимость Сербии: покупка и аренда».
// Читает data/site.json, data/listings.json и папку photos/, пишет готовый сайт в dist/.
// Запуск: node build.mjs  (Node 18+, без зависимостей)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FAQ, DISTRICT_TEXT } from './content.mjs';
import { SERVICES, SERVICE_ICON } from './services.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'dist');
const read = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch (e) { return d; } };

const SITE = {
  name: 'Недвижимость Сербии: покупка и аренда',
  url: '',
  tg: 'Rentch_srb',
  phone: '+381 61 215 98 64',
  whatsapp: '+381612159864',
  channel: 'rentch_serbia',
  brand: 'Maxis Group',
  ...read('data/site.json', {}),
};
// Данные агентства для проверяющих органов (Закон о посредовании в прометe и закупе непокретности, ст. 18).
// Можно переопределить в data/site.json ключом "legal": { ... }
SITE.legal = {
  company: 'Maxis Group d.o.o. Beograd',
  address: 'Hercegovačka 15/303, 11000 Beograd',
  pib: '112901267',
  mb: '',
  registry: '1850',
  agentLicense: '5744',
  agentName: '',
  director: '',
  insurance: '',
  commissionRent: '50% od iznosa mesečne zakupnine',
  commissionSale: '2% od kupoprodajne cene',
  ...(SITE.legal || {}),
};
const L = SITE.legal;
const BRAND = SITE.brand || 'Maxis Group';
// Короткая строка, обязательная в каждом объявлении: пословно име и номер в Регистре посредников
const legalLine = `${L.company}, upisan u Registar posrednika pod brojem ${L.registry}`;
// Основной домен. Технический адрес *.workers.dev никогда не используется в canonical, og:url, sitemap и ссылках:
// иначе Google может проиндексировать его вместо maxisgroup-serbia.com.
const CANONICAL = 'https://maxisgroup-serbia.com';
{
  const u = String(process.env.SITE_URL || SITE.url || '').trim().replace(/\/+$/, '');
  SITE.url = !u || /workers\.dev|localhost|127\.0\.0\.1/i.test(u) ? CANONICAL : u.replace(/^http:\/\//, 'https://').replace('://www.', '://');
}
SITE.tg = String(SITE.tg || '').replace(/^@/, '');
SITE.channel = String(SITE.channel || '').replace(/^@/, '');
// Все 17 городских общин Белграда: в фильтрах показываются всегда
const BELGRADE = [
  ['barajevo', 'Бараево'], ['vozdovac', 'Вождовац'], ['vracar', 'Врачар'], ['grocka', 'Гроцка'], ['zvezdara', 'Звездара'],
  ['zemun', 'Земун'], ['lazarevac', 'Лазаревац'], ['mladenovac', 'Младеновац'], ['novi-beograd', 'Новый Белград'],
  ['obrenovac', 'Обреновац'], ['palilula', 'Палилула'], ['rakovica', 'Раковица'], ['savski-venac', 'Савски-Венац'],
  ['sopot', 'Сопот'], ['stari-grad', 'Старый город'], ['surcin', 'Сурчин'], ['cukarica', 'Чукарица'],
].map(([slug, name]) => ({ slug, name }));
const BG_NAME = Object.fromEntries(BELGRADE.map((d) => [d.slug, d.name]));
// «opstina-zemun», «zemun-polje», «gradska-opstina-zemun» → «zemun»: одна община — одна строка в фильтре
function normDistrict(raw) {
  const base = String(raw || '').toLowerCase().replace(/(^|-)(gradska-)?opstina(-|$)/g, '-').replace(/^-+|-+$/g, '');
  const match = (ds) => BELGRADE.find((d) => ds === d.slug || ds.startsWith(d.slug + '-') || ds.endsWith('-' + d.slug) || ds.includes('-' + d.slug + '-'));
  const hit = match(base) || match(base.replace(/(^|-)beograd$/, '').replace(/^-+|-+$/g, ''));
  return hit ? hit.slug : base.replace(/(^|-)beograd$/, '').replace(/^-+|-+$/g, '') || base;
}
// Мусор вместо названия микрорайона: подписи карты (атрибуция OpenStreetMap / Leaflet), служебные фразы KP.
// Проверяем и латиницу, и транслит на кириллицу («© ОпенСтреетМап цонтрибуторс»).
const JUNK_PLACE = /©|\(c\)|openstreet|опенст|contributor|цонтриб|контриб|leaflet|леафлет|mapbox|google|pogledajte|okolini|nekretnine u|погледа|околин|\bmapa\b/i;
// «Сурчин (mesto)», «Бараево (naselje)» → «Сурчин», «Бараево»
const PAREN_JUNK = /\s*\((?:mesto|место|naselje|насеље|населье|selo|село|grad|град|opština|opstina|општина|општина|gm|go)\)/gi;
const clean = (v) => String(v || '').replace(PAREN_JUNK, '').replace(/\s{2,}/g, ' ').trim();
const OLD_SLUG = {}; // id -> прежний адрес страницы, чтобы старые ссылки вели на новые (301 в worker.js)

function sanitizeListing(l) {
  const ds = normDistrict(l.districtSlug);
  const district = BG_NAME[ds] || clean(String(l.district || '').replace(/^(Општина|Opština|Община|Gradska opština)\s+/i, ''));
  const city = clean(l.city) || 'Белград';
  const rawLoc = String(l.location || '');
  let location = JUNK_PLACE.test(rawLoc) ? '' : clean(rawLoc);
  if (location && location.toLowerCase() === district.toLowerCase()) location = '';
  const street = JUNK_PLACE.test(l.street || '') ? '' : clean(l.street);
  const fixText = (t) => {
    let x = String(t || '');
    if (rawLoc && rawLoc !== location) {
      const re = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // «в районе ЛОК (Район, Белград)» → «в районе Район» или «в районе НовыйЛок (Район, Белград)»
      x = x.replace(new RegExp(`в районе ${re(rawLoc)}( \\([^)]*\\))?`, 'g'), location ? `в районе ${location}$1` : `в районе ${district}`);
      x = x.replace(new RegExp(`,\\s*${re(rawLoc)}(?=,|$)`, 'g'), location ? `, ${location}` : '');
      x = x.split(rawLoc).join(location);
    }
    x = x.replace(PAREN_JUNK, '');
    // «Сурчин, Сурчин» и «в районе Сурчин (Сурчин, Белград)» → без повтора
    if (district) {
      const d = district.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      x = x.replace(new RegExp(`${d}, ${d}(?=$|[,.])`, 'g'), district)
        .replace(new RegExp(`в районе ${d} \\(${d}, [^)]*\\)`, 'g'), `в районе ${district}`);
    }
    return x.replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
  };
  // адрес страницы: убираем «openstreetmap-contributors», «-mesto» и т.п.
  let slug = String(l.slug)
    .replace(/-?(?:c-)?openstreetmap-contributors/, ds ? `-${ds}` : '')
    .replace(/-(?:mesto|naselje|selo)(?=-|$)/g, '')
    .replace(/-{2,}/g, '-').replace(/-$/, '');
  // «…-surcin-surcin» → «…-surcin»
  slug = slug.replace(/(-[a-z0-9]+)\1$/, '$1');
  if (slug !== l.slug) OLD_SLUG[l.id] = l.slug;
  return {
    ...l, slug, city, district, districtSlug: ds, location, street,
    title: fixText(l.title), text: fixText(l.text),
  };
}
const LISTINGS = read('data/listings.json', []).filter((l) => l && l.id && l.slug)
  .map(sanitizeListing)
  .sort((a, b) => String(b.added).localeCompare(String(a.added)) || String(b.updated).localeCompare(String(a.updated)));
const TODAY = new Date().toISOString().slice(0, 10);
// Отзывы клиентов: data/reviews.json пишет расширение (вкладка «Сайт» → «Отзывы»)
const REVIEWS = read('data/reviews.json', []).filter((r) => r && r.name && r.text);

// Версия файлов оформления: меняется при каждом их изменении, поэтому браузер не покажет старый дизайн из кэша
const ver = (f) => { try { return crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, 'assets', f))).digest('hex').slice(0, 8); } catch (e) { return TODAY; } };
const V = { css: ver('site.css'), js: ver('site.js') };

// Курсы валют: при каждой сборке берутся свежие, при ошибке — из data/site.json или запасные.
// Цены в базе хранятся в евро, рубли и динары считаются по курсу.
async function loadRates() {
  const manual = SITE.rates || {};
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://open.er-api.com/v6/latest/EUR', { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    if (j.result === 'success' && j.rates?.RSD && j.rates?.RUB) {
      return { RSD: +j.rates.RSD.toFixed(2), RUB: +j.rates.RUB.toFixed(2), date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10), ...manual };
    }
  } catch (e) { console.warn('Курсы валют не загрузились, беру сохранённые:', e.message); }
  return { RSD: 117.2, RUB: 95, date: TODAY, ...manual };
}
const RATES = await loadRates();
const rateDate = RATES.date.split('-').reverse().join('.');
const NEW_SINCE = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

// ---------- помощники ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (p) => (SITE.url ? SITE.url + p : p);
const nb = (n) => Number(n).toLocaleString('ru-RU').replace(/[,\s\u202f]/g, '\u00a0');
const money = (n) => (n ? `${nb(n)}\u00a0€` : 'Цена по запросу');
// Цена в разметке: евро в атрибуте, скрипт пересчитывает в выбранную валюту
const price = (n, suffix = '') => (n ? `<span class="pr" data-eur="${Math.round(n)}"${suffix ? ` data-suf="${suffix}"` : ''}>${nb(Math.round(n))}\u00a0€${suffix}</span>` : 'Цена по запросу');
const plural = (n, [one, few, many]) => {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};
const objects = (n) => `${n}\u00a0${plural(n, ['объект', 'объекта', 'объектов'])}`;
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : '');
const waDigits = String(SITE.whatsapp || '').replace(/[^\d]/g, '');
const telHref = 'tel:' + String(SITE.phone || '').replace(/[^\d+]/g, '');
const DEAL = {
  rent: { path: 'arenda', name: 'Снять', h1: 'Аренда квартир и домов в Белграде', lead: 'Квартиры и дома от собственников. Отвезём на просмотры отобранных вариантов и поможем с белым картоном.', per: ' / мес' },
  sale: { path: 'prodazha', name: 'Купить', h1: 'Квартиры и дома в Белграде на продажу', lead: 'Квартиры и дома от собственников. Проверим документы и сопроводим сделку от просмотра до регистрации права.', per: '' },
};
const photo = (l, i = 1) => `/photos/${l.id}/${i}.jpg`;
const placeLine = (l) => [l.location, l.district].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
const fact = (l, k) => (l.facts || []).find((f) => f[0] === k)?.[1] || '';
const roomsKey = (l) => (l.type === 'house' ? 'house' : !l.rooms || l.rooms <= 0.5 ? '0' : l.rooms >= 4 ? '4' : String(Math.round(l.rooms * 2) / 2));
const ROOMS = [['0', 'Студия'], ['1', '1'], ['1.5', '1,5'], ['2', '2'], ['2.5', '2,5'], ['3', '3'], ['3.5', '3,5'], ['4', '4+'], ['house', 'Дом']];
const furnKey = (l) => { const f = fact(l, 'Мебель'); return /частично/.test(f) ? 'part' : /без/.test(f) ? 'none' : /с мебелью|меблирован/.test(f) ? 'full' : ''; };
const floorNum = (l) => { const v = fact(l, 'Этаж'); const m = v.match(/^(\d+)/); return m ? +m[1] : (v ? 0 : -1); };
const floorsNum = (l) => { const m = fact(l, 'Этаж').match(/из (\d+)/); return m ? +m[1] : 0; };
const FEATS = [['терраса', 'Терраса или балкон'], ['лифт', 'Лифт'], ['парковка', 'Парковка или гараж'], ['кондиционер', 'Кондиционер'], ['можно с животными', 'Можно с животными'], ['интернет', 'Интернет']];
// Разделы продажи
const catOf = (l) => l.cat || (l.type === 'house' ? 'house' : 'flat');
const CAT_ICON = {
  flat: '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M10 30v-8a4 4 0 0 1 4-4h36a4 4 0 0 1 4 4v8M6 30h52v8H6zM10 38v4M54 38v4M20 18v-6h24v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  new: '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M8 44h48M14 44V18h18v26M32 44V10h16v34M18 24h4M24 24h4M18 30h4M24 30h4M18 36h4M24 36h4M36 16h4M42 16h2M36 22h4M42 22h2M36 28h4M42 28h2M36 34h4M42 34h2M52 44V4M52 4H38M52 4l6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  house: '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M4 44h56M12 44V24L32 8l20 16v20M26 44V32h12v12M16 24h0M44 14V8h4v9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  commercial: '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M8 44h48M10 44V20M54 44V20M8 12h48l-4 8H12zM16 44V28h12v16M34 28h14v10H34z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};
const SALE_CATS = [
  { key: 'flat', slug: 'kvartiry', name: 'Готовые квартиры', h1: 'Готовые квартиры в Белграде на продажу', lead: 'Квартиры на вторичном рынке от собственников.', test: (l) => catOf(l) === 'flat' },
  { key: 'new', slug: 'novostrojki', name: 'Новостройки', h1: 'Новостройки в Белграде', lead: 'Квартиры в домах, которые строятся или только что сданы.', test: (l) => catOf(l) === 'new' },
  { key: 'house', slug: 'doma-i-uchastki', name: 'Дома и участки', h1: 'Дома и участки в Белграде на продажу', lead: 'Дома, части домов и земельные участки от собственников.', test: (l) => ['house', 'land'].includes(catOf(l)) },
  { key: 'commercial', slug: 'kommercheskaya', name: 'Коммерческая недвижимость', h1: 'Коммерческая недвижимость в Белграде', lead: 'Офисы, магазины, склады и помещения под бизнес.', test: (l) => catOf(l) === 'commercial' },
];
function catTiles(current) {
  const sale = LISTINGS.filter((l) => l.deal === 'sale');
  return `<div class="cats">${SALE_CATS.map((c) => {
    const n = sale.filter(c.test).length;
    return `<a class="cat${current === c.key ? ' is-current' : ''}" href="/prodazha/${c.slug}/"${current === c.key ? ' aria-current="page"' : ''}><span class="cat-name">${c.name}</span><span class="cat-n">${n ? objects(n) : 'скоро'}</span><span class="cat-ico">${CAT_ICON[c.key]}</span></a>`;
  }).join('')}</div>`;
}

const featKeys = (l) => {
  const f = l.features || [];
  return FEATS.map(([k]) => k).filter((k) => f.includes(k) || (k === 'терраса' && f.some((x) => /балкон|лоджия/.test(x))) || (k === 'парковка' && f.includes('гараж')));
};
const roomsLabel = (l) => (l.type === 'house' ? 'Дом' : !l.rooms || l.rooms <= 0.5 ? 'Студия' : `${String(l.rooms).replace('.', ',')}\u00a0комн.`);
const heading = (l) => `${cap(l.kind)}${l.area ? `, ${l.area}\u00a0м²` : ''}`;
const perM2 = (l) => (l.deal === 'sale' && l.price && l.area ? price(l.price / l.area, '/м²') : '');
const floorText = (l) => { const v = fact(l, 'Этаж'); return v ? v.replace(/^(.+?)( из \d+)?$/, '$1 этаж$2') : ''; };
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const ruDate = (iso) => { const [y, m, d] = String(iso || '').split('-').map(Number); return y && m && d ? `${d} ${RU_MONTHS[m - 1]} ${y}` : ''; };
const isNew = (l) => String(l.added) >= NEW_SINCE;
const ICON = {
  heart: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tg: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M21 4L3 11l6 2 2 6 3-4 5 4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  wa: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z" fill="currentColor"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  map: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="10" r="2" fill="currentColor"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.5"/></svg>',
};

const logoMark = (inv = false) => `<a class="logo${inv ? ' logo-inv' : ''}" href="/" aria-label="${esc(BRAND)}, на главную">
  <img class="logo-ico logo-ico-dark" src="/assets/maxis-icon-navy.png" alt="" width="40" height="40">
  <img class="logo-ico logo-ico-light" src="/assets/maxis-icon-white.png" alt="" width="40" height="40">
  <span class="logo-txt"><span class="logo-name">${esc(BRAND)}</span><span class="logo-sub">Агентство недвижимости</span></span>
</a>`;

function write(rel, html) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---------- группировки ----------
const byDeal = { rent: LISTINGS.filter((l) => l.deal === 'rent'), sale: LISTINGS.filter((l) => l.deal === 'sale') };
function districtsOf(list) {
  const m = new Map();
  for (const l of list) {
    if (!l.districtSlug) continue;
    const d = m.get(l.districtSlug) || { slug: l.districtSlug, name: l.district, items: [] };
    d.items.push(l);
    m.set(l.districtSlug, d);
  }
  return [...m.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'ru'));
}
const ALL_DISTRICTS = districtsOf(LISTINGS);
const minPrice = (list) => list.filter((l) => l.price).reduce((m, l) => Math.min(m, l.price), Infinity);

// Тематические подборки: страница создаётся, только если в ней есть объекты
const COLLECTIONS_OFF = [
  { slug: 'arenda-s-mebelyu', title: 'Квартиры с мебелью в аренду', short: 'С мебелью', test: (l) => l.deal === 'rent' && l.type !== 'house' && /с мебелью/.test(fact(l, 'Мебель')) },
  { slug: 'arenda-do-500-evro', title: 'Аренда до 500 € в месяц', short: 'До 500 € в месяц', test: (l) => l.deal === 'rent' && l.price && l.price <= 500 },
  { slug: 's-terrasoj', title: 'Квартиры с террасой', short: 'С террасой', test: (l) => (l.features || []).includes('терраса') },
  { slug: 'novostrojki', title: 'Квартиры в новостройках', short: 'Новостройки', test: (l) => fact(l, 'Дом') === 'новостройка' },
  { slug: 'mozhno-s-zhivotnymi', title: 'Можно с животными', short: 'Можно с животными', test: (l) => (l.features || []).includes('можно с животными') },
  { slug: 'studii', title: 'Студии в Белграде', short: 'Студии', test: (l) => l.type !== 'house' && (!l.rooms || l.rooms <= 0.5) },
  { slug: 'doma', title: 'Дома в Белграде', short: 'Дома', test: (l) => l.type === 'house' },
].map((c) => ({ ...c, items: LISTINGS.filter(c.test) })).filter((c) => c.items.length);
// Подборки отключены: их заменила карта на главной
const COLLECTIONS = [];

// Выпадающее меню «Купить» / «Снять»: районы и подборки
function mega(key, nav) {
  const d = DEAL[key];
  const dists = districtsOf(byDeal[key]).slice(0, 10);
  const cols = COLLECTIONS.filter((c) => c.items.some((l) => l.deal === key));
  const types = key === 'sale'
    ? SALE_CATS.map((c) => [c.name, `/prodazha/${c.slug}/`])
    : [['Квартиры', `/${d.path}/?type=apartment`], ...(byDeal[key].some((l) => l.type === 'house') ? [['Дома', `/${d.path}/?type=house`]] : [])];
  return `<div class="mega-item">
    <a href="/${d.path}/"${nav === key ? ' aria-current="page"' : ''}>${d.name}</a>
    <div class="mega">
      <div class="wrap mega-row">
        <div><p class="mega-h">${key === 'rent' ? 'Аренда' : 'Покупка'}</p><ul>${types.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('')}<li><a href="/${d.path}/?view=map">На карте</a></li></ul></div>
        ${dists.length ? `<div><p class="mega-h">Районы</p><ul class="mega-cols">${dists.map((x) => `<li><a href="/${d.path}/${x.slug}/">${esc(x.name)}</a></li>`).join('')}</ul></div>` : ''}
        ${cols.length ? `<div><p class="mega-h">Подборки</p><ul>${cols.map((c) => `<li><a href="/podborki/${c.slug}/">${esc(c.short)}</a></li>`).join('')}</ul></div>` : ''}
        <a class="mega-card" href="/#podbor"><span class="mega-h">Подбор по запросу</span><span class="mega-card-t">Расскажите, что ищете, — соберём подборку за 15 минут</span><span class="link-arrow">Оставить запрос</span></a>
      </div>
    </div>
  </div>`;
}

// ---------- каркас страницы ----------
function page({ title, desc, url, image, jsonld = [], body, nav, head = '', overlay = false }) {
  const canonical = abs(url);
  const link = (key, href, label) => `<a href="${href}"${nav === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="ru" data-rates='${JSON.stringify({ EUR: 1, RSD: RATES.RSD, RUB: RATES.RUB })}'>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(abs(image))}">\n<meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">
<link rel="stylesheet" href="/assets/site.css?v=${V.css}">
${head}
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body${overlay ? ' class="has-hero"' : ''}>
<a class="skip" href="#main">К содержанию</a>
<header class="hdr">
  <div class="wrap hdr-row">
    ${logoMark()}
    <nav class="nav" aria-label="Разделы">
      ${mega('sale', nav)}
      ${mega('rent', nav)}
      ${link('services', '/uslugi/', 'Услуги')}
      ${link('map', '/karta/', 'Карта')}
      ${link('faq', '/voprosy/', 'Вопросы')}
      ${link('contacts', '/kontakty/', 'Контакты')}
    </nav>
    <div class="hdr-actions">
      <div class="cur" role="group" aria-label="Валюта">
        <button type="button" data-cur="EUR" aria-pressed="true">€</button>
        <button type="button" data-cur="RSD" aria-pressed="false">дин</button>
        <button type="button" data-cur="RUB" aria-pressed="false">₽</button>
      </div>
      <a class="fav-link" href="/izbrannoe/" aria-label="Избранное">${ICON.heart}<span data-fav-count hidden></span></a>
      ${SITE.phone ? `<a class="hdr-phone" href="${esc(telHref)}">${esc(SITE.phone)}</a>` : ''}
      <a class="icon-btn" href="https://t.me/${esc(SITE.tg)}" rel="noopener" aria-label="Telegram">${ICON.tg}</a>
      ${waDigits ? `<a class="icon-btn" href="https://wa.me/${waDigits}" rel="noopener" aria-label="WhatsApp">${ICON.wa}</a>` : ''}
      <a class="btn btn-dark hdr-cta" href="/#podbor">Подобрать</a>
      <details class="burger">
        <summary aria-label="Меню">${ICON.menu}</summary>
        <div class="burger-panel">
          <a href="/prodazha/">Купить</a>
          <a href="/arenda/">Снять</a>
          <a href="/uslugi/">Услуги</a>
          <a href="/karta/">Карта</a>
          <a href="/voprosy/">Вопросы и ответы</a>
          <a href="/o-kompanii/">О компании</a>
          ${REVIEWS.length ? '<a href="/otzyvy/">Отзывы</a>' : ''}
          <a href="/izbrannoe/">Избранное</a>
          <a href="/kontakty/">Контакты</a>
          ${SITE.phone ? `<a href="${esc(telHref)}">${esc(SITE.phone)}</a>` : ''}
        </div>
      </details>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
${footer()}
<script src="/assets/site.js?v=${V.js}" defer></script>
</body>
</html>`;
}

function footer() {
  const col = (title, links) => (links.length ? `<div class="ftr-col"><p class="ftr-h">${title}</p><ul>${links.join('')}</ul></div>` : '');
  const dl = (key) => districtsOf(byDeal[key]).slice(0, 12).map((d) => `<li><a href="/${DEAL[key].path}/${d.slug}/">${esc(d.name)}</a></li>`);
  return `<footer class="ftr">
  <div class="wrap">
    <div class="ftr-top">
      <a class="ftr-logo" href="/" aria-label="${esc(BRAND)}, на главную"><img src="/assets/maxis-logo-white.png" alt="${esc(BRAND)} DOO" width="180" height="142" loading="lazy"></a>
      <div class="ftr-contacts">
        ${SITE.phone ? `<a class="ftr-phone" href="${esc(telHref)}">${esc(SITE.phone)}</a>` : ''}
        <div class="ftr-msg">
          <a href="https://t.me/${esc(SITE.tg)}" rel="noopener">Telegram</a>
          ${waDigits ? `<a href="https://wa.me/${waDigits}" rel="noopener">WhatsApp</a>` : ''}
          ${SITE.channel ? `<a href="https://t.me/${esc(SITE.channel)}" rel="noopener">Канал с новыми объектами</a>` : ''}
        </div>
      </div>
    </div>
    <div class="ftr-cols">
      ${col('Купить', [`<li><a href="/prodazha/">Все объекты</a></li>`, ...dl('sale')])}
      ${col('Снять', [`<li><a href="/arenda/">Все объекты</a></li>`, ...dl('rent')])}
      ${col('Услуги', SERVICES.map((x) => `<li><a href="/uslugi/${x.slug}/">${esc(x.short || x.title)}</a></li>`))}
      ${col('Подборки', COLLECTIONS.map((c) => `<li><a href="/podborki/${c.slug}/">${esc(c.short)}</a></li>`))}
      ${col('Агентство', ['<li><a href="/o-kompanii/">О компании и лицензия</a></li>', '<li><a href="/o-kompanii/#opsti-uslovi">Общие условия работы</a></li>', '<li><a href="/kontakty/">Контакты</a></li>', '<li><a href="/izbrannoe/">Избранное</a></li>', '<li><a href="/#podbor">Подбор по запросу</a></li>', '<li><a href="/karta/">Карта объектов</a></li>', '<li><a href="/voprosy/">Вопросы и ответы</a></li>', ...(REVIEWS.length ? ['<li><a href="/otzyvy/">Отзывы</a></li>'] : [])])}
    </div>
    <div class="ftr-legal">
      <p><b>${esc(L.company)}</b> · ${esc(L.address)}${L.pib ? ` · PIB ${esc(L.pib)}` : ''}${L.mb ? ` · MB ${esc(L.mb)}` : ''}</p>
      <p>Посредник в обороте и аренде недвижимости, внесён в Реестр посредников (Registar posrednika) под номером <b>${esc(L.registry)}</b>.${L.agentLicense ? ` Лицензированный агент: лицензия № ${esc(L.agentLicense)}${L.agentName ? `, ${esc(L.agentName)}` : ''}.` : ''} <a href="/o-kompanii/">Правовая информация</a></p>
      <p lang="sr">Posrednik u prometu i zakupu nepokretnosti upisan u Registar posrednika pod brojem ${esc(L.registry)}.${L.agentLicense ? ` Broj licence posrednika: ${esc(L.agentLicense)}.` : ''}</p>
    </div>
    <div class="ftr-bottom">
      <p>Помогаем с белым картоном, регистрацией, открытием счёта в банке и ВНЖ.</p>
      <p>Информация на сайте не является публичной офертой. Цены и наличие уточняйте у агента.</p>
      <p>Цены указаны в евро. Курс для пересчёта на ${rateDate}: 1 € = ${String(RATES.RSD).replace('.', ',')} дин. = ${String(RATES.RUB).replace('.', ',')} ₽.</p>
    </div>
  </div>
</footer>`;
}

// ---------- карточка ----------
function card(l, eager = false) {
  const n = Math.min(l.photos || 0, 15);
  const badges = [isNew(l) ? 'Новое' : '', (l.features || []).includes('терраса') ? 'Терраса' : ''].filter(Boolean).slice(0, 2);
  const url = `/obekt/${l.slug}/`;
  const text = (l.text || '').replace(/^(Сдаётся|Продаётся)[^.]*\.\s*/, '');
  return `<article class="card" data-id="${esc(l.id)}" data-deal="${l.deal}" data-district="${esc(l.districtSlug)}" data-rooms="${roomsKey(l)}" data-price="${l.price || 0}" data-area="${l.area || 0}" data-added="${esc(l.added)}" data-type="${l.type}" data-furn="${furnKey(l)}" data-floor="${floorNum(l)}" data-floors="${floorsNum(l)}" data-feat="${esc(featKeys(l).join('|'))}">
  <div class="slider" data-slider>
    <a class="slider-track" href="${url}" tabindex="-1">
      ${Array.from({ length: n || 1 }, (_, i) => `<img src="${photo(l, i + 1)}" alt="${esc(heading(l))}, ${esc(placeLine(l))}${i ? `, фото ${i + 1}` : ''}" width="640" height="480" ${eager && !i ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`).join('')}
    </a>
    ${n > 1 ? `<button class="sl-btn sl-prev" type="button" aria-label="Предыдущее фото">${ICON.prev}</button><button class="sl-btn sl-next" type="button" aria-label="Следующее фото">${ICON.next}</button><span class="sl-count" aria-hidden="true">1 / ${n}</span>` : ''}
    ${badges.length ? `<span class="badges">${badges.map((b) => `<span class="badge">${b}</span>`).join('')}</span>` : ''}
    <button class="fav" type="button" data-fav="${esc(l.id)}" aria-label="В избранное" aria-pressed="false">${ICON.heart}</button>
  </div>
  <div class="card-main">
    <p class="card-place">${esc(placeLine(l))}</p>
    <h3 class="card-title"><a href="${url}">${esc(heading(l))}</a></h3>
    <p class="card-text">${esc(text)}</p>
    <dl class="card-facts">
      ${l.area ? `<div><dt>Площадь</dt><dd>${l.area}\u00a0м²</dd></div>` : ''}
      <div><dt>Комнат</dt><dd>${esc(roomsLabel(l))}</dd></div>
      ${fact(l, 'Этаж') ? `<div><dt>Этаж</dt><dd>${esc(fact(l, 'Этаж'))}</dd></div>` : ''}
      ${fact(l, 'Мебель') ? `<div><dt>Мебель</dt><dd>${esc(fact(l, 'Мебель'))}</dd></div>` : ''}
    </dl>
  </div>
  <div class="card-side">
    <p class="card-price">${price(l.price)}${l.price ? `<small>${DEAL[l.deal].per}</small>` : ''}</p>
    ${perM2(l) ? `<p class="card-m2">${perM2(l)}</p>` : ''}
    <a class="btn btn-line" href="${url}">Подробнее</a>
  </div>
</article>`;
}

const crumbs = (items) => `<nav class="crumbs" aria-label="Навигация"><ol>${items.map(([href, name], i) => (i < items.length - 1 ? `<li><a href="${href}">${esc(name)}</a></li>` : `<li aria-current="page">${esc(name)}</li>`)).join('')}</ol></nav>`;
const crumbsLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([href, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(href) })),
});

// Форма подбора: собирает сообщение и открывает WhatsApp или Telegram
function leadForm(title = 'Подберём жильё под ваш запрос за 15 минут') {
  return `<section class="lead" id="podbor">
  <div class="wrap lead-row">
    <div class="lead-text">
      <h2>${esc(title)}</h2>
      <p>Расскажите, что ищете: район, бюджет, сроки. Пришлём подборку проверенных вариантов от собственников и ответим на вопросы о переезде.</p>
    </div>
    <form class="lead-form" data-lead data-wa="${waDigits}" data-tg="${esc(SITE.tg)}">
      <label class="fld"><span>Имя</span><input name="name" autocomplete="name" required></label>
      <label class="fld"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required></label>
      <label class="fld fld-wide"><span>Что ищете</span><input name="wish" placeholder="Например: 2 комнаты на Врачаре до 800 € в месяц"></label>
      <fieldset class="seg">
        <legend>Где ответить</legend>
        ${waDigits ? '<label><input type="radio" name="via" value="wa" checked><span>WhatsApp</span></label>' : ''}
        <label><input type="radio" name="via" value="tg"${waDigits ? '' : ' checked'}><span>Telegram</span></label>
      </fieldset>
      <button class="btn btn-dark btn-wide" type="submit">Получить подборку</button>
      <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="lead-note" data-lead-note role="status">Заявка придёт агенту сразу, ответим в выбранном мессенджере.</p>
    </form>
  </div>
</section>`;
}

function faqItems(key) { return FAQ.filter((f) => f.tag === key); }
const faqLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
function seoText(key) {
  const items = faqItems(key).slice(0, 5);
  return `<section class="seo">
  <div class="wrap">
    <div class="block-head"><h2>${key === 'sale' ? 'Вопросы о покупке' : 'Вопросы об аренде'}</h2><a class="link-arrow" href="/voprosy/">Все вопросы</a></div>
    <div class="acc">${items.map((f, i) => `<details${i ? '' : ' open'}><summary>${esc(f.q)}${ICON.chevron}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  </div>
</section>`;
}

// Средние цены по объявлениям каталога (медиана, от 2 объявлений в группе)
function priceStats(list, deal) {
  const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  const groups = [
    ['Студии', (l) => roomsKey(l) === '0'],
    ['1–1,5 комнаты', (l) => ['1', '1.5'].includes(roomsKey(l))],
    ['2–2,5 комнаты', (l) => ['2', '2.5'].includes(roomsKey(l))],
    ['3 комнаты и больше', (l) => ['3', '3.5', '4'].includes(roomsKey(l))],
    ['Дома', (l) => l.type === 'house'],
  ];
  const rows = groups.map(([name, test]) => {
    const g = list.filter((l) => l.price && test(l));
    if (g.length < 2) return null;
    const m2 = g.filter((l) => l.area).map((l) => l.price / l.area);
    return [name, g.length, med(g.map((l) => l.price)), m2.length >= 2 ? med(m2) : 0];
  }).filter(Boolean);
  if (!rows.length) return '';
  return `<div class="stats"><table><thead><tr><th>Тип</th><th>Объявлений</th><th>${deal === 'rent' ? 'Средняя аренда в месяц' : 'Средняя цена'}</th>${deal === 'sale' ? '<th>За м²</th>' : ''}</tr></thead>
<tbody>${rows.map(([n, c, p, m]) => `<tr><td>${n}</td><td>${c}</td><td>${price(p)}</td>${deal === 'sale' ? `<td>${m ? price(m, '/м²') : '—'}</td>` : ''}</tr>`).join('')}</tbody></table>
<p class="muted small-note">Медиана по объявлениям в нашем каталоге на ${TODAY.split('-').reverse().join('.')}. Это ориентир, а не рыночная оценка.</p></div>`;
}

function districtAbout(slug, name, list, deal) {
  const text = DISTRICT_TEXT[slug];
  if (!text && !list.length) return '';
  return `<section class="block"><div class="wrap about-district">
  <div><h2>О районе ${esc(name)}</h2>${(text || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  <div>${list.length >= 2 ? `<h3 class="h-small">Цены в районе</h3>${priceStats(list, deal)}` : ''}</div>
</div></section>`;
}

// Каталог: фильтры, сортировка, вид «список / плитка / карта»
function catalog(list, { showDistricts = true, dealSwitch = false } = {}) {
  const count = (slug) => list.filter((l) => l.districtSlug === slug).length;
  const others = districtsOf(list).filter((d) => !BG_NAME[d.slug]);
  return `<div class="catalog" data-catalog>
  <form class="filters" data-filter aria-label="Фильтр объектов">
    ${dealSwitch ? `<div class="seg seg-inline"><label><input type="radio" name="deal" value="" checked><span>Все</span></label><label><input type="radio" name="deal" value="sale"><span>Купить</span></label><label><input type="radio" name="deal" value="rent"><span>Снять</span></label></div>` : ''}
    ${showDistricts ? `<details class="dd"><summary><span data-dd-label="Район">Район</span>${ICON.chevron}</summary><div class="dd-panel dd-list dd-wide">${[...BELGRADE, ...others].map((d) => `<label class="chk"><input type="checkbox" name="district" value="${esc(d.slug)}"><span>${esc(d.name)}</span><em>${count(d.slug)}</em></label>`).join('')}</div></details>` : ''}
    <details class="dd"><summary><span data-dd-label="Комнаты">Комнаты</span>${ICON.chevron}</summary><div class="dd-panel dd-chips">${ROOMS.map(([k, t]) => `<label class="chip"><input type="checkbox" name="rooms" value="${k}"><span>${t}</span></label>`).join('')}</div></details>
    <details class="dd"><summary><span data-dd-label="Цена">Цена</span>${ICON.chevron}</summary><div class="dd-panel dd-range"><label><span>от, <span data-cur-sym>€</span></span><input name="min" inputmode="numeric"></label><label><span>до, <span data-cur-sym>€</span></span><input name="max" inputmode="numeric"></label></div></details>
    <details class="dd"><summary><span data-dd-label="Площадь">Площадь</span>${ICON.chevron}</summary><div class="dd-panel dd-range"><label><span>от, м²</span><input name="amin" inputmode="numeric"></label><label><span>до, м²</span><input name="amax" inputmode="numeric"></label></div></details>
    <details class="dd"><summary><span data-dd-label="Мебель">Мебель</span>${ICON.chevron}</summary><div class="dd-panel dd-list"><label class="chk"><input type="radio" name="furn" value="" checked><span>Не важно</span></label><label class="chk"><input type="radio" name="furn" value="full"><span>С мебелью</span></label><label class="chk"><input type="radio" name="furn" value="part"><span>Частично</span></label><label class="chk"><input type="radio" name="furn" value="none"><span>Без мебели</span></label></div></details>
    <details class="dd"><summary><span data-dd-label="Этаж">Этаж</span>${ICON.chevron}</summary><div class="dd-panel dd-list"><label class="chk"><input type="checkbox" name="notfirst" value="1"><span>Не первый</span></label><label class="chk"><input type="checkbox" name="notlast" value="1"><span>Не последний</span></label></div></details>
    <details class="dd"><summary><span data-dd-label="Удобства">Удобства</span>${ICON.chevron}</summary><div class="dd-panel dd-list">${FEATS.map(([k, t]) => `<label class="chk"><input type="checkbox" name="feat" value="${esc(k)}"><span>${t}</span></label>`).join('')}</div></details>
    <button class="reset" type="reset">Сбросить</button>
  </form>
  <div class="toolbar">
    <p class="found" data-found aria-live="polite">${objects(list.length)}</p>
    <div class="toolbar-right">
      <label class="sort"><span class="vh">Сортировка</span><select data-sort><option value="new">Сначала новые</option><option value="cheap">Сначала дешевле</option><option value="dear">Сначала дороже</option><option value="area">По площади</option></select></label>
      <div class="views" role="group" aria-label="Вид">
        <button type="button" data-view="list" aria-pressed="true" aria-label="Списком">${ICON.list}</button>
        <button type="button" data-view="grid" aria-pressed="false" aria-label="Плиткой">${ICON.grid}</button>
        <button type="button" data-view="map" aria-pressed="false" aria-label="На карте">${ICON.map}</button>
      </div>
    </div>
  </div>
  <div class="map-box" data-map hidden></div>
  <div class="cards" data-cards>${list.map((l, i) => card(l, i < 2)).join('')}</div>
  <p class="empty" data-empty hidden>Под эти условия объектов нет. Измените фильтры или <a href="#podbor">оставьте запрос</a>: подберём вручную.</p>
  <div class="more"><button class="btn btn-line" type="button" data-more hidden>Показать ещё</button></div>
</div>`;
}

// Лёгкие данные для карты, избранного и счётчика на главной
const LITE = LISTINGS.map((l) => ({
  id: l.id, u: `/obekt/${l.slug}/`, t: heading(l), p: l.price || 0, d: l.deal, ds: l.districtSlug, r: roomsKey(l),
  a: l.area || 0, ty: l.type, pl: placeLine(l), n: Math.min(l.photos || 0, 15), rl: roomsLabel(l), fl: fact(l, 'Этаж'), nw: isNew(l) ? 1 : 0, ad: [l.street, l.location, l.district].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', '), g: l.geo ? [l.geo.lat, l.geo.lng] : null, img: l.photos ? photo(l) : '',
}));

// ---------- сборка ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'photos'))) fs.cpSync(path.join(ROOT, 'photos'), path.join(OUT, 'photos'), { recursive: true });
write('data/lite.json', JSON.stringify(LITE));

const sitemap = [];
const addUrl = (url, lastmod) => sitemap.push({ url, lastmod: lastmod || TODAY });

// Главная
const HOME_PAGE = 12;
{
  const heroImg = fs.existsSync(path.join(ROOT, 'assets', 'hero.jpg')) ? '/assets/hero.jpg'
    : (LISTINGS.find((l) => (l.photos || 0) >= 3) ? photo(LISTINGS.find((l) => (l.photos || 0) >= 3)) : '');
  const best = LISTINGS.filter((l) => l.price && (l.photos || 0) >= 2).slice(0, 5);
  const offerCard = (l, big) => `<a class="offer${big ? ' offer-big' : ''}" href="/obekt/${l.slug}/">
    <span class="offer-img"><img src="${photo(l)}" alt="${esc(heading(l))}, ${esc(placeLine(l))}" loading="lazy" width="900" height="675"></span>
    <span class="offer-body">
      <span class="offer-tag">${l.deal === 'rent' ? 'Аренда' : 'Продажа'} · ${esc(l.district || l.city)}</span>
      <span class="offer-title">${esc(heading(l))}</span>
      <span class="offer-price">${price(l.price)}${l.deal === 'rent' ? '<small> / мес</small>' : ''}</span>
      ${big ? `<span class="offer-text">${esc((l.text || '').replace(/^(Сдаётся|Продаётся)[^.]*\.\s*/, '').slice(0, 180))}</span><span class="link-arrow">Смотреть объект</span>` : ''}
    </span>
  </a>`;
  const pick = (key) => {
    const d = DEAL[key];
    const links = [
      [`Все объекты`, `/${d.path}/`, byDeal[key].length],
      ...COLLECTIONS.map((c) => [c.short, `/podborki/${c.slug}/`, c.items.filter((l) => l.deal === key).length]).filter((x) => x[2]),
      ...districtsOf(byDeal[key]).slice(0, 8).map((x) => [x.name, `/${d.path}/${x.slug}/`, x.items.length]),
    ];
    return `<div class="pick-panel" data-tab-panel="${key}"${key === 'sale' ? ' hidden' : ''}>${links.map(([t, h, n]) => `<a href="${h}"><span>${esc(t)}</span><em>${n}</em></a>`).join('')}</div>`;
  };
  const steps = [
    ['Подбор', 'Вы выбираете объекты на сайте или присылаете запрос. Мы связываемся с собственниками и проверяем, что квартира свободна.'],
    ['Просмотры', 'Составляем маршрут и возим на просмотры отобранных вариантов. Переводим и помогаем договориться о цене.'],
    ['Договор', 'Проверяем документы собственника, готовим договор и присутствуем при подписании.'],
    ['Переезд', 'Помогаем с белым картоном, регистрацией, банковским счётом и документами на ВНЖ.'],
  ];
  const body = `
<section class="hero"${heroImg ? ` style="--hero:url('${heroImg}')"` : ''}>
  <div class="wrap hero-in">
    <p class="eyebrow eyebrow-inv">Агентство недвижимости в Белграде</p>
    <h1>${esc(SITE.name)}</h1>
    <p class="hero-lead">Квартиры и дома от собственников с описанием на русском. Подберём, покажем, проверим документы и поможем с переездом.</p>
    <form class="finder" data-search>
      <div class="finder-tabs" role="radiogroup" aria-label="Сделка">
        <label><input type="radio" name="deal" value="rent" checked><span>Снять</span></label>
        <label><input type="radio" name="deal" value="sale"><span>Купить</span></label>
      </div>
      <div class="finder-row">
        <label class="finder-f"><span>Тип</span><select name="type"><option value="">Любой</option><option value="flat">Квартира</option><option value="new">Новостройка</option><option value="house">Дом или участок</option><option value="commercial">Коммерческая</option></select></label>
        <label class="finder-f"><span>Район</span><select name="district"><option value="">Любой</option>${BELGRADE.map((d) => `<option value="${esc(d.slug)}">${esc(d.name)}</option>`).join('')}</select></label>
        <label class="finder-f"><span>Комнат</span><select name="rooms"><option value="">Любое</option>${ROOMS.filter(([k]) => k !== 'house').map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
        <label class="finder-f"><span>Бюджет до, <span data-cur-sym>€</span></span><input name="max" inputmode="numeric" placeholder="Без ограничений"></label>
        <button class="btn btn-dark finder-btn" type="submit">Найти</button>
      </div>
    </form>
  </div>
  <div class="hero-strip">
    <div class="wrap hero-strip-in">
      <span><b>${LISTINGS.length}</b> ${plural(LISTINGS.length, ['объект', 'объекта', 'объектов'])} от собственников</span>
      <span>Описания и сопровождение на русском</span>
    </div>
  </div>
</section>

${LISTINGS.length ? `<section class="block" id="katalog">
  <div class="wrap">
    <div class="block-head"><div><h2>Каталог Белграда</h2><p class="block-sub">Объекты от собственников, новые сверху.</p></div>
      <div class="seg seg-inline home-cat-deal" data-home-cat-deal><label><input type="radio" name="hcdeal" value="rent" checked><span>Снять</span></label><label><input type="radio" name="hcdeal" value="sale"><span>Купить</span></label></div>
    </div>
    <div class="cards cards-grid home-cat" data-home-cat>${byDeal.rent.slice(0, HOME_PAGE).map((l, i) => card(l, i < 4)).join('')}</div>
    <div class="more"><button class="btn btn-line" type="button" data-home-more${byDeal.rent.length > HOME_PAGE ? '' : ' hidden'}>Другие квартиры</button></div>
  </div>
</section>` : ''}

${LISTINGS.some((l) => l.geo) ? `<section class="block" id="karta">
  <div class="wrap">
    <div class="block-head"><div><h2>Все объекты на карте</h2><p class="block-sub">Нажмите на цену, чтобы увидеть адрес и фото квартиры.</p></div><a class="link-arrow" href="/karta/">Открыть большую карту</a></div>
    <div class="seg seg-inline home-map-deal" data-home-map-deal><label><input type="radio" name="hmdeal" value="" checked><span>Все</span></label><label><input type="radio" name="hmdeal" value="rent"><span>Снять</span></label><label><input type="radio" name="hmdeal" value="sale"><span>Купить</span></label></div>
    <div class="map-box home-map" data-home-map></div>
  </div>
</section>` : ''}



<section class="block">
  <div class="wrap">
    <div class="block-head"><div><h2>Наши услуги</h2><p class="block-sub">Помогаем не только с жильём, но и с документами для жизни и бизнеса в Сербии.</p></div><a class="link-arrow" href="/uslugi/">Все услуги</a></div>
    ${serviceTiles()}
  </div>
</section>

<section class="block">
  <div class="wrap">
    <div class="block-head"><h2>Как мы работаем</h2></div>
    <ol class="steps">${steps.map(([t, d], i) => `<li><span class="step-n">${String(i + 1).padStart(2, '0')}</span><span class="step-t">${t}</span><span class="step-d">${d}</span></li>`).join('')}</ol>
  </div>
</section>

${SITE.channel ? `<section class="block">
  <div class="wrap">
    <a class="channel" href="https://t.me/${esc(SITE.channel)}" rel="noopener">
      <span class="channel-text"><span class="eyebrow eyebrow-inv">Telegram-канал</span><span class="channel-t">Новые квартиры каждый день</span><span class="channel-d">Публикуем объекты от собственников раньше, чем они попадают на сайт.</span></span>
      <span class="btn btn-light">@${esc(SITE.channel)}</span>
    </a>
  </div>
</section>` : ''}

${REVIEWS.length ? `<section class="block"><div class="wrap"><div class="block-head"><h2>Отзывы клиентов</h2>${REVIEWS.length > 3 ? '<a class="link-arrow" href="/otzyvy/">Все отзывы</a>' : ''}</div><div class="reviews">${REVIEWS.slice(0, 3).map(reviewCard).join('')}</div></div></section>` : ''}
${leadForm()}
${seoText('rent')}`;
  write('index.html', page({
    title: `${SITE.name} — квартиры и дома в Белграде`,
    desc: `Аренда и покупка квартир и домов в Белграде от собственников: ${objects(LISTINGS.length)} с фото, ценами и описанием на русском. Помощь с белым картоном, счётом в банке и ВНЖ.`,
    url: '/',
    image: heroImg,
    overlay: !!heroImg,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: abs('/'), inLanguage: 'ru' },
      {
        '@context': 'https://schema.org', '@type': 'RealEstateAgent', name: BRAND, legalName: L.company, url: abs('/'),
        logo: abs('/assets/maxis-logo-navy.png'), image: abs('/assets/maxis-logo-navy.png'), taxID: L.pib || undefined,
        telephone: SITE.phone || undefined, areaServed: { '@type': 'City', name: 'Белград' },
        address: { '@type': 'PostalAddress', streetAddress: L.address.split(',')[0], addressLocality: 'Beograd', addressCountry: 'RS' },
        sameAs: [`https://t.me/${SITE.tg}`, SITE.channel ? `https://t.me/${SITE.channel}` : null].filter(Boolean),
      },
    ],
    body,
  }));
  addUrl('/');
}

// Разделы, районы, подборки
function listPage({ url, h1, lead, list, items, nav, seo, showDistricts = true, dealSwitch = false, extra = '', before = '', ld = [], indexEmpty = false }) {
  const min = minPrice(list);
  const intro = list.length
    ? `${lead} ${objects(list.length)}${Number.isFinite(min) ? `, цены от ${money(min)}` : ''}.`
    : `${lead} Сейчас объектов нет: оставьте запрос, и мы подберём варианты вручную.`;
  const introHtml = list.length
    ? `${esc(lead)} ${objects(list.length)}${Number.isFinite(min) ? `, цены от ${price(min)}` : ''}.`
    : esc(intro);
  const body = `
<section class="page-head">
  <div class="wrap">
    ${crumbs(items)}
    <h1>${esc(h1)}</h1>
    <p class="page-lead">${introHtml}</p>
  </div>
</section>
${before}
<section class="block block-tight"><div class="wrap">${list.length ? catalog(list, { showDistricts, dealSwitch }) : ''}</div></section>
${extra}
${leadForm()}
${seo ? seoText(seo) : ''}`;
  write(url.slice(1) + 'index.html', page({
    title: `${h1} — ${objects(list.length)} от собственников`,
    desc: intro,
    url,
    image: list[0] ? photo(list[0]) : '',
    jsonld: [...ld, crumbsLd(items), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: h1,
      itemListElement: list.slice(0, 50).map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/obekt/${l.slug}/`) })),
    }],
    body,
    nav,
    head: list.length || indexEmpty ? '' : '<meta name="robots" content="noindex, follow">',
  }));
  if (list.length || indexEmpty) addUrl(url, list[0]?.updated);
}

for (const key of ['rent', 'sale']) {
  const d = DEAL[key];
  const dists = districtsOf(byDeal[key]);
  const links = dists.length > 1 ? `<section class="block block-tight"><div class="wrap"><h2 class="h-small">${key === 'rent' ? 'Аренда' : 'Продажа'} по районам</h2><p class="tags">${dists.map((x) => `<a href="/${d.path}/${x.slug}/">${esc(x.name)} <em>${x.items.length}</em></a>`).join('')}</p></div></section>` : '';
  const tiles = key === 'sale' ? `<section class="block block-tight"><div class="wrap">${catTiles('')}</div></section>` : '';
  const statsBlock = byDeal[key].length >= 4 ? `<section class="block block-tight"><div class="wrap"><h2 class="h-small">Средние цены ${key === 'rent' ? 'аренды' : 'продажи'} в Белграде</h2>${priceStats(byDeal[key], key)}</div></section>` : '';
  listPage({ url: `/${d.path}/`, h1: d.h1, lead: d.lead, list: byDeal[key], items: [['/', 'Главная'], [`/${d.path}/`, d.name]], nav: key, seo: key, extra: links + statsBlock, before: tiles, ld: [faqLd(faqItems(key).slice(0, 5))] });
  if (key === 'sale') {
    for (const c of SALE_CATS) {
      listPage({
        url: `/prodazha/${c.slug}/`, h1: c.h1, lead: c.lead, list: byDeal.sale.filter(c.test),
        items: [['/', 'Главная'], ['/prodazha/', d.name], [`/prodazha/${c.slug}/`, c.name]],
        nav: key, seo: key, before: `<section class="block block-tight"><div class="wrap">${catTiles(c.key)}</div></section>`,
      });
    }
  }
  const distPages = key === 'rent'
    ? [...BELGRADE.map((b) => dists.find((x) => x.slug === b.slug) || { ...b, items: [] }), ...dists.filter((x) => !BG_NAME[x.slug])]
    : dists;
  for (const dist of distPages) {
    listPage({
      url: `/${d.path}/${dist.slug}/`,
      h1: `${key === 'rent' ? 'Аренда квартир' : 'Продажа квартир и домов'} в районе ${dist.name}`,
      lead: `${key === 'rent' ? 'Квартиры и дома в аренду' : 'Квартиры и дома на продажу'} в районе ${dist.name}, Белград.`,
      list: dist.items,
      items: [['/', 'Главная'], [`/${d.path}/`, d.name], [`/${d.path}/${dist.slug}/`, dist.name]],
      nav: key, seo: key, showDistricts: false, indexEmpty: !!DISTRICT_TEXT[dist.slug],
      extra: districtAbout(dist.slug, dist.name, dist.items, key),
    });
  }
}
for (const c of COLLECTIONS) {
  const deals = new Set(c.items.map((l) => l.deal));
  listPage({
    url: `/podborki/${c.slug}/`, h1: c.title, lead: 'Подборка объектов от собственников в Белграде.', list: c.items,
    items: [['/', 'Главная'], ['/#podborki', 'Подборки'], [`/podborki/${c.slug}/`, c.short]],
    nav: 'col', seo: deals.size === 1 ? [...deals][0] : 'rent', dealSwitch: deals.size > 1,
  });
}

// Объекты
for (const l of LISTINGS) {
  const d = DEAL[l.deal];
  const url = `/obekt/${l.slug}/`;
  const items = [['/', 'Главная'], [`/${d.path}/`, d.name]];
  if (l.districtSlug) items.push([`/${d.path}/${l.districtSlug}/`, l.district]);
  items.push([url, heading(l)]);
  const photos = Array.from({ length: l.photos || 0 }, (_, i) => photo(l, i + 1));
  const similar = LISTINGS.filter((x) => x.id !== l.id && x.deal === l.deal && x.districtSlug === l.districtSlug).slice(0, 3);
  const more = similar.length < 3 ? LISTINGS.filter((x) => x.id !== l.id && x.deal === l.deal && !similar.includes(x)).slice(0, 3 - similar.length) : [];
  const waText = encodeURIComponent(`Здравствуйте. Меня интересует ${l.type === 'house' ? 'этот дом' : 'эта квартира'}: ${abs(url)}`);
  const tgHref = `https://t.me/${SITE.tg}?text=${waText}`;
  const keyFacts = [
    l.area ? ['Площадь', `${l.area}\u00a0м²`] : null,
    ['Комнат', roomsLabel(l)],
    fact(l, 'Этаж') ? ['Этаж', fact(l, 'Этаж')] : null,
    perM2(l) ? ['Цена за м²', perM2(l)] : null,
  ].filter(Boolean);
  const restFacts = (l.facts || []).filter(([k]) => !['Площадь', 'Комнат', 'Этаж', 'Дом'].includes(k));
  const gallery = photos.length ? `<div class="gal gal-${Math.min(photos.length, 5)}" data-gallery='${esc(JSON.stringify(photos))}'>
    ${photos.slice(0, 5).map((p, i) => `<button type="button" class="gal-item${i ? '' : ' gal-main'}" data-open="${i}" aria-label="Открыть фото ${i + 1}"><img src="${p}" alt="${esc(heading(l))}, фото ${i + 1}" width="1200" height="900" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">${i === 4 && photos.length > 5 ? `<span class="gal-more">+${photos.length - 5} фото</span>` : ''}</button>`).join('')}
  </div>` : '';
  const body = `
<section class="page-head page-head-obj">
  <div class="wrap">
    ${crumbs(items)}
    <div class="obj-head">
      <div>
        <p class="eyebrow">${l.deal === 'rent' ? 'Аренда' : 'Продажа'} · ${esc(placeLine(l))}</p>
        <h1>${esc(heading(l))}</h1>
      </div>
      <button class="fav fav-inline" type="button" data-fav="${esc(l.id)}" aria-pressed="false">${ICON.heart}<span>В избранное</span></button>
    </div>
  </div>
</section>
<div class="wrap">
  ${gallery}
  <div class="obj">
    <div class="obj-main">
      <dl class="key-facts">${keyFacts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${k === 'Цена за м²' ? v : esc(v)}</dd></div>`).join('')}</dl>
      <section class="obj-sec">
        <h2>Об объекте</h2>
        ${l.added ? `<p class="obj-date">Опубликовано на сайте ${ruDate(l.added)}${l.updated && l.updated !== l.added ? `, обновлено ${ruDate(l.updated)}` : ''}</p>` : ''}
        <p>${esc(l.text)}</p>
        ${l.originalLang === 'ru' && l.original ? `<p class="obj-desc">${esc(l.original).replace(/\n+/g, '<br>')}</p>` : ''}
        <p class="obj-legal" lang="sr">Oglašivač: ${esc(legalLine)}. Cena: ${esc(money(l.price))}${l.deal === 'rent' && l.price ? ' mesečno' : ''}. Lokacija: ${esc([l.location, l.district, l.city].filter(Boolean).join(', '))}.${l.area ? ` Površina: ${l.area} m².` : ''} Struktura: ${esc(l.type === 'house' ? 'kuća' : !l.rooms || l.rooms <= 0.5 ? 'garsonjera' : `${String(l.rooms).replace('.', ',')}-sobni stan`)}.</p>
        ${restFacts.length ? `<dl class="facts">${restFacts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      </section>
      ${l.features?.length ? `<section class="obj-sec"><h2>Удобства</h2><ul class="feat">${l.features.map((f) => `<li>${esc(cap(f))}</li>`).join('')}</ul></section>` : ''}
      
      ${l.geo ? `<section class="obj-sec"><h2>Расположение</h2><p class="muted">${esc([l.street, l.location, l.district, l.city].filter(Boolean).join(', '))}</p><div class="map-box map-one" data-point="${l.geo.lat},${l.geo.lng}" data-label="${esc(money(l.price))}"></div></section>` : ''}
    </div>
    <aside class="obj-aside">
      <div class="panel">
        <p class="panel-price">${price(l.price)}${l.price ? `<small>${d.per}</small>` : ''}</p>
        ${perM2(l) ? `<p class="muted">${perM2(l)}</p>` : ''}
        <p class="panel-note" data-rate-note hidden>Пересчёт из евро по курсу на ${rateDate}. Цена в договоре — в евро.</p>
        <div class="agent">
          <img class="agent-mark" src="/assets/maxis-icon-navy.png" alt="" width="52" height="52">
          <div><p class="agent-name">${esc(BRAND)}</p>${SITE.phone ? `<a href="${esc(telHref)}">${esc(SITE.phone)}</a>` : ''}</div>
        </div>
        <button class="btn btn-dark btn-wide" type="button" data-open-viewing>Записаться на просмотр</button>
        ${waDigits ? `<a class="btn btn-line btn-wide" href="https://wa.me/${waDigits}?text=${waText}" rel="noopener">${ICON.wa}Написать в WhatsApp</a>` : ''}
        <a class="btn btn-line btn-wide" href="${esc(tgHref)}" rel="noopener" data-tg-text="${esc(decodeURIComponent(waText))}">${ICON.tg}Написать в Telegram</a>
        <p class="panel-note">Номер объекта: <span class="obj-id">${esc(l.id)}</span></p>
        <p class="panel-note panel-legal">Посредник: ${esc(L.company)}, номер в Реестре посредников ${esc(L.registry)}. <a href="/o-kompanii/">Подробнее</a></p>
        ${l.deal === 'rent' ? '<p class="panel-note">Трансфер на просмотры входит в комиссию: 50% от месячной аренды.</p>' : ''}
      </div>
    </aside>
  </div>
</div>
${similar.length + more.length ? `<section class="block"><div class="wrap"><div class="block-head"><h2>${similar.length ? `Ещё в районе ${esc(l.district)}` : 'Похожие объекты'}</h2></div><div class="cards cards-grid">${[...similar, ...more].map((x) => card(x)).join('')}</div></div></section>` : ''}
<div class="mobile-cta"><span class="mobile-price">${price(l.price)}${l.price ? `<small>${d.per}</small>` : ''}</span><button class="btn btn-dark" type="button" data-open-viewing>Записаться</button></div>
<dialog class="modal" data-viewing aria-labelledby="vw-title">
  <form class="modal-form" data-viewing-form>
    <button class="modal-close" type="button" data-close-viewing aria-label="Закрыть">×</button>
    <h2 id="vw-title">Записаться на просмотр</h2>
    <p class="muted">${esc(heading(l))}, ${esc(placeLine(l))}. Перезвоним и согласуем время.</p>
    <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
    <input type="hidden" name="t0"><input type="hidden" name="kind" value="viewing">
    <input type="hidden" name="title" value="${esc(heading(l))}, ${esc(placeLine(l))}"><input type="hidden" name="price" value="${esc(money(l.price))}${l.deal === 'rent' && l.price ? ' в месяц' : ''}"><input type="hidden" name="url" value="${esc(abs(url))}">
    <label class="fld"><span>Имя</span><input name="name" autocomplete="name" required></label>
    <label class="fld"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+381 6… или +7 9…"></label>
    <button class="btn btn-dark btn-wide" type="submit">Записаться</button>
    <p class="lead-note" data-viewing-note role="status"></p>
  </form>
  <div class="modal-done" data-viewing-done hidden><h2>Заявка отправлена</h2><p>Мы свяжемся с вами в ближайшее время, чтобы согласовать время просмотра.</p><button class="btn btn-line" type="button" data-close-viewing>Закрыть</button></div>
</dialog>
<dialog class="lightbox" data-lightbox aria-label="Фото объекта">
  <button class="lb-close" type="button" data-close aria-label="Закрыть">×</button>
  <button class="lb-btn lb-prev" type="button" aria-label="Предыдущее фото">${ICON.prev}</button>
  <img alt="">
  <button class="lb-btn lb-next" type="button" aria-label="Следующее фото">${ICON.next}</button>
  <p class="lb-count"></p>
</dialog>`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'RealEstateListing', name: `${heading(l)}, ${placeLine(l)}`, url: abs(url), datePosted: l.added,
    description: l.text, image: photos.slice(0, 6).map(abs), inLanguage: 'ru',
    provider: { '@type': 'RealEstateAgent', name: BRAND, legalName: L.company, url: abs('/') },
    about: {
      '@type': l.type === 'house' ? 'SingleFamilyResidence' : 'Apartment',
      floorSize: l.area ? { '@type': 'QuantitativeValue', value: l.area, unitCode: 'MTK' } : undefined,
      numberOfRooms: l.type === 'house' ? undefined : l.rooms || undefined,
      address: { '@type': 'PostalAddress', streetAddress: l.street || undefined, addressLocality: l.city, addressRegion: l.district, addressCountry: 'RS' },
      geo: l.geo ? { '@type': 'GeoCoordinates', latitude: l.geo.lat, longitude: l.geo.lng } : undefined,
    },
    offers: l.price ? {
      '@type': 'Offer', price: l.price, priceCurrency: 'EUR', availability: 'https://schema.org/InStock',
      businessFunction: l.deal === 'rent' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell',
    } : undefined,
  };
  write(url.slice(1) + 'index.html', page({
    title: `${heading(l)} ${l.deal === 'rent' ? 'в аренду' : 'на продажу'}, ${placeLine(l)} — ${money(l.price)}${l.deal === 'rent' && l.price ? ' в месяц' : ''}`,
    desc: (l.text || '').slice(0, 160),
    url,
    image: photos[0],
    jsonld: [ld, crumbsLd(items)],
    body,
    nav: l.deal,
  }));
  addUrl(url, l.updated);
}


// Карта всех объектов
write('karta/index.html', page({
  title: `Карта объектов — аренда и продажа квартир в Белграде`,
  desc: `Все объекты на карте Белграда: ${objects(LISTINGS.length)} в аренду и на продажу от собственников. Фильтр по району, комнатам и цене.`,
  url: '/karta/', nav: 'map',
  body: `<section class="map-page" data-bigmap>
  <form class="map-filters" data-map-filter aria-label="Фильтр карты">
    <div class="seg seg-inline"><label><input type="radio" name="deal" value="" checked><span>Все</span></label><label><input type="radio" name="deal" value="rent"><span>Снять</span></label><label><input type="radio" name="deal" value="sale"><span>Купить</span></label></div>
    <label class="mf"><span class="vh">Район</span><select name="district"><option value="">Все районы</option>${BELGRADE.map((d) => `<option value="${d.slug}">${esc(d.name)}</option>`).join('')}</select></label>
    <label class="mf"><span class="vh">Комнаты</span><select name="rooms"><option value="">Любое число комнат</option>${ROOMS.map(([k, t]) => `<option value="${k}">${k === 'house' ? 'Дом' : k === '0' ? 'Студия' : `${t} комн.`}</option>`).join('')}</select></label>
    <label class="mf"><span class="vh">Цена до</span><input name="max" inputmode="numeric" placeholder="Цена до, €" data-cur-ph></label>
    <p class="found" data-map-found aria-live="polite"></p>
  </form>
  <div class="map-split">
    <div class="map-canvas" data-map-canvas></div>
    <aside class="map-list" data-map-list aria-label="Объекты в области карты"></aside>
  </div>
</section>`,
}));
addUrl('/karta/');




// Вопросы и ответы
{
  const groups = [['Аренда', 'rent'], ['Покупка', 'sale'], ['Общие вопросы', 'all']];
  write('voprosy/index.html', page({
    title: 'Вопросы и ответы: аренда и покупка недвижимости в Белграде',
    desc: 'Ответы на частые вопросы о том, как снять или купить квартиру в Белграде иностранцу: депозит, коммунальные платежи, белый картон, налоги, проверка документов, ВНЖ.',
    url: '/voprosy/', nav: 'faq',
    jsonld: [faqLd(FAQ), crumbsLd([['/', 'Главная'], ['/voprosy/', 'Вопросы и ответы']])],
    body: `<section class="page-head"><div class="wrap">${crumbs([['/', 'Главная'], ['/voprosy/', 'Вопросы и ответы']])}<h1>Вопросы и ответы</h1>
<p class="page-lead">Коротко о том, как снять или купить жильё в Белграде. Не нашли ответ — <a href="https://t.me/${esc(SITE.tg)}" rel="noopener">напишите нам</a>.</p></div></section>
${groups.map(([title, tag]) => `<section class="block block-tight"><div class="wrap"><h2 class="h-small">${title}</h2><div class="acc">${FAQ.filter((f) => f.tag === tag).map((f) => `<details><summary>${esc(f.q)}${ICON.chevron}</summary><p>${esc(f.a)}</p></details>`).join('')}</div></div></section>`).join('')}
${leadForm('Остались вопросы? Оставьте заявку')}`,
  }));
  addUrl('/voprosy/');
}

// Отзывы: только настоящие, которые вы добавили в расширении
function reviewCard(r) { return `<figure class="review"><blockquote>${esc(r.text)}</blockquote><figcaption><b>${esc(r.name)}</b>${r.date ? `<span>${esc(r.date)}</span>` : ''}${r.link ? `<a href="${esc(r.link)}" rel="noopener nofollow">Источник</a>` : ''}</figcaption></figure>`; }
if (REVIEWS.length) {
  write('otzyvy/index.html', page({
    title: `Отзывы клиентов — ${SITE.name}`,
    desc: 'Отзывы клиентов, которые сняли или купили жильё в Белграде с нашей помощью.',
    url: '/otzyvy/', nav: 'reviews',
    jsonld: [crumbsLd([['/', 'Главная'], ['/otzyvy/', 'Отзывы']])],
    body: `<section class="page-head"><div class="wrap">${crumbs([['/', 'Главная'], ['/otzyvy/', 'Отзывы']])}<h1>Отзывы клиентов</h1>
<p class="page-lead">Что говорят люди, которые нашли жильё в Белграде вместе с нами.</p></div></section>
<section class="block block-tight"><div class="wrap"><div class="reviews">${REVIEWS.map(reviewCard).join('')}</div>
<p class="review-cta">Работали с нами? <a href="https://t.me/${esc(SITE.tg)}?text=${encodeURIComponent('Здравствуйте! Хочу оставить отзыв: ')}" rel="noopener">Оставьте отзыв в Telegram</a>, и мы опубликуем его здесь.</p></div></section>`,
  }));
  addUrl('/otzyvy/');
}

// Избранное (заполняется скриптом из localStorage)
write('izbrannoe/index.html', page({
  title: 'Избранное', desc: 'Объекты, которые вы сохранили.', url: '/izbrannoe/',
  body: `<section class="page-head"><div class="wrap">${crumbs([['/', 'Главная'], ['/izbrannoe/', 'Избранное']])}<h1>Избранное</h1><p class="page-lead">Объекты, отмеченные сердечком. Список хранится в этом браузере.</p></div></section>
<section class="block block-tight"><div class="wrap"><div class="cards cards-grid" data-favs></div><p class="empty" data-favs-empty hidden>Пока пусто. Нажмите на сердечко у объекта, чтобы сохранить его здесь. <a href="/arenda/">Перейти в каталог</a></p></div></section>`,
}));

// ---------- Наши услуги ----------
function serviceTiles(exclude = '') {
  return `<div class="svc-grid">${SERVICES.filter((x) => x.slug !== exclude).map((x) => `<a class="svc" href="/uslugi/${x.slug}/">
    <span class="svc-ico">${SERVICE_ICON[x.icon] || ''}</span>
    <span class="svc-t">${esc(x.title)}</span>
    <span class="svc-s">${esc(x.sub)}</span>
    <span class="svc-more">Подробнее</span>
  </a>`).join('')}</div>`;
}
function serviceForm(svc) {
  return `<section class="lead" id="konsultaciya">
  <div class="wrap lead-row">
    <div class="lead-text">
      <p class="eyebrow">Бесплатная консультация</p>
      <h2>${svc ? esc(svc.h1) : 'Получите консультацию'}</h2>
      <p>Оставьте имя и телефон: специалист свяжется с вами, разберёт вашу ситуацию и назовёт сроки и стоимость. Консультация ни к чему не обязывает.</p>
    </div>
    <form class="lead-form" data-service-form data-wa="${waDigits}" data-tg="${esc(SITE.tg)}">
      <input type="hidden" name="service" value="${esc(svc ? `${svc.title} ${svc.sub}` : '')}">
      ${svc ? '' : `<label class="fld fld-wide"><span>Услуга</span><select name="service_pick">${SERVICES.map((x) => `<option>${esc(x.title)} ${esc(x.sub)}</option>`).join('')}<option>Другое</option></select></label>`}
      <label class="fld"><span>Имя</span><input name="name" autocomplete="name" required></label>
      <label class="fld"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+381 6… или +7 9…"></label>
      <label class="fld fld-wide"><span>Комментарий</span><input name="comment" placeholder="Например: гражданство, сроки, ваши вопросы"></label>
      <fieldset class="seg">
        <legend>Где ответить</legend>
        ${waDigits ? '<label><input type="radio" name="via" value="wa" checked><span>WhatsApp</span></label>' : ''}
        <label><input type="radio" name="via" value="tg"${waDigits ? '' : ' checked'}><span>Telegram</span></label>
        <label><input type="radio" name="via" value="call"><span>Звонок</span></label>
      </fieldset>
      <button class="btn btn-dark btn-wide" type="submit">Получить консультацию</button>
      <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="lead-note" data-lead-note role="status">Нажимая кнопку, вы соглашаетесь на обработку имени и телефона для ответа на заявку.</p>
    </form>
  </div>
</section>`;
}
{
  const items = [['/', 'Главная'], ['/uslugi/', 'Услуги']];
  write('uslugi/index.html', page({
    title: `Услуги в Сербии: ВНЖ, счёт в банке, открытие DOO и ИП — ${BRAND}`,
    desc: 'Открытие счёта в сербском банке для физических и юридических лиц, ВНЖ и ПМЖ Сербии под ключ, регистрация ИП и DOO, юридический адрес в Белграде. Бесплатная консультация.',
    url: '/uslugi/', nav: 'services',
    jsonld: [crumbsLd(items), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Наши услуги',
      itemListElement: SERVICES.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/uslugi/${x.slug}/`), name: x.h1 })),
    }],
    body: `<section class="page-head"><div class="wrap">${crumbs(items)}<h1>Наши услуги</h1>
<p class="page-lead">Кроме подбора жилья, помогаем с документами для жизни и бизнеса в Сербии: банковские счета, ВНЖ и ПМЖ, регистрация компании. Выберите услугу, чтобы узнать, как всё устроено.</p></div></section>
<section class="block block-tight"><div class="wrap">${serviceTiles()}</div></section>
${serviceForm(null)}`,
  }));
  addUrl('/uslugi/');
  for (const x of SERVICES) {
    const url = `/uslugi/${x.slug}/`;
    const its = [...items, [url, `${x.title} ${x.sub}`]];
    const body = `<section class="page-head"><div class="wrap">${crumbs(its)}
  <div class="svc-head">
    <span class="svc-ico svc-ico-lg">${SERVICE_ICON[x.icon] || ''}</span>
    <div><h1>${esc(x.h1)}</h1><p class="page-lead">${esc(x.lead)}</p>
    <a class="btn btn-dark" href="#konsultaciya">Получить консультацию</a></div>
  </div>
</div></section>
<div class="wrap svc-page">
  <div class="svc-main">
    <section class="obj-sec"><h2>Кому подходит</h2><ul class="svc-list">${x.who.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>
    ${x.grounds ? `<section class="obj-sec"><h2>Основания для ВНЖ</h2><div class="svc-grounds">${x.grounds.map(([t, d]) => `<div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div></section>` : ''}
    <section class="obj-sec"><h2>Как это происходит</h2><ol class="svc-steps">${x.steps.map(([t, d], i) => `<li><span class="step-n">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></li>`).join('')}</ol></section>
    <section class="obj-sec"><h2>Какие документы понадобятся</h2><ul class="svc-list">${x.docs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul><p class="muted">Точный список зависит от вашей ситуации, мы подготовим его на консультации.</p></section>
    <section class="obj-sec"><h2>Сроки</h2><p>${esc(x.terms)}</p></section>
    ${x.faq?.length ? `<section class="obj-sec"><h2>Частые вопросы</h2><div class="acc">${x.faq.map(([q, a], i) => `<details${i ? '' : ' open'}><summary>${esc(q)}${ICON.chevron}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>` : ''}
  </div>
  <aside class="svc-aside"><div class="panel">
    <p class="panel-t">Консультация бесплатно</p>
    <p class="muted">Расскажем, подходит ли вам этот вариант, сколько займёт и сколько будет стоить.</p>
    <a class="btn btn-dark btn-wide" href="#konsultaciya">Оставить заявку</a>
    ${waDigits ? `<a class="btn btn-line btn-wide" href="https://wa.me/${waDigits}?text=${encodeURIComponent(`Здравствуйте! Интересует услуга: ${x.h1}`)}" rel="noopener">${ICON.wa}WhatsApp</a>` : ''}
    <a class="btn btn-line btn-wide" href="https://t.me/${esc(SITE.tg)}?text=${encodeURIComponent(`Здравствуйте! Интересует услуга: ${x.h1}`)}" rel="noopener">${ICON.tg}Telegram</a>
    ${SITE.phone ? `<p class="panel-note">Телефон: <a href="${esc(telHref)}">${esc(SITE.phone)}</a></p>` : ''}
  </div></aside>
</div>
${serviceForm(x)}
<section class="block"><div class="wrap"><div class="block-head"><h2>Другие услуги</h2><a class="link-arrow" href="/uslugi/">Все услуги</a></div>${serviceTiles(x.slug)}</div></section>`;
    write(url.slice(1) + 'index.html', page({
      title: `${x.h1} — ${BRAND}`,
      desc: x.lead,
      url, nav: 'services',
      jsonld: [crumbsLd(its), {
        '@context': 'https://schema.org', '@type': 'Service', name: x.h1, description: x.lead, areaServed: { '@type': 'Country', name: 'Сербия' },
        provider: { '@type': 'Organization', name: BRAND, legalName: L.company, url: abs('/') },
      }, ...(x.faq?.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: x.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : [])],
      body,
    }));
    addUrl(url);
  }
}

// ---------- О компании: данные посредника для проверяющих органов ----------
{
  const items = [['/', 'Главная'], ['/o-kompanii/', 'О компании']];
  const row = (ru, sr, v) => (v ? `<div><dt>${ru}<span lang="sr">${sr}</span></dt><dd>${v}</dd></div>` : '');
  const body = `<section class="page-head"><div class="wrap">${crumbs(items)}<h1>О компании и правовая информация</h1>
<p class="page-lead">${esc(BRAND)} работает как зарегистрированный посредник в обороте и аренде недвижимости в Республике Сербия. Ниже приведены сведения, которые закон обязывает публиковать, а также общие условия нашей работы.</p></div></section>

<section class="block block-tight"><div class="wrap">
  <h2 class="h-small">Сведения о посреднике <span class="muted" lang="sr">/ Podaci o posredniku</span></h2>
  <dl class="legal-dl">
    ${row('Наименование', 'Poslovno ime', esc(L.company))}
    ${row('Адрес (седиште)', 'Sedište', esc(L.address))}
    ${row('ПИБ', 'PIB', esc(L.pib))}
    ${row('Матичный номер', 'Matični broj', esc(L.mb))}
    ${row('Номер в Реестре посредников', 'Broj u Registru posrednika', `<b>${esc(L.registry)}</b>`)}
    ${row('Лицензия агента', 'Broj licence posrednika', L.agentLicense ? `№ ${esc(L.agentLicense)}${L.agentName ? `, ${esc(L.agentName)}` : ''}` : '')}
    ${row('Директор', 'Direktor', esc(L.director))}
    ${row('Страхование ответственности', 'Osiguranje od odgovornosti', esc(L.insurance))}
    ${row('Телефон', 'Telefon', SITE.phone ? `<a href="${esc(telHref)}">${esc(SITE.phone)}</a>` : '')}
    ${row('Сайт', 'Internet stranica', esc(SITE.url || ''))}
  </dl>
</div></section>

<section class="block block-tight"><div class="wrap legal-text">
  <h2 class="h-small">Правовая основа</h2>
  <p>Деятельность посредника регулируется Законом о посредовании в обороте и аренде недвижимости Республики Сербия («Službeni glasnik RS», br. 95/2013, 41/2018 и 91/2019). Реестр посредников ведёт министерство, отвечающее за торговлю; сведения реестра публичны, и любой желающий может проверить в нём нашу компанию по номеру ${esc(L.registry)}.</p>
  <p>В соответствии со статьёй 18 Закона в каждом нашем объявлении указаны наименование посредника, номер в Реестре посредников, цена, местоположение, площадь и структура объекта.</p>
  <p>Посредничество осуществляется на основании письменного договора о посредничестве, заключаемого с клиентом (налогодавцем). До заключения договора мы знакомим клиента с общими условиями работы и размером вознаграждения.</p>
  <div lang="sr" class="legal-sr">
    <h3>Pravni okvir</h3>
    <p>${esc(L.company)}, ${esc(L.address)}${L.pib ? `, PIB ${esc(L.pib)}` : ''}${L.mb ? `, MB ${esc(L.mb)}` : ''}, obavlja delatnost posredovanja u prometu i zakupu nepokretnosti u skladu sa Zakonom o posredovanju u prometu i zakupu nepokretnosti („Sl. glasnik RS”, br. 95/2013, 41/2018 i 91/2019) i upisan je u Registar posrednika pod brojem ${esc(L.registry)}.${L.agentLicense ? ` Broj licence posrednika: ${esc(L.agentLicense)}${L.agentName ? ` (${esc(L.agentName)})` : ''}.` : ''}</p>
    <p>U skladu sa članom 18. Zakona, u svakom oglasu na ovoj internet stranici navedeni su poslovno ime posrednika, broj pod kojim je upisan u Registar posrednika, kao i cena, lokacija, površina i struktura nepokretnosti.</p>
  </div>
</div></section>

<section class="block block-tight" id="opsti-uslovi"><div class="wrap legal-text">
  <h2 class="h-small">Общие условия работы <span class="muted" lang="sr">/ Opšti uslovi poslovanja</span></h2>
  <p>Кратко: мы ищем для клиента вторую сторону сделки (покупателя, продавца, арендатора или арендодателя), организуем просмотры, проверяем документы и помогаем подготовить договор. Вознаграждение посредника выплачивается только после заключения сделки, если иное не указано в договоре о посредничестве.</p>
  <div lang="sr" class="legal-sr">
    <h3>1. Opšte odredbe</h3>
    <p>Ovim Opštim uslovima poslovanja uređuje se poslovni odnos između posrednika ${esc(L.company)} (u daljem tekstu: Posrednik) i nalogodavca, fizičkog ili pravnog lica. Posredovanje se vrši na osnovu pisanog ugovora o posredovanju. Zaključenjem ugovora o posredovanju nalogodavac potvrđuje da je upoznat i saglasan sa ovim Opštim uslovima.</p>
    <h3>2. Obaveze posrednika</h3>
    <p>Posrednik je dužan da postupa savesno i pošteno, da nastoji da nađe i dovede u vezu sa nalogodavcem lice radi zaključenja ugovora, da izvrši uvid u isprave kojima se dokazuje pravo svojine na nepokretnosti i upozori nalogodavca na očigledne rizike, da obavesti nalogodavca o okolnostima značajnim za posao, da posreduje u pregovorima, da omogući razgledanje nepokretnosti, da čuva lične podatke nalogodavca i da u oglasima navodi zakonom propisane podatke.</p>
    <h3>3. Obaveze nalogodavca</h3>
    <p>Nalogodavac je dužan da posredniku pruži tačne podatke o nepokretnosti i dostavi na uvid isprave o pravu svojine, da obavesti posrednika o svim promenama, da omogući razgledanje nepokretnosti i da posredniku isplati ugovorenu posredničku naknadu.</p>
    <h3>4. Posrednička naknada (cenovnik)</h3>
    <p>Posrednik stiče pravo na naknadu u trenutku zaključenja ugovora o prometu ili zakupu nepokretnosti sa licem koje je posrednik doveo u vezu sa nalogodavcem, ukoliko ugovorom o posredovanju nije drugačije određeno.</p>
    <ul>
      <li>Posredovanje u zakupu: ${esc(L.commissionRent)}.</li>
      <li>Posredovanje u kupoprodaji: ${esc(L.commissionSale)}.</li>
    </ul>
    <p>Tačan iznos naknade utvrđuje se ugovorom o posredovanju. Dodatne usluge (prevod, pratnja u banci, priprema dokumentacije) naplaćuju se samo ako su posebno ugovorene.</p>
    <h3>5. Ekskluzivno posredovanje</h3>
    <p>Ako je ugovoreno ekskluzivno posredovanje, nalogodavac se obavezuje da za vreme trajanja ugovora ne angažuje drugog posrednika. Posrednik je dužan da nalogodavca posebno upozori na značenje i pravne posledice klauzule o ekskluzivnom posredovanju.</p>
    <h3>6. Prestanak ugovora</h3>
    <p>Ugovor o posredovanju prestaje istekom roka na koji je zaključen, zaključenjem pravnog posla radi kojeg je zaključen ili otkazom u skladu sa ugovorom i zakonom.</p>
    <h3>7. Zaštita podataka i reklamacije</h3>
    <p>Lični podaci nalogodavaca i lica koja ostavljaju upite preko ove internet stranice obrađuju se isključivo radi pružanja usluge posredovanja. Prigovori se podnose pisanim putem na adresu sedišta Posrednika ili preko kontakata navedenih na sajtu; Posrednik odgovara u roku od osam dana.</p>
    <h3>8. Primena propisa</h3>
    <p>Na sve što nije uređeno ugovorom o posredovanju i ovim Opštim uslovima primenjuju se odredbe Zakona o posredovanju u prometu i zakupu nepokretnosti i Zakona o obligacionim odnosima.</p>
  </div>
</div></section>
${serviceForm(null)}`;
  write('o-kompanii/index.html', page({
    title: `О компании ${BRAND}: лицензия, реестр посредников, общие условия`,
    desc: `${L.company}: посредник в обороте и аренде недвижимости, номер в Реестре посредников Сербии ${L.registry}. Реквизиты и общие условия работы.`,
    url: '/o-kompanii/', nav: 'about',
    jsonld: [crumbsLd(items), {
      '@context': 'https://schema.org', '@type': 'RealEstateAgent', name: BRAND, legalName: L.company, url: abs('/'), taxID: L.pib || undefined,
      logo: abs('/assets/maxis-logo-navy.png'), telephone: SITE.phone || undefined,
      address: { '@type': 'PostalAddress', streetAddress: L.address.split(',')[0], addressLocality: 'Beograd', addressCountry: 'RS' },
      identifier: { '@type': 'PropertyValue', name: 'Registar posrednika', value: L.registry },
    }],
    body,
  }));
  addUrl('/o-kompanii/');
}

// Контакты
write('kontakty/index.html', page({
  title: `Контакты — ${SITE.name}`, desc: 'Как связаться с агентством: Telegram, WhatsApp, телефон.', url: '/kontakty/', nav: 'contacts',
  body: `<section class="page-head"><div class="wrap">${crumbs([['/', 'Главная'], ['/kontakty/', 'Контакты']])}<h1>Контакты</h1><p class="page-lead">Работаем с русскоязычными клиентами в Белграде: подбор жилья, просмотры, проверка документов, белый картон, счёт в банке и ВНЖ.</p></div></section>
<section class="block block-tight"><div class="wrap"><dl class="contacts">
  ${SITE.phone ? `<div><dt>Телефон</dt><dd><a href="${esc(telHref)}">${esc(SITE.phone)}</a></dd></div>` : ''}
  <div><dt>Telegram</dt><dd><a href="https://t.me/${esc(SITE.tg)}" rel="noopener">@${esc(SITE.tg)}</a></dd></div>
  ${waDigits ? `<div><dt>WhatsApp</dt><dd><a href="https://wa.me/${waDigits}" rel="noopener">Написать</a></dd></div>` : ''}
  ${SITE.channel ? `<div><dt>Канал с новыми объектами</dt><dd><a href="https://t.me/${esc(SITE.channel)}" rel="noopener">@${esc(SITE.channel)}</a></dd></div>` : ''}
  <div><dt>Адрес</dt><dd>${esc(L.address)}</dd></div>
  <div><dt>Компания</dt><dd>${esc(L.company)}</dd></div>
  <div><dt>Номер в Реестре посредников</dt><dd>${esc(L.registry)}</dd></div>
</dl></div></section>
${leadForm('Оставьте запрос')}`,
}));
addUrl('/kontakty/');

// 404, sitemap, robots, llms.txt
write('404.html', page({
  title: 'Страница не найдена', desc: 'Такой страницы нет. Возможно, объект уже сдан или продан.', url: '/404.html',
  body: `<section class="page-head"><div class="wrap"><h1>Такой страницы нет</h1><p class="page-lead">Возможно, объект уже сдан или продан. Посмотрите <a href="/arenda/">аренду</a> или <a href="/prodazha/">покупку</a>.</p></div></section>`,
}));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((u) => `<url><loc>${esc(abs(u.url))}</loc><lastmod>${esc(u.lastmod)}</lastmod></url>`).join('\n')}
</urlset>
`);
// Карта «номер объекта → адрес страницы»: worker.js по ней перенаправляет (301) старые и изменившиеся адреса
write('obekt-map.json', JSON.stringify(Object.fromEntries(LISTINGS.map((l) => [l.id, l.slug]))));
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /izbrannoe/\n${SITE.url ? `Sitemap: ${SITE.url}/sitemap.xml\n` : ''}`);
write('llms.txt', `# ${SITE.name}

> Каталог квартир и домов в Белграде (Сербия) для аренды и покупки, объекты от собственников, описания на русском языке. Агентство помогает русскоязычным клиентам с подбором жилья, просмотрами, белым картоном, регистрацией, банковским счётом и ВНЖ.

Агентство: ${L.company}, ${L.address}. Номер в Реестре посредников Сербии: ${L.registry}.
Контакты: Telegram @${SITE.tg}${SITE.phone ? `, телефон ${SITE.phone}` : ''}.

## Услуги
${SERVICES.map((x) => `- [${x.h1}](${abs(`/uslugi/${x.slug}/`)})`).join('\n')}
- [О компании и правовая информация](${abs('/o-kompanii/')})

## Разделы
- [Аренда](${abs('/arenda/')}): ${objects(byDeal.rent.length)}
- [Покупка](${abs('/prodazha/')}): ${objects(byDeal.sale.length)}
${COLLECTIONS.map((c) => `- [${c.title}](${abs(`/podborki/${c.slug}/`)}): ${objects(c.items.length)}`).join('\n')}

## Районы
${['rent', 'sale'].flatMap((k) => districtsOf(byDeal[k]).map((d) => `- [${k === 'rent' ? 'Аренда' : 'Продажа'}: ${d.name}](${abs(`/${DEAL[k].path}/${d.slug}/`)}): ${objects(d.items.length)}`)).join('\n')}
`);
write('_headers', `/assets/*\n  Cache-Control: public, max-age=300\n/photos/*\n  Cache-Control: public, max-age=2592000\n`);

console.log(`Готово: ${LISTINGS.length} объектов, ${sitemap.length} страниц в sitemap, папка dist/`);

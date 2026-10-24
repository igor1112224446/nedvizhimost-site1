// Сборка сайта-каталога «Недвижимость Сербии: покупка и аренда».
// Читает data/site.json, data/listings.json и папку photos/, пишет готовый сайт в dist/.
// Запуск: node build.mjs  (Node 18+, без зависимостей)
import fs from 'node:fs';
import path from 'node:path';

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
  ...read('data/site.json', {}),
};
SITE.url = String(SITE.url || process.env.SITE_URL || '').replace(/\/+$/, '');
const LISTINGS = read('data/listings.json', []).filter((l) => l && l.id && l.slug)
  .sort((a, b) => String(b.updated).localeCompare(String(a.updated)) || String(b.added).localeCompare(String(a.added)));

// ---------- помощники ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (p) => (SITE.url ? SITE.url + p : p);
const money = (n) => (n ? Number(n).toLocaleString('ru-RU').replace(/[,\s\u202f]/g, '\u00a0') + '\u00a0€' : 'Цена по запросу');
const plural = (n, [one, few, many]) => {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};
const objects = (n) => `${n} ${plural(n, ['объект', 'объекта', 'объектов'])}`;
const waDigits = String(SITE.whatsapp || '').replace(/[^\d]/g, '');
const telHref = 'tel:' + String(SITE.phone || '').replace(/[^\d+]/g, '');
const DEAL = {
  rent: { path: 'arenda', name: 'Аренда', verb: 'Снять', h1: 'Аренда квартир и домов в Белграде', gen: 'аренды' },
  sale: { path: 'prodazha', name: 'Покупка', verb: 'Купить', h1: 'Квартиры и дома в Белграде на продажу', gen: 'покупки' },
};
const photo = (l, i = 1) => `/photos/${l.id}/${i}.jpg`;
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : '');
const heading = (l) => `${cap(l.kind)} ${l.deal === 'rent' ? 'в аренду' : 'на продажу'}${l.area ? `, ${l.area}\u00a0м²` : ''}${placeLine(l) ? `, ${placeLine(l)}` : ''}`;
const shortKind = (l) => `${l.kind}${l.area ? `, ${l.area}\u00a0м²` : ''}`;
const placeLine = (l) => [l.location, l.district].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
// «1-й из 4» → «1-й этаж из 4»
const floorFact = (l) => {
  const v = (l.facts || []).find((f) => f[0] === 'Этаж')?.[1] || '';
  return v ? v.replace(/^(.+?)( из \d+)?$/, '$1 этаж$2') : '';
};
const roomsKey = (l) => (l.type === 'house' ? 'house' : !l.rooms || l.rooms <= 0.5 ? '0' : l.rooms >= 4 ? '4' : String(Math.floor(l.rooms)));

function write(rel, html) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---------- каркас страницы ----------
function page({ title, desc, url, image, jsonld = [], body, deal }) {
  const canonical = abs(url);
  const nav = (key, href, label) => `<a href="${href}"${deal === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="ru">
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
<meta name="theme-color" content="#1d6a50">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Unbounded:wght@500;600&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">К содержанию</a>
<header class="site-head">
  <div class="wrap head-row">
    <a class="logo" href="/">Недвижимость Сербии</a>
    <nav class="nav" aria-label="Разделы">
      ${nav('rent', '/arenda/', 'Аренда')}
      ${nav('sale', '/prodazha/', 'Покупка')}
      ${nav('districts', '/#rajony', 'Районы')}
    </nav>
    <a class="btn btn-small" href="https://t.me/${esc(SITE.tg)}" rel="noopener">Написать в Telegram</a>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-foot">
  <div class="wrap foot-row">
    <div>
      <p class="foot-name">${esc(SITE.name)}</p>
      <p>Квартиры и дома в Белграде напрямую от собственников. Помогаем с белым картоном, регистрацией, банковским счётом и ВНЖ.</p>
    </div>
    <div>
      <p><a href="https://t.me/${esc(SITE.tg)}" rel="noopener">Telegram: @${esc(SITE.tg)}</a></p>
      ${waDigits ? `<p><a href="https://wa.me/${waDigits}" rel="noopener">WhatsApp</a></p>` : ''}
      ${SITE.phone ? `<p><a href="${esc(telHref)}">${esc(SITE.phone)}</a></p>` : ''}
      ${SITE.channel ? `<p><a href="https://t.me/${esc(SITE.channel)}" rel="noopener">Канал с новыми квартирами: @${esc(SITE.channel)}</a></p>` : ''}
    </div>
  </div>
</footer>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

function card(l, eager = false) {
  return `<a class="card" href="/obekt/${esc(l.slug)}/" data-district="${esc(l.districtSlug)}" data-rooms="${roomsKey(l)}" data-price="${l.price || 0}" data-added="${esc(l.added)}">
  <img src="${photo(l)}" alt="${esc(shortKind(l))}, ${esc(placeLine(l))}" width="640" height="480" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
  <span class="card-body">
    <span class="price">${money(l.price)}${l.deal === 'rent' && l.price ? '<small> в месяц</small>' : ''}</span>
    <span class="card-title">${esc(cap(shortKind(l)))}</span>
    <span class="card-place">${esc(placeLine(l))}</span>
    ${floorFact(l) ? `<span class="card-meta">${esc(floorFact(l))}</span>` : ''}
  </span>
</a>`;
}

const crumbs = (items) => `<nav class="crumbs" aria-label="Навигация"><ol>${items.map(([href, name], i) => (i < items.length - 1 ? `<li><a href="${href}">${esc(name)}</a></li>` : `<li aria-current="page">${esc(name)}</li>`)).join('')}</ol></nav>`;
const crumbsLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([href, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(href) })),
});

// ---------- группировка ----------
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
const minPrice = (list) => list.filter((l) => l.price).reduce((m, l) => Math.min(m, l.price), Infinity);

// ---------- страницы ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'photos'))) fs.cpSync(path.join(ROOT, 'photos'), path.join(OUT, 'photos'), { recursive: true });

const sitemap = [];
const addUrl = (url, lastmod) => sitemap.push({ url, lastmod });
const today = new Date().toISOString().slice(0, 10);

// Главная
{
  const all = districtsOf(LISTINGS);
  const entry = (key) => {
    const d = DEAL[key];
    const list = byDeal[key];
    const min = minPrice(list);
    return `<a class="entry" href="/${d.path}/">
      <span class="entry-verb">${d.verb}</span>
      <span class="entry-count">${objects(list.length)}</span>
      ${Number.isFinite(min) ? `<span class="entry-min">от ${money(min)}${key === 'rent' ? ' в месяц' : ''}</span>` : ''}
    </a>`;
  };
  const fresh = LISTINGS.slice(0, 8);
  const body = `
<section class="hero wrap">
  <h1>${esc(SITE.name)}</h1>
  <p class="lead">Квартиры и дома в Белграде от собственников. Подберём варианты, отвезём на просмотры и поможем с документами для переезда.</p>
  <div class="entries">${entry('rent')}${entry('sale')}</div>
</section>
${fresh.length ? `<section class="wrap block">
  <h2>Новые объекты</h2>
  <div class="grid">${fresh.map((l, i) => card(l, i < 2)).join('')}</div>
</section>` : ''}
${all.length ? `<section class="wrap block" id="rajony">
  <h2>Районы Белграда</h2>
  <div class="districts">
    ${all.map((d) => {
      const r = d.items.filter((l) => l.deal === 'rent').length;
      const s = d.items.filter((l) => l.deal === 'sale').length;
      return `<div class="district"><p class="district-name">${esc(d.name)}</p><p>${r ? `<a href="/arenda/${d.slug}/">аренда: ${r}</a>` : ''}${r && s ? ', ' : ''}${s ? `<a href="/prodazha/${d.slug}/">покупка: ${s}</a>` : ''}</p></div>`;
    }).join('')}
  </div>
</section>` : ''}
<section class="wrap block help">
  <h2>Помогаем с переездом</h2>
  <p>Кроме подбора жилья помогаем получить белый картон и регистрацию, открыть счёт в банке и подать документы на ВНЖ. На просмотры отобранных вами квартир возим сами: трансфер входит в комиссию.</p>
  <p><a class="btn" href="https://t.me/${esc(SITE.tg)}" rel="noopener">Написать в Telegram</a>${waDigits ? ` <a class="btn btn-ghost" href="https://wa.me/${waDigits}" rel="noopener">Написать в WhatsApp</a>` : ''}</p>
</section>`;
  write('index.html', page({
    title: `${SITE.name} — квартиры и дома в Белграде`,
    desc: `Аренда и покупка квартир и домов в Белграде напрямую от собственников: ${objects(LISTINGS.length)} с фото, ценами и описанием на русском. Помощь с ВНЖ, белым картоном и банковским счётом.`,
    url: '/',
    image: LISTINGS[0] ? photo(LISTINGS[0]) : '',
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: abs('/'), inLanguage: 'ru' },
      {
        '@context': 'https://schema.org', '@type': 'RealEstateAgent', name: SITE.name, url: abs('/'),
        telephone: SITE.phone || undefined, areaServed: { '@type': 'City', name: 'Белград' },
        address: { '@type': 'PostalAddress', addressLocality: 'Белград', addressCountry: 'RS' },
        sameAs: [`https://t.me/${SITE.tg}`, SITE.channel ? `https://t.me/${SITE.channel}` : null].filter(Boolean),
      },
    ],
    body,
  }));
  addUrl('/', today);
}

// Разделы и районы
function listPage(key, district) {
  const d = DEAL[key];
  const list = district ? district.items.filter((l) => l.deal === key) : byDeal[key];
  if (district && !list.length) return;
  const url = district ? `/${d.path}/${district.slug}/` : `/${d.path}/`;
  const h1 = district ? `${d.name} в районе ${district.name}` : d.h1;
  const dists = districtsOf(byDeal[key]);
  const min = minPrice(list);
  const items = [['/', 'Главная'], [`/${d.path}/`, d.name]];
  if (district) items.push([url, district.name]);
  const intro = list.length
    ? `${objects(list.length)} от собственников${Number.isFinite(min) ? `, цены от ${money(min)}${key === 'rent' ? ' в месяц' : ''}` : ''}. Фото, параметры и описание на русском. Чтобы записаться на просмотр, откройте объект и напишите нам.`
    : 'Сейчас объектов нет. Напишите нам: подберём варианты под ваш запрос.';
  const body = `
<div class="wrap">
  ${crumbs(items)}
  <h1>${esc(h1)}</h1>
  <p class="lead">${intro}</p>
  ${list.length ? `<form class="filter" data-filter aria-label="Фильтр объектов">
    ${district ? '' : `<label>Район<select name="district"><option value="">Все районы</option>${dists.map((x) => `<option value="${esc(x.slug)}">${esc(x.name)} (${x.items.length})</option>`).join('')}</select></label>`}
    <label>Комнат<select name="rooms"><option value="">Любое</option><option value="0">Студия</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4 и больше</option><option value="house">Дом</option></select></label>
    <label>Цена до, €<input name="max" inputmode="numeric" placeholder="${key === 'rent' ? '600' : '150000'}"></label>
    <label>Сначала<select name="sort"><option value="new">новые</option><option value="cheap">дешевле</option><option value="dear">дороже</option></select></label>
  </form>
  <p class="found" data-found aria-live="polite"></p>` : ''}
  <div class="grid" data-grid>${list.map((l, i) => card(l, i < 2)).join('')}</div>
  <p class="empty" data-empty hidden>Под эти условия объектов нет. Измените фильтр или <a href="https://t.me/${esc(SITE.tg)}" rel="noopener">напишите нам</a>: подберём вручную.</p>
  ${!district && dists.length ? `<section class="block"><h2>${d.name} по районам</h2><p class="district-links">${dists.map((x) => `<a href="/${d.path}/${x.slug}/">${esc(x.name)}</a>`).join('')}</p></section>` : ''}
</div>`;
  write(url.slice(1) + 'index.html', page({
    title: `${h1}${district ? ', Белград' : ''} — ${objects(list.length)} от собственников`,
    desc: `${h1}${district ? ' (Белград)' : ''}: ${intro}`,
    url,
    image: list[0] ? photo(list[0]) : '',
    jsonld: [crumbsLd(items), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: h1,
      itemListElement: list.slice(0, 50).map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/obekt/${l.slug}/`) })),
    }],
    body,
    deal: key,
  }));
  addUrl(url, list[0]?.updated || today);
}
for (const key of ['rent', 'sale']) {
  listPage(key);
  for (const dist of districtsOf(byDeal[key])) listPage(key, dist);
}

// Объекты
for (const l of LISTINGS) {
  const d = DEAL[l.deal];
  const url = `/obekt/${l.slug}/`;
  const items = [['/', 'Главная'], [`/${d.path}/`, d.name]];
  if (l.districtSlug) items.push([`/${d.path}/${l.districtSlug}/`, l.district]);
  items.push([url, cap(shortKind(l))]);
  const photos = Array.from({ length: l.photos || 0 }, (_, i) => photo(l, i + 1));
  const similar = LISTINGS.filter((x) => x.id !== l.id && x.deal === l.deal && x.districtSlug === l.districtSlug).slice(0, 4);
  const waText = encodeURIComponent(`Здравствуйте! Интересует объект ${l.id}: ${abs(url)}`);
  const map = l.geo ? `https://www.openstreetmap.org/export/embed.html?bbox=${l.geo.lng - 0.012},${l.geo.lat - 0.007},${l.geo.lng + 0.012},${l.geo.lat + 0.007}&layer=mapnik&marker=${l.geo.lat},${l.geo.lng}` : '';
  const body = `
<div class="wrap">
  ${crumbs(items)}
  <h1 class="obj-title">${esc(heading(l))}</h1>
  <div class="obj">
    <div class="obj-main">
      ${photos.length ? `<div class="gallery" data-gallery>
        <div class="gallery-track" tabindex="0" aria-label="Фото объекта">
          ${photos.map((p, i) => `<img src="${p}" alt="${esc(shortKind(l))}, фото ${i + 1}" width="1200" height="900" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">`).join('')}
        </div>
        ${photos.length > 1 ? `<div class="gallery-nav"><button type="button" data-prev aria-label="Предыдущее фото"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span data-counter>1 из ${photos.length}</span><button type="button" data-next aria-label="Следующее фото"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>` : ''}
      </div>` : ''}
      <section class="obj-section">
        <h2>Об объекте</h2>
        <p>${esc(l.text)}</p>
        ${l.facts?.length ? `<dl class="facts">${l.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        ${l.features?.length ? `<h3>Удобства</h3><ul class="features">${l.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      </section>
      ${l.original ? `<details class="obj-section original"><summary>Описание собственника на сербском</summary><p lang="sr-Latn">${esc(l.original).replace(/\n/g, '<br>')}</p></details>` : ''}
      ${map ? `<section class="obj-section"><h2>Расположение</h2><p class="muted">${esc([l.street, l.location, l.district, l.city].filter(Boolean).join(', '))}. На карте показано примерное место.</p>
        <iframe class="map" src="${esc(map)}" title="Карта: ${esc(placeLine(l))}" loading="lazy"></iframe></section>` : ''}
    </div>
    <aside class="obj-aside">
      <div class="contact">
        <p class="price price-big">${money(l.price)}${l.deal === 'rent' && l.price ? '<small> в месяц</small>' : ''}</p>
        <p class="muted">${esc(placeLine(l))}</p>
        <a class="btn btn-wide" href="https://t.me/${esc(SITE.tg)}" rel="noopener">Записаться на просмотр</a>
        ${waDigits ? `<a class="btn btn-ghost btn-wide" href="https://wa.me/${waDigits}?text=${waText}" rel="noopener">Написать в WhatsApp</a>` : ''}
        <p class="small muted">Запись в Telegram @${esc(SITE.tg)}${SITE.phone ? `, или позвоните: <a href="${esc(telHref)}">${esc(SITE.phone)}</a>` : ''}</p>
        <p class="small">Номер объекта для заявки: <span class="obj-id">${esc(l.id)}</span></p>
        ${l.deal === 'rent' ? '<p class="small muted">Возим на просмотры отобранных квартир, трансфер входит в комиссию: 50% от месячной аренды.</p>' : ''}
      </div>
    </aside>
  </div>
  <div class="mobile-cta"><span class="price">${money(l.price)}${l.deal === 'rent' && l.price ? '<small> в месяц</small>' : ''}</span><a class="btn" href="https://t.me/${esc(SITE.tg)}" rel="noopener">Записаться</a></div>
  ${similar.length ? `<section class="block"><h2>Ещё в районе ${esc(l.district)}</h2><div class="grid">${similar.map((x) => card(x)).join('')}</div></section>` : ''}
</div>`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'RealEstateListing', name: l.title, url: abs(url), datePosted: l.added,
    description: l.text, image: photos.slice(0, 6).map(abs), inLanguage: 'ru',
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
      ...(l.deal === 'rent' ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: l.price, priceCurrency: 'EUR', unitCode: 'MON' } } : {}),
    } : undefined,
  };
  write(url.slice(1) + 'index.html', page({
    title: `${heading(l)} — ${money(l.price)}${l.deal === 'rent' && l.price ? ' в месяц' : ''}`,
    desc: l.text.slice(0, 160),
    url,
    image: photos[0],
    jsonld: [ld, crumbsLd(items)],
    body,
    deal: l.deal,
  }));
  addUrl(url, l.updated);
}

// 404, sitemap, robots, llms.txt
write('404.html', page({
  title: 'Страница не найдена',
  desc: 'Такой страницы нет. Возможно, объект уже сдан или продан.',
  url: '/404.html',
  body: `<div class="wrap block"><h1>Такой страницы нет</h1><p class="lead">Возможно, объект уже сдан или продан. Посмотрите <a href="/arenda/">аренду</a> или <a href="/prodazha/">покупку</a>, или <a href="https://t.me/${esc(SITE.tg)}" rel="noopener">напишите нам</a>.</p></div>`,
}));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((u) => `<url><loc>${esc(abs(u.url))}</loc><lastmod>${esc(u.lastmod || today)}</lastmod></url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *\nAllow: /\n${SITE.url ? `Sitemap: ${SITE.url}/sitemap.xml\n` : ''}`);
write('llms.txt', `# ${SITE.name}

> Каталог квартир и домов в Белграде (Сербия) для аренды и покупки, объекты от собственников. Описания на русском языке. Агентство помогает русскоязычным клиентам с подбором жилья, просмотрами, белым картоном, регистрацией, банковским счётом и ВНЖ.

Контакты: Telegram @${SITE.tg}${SITE.phone ? `, телефон ${SITE.phone}` : ''}.

## Разделы
- [Аренда](${abs('/arenda/')}): ${objects(byDeal.rent.length)}
- [Покупка](${abs('/prodazha/')}): ${objects(byDeal.sale.length)}

## Районы
${['rent', 'sale'].flatMap((k) => districtsOf(byDeal[k]).map((d) => `- [${DEAL[k].name}: ${d.name}](${abs(`/${DEAL[k].path}/${d.slug}/`)}): ${objects(d.items.length)}`)).join('\n')}
`);
write('_headers', `/assets/*\n  Cache-Control: public, max-age=604800\n/photos/*\n  Cache-Control: public, max-age=2592000\n`);

console.log(`Готово: ${LISTINGS.length} объектов, ${sitemap.length} страниц в sitemap, папка dist/`);

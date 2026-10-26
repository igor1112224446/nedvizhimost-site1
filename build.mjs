// Сборка сайта-каталога «Недвижимость Сербии: покупка и аренда».
// Читает data/site.json, data/listings.json и папку photos/, пишет готовый сайт в dist/.
// Запуск: node build.mjs  (Node 18+, без зависимостей)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
  const ds = String(raw || '').toLowerCase().replace(/(^|-)(gradska-)?opstina(-|$)/g, '-').replace(/(^|-)beograd$/, '').replace(/^-+|-+$/g, '');
  const hit = BELGRADE.find((d) => ds === d.slug || ds.startsWith(d.slug + '-') || ds.endsWith('-' + d.slug) || ds.includes('-' + d.slug + '-'));
  return hit ? hit.slug : ds;
}
const LISTINGS = read('data/listings.json', []).filter((l) => l && l.id && l.slug)
  .map((l) => {
    const ds = normDistrict(l.districtSlug);
    return { ...l, districtSlug: ds, district: BG_NAME[ds] || String(l.district || '').replace(/^(Општина|Opština|Община|Gradska opština)\s+/i, '') };
  })
  .sort((a, b) => String(b.added).localeCompare(String(a.added)) || String(b.updated).localeCompare(String(a.updated)));
const TODAY = new Date().toISOString().slice(0, 10);

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
const featKeys = (l) => {
  const f = l.features || [];
  return FEATS.map(([k]) => k).filter((k) => f.includes(k) || (k === 'терраса' && f.some((x) => /балкон|лоджия/.test(x))) || (k === 'парковка' && f.includes('гараж')));
};
const roomsLabel = (l) => (l.type === 'house' ? 'Дом' : !l.rooms || l.rooms <= 0.5 ? 'Студия' : `${String(l.rooms).replace('.', ',')}\u00a0комн.`);
const heading = (l) => `${cap(l.kind)}${l.area ? `, ${l.area}\u00a0м²` : ''}`;
const perM2 = (l) => (l.deal === 'sale' && l.price && l.area ? price(l.price / l.area, '/м²') : '');
const floorText = (l) => { const v = fact(l, 'Этаж'); return v ? v.replace(/^(.+?)( из \d+)?$/, '$1 этаж$2') : ''; };
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
  const types = [['Квартиры', `/${d.path}/`], ...(byDeal[key].some((l) => l.type === 'house') ? [['Дома', `/${d.path}/?rooms=house`]] : [])];
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
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
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
    <a class="logo" href="/"><span class="logo-name">Gloria: квартиры в Сербии</span></a>
    <nav class="nav" aria-label="Разделы">
      ${mega('sale', nav)}
      ${mega('rent', nav)}
      ${link('map', '/karta/', 'Карта')}
      ${link('owners', '/podat-obyavlenie/', 'Собственникам')}
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
          <a href="/karta/">Карта</a>
          <a href="/podat-obyavlenie/">Собственникам</a>
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
      <a class="logo logo-inv" href="/"><span class="logo-name">Gloria: квартиры в Сербии</span></a>
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
      ${col('Подборки', COLLECTIONS.map((c) => `<li><a href="/podborki/${c.slug}/">${esc(c.short)}</a></li>`))}
      ${col('Агентство', ['<li><a href="/kontakty/">Контакты</a></li>', '<li><a href="/izbrannoe/">Избранное</a></li>', '<li><a href="/#podbor">Подбор по запросу</a></li>', '<li><a href="/karta/">Карта объектов</a></li>', '<li><a href="/podat-obyavlenie/">Подать объявление</a></li>'])}
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

function seoText(key) {
  const rent = [
    ['Как снять квартиру в Белграде', 'Большинство собственников сдают жильё на срок от года и просят депозит, обычно в размере месячной аренды. Коммунальные платежи чаще всего оплачиваются отдельно, по счетам. Перед просмотром стоит уточнить, включены ли в цену интернет и обслуживание дома.'],
    ['Белый картон и регистрация', 'Иностранец, который живёт в Сербии, должен зарегистрировать место проживания в полиции. Документ о регистрации называют белым картоном, он нужен для ВНЖ и для открытия счёта в банке. Мы заранее договариваемся с собственником о регистрации и помогаем её оформить.'],
    ['Как мы работаем', 'Вы выбираете объекты на сайте или присылаете запрос, мы связываемся с собственниками и составляем маршрут просмотров. Трансфер по отобранным квартирам входит в комиссию, которая составляет 50% от месячной аренды.'],
  ];
  const sale = [
    ['Покупка жилья иностранцем', 'Граждане России и многих других стран могут покупать квартиры и дома в Сербии. Сделку заверяет нотариус, после чего право собственности регистрируется в кадастре.'],
    ['Что проверить перед покупкой', 'Главное — выписка из кадастра: в ней видно, кто собственник и есть ли обременения. Также стоит проверить, совпадает ли фактическая площадь с документами и узаконены ли перепланировки. Мы проверяем документы до внесения задатка.'],
    ['Как мы работаем', 'Подбираем объекты под бюджет, организуем просмотры, проверяем документы, сопровождаем сделку у нотариуса и помогаем с открытием счёта и последующим ВНЖ.'],
  ];
  const items = key === 'sale' ? sale : rent;
  return `<section class="seo">
  <div class="wrap">
    <h2>${key === 'sale' ? 'О покупке недвижимости в Сербии' : 'Об аренде в Белграде'}</h2>
    <div class="acc">${items.map(([q, a], i) => `<details${i ? '' : ' open'}><summary>${esc(q)}${ICON.chevron}</summary><p>${esc(a)}</p></details>`).join('')}</div>
  </div>
</section>`;
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
  a: l.area || 0, ty: l.type, pl: placeLine(l), ad: [l.street, l.location, l.district].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', '), g: l.geo ? [l.geo.lat, l.geo.lng] : null, img: l.photos ? photo(l) : '',
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
        <label class="finder-f"><span>Тип</span><select name="type"><option value="">Любой</option><option value="apartment">Квартира</option><option value="house">Дом</option></select></label>
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
      <span><b>${ALL_DISTRICTS.length}</b> ${plural(ALL_DISTRICTS.length, ['район', 'района', 'районов'])} Белграда</span>
      <span>Описания и сопровождение на русском</span>
    </div>
  </div>
</section>

${best.length ? `<section class="block">
  <div class="wrap">
    <div class="block-head"><div><h2>Каталог Белграда</h2><p class="block-sub">Свежие объекты от собственников в Белграде.</p></div><a class="link-arrow" href="/arenda/">Весь каталог</a></div>
    <div class="offers">${best.map((l, i) => offerCard(l, i === 0)).join('')}</div>
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
    <div class="block-head"><h2>Собственникам</h2></div>
    <div class="owners">
      <a class="owner-card" href="/podat-obyavlenie/?deal=rent"><span class="owner-n">01</span><span class="owner-t">Сдать недвижимость</span><span class="owner-d">Покажем квартиру русскоязычным арендаторам и поможем подготовить договор.</span><span class="link-arrow">Подать объявление</span></a>
      <a class="owner-card" href="/podat-obyavlenie/?deal=sale"><span class="owner-n">02</span><span class="owner-t">Продать недвижимость</span><span class="owner-d">Разместим объект в каталоге и Telegram-канале, приведём покупателей и сопроводим сделку.</span><span class="link-arrow">Подать объявление</span></a>
    </div>
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
        '@context': 'https://schema.org', '@type': 'RealEstateAgent', name: SITE.name, url: abs('/'),
        telephone: SITE.phone || undefined, areaServed: { '@type': 'City', name: 'Белград' },
        address: { '@type': 'PostalAddress', addressLocality: 'Белград', addressCountry: 'RS' },
        sameAs: [`https://t.me/${SITE.tg}`, SITE.channel ? `https://t.me/${SITE.channel}` : null].filter(Boolean),
      },
    ],
    body,
  }));
  addUrl('/');
}

// Разделы, районы, подборки
function listPage({ url, h1, lead, list, items, nav, seo, showDistricts = true, dealSwitch = false, extra = '' }) {
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
<section class="block block-tight"><div class="wrap">${catalog(list, { showDistricts, dealSwitch })}</div></section>
${extra}
${leadForm()}
${seo ? seoText(seo) : ''}`;
  write(url.slice(1) + 'index.html', page({
    title: `${h1} — ${objects(list.length)} от собственников`,
    desc: intro,
    url,
    image: list[0] ? photo(list[0]) : '',
    jsonld: [crumbsLd(items), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: h1,
      itemListElement: list.slice(0, 50).map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/obekt/${l.slug}/`) })),
    }],
    body,
    nav,
  }));
  addUrl(url, list[0]?.updated);
}

for (const key of ['rent', 'sale']) {
  const d = DEAL[key];
  const dists = districtsOf(byDeal[key]);
  const links = dists.length > 1 ? `<section class="block block-tight"><div class="wrap"><h2 class="h-small">${key === 'rent' ? 'Аренда' : 'Продажа'} по районам</h2><p class="tags">${dists.map((x) => `<a href="/${d.path}/${x.slug}/">${esc(x.name)} <em>${x.items.length}</em></a>`).join('')}</p></div></section>` : '';
  listPage({ url: `/${d.path}/`, h1: d.h1, lead: d.lead, list: byDeal[key], items: [['/', 'Главная'], [`/${d.path}/`, d.name]], nav: key, seo: key, extra: links });
  for (const dist of dists) {
    listPage({
      url: `/${d.path}/${dist.slug}/`,
      h1: `${key === 'rent' ? 'Аренда' : 'Продажа'} в районе ${dist.name}`,
      lead: `${key === 'rent' ? 'Квартиры и дома в аренду' : 'Квартиры и дома на продажу'} в районе ${dist.name}, Белград.`,
      list: dist.items,
      items: [['/', 'Главная'], [`/${d.path}/`, d.name], [`/${d.path}/${dist.slug}/`, dist.name]],
      nav: key, seo: key, showDistricts: false,
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
        <p>${esc(l.text)}</p>
        ${restFacts.length ? `<dl class="facts">${restFacts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      </section>
      ${l.features?.length ? `<section class="obj-sec"><h2>Удобства</h2><ul class="feat">${l.features.map((f) => `<li>${esc(cap(f))}</li>`).join('')}</ul></section>` : ''}
      ${l.original ? `<section class="obj-sec"><details class="orig"><summary>Описание собственника на сербском${ICON.chevron}</summary><p lang="sr-Latn">${esc(l.original).replace(/\n/g, '<br>')}</p></details></section>` : ''}
      ${l.geo ? `<section class="obj-sec"><h2>Расположение</h2><p class="muted">${esc([l.street, l.location, l.district, l.city].filter(Boolean).join(', '))}</p><div class="map-box map-one" data-point="${l.geo.lat},${l.geo.lng}" data-label="${esc(money(l.price))}"></div></section>` : ''}
    </div>
    <aside class="obj-aside">
      <div class="panel">
        <p class="panel-price">${price(l.price)}${l.price ? `<small>${d.per}</small>` : ''}</p>
        ${perM2(l) ? `<p class="muted">${perM2(l)}</p>` : ''}
        <p class="panel-note" data-rate-note hidden>Пересчёт из евро по курсу на ${rateDate}. Цена в договоре — в евро.</p>
        <div class="agent">
          <span class="agent-mark" aria-hidden="true">G</span>
          <div><p class="agent-name">Gloria: квартиры в Сербии</p>${SITE.phone ? `<a href="${esc(telHref)}">${esc(SITE.phone)}</a>` : ''}</div>
        </div>
        <button class="btn btn-dark btn-wide" type="button" data-open-viewing>Записаться на просмотр</button>
        ${waDigits ? `<a class="btn btn-line btn-wide" href="https://wa.me/${waDigits}?text=${waText}" rel="noopener">${ICON.wa}Написать в WhatsApp</a>` : ''}
        <a class="btn btn-line btn-wide" href="${esc(tgHref)}" rel="noopener" data-tg-text="${esc(decodeURIComponent(waText))}">${ICON.tg}Написать в Telegram</a>
        <p class="panel-note">Номер объекта: <span class="obj-id">${esc(l.id)}</span></p>
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

// Форма для собственников: заявка уходит в Telegram агентства через /api/submit
{
  const opt = (arr) => arr.map((x) => `<option>${esc(x)}</option>`).join('');
  write('podat-obyavlenie/index.html', page({
    title: `Сдать или продать квартиру в Белграде — подать объявление`,
    desc: 'Собственникам: разместите квартиру или дом в каталоге и Telegram-канале. Покажем объект русскоязычным клиентам и поможем с договором.',
    url: '/podat-obyavlenie/', nav: 'owners',
    body: `<section class="page-head"><div class="wrap">${crumbs([['/', 'Главная'], ['/podat-obyavlenie/', 'Подать объявление']])}
  <h1>Подать объявление</h1>
  <p class="page-lead">Заполните форму, и мы свяжемся с вами в течение дня. Размещение в каталоге и Telegram-канале бесплатное для собственника.</p></div></section>
<section class="block block-tight"><div class="wrap">
<form class="owner-form" data-owner-form data-tg="${esc(SITE.tg)}" novalidate>
  <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
  <input type="hidden" name="t0" value="">
  <fieldset class="of-sec"><legend>Сделка и объект</legend>
    <div class="seg"><label><input type="radio" name="deal" value="Сдать" checked><span>Сдать</span></label><label><input type="radio" name="deal" value="Продать"><span>Продать</span></label></div>
    <div class="of-grid">
      <label class="fld"><span>Тип</span><select name="type">${opt(['Квартира', 'Студия', 'Дом', 'Часть дома', 'Комната'])}</select></label>
      <label class="fld"><span>Комнат</span><select name="rooms">${opt(['Студия', '1', '1,5', '2', '2,5', '3', '3,5', '4', '5 и больше'])}</select></label>
      <label class="fld"><span>Площадь, м² *</span><input name="area" inputmode="numeric" required></label>
      <label class="fld"><span>Этаж</span><input name="floor" placeholder="Например: 3 или ПР"></label>
      <label class="fld"><span>Этажей в доме</span><input name="floors" inputmode="numeric"></label>
      <label class="fld"><span>Год постройки</span><input name="year" inputmode="numeric"></label>
    </div>
  </fieldset>
  <fieldset class="of-sec"><legend>Адрес</legend>
    <div class="of-grid">
      <label class="fld"><span>Район (община) *</span><select name="district" required><option value="">Выберите</option>${opt(BELGRADE.map((d) => d.name))}<option>Другое</option></select></label>
      <label class="fld"><span>Микрорайон</span><input name="location" placeholder="Например: Црвени крст, Блок 45"></label>
      <label class="fld fld-wide"><span>Улица и номер дома</span><input name="street"><small>На сайте точный адрес не показываем.</small></label>
    </div>
  </fieldset>
  <fieldset class="of-sec"><legend>Цена и условия</legend>
    <div class="of-grid">
      <label class="fld"><span data-price-label>Цена в месяц, € *</span><input name="price" inputmode="numeric" required></label>
      <label class="fld" data-rent-only><span>Депозит, €</span><input name="deposit" inputmode="numeric"></label>
      <label class="fld" data-rent-only><span>Коммунальные в месяц, примерно €</span><input name="bills" inputmode="numeric"></label>
      <label class="fld" data-rent-only><span>Свободна с</span><input name="from" type="date"></label>
      <label class="fld" data-rent-only><span>Мебель</span><select name="furn">${opt(['С мебелью', 'Частично', 'Без мебели'])}</select></label>
      <label class="fld" data-sale-only hidden><span>Право собственности (укњижено)</span><select name="owned">${opt(['Да', 'В процессе', 'Нет'])}</select></label>
      <label class="fld"><span>Отопление</span><select name="heating">${opt(['Центральное', 'Автономное (газ)', 'Электрическое', 'Аккумуляционные печи', 'Кондиционеры', 'Тепловой насос', 'Другое'])}</select></label>
      <label class="fld"><span>Состояние</span><select name="state">${opt(['После ремонта', 'Новостройка', 'Хорошее', 'Требует ремонта'])}</select></label>
    </div>
    <div class="of-checks">${['Терраса или балкон', 'Лифт', 'Парковка', 'Гараж', 'Кондиционер', 'Интернет', 'Посудомоечная машина', 'Стиральная машина', 'Можно с животными', 'Подвал или кладовка'].map((x) => `<label class="chk"><input type="checkbox" name="features" value="${esc(x)}"><span>${esc(x)}</span></label>`).join('')}</div>
  </fieldset>
  <fieldset class="of-sec"><legend>Описание и фото</legend>
    <label class="fld fld-wide"><span>Описание</span><textarea name="description" rows="6" placeholder="Планировка, вид из окон, что рядом, условия для жильцов"></textarea></label>
    <div class="photos-in">
      <label class="photo-drop"><input type="file" name="photos" accept="image/*" multiple data-photos><span><b>Добавить фото</b><small>До 10 снимков. Первое фото станет обложкой.</small></span></label>
      <div class="photo-list" data-photo-list></div>
    </div>
  </fieldset>
  <fieldset class="of-sec"><legend>Контакты</legend>
    <div class="of-grid">
      <label class="fld"><span>Ваше имя *</span><input name="name" autocomplete="name" required></label>
      <label class="fld"><span>Телефон *</span><input name="phone" type="tel" autocomplete="tel" required placeholder="+381 6…"></label>
      <label class="fld"><span>Как удобнее связаться</span><select name="messenger">${opt(['WhatsApp', 'Viber', 'Telegram', 'Звонок'])}</select></label>
    </div>
    <label class="chk chk-consent"><input type="checkbox" name="consent" required><span>Я собственник объекта или действую по его поручению и согласен на обработку контактных данных для связи по этому объявлению.</span></label>
  </fieldset>
  <div class="of-submit">
    <button class="btn btn-dark" type="submit" data-owner-submit>Отправить объявление</button>
    <p class="lead-note" data-owner-note role="status"></p>
  </div>
</form>
<div class="owner-done" data-owner-done hidden><h2>Спасибо, объявление отправлено</h2><p>Мы свяжемся с вами в течение дня по указанному телефону.</p><p><a class="btn btn-line" href="/">На главную</a></p></div>
</div></section>`,
  }));
  addUrl('/podat-obyavlenie/');
}

// Избранное (заполняется скриптом из localStorage)
write('izbrannoe/index.html', page({
  title: 'Избранное', desc: 'Объекты, которые вы сохранили.', url: '/izbrannoe/',
  body: `<section class="page-head"><div class="wrap">${crumbs([['/', 'Главная'], ['/izbrannoe/', 'Избранное']])}<h1>Избранное</h1><p class="page-lead">Объекты, отмеченные сердечком. Список хранится в этом браузере.</p></div></section>
<section class="block block-tight"><div class="wrap"><div class="cards cards-grid" data-favs></div><p class="empty" data-favs-empty hidden>Пока пусто. Нажмите на сердечко у объекта, чтобы сохранить его здесь. <a href="/arenda/">Перейти в каталог</a></p></div></section>`,
}));

// Контакты
write('kontakty/index.html', page({
  title: `Контакты — ${SITE.name}`, desc: 'Как связаться с агентством: Telegram, WhatsApp, телефон.', url: '/kontakty/', nav: 'contacts',
  body: `<section class="page-head"><div class="wrap">${crumbs([['/', 'Главная'], ['/kontakty/', 'Контакты']])}<h1>Контакты</h1><p class="page-lead">Работаем с русскоязычными клиентами в Белграде: подбор жилья, просмотры, проверка документов, белый картон, счёт в банке и ВНЖ.</p></div></section>
<section class="block block-tight"><div class="wrap"><dl class="contacts">
  ${SITE.phone ? `<div><dt>Телефон</dt><dd><a href="${esc(telHref)}">${esc(SITE.phone)}</a></dd></div>` : ''}
  <div><dt>Telegram</dt><dd><a href="https://t.me/${esc(SITE.tg)}" rel="noopener">@${esc(SITE.tg)}</a></dd></div>
  ${waDigits ? `<div><dt>WhatsApp</dt><dd><a href="https://wa.me/${waDigits}" rel="noopener">Написать</a></dd></div>` : ''}
  ${SITE.channel ? `<div><dt>Канал с новыми объектами</dt><dd><a href="https://t.me/${esc(SITE.channel)}" rel="noopener">@${esc(SITE.channel)}</a></dd></div>` : ''}
  <div><dt>Город</dt><dd>Белград, Сербия</dd></div>
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
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /izbrannoe/\n${SITE.url ? `Sitemap: ${SITE.url}/sitemap.xml\n` : ''}`);
write('llms.txt', `# ${SITE.name}

> Каталог квартир и домов в Белграде (Сербия) для аренды и покупки, объекты от собственников, описания на русском языке. Агентство помогает русскоязычным клиентам с подбором жилья, просмотрами, белым картоном, регистрацией, банковским счётом и ВНЖ.

Контакты: Telegram @${SITE.tg}${SITE.phone ? `, телефон ${SITE.phone}` : ''}.

## Разделы
- [Аренда](${abs('/arenda/')}): ${objects(byDeal.rent.length)}
- [Покупка](${abs('/prodazha/')}): ${objects(byDeal.sale.length)}
${COLLECTIONS.map((c) => `- [${c.title}](${abs(`/podborki/${c.slug}/`)}): ${objects(c.items.length)}`).join('\n')}

## Районы
${['rent', 'sale'].flatMap((k) => districtsOf(byDeal[k]).map((d) => `- [${k === 'rent' ? 'Аренда' : 'Продажа'}: ${d.name}](${abs(`/${DEAL[k].path}/${d.slug}/`)}): ${objects(d.items.length)}`)).join('\n')}
`);
write('_headers', `/assets/*\n  Cache-Control: public, max-age=300\n/photos/*\n  Cache-Control: public, max-age=2592000\n`);

console.log(`Готово: ${LISTINGS.length} объектов, ${sitemap.length} страниц в sitemap, папка dist/`);

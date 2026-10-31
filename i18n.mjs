// Английская версия сайта. Сборка с SITE_LANG=en рисует те же страницы, что и русская,
// а здесь готовая разметка переводится: тексты интерфейса и услуг — по словарю i18n/en.json,
// характеристики объектов — по таблицам ниже, названия мест — транслитерацией на латиницу.
// Новые фразы, которых нет в словаре, сборка печатает в конце: их нужно добавить в i18n/en.json.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CYR = /[А-Яа-яЁё]/;
const norm = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- места ----------
const DISTRICTS = {
  'Бараево': 'Barajevo', 'Вождовац': 'Voždovac', 'Врачар': 'Vračar', 'Гроцка': 'Grocka', 'Звездара': 'Zvezdara', 'Земун': 'Zemun',
  'Лазаревац': 'Lazarevac', 'Младеновац': 'Mladenovac', 'Новый Белград': 'New Belgrade', 'Обреновац': 'Obrenovac', 'Палилула': 'Palilula',
  'Раковица': 'Rakovica', 'Савски-Венац': 'Savski Venac', 'Сопот': 'Sopot', 'Старый город': 'Stari Grad', 'Сурчин': 'Surčin', 'Чукарица': 'Čukarica',
  'Белград': 'Belgrade', 'Сербия': 'Serbia', 'Нови-Сад': 'Novi Sad', 'Дорчол': 'Dorćol', 'центр': 'centre',
};
const LAT = [
  ['дж', 'dž'], ['ль', 'lj'], ['нь', 'nj'], ['я', 'ja'], ['ю', 'ju'], ['ё', 'jo'], ['щ', 'šč'], ['ш', 'š'], ['ж', 'ž'], ['ч', 'č'], ['ц', 'c'], ['х', 'h'], ['й', 'j'],
  ['а', 'a'], ['б', 'b'], ['в', 'v'], ['г', 'g'], ['д', 'd'], ['е', 'e'], ['з', 'z'], ['и', 'i'], ['к', 'k'], ['л', 'l'], ['м', 'm'], ['н', 'n'], ['о', 'o'],
  ['п', 'p'], ['р', 'r'], ['с', 's'], ['т', 't'], ['у', 'u'], ['ф', 'f'], ['ы', 'i'], ['э', 'e'], ['ь', ''], ['ъ', ''],
];
function translit(s) {
  let out = '';
  const low = s.toLowerCase();
  for (let i = 0; i < s.length;) {
    const hit = LAT.find(([c]) => low.startsWith(c, i));
    if (!hit) { out += s[i]; i++; continue; }
    const up = s[i] !== low[i];
    out += up && hit[1] ? hit[1][0].toUpperCase() + hit[1].slice(1) : hit[1];
    i += hit[0].length;
  }
  return out;
}
export const place = (s) => {
  const t = norm(s);
  if (!t || !CYR.test(t)) return t;
  return DISTRICTS[t] || t.split(/(,\s*|\s+-\s+)/).map((p) => DISTRICTS[p] || (CYR.test(p) ? translit(p) : p)).join('');
};

// ---------- характеристики объектов ----------
const VALUES = {
  // отопление
  'центральное': 'central heating', 'автономное': 'individual heating', 'аккумуляционные печи': 'storage heaters', 'тёплый пол': 'underfloor heating',
  'тепловой насос': 'heat pump', 'газовое': 'gas heating', 'норвежские радиаторы': 'electric panel heaters', 'мраморные радиаторы': 'marble heaters',
  'электрическое': 'electric heating', 'кондиционер': 'air conditioning', 'твёрдое топливо': 'solid fuel', 'изразцовая печь': 'tiled stove',
  // мебель, состояние, дом
  'с мебелью': 'furnished', 'без мебели': 'unfurnished', 'частично меблирована': 'partly furnished', 'частично меблирован': 'partly furnished',
  'люкс': 'luxury finish', 'после ремонта': 'renovated', 'требует ремонта': 'needs renovation', 'в исходном состоянии': 'original condition',
  'новое': 'new', 'строится': 'under construction', 'старый фонд': 'older building', 'дом строится': 'building under construction',
  'дом современной постройки': 'modern building', 'новостройка': 'new build',
  // удобства
  'терраса': 'terrace', 'лифт': 'elevator', 'подвал': 'storage room', 'домофон': 'intercom', 'интернет': 'internet', 'гараж': 'garage', 'парковка': 'parking',
  'французский балкон': 'French balcony', 'лоджия': 'loggia', 'кабельное ТВ': 'cable TV', 'видеонаблюдение': 'video surveillance',
  'можно въехать сразу': 'available immediately', 'депозит': 'deposit', 'можно с животными': 'pets allowed', 'двухуровневая': 'duplex',
  'пентхаус': 'penthouse', 'мансарда': 'attic', 'доступ для колясок': 'wheelchair access', 'энергопаспорт': 'energy certificate', 'с садом': 'with garden',
  'камин': 'fireplace', 'подходит студентам': 'suitable for students', 'для некурящих': 'non-smokers only', 'горячая вода': 'hot water',
  'салонная планировка': 'salon-type layout', 'не последний этаж': 'not the top floor', 'есть право собственности': 'registered ownership',
  'требуется, сумму уточним': 'required, amount on request', 'требуется': 'required',
  // подписи характеристик
  'Площадь': 'Area', 'Комнат': 'Rooms', 'Этаж': 'Floor', 'Отопление': 'Heating', 'Мебель': 'Furniture', 'Состояние': 'Condition', 'Дом': 'Building',
  'Коммунальные': 'Utilities', 'Депозит': 'Deposit', 'Студия': 'Studio', 'Дом ': 'House',
};
const FLOOR = { 'первый': 'ground floor', 'высокий первый': 'raised ground floor', 'низкий первый': 'lower ground floor', 'полуподвал': 'semi-basement', 'подвал': 'basement', 'мансарда': 'attic floor' };
const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
function floorEn(v) {
  const m = norm(v).match(/^(.+?)(?: \((?:дом в (\d+) этаж\S*|дом одноэтажный)\))?$/);
  if (!m) return null;
  const [, name, total] = m;
  const base = /^(\d+)-й$/.test(name) ? `${ordinal(+name.match(/\d+/)[0])} floor` : FLOOR[name];
  if (!base) return null;
  if (/одноэтажный/.test(v)) return `${base} (single-storey building)`;
  return total ? `${base} (${total}-storey building)` : base;
}
const value = (v) => {
  const t = norm(v);
  if (VALUES[t]) return VALUES[t];
  const f = floorEn(t);
  if (f) return f;
  if (t.includes(' + ')) return t.split(' + ').map(value).join(' + ');
  if (t.includes(', ')) { const parts = t.split(', ').map((x) => VALUES[x]); if (parts.every(Boolean)) return parts.join(', '); }
  let m = t.match(/^около (\d[\d ]*) € в месяц$/);
  if (m) return `about ${m[1]} € per month`;
  return null;
};

// ---------- типы объектов ----------
const ROOMS_WORD = { 'однокомнатная': 1, 'двухкомнатная': 2, 'трёхкомнатная': 3, 'четырёхкомнатная': 4 };
function kindEn(k) {
  const t = norm(k).toLowerCase();
  if (t === 'студия') return 'studio';
  if (t === 'дом') return 'house';
  if (t === 'квартира') return 'apartment';
  let m = t.match(/^(\S+) квартира$/);
  if (m) {
    const n = ROOMS_WORD[m[1]] || m[1].replace(/-комнатная$/, '').replace(',', '.');
    return `${n}-room apartment`;
  }
  return null;
}
const capF = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---------- словарь и правила ----------
let DICT = null;
const MISSES = new Map();
function dict() {
  if (!DICT) {
    DICT = {};
    try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'en.json'), 'utf8')))) DICT[norm(k)] = v; } catch (e) { /* пустой словарь */ }
  }
  return DICT;
}
const NUM = '(\\d[\\d\\s.,]*)';
const plEn = (n, w) => `${n} ${w}${String(n).trim() === '1' ? '' : 's'}`;
// Шаблонные фразы с числами и названиями мест
const RULES = [
  [new RegExp(`^${NUM}\\s*(объект|объекта|объектов)$`), (m) => plEn(m[1].trim(), 'listing')],
  [new RegExp(`^${NUM}\\s*м²$`), (m) => `${m[1].trim()} m²`],
  [new RegExp(`^${NUM}\\s*комн\\.$`), (m) => `${m[1].trim()} rooms`],
  [/^(.+), (\d[\d.,]*)\s*м²$/, (m) => { const k = kindEn(m[1]) || tr(m[1]); return k && `${capF(k)}, ${m[2]} m²`; }],
  [/^(.+) м²$/, (m) => { const x = tr(m[1]); return x && `${x} m²`; }],
  [/^(.+)\/м²$/, (m) => `${m[1]}/m²`],
  [/^(.+) \/ мес$/, (m) => `${tr(m[1]) || m[1]} / mo`],
  [/^\/ мес$/, () => '/ mo'],
  [/^ \/ мес$/, () => ' / mo'],
  [/^(Аренда|Продажа) · (.+)$/, (m) => `${m[1] === 'Аренда' ? 'Rent' : 'Sale'} · ${place(m[2])}`],
  [/^Фото (\d+)$/, (m) => `Photo ${m[1]}`],
  [/^(\d+) фото$/, (m) => plEn(m[1], 'photo')],
];
// Части фраз внутри строк, где остальное уже переведено (заголовки карточек, подписи фото и т.п.)
const FRAGS = [
  [/(\d)\s*м²/g, '$1 m²'], [/\/м²/g, '/m²'], [/ м²/g, ' m²'],
  [/,? фото (\d+)/g, ', photo $1'], [/^\+(\d+) фото$/, '+$1 photos'],
  [/ в аренду,/g, ' for rent,'], [/ на продажу,/g, ' for sale,'], [/ в аренду$/g, ' for rent'], [/ на продажу$/g, ' for sale'],
  [/ € в месяц/g, ' € per month'], [/ € \/ мес/g, ' € / mo'], [/ \/ мес/g, ' / mo'],
  [/\. Перезвоним и согласуем время\./g, '. We will call you back to arrange a time.'],
  [/Белград/g, 'Belgrade'], [/Цена по запросу/g, 'Price on request'],
];
const MONTHS = { января: 'January', февраля: 'February', марта: 'March', апреля: 'April', мая: 'May', июня: 'June', июля: 'July', августа: 'August', сентября: 'September', октября: 'October', ноября: 'November', декабря: 'December' };
const dateEn = (s) => s.replace(/(\d+) ([а-я]+) (\d{4})/g, (m, d, mo, y) => (MONTHS[mo] ? `${MONTHS[mo]} ${d}, ${y}` : m));
const COMPLEX = [
  [/^Квартиры и дома (на продажу|в аренду) в районе (.+?), Белград\.\s*(\d+) объект\S*,?\s*(?:цены от\s*(.*?)\.?)?$/, (m) => `Apartments and houses ${m[1] === 'в аренду' ? 'for rent' : 'for sale'} in ${place(m[2])}, Belgrade. ${plEn(m[3], 'listing')}${m[4] ? `, prices from ${m[4]}.` : ''}`],
  [/^Опубликовано на сайте (.+?)(?:, обновлено (.+))?$/, (m) => `Listed on ${dateEn(m[1])}${m[2] ? `, updated ${dateEn(m[2])}` : ''}`],
  [/^(.+?)\s+(\d+) объект\S*, цены от (.+?)\.?$/, (m) => { const lead = tr(m[1]); return lead && `${lead} ${plEn(m[2], 'listing')}, prices from ${m[3]}.`; }],
  [/^(.+?)\s+(\d+) объект\S*, цены от$/, (m) => { const lead = tr(m[1]); return lead && `${lead} ${plEn(m[2], 'listing')}, prices from`; }],
  [/^(.+?)\s+(\d+) объект\S*\.?$/, (m) => { const lead = tr(m[1]); return lead && `${lead} ${plEn(m[2], 'listing')}.`; }],
  [/^(.+) — (\d+) объект\S* от собственников$/, (m) => { const x = tr(m[1]); return x && `${x} — ${plEn(m[2], 'listing')} from owners`; }],
  [/^(.+)\. Сейчас объектов нет: оставьте запрос, и мы подберём варианты вручную\.$/, (m) => { const x = tr(m[1] + '.') || tr(m[1]); return x && `${x.replace(/\.$/, '')}. No listings right now: leave a request and we will find options for you.`; }],
  [/^Квартиры и дома в аренду в районе (.+?), Белград\. Сейчас объектов нет.*$/, (m) => `Apartments and houses for rent in ${place(m[1])}, Belgrade. No listings right now: leave a request and we will find options for you.`],
  [/^Квартиры и дома на продажу в районе (.+?), Белград\. Сейчас объектов нет.*$/, (m) => `Apartments and houses for sale in ${place(m[1])}, Belgrade. No listings right now: leave a request and we will find options for you.`],
  [/^(.+) — (Maxis Group|Недвижимость Сербии: покупка и аренда)$/, (m) => { const x = tr(m[1]); return x && `${x} — ${m[2] === 'Maxis Group' ? 'Maxis Group' : 'Real Estate in Serbia'}`; }],
  [/^Аренда и покупка квартир и домов в Белграде от собственников: (\d+) объект\S* с фото, ценами и описанием на русском\. Помощь с белым картоном, счётом в банке и ВНЖ\.$/, (m) => `Apartments and houses in Belgrade for rent and for sale, directly from owners: ${plEn(m[1], 'listing')} with photos, prices and descriptions. Help with residence registration, bank accounts and residence permits.`],
  [/^Все объекты на карте Белграда: (\d+) объект\S* в аренду и на продажу от собственников\. Фильтр по району, комнатам и цене\.$/, (m) => `All listings on the Belgrade map: ${plEn(m[1], 'listing')} for rent and for sale from owners. Filter by district, rooms and price.`],
  [/^Медиана по объявлениям в нашем каталоге на (\S+)\. Это ориентир, а не рыночная оценка\.$/, (m) => `Median of the listings in our catalogue as of ${m[1]}. A guide, not a market valuation.`],
  [/^Цены указаны в евро\. Курс для пересчёта на (\S+): 1 € = (\S+) дин\. = (\S+) ₽\.$/, (m) => `Prices are in euros. Exchange rate as of ${m[1]}: 1 € = ${m[2]} RSD = ${m[3]} RUB.`],
  [/^Пересчёт из евро по курсу на (\S+)\. Цена в договоре — в евро\.$/, (m) => `Converted from euros at the rate of ${m[1]}. The contract price is in euros.`],
  [/^(\d[\d,]*)–(\d[\d,]*) комнаты$/, (m) => `${m[1].replace(',', '.')}–${m[2].replace(',', '.')} rooms`],
  [/^(.+), на главную$/, (m) => `${m[1]}, home page`],
  [/^Посредник: (.+), номер в Реестре посредников (\d+)\.$/, (m) => `Broker: ${m[1]}, Register of Brokers no. ${m[2]}.`],
];
const PLACE_RULES = [
  [/^О районе (.+)$/, (p) => `About ${p}`],
  [/^Ещё в районе (.+)$/, (p) => `More in ${p}`],
  [/^Аренда квартир в районе (.+)$/, (p) => `Apartments for rent in ${p}`],
  [/^Аренда квартир и домов в районе (.+)$/, (p) => `Apartments and houses for rent in ${p}`],
  [/^Продажа квартир и домов в районе (.+)$/, (p) => `Apartments and houses for sale in ${p}`],
  [/^Продажа квартир в районе (.+)$/, (p) => `Apartments for sale in ${p}`],
];
function tr(s) {
  const t = norm(s);
  if (!t || !CYR.test(t)) return t;
  const D = dict();
  if (D[t] != null) return D[t];
  const v = value(t);
  if (v) return v;
  const k = kindEn(t);
  if (k) return capF(k);
  if (DISTRICTS[t]) return DISTRICTS[t];
  for (const [re, fn] of RULES) { const m = t.match(re); if (m) { const r = fn(m); if (r && !CYR.test(r)) return r; } }
  for (const [re, fn] of COMPLEX) { const m = t.match(re); if (m) { const r = fn(m); if (r && !CYR.test(r)) return r; } }
  for (const [re, fn] of PLACE_RULES) { const m = t.match(re); if (m) return fn(place(m[1])); }
  let x = t;
  for (const [re, rep] of FRAGS) x = x.replace(re, rep);
  if (!CYR.test(x)) return x;
  // «… — 2 600 € в месяц» и подобные хвосты уже заменены; остаток мог быть названием места
  const y = x.replace(/[А-ЯЁ][А-Яа-яЁё]*(?:[ -][А-ЯЁа-яё][а-яё]*)*/g, (w) => (KNOWN_PLACES.has(w) || DISTRICTS[w] ? place(w) : w));
  return CYR.test(y) ? null : y;
}
// Перевод строки; если перевода нет — названия мест транслитерируются, остальное запоминается как пропуск
export function str(s, where = '') {
  const r = tr(s);
  if (r != null) return r;
  const t = norm(s);
  if (t.split(/,\s*/).every((p) => KNOWN_PLACES.has(p) || DISTRICTS[p])) return place(t);
  MISSES.set(t, (MISSES.get(t) || 0) + 1);
  return t;
}

// ---------- объект на английском ----------
const KNOWN_PLACES = new Set(); // названия мест из объектов: только их можно транслитерировать без словаря
export function enListing(l) {
  for (const x of [l.district, l.location, l.street, l.city]) if (x) KNOWN_PLACES.add(norm(x));
  const sale = l.deal === 'sale';
  const kind = kindEn(l.kind) || (l.type === 'house' ? 'house' : 'apartment');
  const district = place(l.district);
  const location = place(l.location);
  const street = place(l.street);
  const facts = l.facts || [];
  const fv = (k) => { const x = facts.find(([a]) => a === k); return x ? (value(x[1]) || x[1]) : ''; };
  const where = location ? `in ${location}${district && district !== location ? ` (${district})` : ''}` : district ? `in ${district}` : '';
  const feats = (l.features || []).map((x) => VALUES[x]).filter(Boolean);
  const s1 = `${capF(kind)} ${sale ? 'for sale' : 'for rent'}${l.area ? `, ${l.area} m²` : ''}${where ? `, ${where}` : ''}.`;
  const bits = [l.type !== 'house' && fv('Этаж') && `Floor: ${fv('Этаж')}`, fv('Отопление') && `Heating: ${fv('Отопление')}`].filter(Boolean);
  const cond = [fv('Мебель'), fv('Состояние'), fv('Дом')].filter(Boolean).join(', ');
  const s2 = [...bits, cond && capF(cond)].filter(Boolean).map((x) => x + '.').join(' ');
  const s3 = feats.length ? `Amenities: ${feats.join(', ')}.` : '';
  const s4 = l.price ? `${sale ? 'Price' : 'Rent'}: ${Number(l.price).toLocaleString('en-US').replace(/,/g, ' ')} €${sale ? '' : ' per month'}.` : 'Price on request.';
  const dep = fv('Депозит');
  const s5 = dep && !sale ? `Deposit: ${dep}.` : '';
  return {
    ...l,
    kind,
    district, location, street, city: 'Belgrade',
    title: `${sale ? 'For sale' : 'For rent'}: ${kind}${l.area ? `, ${l.area} m²` : ''}${[location, district].filter(Boolean).length ? `, ${[...new Set([location, district].filter(Boolean))].join(', ')}` : ''}`,
    text: [s1, s2, s3, s4, s5].filter(Boolean).join(' '),
    original: '',
  };
}

// ---------- перевод готовой страницы ----------
function links(html) {
  return html.replace(/(\s(?:href|action))="\/([^"]*)"/g, (all, attr, rest) => {
    if (/^(assets|photos|api|en|data)(\/|$)/.test(rest) || rest.startsWith('/')) return all;
    return `${attr}="/en/${rest}"`;
  });
}
function jsonLd(html) {
  return html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (all, a, body, b) => {
    try {
      const walk = (v) => (typeof v === 'string' ? (CYR.test(v) ? str(v, 'json') : v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'inLanguage' ? 'en' : walk(x)])) : v);
      return a + JSON.stringify(walk(JSON.parse(body))).replace(/</g, '\\u003c') + b;
    } catch (e) { return all; }
  });
}
const ATTRS = /(\s(?:content|title|alt|placeholder|aria-label|data-dd-label|data-suf|data-label|data-empty|data-sent|data-err))="([^"]*[А-Яа-яЁё][^"]*)"/g;
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escA = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escT = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function makeTranslator() {
  return {
    str,
    page(html) {
      let h = jsonLd(html);
      // скрипты и стили не трогаем
      const keep = [];
      h = h.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
      h = h.replace(ATTRS, (all, attr, v) => `${attr}="${escA(str(unesc(v)))}"`);
      h = h.replace(/>([^<>]*[А-Яа-яЁё][^<>]*)</g, (all, txt) => {
        const lead = txt.match(/^\s*/)[0], trail = txt.match(/\s*$/)[0];
        return `>${lead}${escT(str(unesc(txt)))}${trail}<`;
      });
      h = h.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
      return links(h);
    },
    report() {
      if (!MISSES.size) { console.log('Перевод: все строки переведены'); return; }
      const list = [...MISSES.entries()].sort((a, b) => b[1] - a[1]);
      fs.writeFileSync(path.join(ROOT, 'i18n', 'missing.json'), JSON.stringify(Object.fromEntries(list.map(([k]) => [k, ''])), null, 1));
      console.log(`Перевод: нет перевода для ${list.length} строк (список в i18n/missing.json)`);
    },
  };
}

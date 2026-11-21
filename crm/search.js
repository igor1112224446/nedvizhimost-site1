// Умный поиск по базе объектов: разбирает запрос вроде «двушка на Врачаре до 1000 евро от 50 метров с террасой»
// в фильтры и подбирает объекты. Работает в браузере без внешних сервисов; если у робота подключён
// Workers AI, его разбор дополняет этот (см. mergeAi).

export const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

// латиница по-сербски → кириллица: vračar → врачар, novi beograd → нови београд
const LAT = [['dž', 'дж'], ['dj', 'дж'], ['lj', 'ль'], ['nj', 'нь'], ['đ', 'дж'], ['ć', 'ч'], ['č', 'ч'], ['š', 'ш'], ['ž', 'ж'], ['ch', 'ч'], ['sh', 'ш'], ['zh', 'ж'],
  ['a', 'а'], ['b', 'б'], ['c', 'ц'], ['d', 'д'], ['e', 'е'], ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'й'], ['k', 'к'], ['l', 'л'], ['m', 'м'],
  ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['z', 'з'], ['y', 'ы'], ['w', 'в'], ['x', 'кс'], ['q', 'к']];
function lat2cyr(w) {
  let out = '';
  for (let i = 0; i < w.length;) {
    const p = LAT.find(([l]) => w.startsWith(l, i));
    if (p) { out += p[1]; i += p[0].length; } else { out += w[i]; i++; }
  }
  return out;
}
const KEEP_LATIN = /^(eur|euro|evro|m2|sqm|k|wa|tg|ok)$/;
export function prepare(q) {
  let s = norm(q).replace(/[a-zčćšžđ]{3,}/g, (w) => (KEEP_LATIN.test(w) ? w : lat2cyr(w)));
  // «1 000», «1.000» → 1000; «1,5» → 1.5
  for (let i = 0; i < 3; i++) s = s.replace(/(\d)[\s.](\d{3})(?!\d)/g, '$1$2');
  return s.replace(/(\d),(\d)/g, '$1.$2');
}

// ---------- районы и микрорайоны ----------
const NOT_PLACE = /^(белград|београд|градска локация|луксузан|планина)$|\d\s*\/|©/i;
const stem = (w) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2)));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '(?:^|[^а-яa-z0-9])';
// устойчивые названия, которые по корню не угадать
const ALIASES = [
  { re: 'нов\\S*\\s+(?:белград|београд)\\S*|новобелград\\S*|нбг|н\\.\\s?белград\\S*', names: ['Новый Белград'] },
  { re: 'стар\\S*\\s+(?:город|град)\\S*|стари\\s*-?\\s*град\\S*', names: ['Старый город'] },
  { re: 'центр\\S*|центральн\\S* район\\S*', names: ['Старый город', 'Врачар', 'Савски-Венац'], loc: ['Центр'] },
  { re: '(?:белград|београд)\\S*\\s+на\\s+вод\\S*|бнв|waterfront|ватерфронт\\S*', loc: ['Београд на води', 'Београд на води -'] },
];
function placeRe(name) {
  const words = norm(name).replace(/\(.*?\)/g, ' ').replace(/[-–]/g, ' ').split(' ').filter((w) => w && !/^\d+$/.test(w));
  if (!words.length) return null;
  if (words.length === 1 && words[0].length < 5) return null; // слишком коротко: «блок», «пут» совпадут с чем угодно
  return words.map((w) => reEsc(stem(w))).join('\\S*[\\s-]+') + '\\S*';
}
export function buildIndex(items) {
  const count = (key) => items.reduce((m, l) => (l[key] ? m.set(l[key], (m.get(l[key]) || 0) + 1) : m), new Map());
  const districts = [...count('district').keys()].filter((n) => !NOT_PLACE.test(n));
  const locations = [...count('location').entries()].filter(([n]) => n && !NOT_PLACE.test(n) && !districts.includes(n)).map(([n]) => n);
  const mk = (names, field) => names.map((name) => ({ name, field, re: placeRe(name) })).filter((x) => x.re);
  return { districts, locations, places: [...mk(districts, 'district'), ...mk(locations, 'location')] };
}
function findPlaces(s, index) {
  const found = [];
  let rest = s;
  const take = (re) => {
    const r = new RegExp(B + '(' + re + ')', 'i');
    const m = rest.match(r);
    if (!m) return false;
    rest = rest.replace(m[1], ' ');
    return true;
  };
  for (const a of ALIASES) {
    if (!take(a.re)) continue;
    (a.names || []).forEach((n) => index.districts.includes(n) && found.push({ name: n, field: 'district' }));
    (a.loc || []).forEach((n) => index.locations.includes(n) && found.push({ name: n, field: 'location' }));
  }
  const blk = rest.match(/блок\S*\s*(\d{1,3})/);
  if (blk) {
    index.locations.filter((n) => new RegExp(`блок\\s*${blk[1]}(?!\\d)`, 'i').test(n)).forEach((n) => found.push({ name: n, field: 'location' }));
    rest = rest.replace(blk[0], ' ');
  }
  // сначала длинные названия, чтобы «Баново брдо» не съелось чем-то коротким
  for (const p of [...index.places].sort((a, b) => b.re.length - a.re.length)) {
    if (take(p.re)) found.push({ name: p.name, field: p.field });
  }
  const seen = new Set();
  return { places: found.filter((p) => !seen.has(p.field + p.name) && seen.add(p.field + p.name)), rest };
}

// ---------- удобства ----------
const has = (l, re) => (l.features || []).some((f) => re.test(f));
const fact = (l, name) => ((l.facts || []).find((f) => f[0] === name) || [])[1] || '';
export const FEATURES = [
  { key: 'terrace', label: 'терраса', q: /терр?ас/, test: (l) => has(l, /терраса/) },
  { key: 'balcony', label: 'балкон или лоджия', q: /балкон|лодж/, test: (l) => has(l, /терраса|лоджия|балкон/) },
  { key: 'lift', label: 'лифт', q: /лифт/, test: (l) => has(l, /лифт/) },
  { key: 'parking', label: 'парковка', q: /парков|паркинг|машин|parking/, test: (l) => has(l, /парковка|гараж/) },
  { key: 'garage', label: 'гараж', q: /гараж/, test: (l) => has(l, /гараж/) },
  { key: 'pets', label: 'можно с животными', q: /живот|питом|собак|кошк|(?:^|[^а-я])кот(?:[^а-я]|$)|пес(?:[^а-я]|$)|пёс/, test: (l) => has(l, /животн/) },
  { key: 'ac', label: 'кондиционер', q: /кондиц|клима/, test: (l) => has(l, /кондиционер/) || /кондиционер/.test(fact(l, 'Отопление')) },
  { key: 'nofurn', label: 'без мебели', q: /без мебел|пуст[ауо]/, test: (l) => /без мебели/.test(fact(l, 'Мебель')) },
  { key: 'furn', label: 'с мебелью', q: /с мебел|мебелью|меблир|обставлен/, test: (l) => /с мебелью|частично/.test(fact(l, 'Мебель')) },
  { key: 'new', label: 'новый дом', q: /новостро|новый дом|новогра|современн\S* (?:дом|постро)/, test: (l) => l.cat === 'new' || /современ/.test(fact(l, 'Дом')) },
  { key: 'renov', label: 'после ремонта', q: /ремонт|люкс|lux/, test: (l) => /ремонт|люкс/.test(fact(l, 'Состояние')) },
  { key: 'garden', label: 'сад или двор', q: /(?:^|[^а-я])сад(?:ом)?(?:[^а-я]|$)|двор/, test: (l) => has(l, /сад/) },
  { key: 'students', label: 'подходит студентам', q: /студент/, test: (l) => has(l, /студент/) },
  { key: 'now', label: 'можно въехать сразу', q: /сразу|срочно|сегодня|немедленн|завтра/, test: (l) => has(l, /сразу/) },
  { key: 'central', label: 'центральное отопление', q: /центральн\S* отоплен|(?:^|[^а-я])цо(?:[^а-я]|$)/, test: (l) => /центральн/.test(fact(l, 'Отопление')) },
  { key: 'fireplace', label: 'камин', q: /камин/, test: (l) => has(l, /камин/) },
  { key: 'penthouse', label: 'пентхаус', q: /пентхаус/, test: (l) => has(l, /пентхаус/) },
  { key: 'duplex', label: 'двухуровневая', q: /двухуров|дуплекс/, test: (l) => has(l, /двухуровн/) },
];

// ---------- разбор запроса ----------
const EURO = /^(€|евро|eur\S*|евр\S*|e)$/;
const AREA = /^(м2|м²|м|кв\S*|метр\S*|квадрат\S*|m2|sqm)$/;
const MAX_OP = /^(до|не более|не дороже|дешевле|меньше|максимум|макс|бюджет|за|в пределах|не выше)$/;
const MIN_OP = /^(от|не менее|не дешевле|дороже|больше|минимум|мин|свыше|выше)$/;
const ABOUT_OP = /^(около|примерно|порядка|~)$/;
const NUM_RE = /(?:(не более|не менее|не дороже|не дешевле|не выше|в пределах|от|до|дешевле|дороже|больше|меньше|максимум|минимум|макс|мин|бюджет|свыше|выше|за|около|примерно|порядка|~)\s*)?(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|до)\s*(\d+(?:\.\d+)?))?\s*(тыс\S*|млн|k(?![a-z])|к(?![а-я]))?\s*(€|евро|eur\S*|евр\S*|м2|м²|кв\S*|метр\S*|квадрат\S*|м(?![а-я])|комн\S*|-?комн\S*|соб[аеи]\S*|спал\S*|этаж\S*|e(?![a-z]))?/g;

const ROOM_WORDS = [
  { re: /студи|гарсон|garsonj/, rooms: [0.5] },
  { re: /однуш|однокомн|одна комн|(?:^|[^\d.])1[\s-]*комн/, rooms: [1, 1.5] },
  { re: /полутор|1\.5[\s-]*комн/, rooms: [1.5] },
  { re: /двуш|двухкомн|двукомн|две комн|(?:^|[^\d.])2[\s-]*комн/, rooms: [2, 2.5] },
  { re: /треш|трех|трёх|три комн|(?:^|[^\d.])3[\s-]*комн/, rooms: [3, 3.5] },
  { re: /четыр|четырех|(?:^|[^\d.])4[\s-]*комн|4\+|многокомн|(?:^|[^\d.])5[\s-]*комн|пятикомн/, roomsMin: 4 },
];

export function parseQuery(q, index) {
  const s = prepare(q);
  const f = { deal: null, type: null, places: [], priceMin: null, priceMax: null, areaMin: null, areaMax: null, rooms: null, roomsMin: null, features: [] };
  const { places, rest } = findPlaces(s, index);
  f.places = places;
  for (const r of ROOM_WORDS) {
    if (!r.re.test(rest)) continue;
    if (r.rooms) f.rooms = [...new Set([...(f.rooms || []), ...r.rooms])];
    if (r.roomsMin) f.roomsMin = r.roomsMin;
  }
  for (const m of rest.matchAll(NUM_RE)) {
    let [, op = '', a, b, mult = '', unit = ''] = m;
    const k = /тыс|k|к/.test(mult) ? 1000 : /млн/.test(mult) ? 1e6 : 1;
    let x = +a * k;
    let y = b != null ? +b * k : null;
    unit = unit.replace(/^-/, '');
    if (/^этаж/.test(unit)) continue;
    // «2к» без «до/от» — это двушка, а «до 2к» — 2000 €
    if (/^(k|к)$/.test(mult) && !op && !unit && +a <= 6 && b == null) { f.rooms = [...new Set([...(f.rooms || []), +a, +a + 0.5])]; continue; }
    if (/^(комн|спал|соб)/.test(unit)) {
      const n = /^спал/.test(unit) ? +a + 1 : +a;
      if (MIN_OP.test(op)) f.roomsMin = n;
      else f.rooms = [...new Set([...(f.rooms || []), ...(Number.isInteger(n) ? [n, n + 0.5] : [n])])];
      continue;
    }
    let kind = EURO.test(unit) ? 'price' : AREA.test(unit) ? 'area' : null;
    if (!kind) {
      // без единиц: 1900–2100 рядом с «год» — это год; большое число — цена, маленькое — площадь
      if (x >= 1900 && x <= 2100 && /год|построй/.test(rest.slice(m.index + m[0].length, m.index + m[0].length + 12))) continue;
      kind = x >= 200 ? 'price' : 'area';
    }
    const key = kind === 'price' ? 'price' : 'area';
    if (y != null) { f[key + 'Min'] = Math.min(x, y); f[key + 'Max'] = Math.max(x, y); }
    else if (MAX_OP.test(op)) f[key + 'Max'] = x;
    else if (MIN_OP.test(op)) f[key + 'Min'] = x;
    else if (ABOUT_OP.test(op)) { f[key + 'Min'] = Math.round(x * 0.9); f[key + 'Max'] = Math.round(x * 1.1); }
    else if (kind === 'price') f.priceMax = x;
    else { f.areaMin = Math.round(x * 0.9); f.areaMax = Math.round(x * 1.25); }
  }
  if (f.roomsMin) f.rooms = null;
  if (/куп|покуп|продаж|продае|продаё|в собственн|инвест|ипотек/.test(rest)) f.deal = 'sale';
  else if (/аренд|снять|сним|сдает|сдаёт|сдаю|в месяц|помесяч|долгосроч|на месяц|на год|кирий/.test(rest)) f.deal = 'rent';
  else if ((f.priceMax || f.priceMin || 0) >= 20000) f.deal = 'sale';
  else if (f.priceMax || f.priceMin) f.deal = 'rent';
  if (/(?:^|[^а-я])(дом|дома|домик|домом|коттедж\S*|вилл\S*|таунхаус\S*|кућ\S*|куч\S*)(?:[^а-я]|$)/.test(rest)) f.type = 'house';
  else if (/квартир|апартамент|студи|комнатн|двуш|треш|однуш/.test(rest)) f.type = 'apartment';
  f.features = FEATURES.filter((x) => x.q.test(rest)).map((x) => x.key);
  if (f.features.includes('nofurn')) f.features = f.features.filter((k) => k !== 'furn');
  return f;
}

// Разбор от ИИ дополняет местный: числа надёжнее берём свои, пробелы заполняем ответом ИИ
export function mergeAi(local, ai, index) {
  if (!ai || typeof ai !== 'object') return local;
  const f = { ...local, places: [...local.places], features: [...local.features] };
  const num = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);
  for (const k of ['priceMin', 'priceMax', 'areaMin', 'areaMax']) if (f[k] == null && num(ai[k])) f[k] = num(ai[k]);
  if (!f.deal && /^(rent|sale)$/.test(ai.deal)) f.deal = ai.deal;
  if (!f.type && /^(apartment|house)$/.test(ai.type)) f.type = ai.type;
  if (!f.rooms && !f.roomsMin && Array.isArray(ai.rooms) && ai.rooms.length) f.rooms = ai.rooms.map(Number).filter((n) => n > 0 && n < 20);
  if (!f.places.length && Array.isArray(ai.districts)) {
    for (const d of ai.districts) {
      const { places } = findPlaces(prepare(String(d)), index);
      f.places.push(...places);
    }
  }
  if (Array.isArray(ai.features)) {
    const txt = prepare(ai.features.join(', '));
    for (const x of FEATURES) if (x.q.test(txt) && !f.features.includes(x.key)) f.features.push(x.key);
  }
  return f;
}

// ---------- подбор ----------
function matches(l, f, slack = 0) {
  if (f.deal && l.deal !== f.deal) return false;
  if (f.type && l.type !== f.type) return false;
  if (f.places.length && !f.places.some((p) => l[p.field] === p.name)) return false;
  const price = +l.price || 0;
  const area = +l.area || 0;
  if (f.priceMax && (!price || price > f.priceMax * (1 + slack))) return false;
  if (f.priceMin && (!price || price < f.priceMin * (1 - slack))) return false;
  if (f.areaMax && area && area > f.areaMax * (1 + slack)) return false;
  if (f.areaMin && (!area || area < f.areaMin * (1 - slack))) return false;
  if (f.rooms && f.rooms.length && !f.rooms.includes(+l.rooms)) return false;
  if (f.roomsMin && !(+l.rooms >= f.roomsMin)) return false;
  return true;
}
const featOk = (l, keys) => keys.every((k) => FEATURES.find((x) => x.key === k)?.test(l));
function score(l, f) {
  let s = 0;
  if ((l.photos || 0) >= 3) s += 3; else if (l.photos) s += 1;
  const age = (Date.now() - Date.parse(l.added || 0)) / 864e5;
  if (age < 3) s += 3; else if (age < 14) s += 2; else if (age < 45) s += 1;
  if (f.priceMax && l.price) s += 2 * Math.max(0, 1 - Math.abs(f.priceMax * 0.85 - l.price) / f.priceMax);
  const okFeats = f.features.filter((k) => FEATURES.find((x) => x.key === k)?.test(l)).length;
  return s + okFeats * 2;
}
export function search(items, f, limit = 60) {
  const pick = (slack, feats) => items.filter((l) => matches(l, f, slack) && featOk(l, feats));
  let list = pick(0, f.features);
  let relaxed = '';
  if (!list.length && f.features.length) { list = pick(0, []); relaxed = 'Точных совпадений нет: ниже варианты без части удобств.'; }
  if (!list.length) { list = pick(0.15, []); relaxed = 'Точных совпадений нет: ниже варианты с ценой и площадью ±15%.'; }
  list = list.map((l) => ({ l, s: score(l, f) })).sort((a, b) => b.s - a.s).map((x) => x.l);
  return { items: list.slice(0, limit), total: list.length, relaxed };
}

// Подписи фильтров для «чипов»
export function describe(f) {
  const out = [];
  const eur = (n) => `${Number(n).toLocaleString('ru-RU')} €`;
  if (f.deal) out.push({ key: 'deal', text: f.deal === 'rent' ? 'Аренда' : 'Покупка' });
  if (f.type) out.push({ key: 'type', text: f.type === 'house' ? 'Дом' : 'Квартира' });
  f.places.forEach((p, i) => out.push({ key: 'place:' + i, text: p.name }));
  if (f.priceMin || f.priceMax) out.push({ key: 'price', text: f.priceMin && f.priceMax ? `${eur(f.priceMin)} – ${eur(f.priceMax)}` : f.priceMax ? `до ${eur(f.priceMax)}` : `от ${eur(f.priceMin)}` });
  if (f.areaMin || f.areaMax) out.push({ key: 'area', text: f.areaMin && f.areaMax ? `${f.areaMin}–${f.areaMax} м²` : f.areaMax ? `до ${f.areaMax} м²` : `от ${f.areaMin} м²` });
  if (f.rooms?.length) out.push({ key: 'rooms', text: 'Комнат: ' + f.rooms.map((n) => (n === 0.5 ? 'студия' : String(n).replace('.', ','))).join(', ') });
  if (f.roomsMin) out.push({ key: 'roomsMin', text: `от ${f.roomsMin} комнат` });
  f.features.forEach((k) => out.push({ key: 'feat:' + k, text: FEATURES.find((x) => x.key === k)?.label || k }));
  return out;
}
export function dropFilter(f, key) {
  const g = { ...f, places: [...f.places], features: [...f.features] };
  if (key === 'deal' || key === 'type') g[key] = null;
  else if (key === 'price') { g.priceMin = null; g.priceMax = null; }
  else if (key === 'area') { g.areaMin = null; g.areaMax = null; }
  else if (key === 'rooms') g.rooms = null;
  else if (key === 'roomsMin') g.roomsMin = null;
  else if (key.startsWith('place:')) g.places.splice(+key.slice(6), 1);
  else if (key.startsWith('feat:')) g.features = g.features.filter((k) => k !== key.slice(5));
  return g;
}

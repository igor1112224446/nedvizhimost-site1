import { buildIndex, parseQuery, mergeAi, search, describe, dropFilter } from './search.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUSES = [
  ['new', 'Новые'], ['work', 'В работе'], ['offer', 'Отправлены варианты'], ['viewing', 'Показ'], ['deal', 'Сделка'], ['lost', 'Отказ'],
];
const KIND = { viewing: 'Запись на просмотр', match: 'Подбор', service: 'Услуга', owner: 'Собственник', manual: 'Вручную' };
const VIA = { wa: 'WhatsApp', tg: 'Telegram', call: 'Звонок' };

let leads = [];
let objects = [];
let index = null;
let site = { url: 'https://maxisgroup-serbia.com' };
let settings = {};
let filters = null;
let forLead = null; // заявка, для которой подбираем объекты

// ---------- API ----------
async function api(path, body) {
  const r = await fetch('/crm/api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (r.status === 401) { location.href = '/crm/login/'; throw new Error('войдите заново'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `ошибка ${r.status}`);
  return j;
}
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3500);
}
const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};
const digits = (p) => {
  let d = String(p || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (/^0\d{7,10}$/.test(d)) d = '381' + d.slice(1);
  else if (/^6\d{7,8}$/.test(d)) d = '381' + d;
  return d.length >= 8 ? d : '';
};
const tgUser = (v) => (String(v || '').trim().match(/^(?:@|https?:\/\/t\.me\/|t\.me\/)([a-z0-9_]{4,})$/i) || [])[1] || '';

// ---------- вкладки ----------
function showTab(name) {
  $$('.tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $('#tab-leads').hidden = name !== 'leads';
  $('#tab-search').hidden = name !== 'search';
  if (name === 'search') { loadObjects(); setTimeout(() => $('#aiQuery').focus(), 50); }
}
$$('.tabs [role="tab"]').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

// ---------- канбан ----------
async function loadLeads(quiet) {
  try {
    leads = (await api('list')).leads;
    renderBoard();
    $('#leadsMsg').textContent = '';
  } catch (e) {
    if (!quiet) { $('#leadsMsg').textContent = 'Не удалось загрузить заявки: ' + e.message; $('#leadsMsg').classList.add('error'); }
  }
}
function leadMatchesFilter(l, q) {
  if (!q) return true;
  return [l.name, l.phone, l.wish, l.title, l.notes].join(' ').toLowerCase().includes(q);
}
function renderBoard() {
  const q = $('#leadFilter').value.trim().toLowerCase();
  const n = leads.filter((l) => l.status === 'new').length;
  $('#newCount').textContent = n;
  $('#newCount').hidden = !n;
  $('#board').innerHTML = STATUSES.map(([key, name]) => {
    const list = leads.filter((l) => (l.status || 'new') === key && leadMatchesFilter(l, q));
    return `<section class="col" data-status="${key}">
      <div class="col-head"><span>${name}</span><span class="n">${list.length}</span></div>
      <div class="col-list" data-status="${key}">${list.map(cardHtml).join('') || '<p class="col-empty">Пусто</p>'}</div>
    </section>`;
  }).join('');
  $$('.card').forEach((c) => {
    c.onclick = () => openLead(+c.dataset.id);
    c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
    c.ondragend = () => c.classList.remove('dragging');
  });
  $$('.col-list').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
    col.ondragleave = () => col.classList.remove('drop');
    col.ondrop = (e) => { e.preventDefault(); col.classList.remove('drop'); moveLead(+e.dataTransfer.getData('text/plain'), col.dataset.status, e.clientY, col); };
  });
}
function cardHtml(l) {
  const text = l.title || l.wish || l.notes || '';
  const sent = (l.data?.sent || []).length;
  return `<article class="card" draggable="true" data-id="${l.id}">
    <div class="card-top"><span class="tag tag-${esc(l.kind)}">${esc(KIND[l.kind] || 'Заявка')}</span><span class="card-time">${ago(l.created)}</span></div>
    <div class="card-name">${esc(l.name || 'Без имени')}</div>
    ${l.phone ? `<div class="card-phone">${esc(l.phone)}${l.via ? ` · ${esc(VIA[l.via] || l.via)}` : ''}</div>` : ''}
    ${text ? `<div class="card-text">${esc(text)}</div>` : ''}
    ${sent || l.notes ? `<div class="card-foot">${sent ? `<span>Отправлено объектов: ${sent}</span>` : ''}${l.notes ? '<span>Есть заметки</span>' : ''}</div>` : ''}
  </article>`;
}
async function moveLead(id, status, y, col) {
  const lead = leads.find((l) => l.id === id);
  if (!lead) return;
  // место в колонке: между карточками, рядом с которыми отпустили
  const others = $$('.card', col).filter((c) => +c.dataset.id !== id);
  const after = others.findIndex((c) => y < c.getBoundingClientRect().top + c.offsetHeight / 2);
  const pos = (i) => leads.find((l) => l.id === +others[i].dataset.id)?.pos ?? 0;
  let p;
  if (!others.length) p = 0;
  else if (after === 0) p = pos(0) - 1000;
  else if (after === -1) p = pos(others.length - 1) + 1000;
  else p = (pos(after - 1) + pos(after)) / 2;
  lead.status = status;
  lead.pos = p;
  leads.sort((a, b) => a.pos - b.pos);
  renderBoard();
  try { await api('save', { id, status, pos: p }); } catch (e) { toast('Не сохранилось: ' + e.message); loadLeads(); }
}
$('#leadFilter').oninput = renderBoard;

// ---------- карточка заявки ----------
let current = null;
function contactsHtml(l) {
  const d = digits(l.phone);
  return [
    d ? `<a class="btn btn-sm btn-wa" href="https://wa.me/${d}" target="_blank" rel="noopener">WhatsApp</a>` : '',
    d ? `<a class="btn btn-sm btn-tg" href="https://t.me/+${d}" target="_blank" rel="noopener">Telegram</a>` : '',
    l.phone ? `<a class="btn btn-sm" href="tel:${esc(l.phone.replace(/[^\d+]/g, ''))}">Позвонить</a>` : '',
  ].join('');
}
function openLead(id) {
  const l = id ? leads.find((x) => x.id === id) : { kind: 'manual', status: 'new', data: {} };
  if (!l) return;
  current = l;
  const f = $('#leadForm');
  f.elements.status.innerHTML = STATUSES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  for (const k of ['name', 'phone', 'via', 'status', 'title', 'wish', 'notes']) f.elements[k].value = l[k] || '';
  $('#dTitle').textContent = id ? (KIND[l.kind] || 'Заявка') : 'Новая заявка';
  $('#dContacts').innerHTML = contactsHtml(l);
  $('#dLink').innerHTML = l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">Открыть объект на сайте</a>` : '';
  const sent = l.data?.sent || [];
  $('#dSent').innerHTML = sent.length ? `<div class="sent-list"><h3>Отправленные объекты</h3>${sent.slice().reverse().map((s) => `<div>${new Date(s.at).toLocaleDateString('ru-RU')} · ${esc(VIA[s.via] || s.via)} · <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></div>`).join('')}</div>` : '';
  $('#dMeta').textContent = id ? `Создана ${new Date(l.created).toLocaleString('ru-RU')}${l.data?.source === 'site' ? ', с сайта' : ''}` : '';
  $('#dDelete').hidden = !id;
  $('#dMatch').hidden = !id;
  $('#drawer').hidden = false;
  setTimeout(() => f.elements.name.focus(), 30);
}
$('#addLead').onclick = () => openLead(0);
$('#leadForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = Object.fromEntries(['name', 'phone', 'via', 'status', 'title', 'wish', 'notes'].map((k) => [k, f.elements[k].value.trim()]));
  if (current.id) body.id = current.id;
  else { body.kind = 'manual'; body.pos = Math.min(0, ...leads.map((l) => l.pos || 0)) - 1000; }
  try {
    await api('save', body);
    closeAll();
    toast('Сохранено');
    loadLeads();
  } catch (err) { toast('Не сохранилось: ' + err.message); }
};
$('#dDelete').onclick = async () => {
  if (!current?.id || !confirm(`Удалить заявку «${current.name || 'без имени'}»?`)) return;
  try { await api('delete', { id: current.id }); closeAll(); loadLeads(); toast('Заявка удалена'); } catch (e) { toast(e.message); }
};
$('#dMatch').onclick = () => {
  const l = current;
  closeAll();
  forLead = l;
  showTab('search');
  const q = l.wish || l.title || '';
  $('#aiQuery').value = q;
  renderFor();
  if (q) runSearch(q);
};
function renderFor() {
  $('#aiFor').hidden = !forLead;
  if (forLead) {
    $('#aiFor').innerHTML = `<span>Подбор для: <b>${esc(forLead.name || 'без имени')}</b>${forLead.phone ? `, ${esc(forLead.phone)}` : ''}</span><button class="btn btn-sm btn-ghost" type="button" id="forClear">Убрать</button>`;
    $('#forClear').onclick = () => { forLead = null; renderFor(); };
  }
}

// ---------- окна ----------
function closeAll() {
  $('#drawer').hidden = true;
  $('#sendModal').hidden = true;
  $('#settingsModal').hidden = true;
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeAll(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

// ---------- реквизиты ----------
const DEFAULT_SIGNATURE = () => [
  '—',
  'Maxis Group, агентство недвижимости в Белграде',
  site.phone ? `📞 ${site.phone}` : '',
  site.tg ? `💬 Telegram: @${site.tg}` : '',
  site.whatsapp ? `🟢 WhatsApp: wa.me/${digits(site.whatsapp)}` : '',
  '🌐 maxisgroup-serbia.com',
].filter(Boolean).join('\n');
async function loadSettings() {
  try { settings = (await api('settings')).settings || {}; } catch (e) { settings = {}; }
}
$('#openSettings').onclick = async () => {
  await loadObjects();
  const f = $('#settingsForm');
  f.elements.signature.value = settings.signature || DEFAULT_SIGNATURE();
  f.elements.greeting.value = settings.greeting ?? 'Здравствуйте, {имя}! Подобрали для вас вариант:';
  $('#settingsModal').hidden = false;
};
$('#settingsForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const next = { ...settings, signature: f.elements.signature.value.trim(), greeting: f.elements.greeting.value.trim() };
  try { settings = (await api('settings', { settings: next })).settings; closeAll(); toast('Реквизиты сохранены'); } catch (err) { toast(err.message); }
};

// ---------- база объектов и поиск ----------
let loading = null;
function loadObjects() {
  if (objects.length) return Promise.resolve();
  loading ||= fetch('/crm/objects.json', { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`база объектов не загрузилась (${r.status})`);
    return r.json();
  }).then((j) => {
    objects = j.items || [];
    site = { ...site, ...(j.site || {}) };
    index = buildIndex(objects);
    $('#searchMsg').textContent = `В базе ${objects.length} объектов. Пишите как клиенту: район, бюджет, площадь, комнаты, удобства.`;
  }).catch((e) => { loading = null; $('#searchMsg').textContent = e.message; $('#searchMsg').classList.add('error'); });
  return loading;
}
const fact = (l, name) => ((l.facts || []).find((f) => f[0] === name) || [])[1] || '';
const objUrl = (l) => `${site.url || 'https://maxisgroup-serbia.com'}/obekt/${l.slug}/`;
const photoUrl = (l, i = 1) => `/photos/${l.id}/${i}.jpg`;
const money = (n) => Number(n).toLocaleString('ru-RU');
const placeOf = (l) => [l.location, l.district].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');

async function runSearch(q) {
  await loadObjects();
  if (!index) return;
  let f = parseQuery(q, index);
  filters = f;
  renderResults();
  // ИИ робота (если подключён) уточняет разбор; ждём не дольше 6 секунд
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch('/crm/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, districts: [...index.districts, ...index.locations.slice(0, 60)] }), signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json().catch(() => ({}));
    if (j.ok && j.filters && filters === f) {
      const g = mergeAi(f, j.filters, index);
      if (JSON.stringify(g) !== JSON.stringify(f)) { filters = g; renderResults(); }
    }
  } catch (e) { /* без ИИ работает местный разбор */ }
}
function renderResults() {
  const f = filters;
  $('#chips').innerHTML = describe(f).map((c) => `<span class="chip">${esc(c.text)}<button type="button" data-drop="${esc(c.key)}" aria-label="Убрать фильтр ${esc(c.text)}">✕</button></span>`).join('');
  $$('#chips [data-drop]').forEach((b) => (b.onclick = () => { filters = dropFilter(filters, b.dataset.drop); renderResults(); }));
  const r = search(objects, f);
  $('#searchMsg').classList.remove('error');
  $('#searchMsg').textContent = r.total ? `${r.relaxed ? r.relaxed + ' ' : ''}Найдено: ${r.total}${r.total > r.items.length ? `, показаны первые ${r.items.length}` : ''}` : 'Ничего не нашлось. Уберите часть фильтров крестиком или измените запрос.';
  $('#results').innerHTML = r.items.map(objHtml).join('');
  $$('#results [data-send]').forEach((b) => (b.onclick = () => openSend(objects.find((l) => l.id === b.dataset.send))));
}
function objHtml(l) {
  const rent = l.deal === 'rent';
  const per = !rent && l.price && l.area ? ` <small>${money(Math.round(l.price / l.area))} €/м²</small>` : '';
  const facts = [l.area && `${l.area} м²`, fact(l, 'Этаж') && `этаж ${fact(l, 'Этаж')}`, fact(l, 'Мебель')].filter(Boolean).join(' · ');
  return `<article class="obj">
    <div class="obj-img" style="background-image:url('${l.photos ? photoUrl(l) : ''}')">${l.photos ? `<span class="obj-n">${l.photos} фото</span>` : ''}</div>
    <div class="obj-body">
      <div class="obj-price">${l.price ? `${money(l.price)} €${rent ? ' <small>в месяц</small>' : per}` : 'Цена по запросу'}</div>
      <div class="obj-title">${esc(l.kind || l.title)}</div>
      <div class="obj-place">${esc(placeOf(l))}${l.street ? `, ${esc(l.street)}` : ''}</div>
      <div class="obj-facts">${esc(facts)}</div>
      <div class="obj-actions">
        <a class="btn" href="${esc(objUrl(l))}" target="_blank" rel="noopener">На сайте</a>
        <button class="btn btn-primary" type="button" data-send="${esc(l.id)}">Отправить клиенту</button>
      </div>
    </div>
  </article>`;
}
$('#aiForm').onsubmit = (e) => { e.preventDefault(); const q = $('#aiQuery').value.trim(); if (q) runSearch(q); };

// ---------- отправка объекта клиенту ----------
function messageFor(l, lead) {
  const rent = l.deal === 'rent';
  const name = (lead?.name || '').trim().split(/\s+/)[0] || '';
  let greet = settings.greeting ?? 'Здравствуйте, {имя}! Подобрали для вас вариант:';
  greet = name ? greet.replace(/\{имя\}/g, name) : greet.replace(/,?\s*\{имя\}/g, '');
  const feats = (l.features || []).filter((x) => !/депозит|не последний этаж/.test(x)).slice(0, 7);
  const floor = fact(l, 'Этаж');
  return [
    greet,
    '',
    `🏠 ${l.title}`,
    `📍 ${placeOf(l)}${l.street ? `, ${l.street}` : ''}`,
    l.price ? (rent ? `💰 ${money(l.price)} € в месяц` : `💰 ${money(l.price)} €${l.area ? ` (${money(Math.round(l.price / l.area))} €/м²)` : ''}`) : '',
    [l.area && `📐 ${l.area} м²`, floor && `этаж ${floor}`].filter(Boolean).join(', '),
    [fact(l, 'Мебель'), fact(l, 'Отопление') && `отопление ${fact(l, 'Отопление')}`, fact(l, 'Состояние')].filter(Boolean).join(', '),
    feats.length ? `✅ ${feats.join(', ')}` : '',
    '',
    `📸 Все фото и подробности: ${objUrl(l)}`,
    '',
    settings.signature || DEFAULT_SIGNATURE(),
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
let sending = null;
function openSend(l) {
  if (!l) return;
  sending = l;
  const sel = $('#sLead');
  const withPhone = leads.filter((x) => x.phone && x.status !== 'lost');
  sel.innerHTML = '<option value="">выберите или впишите ниже</option>' + withPhone.map((x) => `<option value="${x.id}">${esc(x.name || 'без имени')} · ${esc(x.phone)}</option>`).join('');
  sel.value = forLead ? String(forLead.id) : '';
  const lead = forLead || null;
  $('#sTo').value = lead?.phone || '';
  $('#sText').value = messageFor(l, lead);
  $('#sPhotos').innerHTML = Array.from({ length: Math.min(l.photos || 0, 10) }, (_, i) => `<img src="${photoUrl(l, i + 1)}" alt="Фото ${i + 1}" loading="lazy">`).join('');
  $('#sShare').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] }));
  $('#sDownload').hidden = !l.photos;
  $('#sMsg').textContent = '';
  $('#sendModal').hidden = false;
}
$('#sLead').onchange = () => {
  const lead = leads.find((x) => x.id === +$('#sLead').value);
  if (lead) $('#sTo').value = lead.phone || '';
  $('#sText').value = messageFor(sending, lead);
};
const sendLead = () => leads.find((x) => x.id === +$('#sLead').value) || null;
async function logSent(via) {
  const lead = sendLead();
  if (!lead || !sending) return;
  const sent = [...(lead.data?.sent || []), { id: sending.id, title: sending.kind || sending.title, url: objUrl(sending), via, at: Date.now() }].slice(-50);
  const upd = { id: lead.id, data: { ...(lead.data || {}), sent } };
  if (lead.status === 'new' || lead.status === 'work') upd.status = 'offer';
  try { await api('save', upd); loadLeads(true); } catch (e) { /* история не критична */ }
}
async function copyText() {
  try { await navigator.clipboard.writeText($('#sText').value); return true; } catch (e) { return false; }
}
$('#sWa').onclick = () => {
  const d = digits($('#sTo').value);
  const text = encodeURIComponent($('#sText').value);
  window.open(d ? `https://wa.me/${d}?text=${text}` : `https://wa.me/?text=${text}`, '_blank', 'noopener');
  logSent('wa');
};
$('#sTg').onclick = async () => {
  const to = $('#sTo').value;
  const u = tgUser(to);
  const d = digits(to);
  const copied = await copyText();
  if (u || d) {
    window.open(u ? `https://t.me/${u}` : `https://t.me/+${d}`, '_blank', 'noopener');
    $('#sMsg').textContent = copied ? 'Текст скопирован. В открывшемся чате вставьте его: Ctrl+V или долгое нажатие → «Вставить».' : 'Скопируйте текст вручную и вставьте в чат.';
  } else {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(objUrl(sending))}&text=${encodeURIComponent($('#sText').value)}`, '_blank', 'noopener');
  }
  logSent('tg');
};
$('#sCopy').onclick = async () => { toast((await copyText()) ? 'Текст скопирован' : 'Не удалось скопировать: выделите текст вручную'); };
async function photoFiles() {
  const n = Math.min(sending.photos || 0, 10);
  const files = [];
  for (let i = 1; i <= n; i++) {
    try {
      const r = await fetch(photoUrl(sending, i));
      if (r.ok) files.push(new File([await r.blob()], `${sending.id}-${i}.jpg`, { type: 'image/jpeg' }));
    } catch (e) { /* пропускаем фото */ }
  }
  return files;
}
$('#sShare').onclick = async () => {
  $('#sMsg').textContent = 'Готовлю фото…';
  const files = await photoFiles();
  const text = $('#sText').value;
  try {
    await copyText();
    await navigator.share(files.length && navigator.canShare({ files }) ? { files, text } : { text });
    $('#sMsg').textContent = 'Отправлено. Если подпись не прикрепилась к фото, текст уже скопирован: вставьте его в чат.';
    logSent('share');
  } catch (e) {
    $('#sMsg').textContent = e.name === 'AbortError' ? '' : 'Не получилось: ' + e.message;
  }
};
$('#sDownload').onclick = async () => {
  const n = Math.min(sending.photos || 0, 15);
  for (let i = 1; i <= n; i++) {
    const a = document.createElement('a');
    a.href = photoUrl(sending, i);
    a.download = `${sending.id}-${i}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 250));
  }
  toast(`Скачивается фото: ${n}. Их можно перетащить в чат WhatsApp или Telegram.`);
};

// ---------- запуск ----------
loadLeads();
loadSettings();
setInterval(() => { if (!document.hidden && $('#drawer').hidden && $('#sendModal').hidden) loadLeads(true); }, 60000);

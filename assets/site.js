// Каталог, карта, избранное, листание фото, форма подбора. Без скрипта всё содержимое доступно.
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const plural = (n, f) => { const a = n % 100, b = n % 10; return a >= 11 && a <= 14 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2]; };
  // язык страницы: английская версия лежит в /en/
  const EN = document.documentElement.lang === 'en';
  const T = (ru, en) => (EN ? en : ru);
  const P = EN ? '/en' : '';
  const objects = (n) => (EN ? `${n} listing${n === 1 ? '' : 's'}` : `${n} ${plural(n, ['объект', 'объекта', 'объектов'])}`);
  // ---------- валюта: евро, динары, рубли ----------
  let RATES = { EUR: 1 };
  try { RATES = { ...RATES, ...JSON.parse(document.documentElement.dataset.rates || '{}') }; } catch (e) { /* только евро */ }
  const SYM = { EUR: '€', RSD: T('дин.', 'RSD'), RUB: '₽' };
  const CKEY = 'ns-cur';
  let cur = (() => { try { const c = localStorage.getItem(CKEY); return RATES[c] ? c : 'EUR'; } catch (e) { return 'EUR'; } })();
  const conv = (eur) => {
    if (cur === 'EUR') return Math.round(eur);
    const v = eur * RATES[cur];
    const step = v >= 100000 ? 1000 : 100;
    return Math.round(v / step) * step;
  };
  const fmt = (eur, suf = '') => `${conv(eur).toLocaleString('ru-RU')}\u00a0${SYM[cur]}${suf}`;
  const money = (n) => (n ? fmt(n) : T('Цена по запросу', 'Price on request'));
  const toEur = (v) => (v ? v / RATES[cur] : 0); // значения фильтров вводятся в выбранной валюте
  function paintCur() {
    $$('.pr[data-eur]').forEach((el) => { el.textContent = fmt(+el.dataset.eur, el.dataset.suf || ''); });
    $$('[data-cur-sym]').forEach((el) => { el.textContent = SYM[cur].replace('.', ''); });
    $$('[data-cur]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cur === cur)));
    $$('[data-rate-note]').forEach((el) => { el.hidden = cur === 'EUR'; });
    $$('[data-cur-ph]').forEach((el) => { el.placeholder = `${T('Цена до', 'Price up to')}, ${SYM[cur]}`; });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cur]');
    if (!b || !RATES[b.dataset.cur]) return;
    cur = b.dataset.cur;
    try { localStorage.setItem(CKEY, cur); } catch (err) { /* приватный режим */ }
    paintCur();
    document.dispatchEvent(new CustomEvent('ns-cur'));
  });
  paintCur();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let liteCache;
  const lite = () => (liteCache ||= fetch(P + '/data/lite.json').then((r) => r.json()).catch(() => []));

  async function loadLeafletLib() {
    if (window.L) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // ---------- избранное ----------
  const FKEY = 'ns-favs';
  const getFavs = () => { try { return JSON.parse(localStorage.getItem(FKEY)) || []; } catch (e) { return []; } };
  const setFavs = (a) => { try { localStorage.setItem(FKEY, JSON.stringify(a)); } catch (e) { /* приватный режим */ } };
  function paintFavs() {
    const f = new Set(getFavs());
    $$('[data-fav]').forEach((b) => {
      const on = f.has(b.dataset.fav);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? T('Убрать из избранного', 'Remove from saved') : T('В избранное', 'Save'));
      const t = b.querySelector('span');
      if (t) t.textContent = on ? T('В избранном', 'Saved') : T('В избранное', 'Save');
    });
    $$('[data-fav-count]').forEach((c) => { c.textContent = f.size; c.hidden = !f.size; });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault();
    const f = getFavs();
    const i = f.indexOf(b.dataset.fav);
    if (i >= 0) f.splice(i, 1); else f.unshift(b.dataset.fav);
    setFavs(f);
    paintFavs();
  });
  paintFavs();

  // ---------- листание фото в карточках ----------
  function bindSlider(s) {
    const track = s.querySelector('.slider-track');
    const count = s.querySelector('.sl-count');
    const total = track.children.length;
    const idx = () => Math.round(track.scrollLeft / track.clientWidth);
    const go = (i) => track.scrollTo({ left: ((i + total) % total) * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    s.querySelector('.sl-prev')?.addEventListener('click', (e) => { e.preventDefault(); go(idx() - 1); });
    s.querySelector('.sl-next')?.addEventListener('click', (e) => { e.preventDefault(); go(idx() + 1); });
    if (count) { let t; track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { count.textContent = `${idx() + 1} / ${total}`; }, 60); }, { passive: true }); }
  }
  $$('[data-slider]').forEach(bindSlider);

  // ---------- выпадающие фильтры: одновременно открыт один ----------
  document.addEventListener('click', (e) => {
    $$('details.dd[open], details.burger[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('details.dd[open], details.burger[open]').forEach((d) => { d.open = false; d.querySelector('summary').focus(); });
  });

  // ---------- каталог ----------
  const cat = document.querySelector('[data-catalog]');
  if (cat) {
    const form = cat.querySelector('[data-filter]');
    const box = cat.querySelector('[data-cards]');
    const cards = [...box.children];
    const found = cat.querySelector('[data-found]');
    const empty = cat.querySelector('[data-empty]');
    const more = cat.querySelector('[data-more]');
    const sort = cat.querySelector('[data-sort]');
    const mapBox = cat.querySelector('[data-map]');
    const PAGE = 12;
    let shown = PAGE;
    let view = 'list';
    let visible = cards;
    const typeParam = new URLSearchParams(location.search).get('type') || '';

    const num = (v) => parseInt(String(v || '').replace(/\D/g, ''), 10) || 0;
    const vals = (name) => $$(`input[name="${name}"]:checked`, form).map((i) => i.value);

    // восстановить фильтры из адреса
    const q = new URLSearchParams(location.search);
    for (const [k, v] of q) {
      if (['district', 'rooms', 'feat'].includes(k)) v.split(',').forEach((x) => { const i = form.querySelector(`input[name="${k}"][value="${CSS.escape(x)}"]`); if (i) i.checked = true; });
      else if (k === 'deal' || k === 'furn') { const i = form.querySelector(`input[name="${k}"][value="${CSS.escape(v)}"]`); if (i) i.checked = true; }
      else if (k === 'notfirst' || k === 'notlast') { const i = form.querySelector(`input[name="${k}"]`); if (i) i.checked = true; }
      else if (form.elements[k]) form.elements[k].value = v;
    }
    if (q.get('sort')) sort.value = q.get('sort');
    if (q.get('view')) view = q.get('view');

    function labels() {
      $$('details.dd', form).forEach((d) => {
        const lab = d.querySelector('[data-dd-label]');
        const base = lab.dataset.ddLabel;
        const checked = $$('input:checked', d).filter((i) => i.value);
        const nums = $$('input[inputmode]', d).map((i) => num(i.value));
        let text = base;
        if (checked.length === 1) text = checked[0].closest('label').querySelector('span').textContent;
        else if (checked.length > 1) text = `${base}: ${checked.length}`;
        else if (nums.some(Boolean)) {
          const unit = (base === 'Цена' || base === 'Price') ? ` ${SYM[cur]}` : T(' м²', ' m²');
          text = nums[0] && nums[1] ? `${nums[0].toLocaleString('ru-RU')}–${nums[1].toLocaleString('ru-RU')}${unit}` : nums[0] ? `${T('от', 'from')} ${nums[0].toLocaleString('ru-RU')}${unit}` : `${T('до', 'up to')} ${nums[1].toLocaleString('ru-RU')}${unit}`;
        }
        lab.textContent = text;
        d.classList.toggle('is-set', text !== base);
      });
    }

    function apply(resetPage = true) {
      if (resetPage) shown = PAGE;
      const f = form.elements;
      const dists = vals('district'), rooms = vals('rooms'), feats = vals('feat');
      const furn = form.querySelector('input[name="furn"]:checked')?.value || '';
      const notfirst = form.querySelector('input[name="notfirst"]')?.checked, notlast = form.querySelector('input[name="notlast"]')?.checked;
      const deal = f.deal ? (form.querySelector('input[name="deal"]:checked')?.value || '') : '';
      const min = toEur(num(f.min.value)), max = toEur(num(f.max.value)), amin = num(f.amin.value), amax = num(f.amax.value);
      visible = cards.filter((c) => {
        const p = +c.dataset.price, a = +c.dataset.area;
        return (!deal || c.dataset.deal === deal)
          && (!typeParam || c.dataset.type === typeParam)
          && (!dists.length || dists.includes(c.dataset.district))
          && (!rooms.length || rooms.includes(c.dataset.rooms))
          && (!min || p >= min) && (!max || (p && p <= max))
          && (!amin || a >= amin) && (!amax || (a && a <= amax))
          && (!furn || c.dataset.furn === furn)
          && (!notfirst || +c.dataset.floor >= 1)
          && (!notlast || (+c.dataset.floors && +c.dataset.floor >= 0 && +c.dataset.floor < +c.dataset.floors))
          && (!feats.length || feats.every((f) => (c.dataset.feat || '').split('|').includes(f)));
      });
      const s = sort.value;
      visible.sort((a, b) => {
        if (s === 'cheap') return (+a.dataset.price || 1e12) - (+b.dataset.price || 1e12);
        if (s === 'dear') return (+b.dataset.price || 0) - (+a.dataset.price || 0);
        if (s === 'area') return (+b.dataset.area || 0) - (+a.dataset.area || 0);
        return b.dataset.added.localeCompare(a.dataset.added);
      });
      const set = new Set(visible);
      cards.forEach((c) => { c.hidden = true; });
      visible.forEach((c, i) => { box.appendChild(c); c.hidden = view !== 'map' && i >= shown; });
      cards.filter((c) => !set.has(c)).forEach((c) => box.appendChild(c));
      found.textContent = `${T('Найдено', 'Found')}: ${objects(visible.length)}`;
      empty.hidden = visible.length > 0;
      more.hidden = view === 'map' || visible.length <= shown;
      if (!more.hidden) more.textContent = T(`Показать ещё ${Math.min(PAGE, visible.length - shown)} из ${visible.length - shown}`, `Show ${Math.min(PAGE, visible.length - shown)} more of ${visible.length - shown}`);
      labels();
      if (view === 'map') drawMap();
      // адрес страницы
      const u = new URLSearchParams();
      if (deal) u.set('deal', deal);
      if (typeParam) u.set('type', typeParam);
      if (dists.length) u.set('district', dists.join(','));
      if (rooms.length) u.set('rooms', rooms.join(','));
      if (feats.length) u.set('feat', feats.join(','));
      if (furn) u.set('furn', furn);
      if (notfirst) u.set('notfirst', 1);
      if (notlast) u.set('notlast', 1);
      ['min', 'max', 'amin', 'amax'].forEach((k) => { if (num(f[k].value)) u.set(k, num(f[k].value)); });
      if (s !== 'new') u.set('sort', s);
      if (view !== 'list') u.set('view', view);
      history.replaceState(null, '', u.toString() ? `?${u}` : location.pathname);
    }

    function setView(v) {
      view = v;
      $$('[data-view]', cat).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
      box.classList.toggle('is-grid', v === 'grid');
      box.hidden = v === 'map';
      mapBox.hidden = v !== 'map';
      apply(false);
    }

    // карта со всеми объектами по фильтру
    let map, layer;
    async function loadLeaflet() {
      if (window.L) return;
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    async function drawMap() {
      try { await loadLeaflet(); } catch (e) { mapBox.textContent = T('Карта не загрузилась. Проверьте интернет и обновите страницу.', 'The map did not load. Check your connection and refresh the page.'); return; }
      const data = await lite();
      const byId = new Map(data.map((d) => [d.id, d]));
      if (!map) {
        map = L.map(mapBox, { scrollWheelZoom: false }).setView([44.8125, 20.4612], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
        layer = L.layerGroup().addTo(map);
      }
      layer.clearLayers();
      const pts = [];
      visible.forEach((c) => {
        const d = byId.get(c.dataset.id);
        if (!d || !d.g) return;
        const icon = L.divIcon({ className: '', html: `<span class="pin">${d.p ? money(d.p) : '—'}</span>`, iconSize: [0, 0] });
        L.marker(d.g, { icon }).addTo(layer).bindPopup(`<div class="map-pop">${d.img ? `<img src="${d.img}" alt="">` : ''}<b>${money(d.p)}</b><span>${d.t}</span><br><span>${d.ad || d.pl}</span><br><a href="${d.u}">${T('Подробнее', 'Details')}</a></div>`);
        pts.push(d.g);
      });
      setTimeout(() => { map.invalidateSize(); if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); }, 50);
    }

    form.addEventListener('input', () => apply());
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('reset', () => setTimeout(() => apply(), 0));
    sort.addEventListener('change', () => apply());
    more.addEventListener('click', () => { shown += PAGE; apply(false); });
    $$('[data-view]', cat).forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    document.addEventListener('ns-cur', () => apply(false));
    setView(view);
  }

  // ---------- поиск на главной ----------
  const search = document.querySelector('[data-search]');
  if (search) {
    search.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = search.elements;
      const deal = search.querySelector('input[name="deal"]:checked').value;
      const type = f.type ? f.type.value : '';
      const u = new URLSearchParams();
      if (f.district.value) u.set('district', f.district.value);
      if (f.rooms.value) u.set('rooms', f.rooms.value);
      const max = parseInt(String(f.max.value).replace(/\D/g, ''), 10);
      if (max) u.set('max', max);
      let path = P + (deal === 'sale' ? '/prodazha/' : '/arenda/');
      if (deal === 'sale') {
        const sub = { flat: 'kvartiry', new: 'novostrojki', house: 'doma-i-uchastki', commercial: 'kommercheskaya' }[type];
        if (sub) path += sub + '/';
      } else if (type === 'house') u.set('type', 'house');
      else if (type === 'flat' || type === 'new') u.set('type', 'apartment');
      location.href = path + (u.toString() ? `?${u}` : '');
    });
  }

  // ---------- вкладки «Аренда / Покупка» на главной ----------
  $$('[data-tabs]').forEach((tl) => {
    tl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      $$('[data-tab]', tl).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('[data-tab-panel]').forEach((p) => { p.hidden = p.dataset.tabPanel !== b.dataset.tab; });
    });
  });

  // ---------- прозрачная шапка над фото ----------
  if (document.body.classList.contains('has-hero')) {
    const hdr = document.querySelector('.hdr');
    const onScroll = () => hdr.classList.toggle('is-solid', scrollY > 40);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }


  // ---------- каталог на главной: «Другие квартиры» и переключатель сделки ----------
  const hc = document.querySelector('[data-home-cat]');
  if (hc) {
    const PAGE = 12;
    const moreBtn = document.querySelector('[data-home-more]');
    const sw = document.querySelector('[data-home-cat-deal]');
    const heart = document.querySelector('.fav-link svg')?.outerHTML || '';
    const arrows = hc.querySelector('.sl-prev')?.innerHTML || '‹';
    const arrowsN = hc.querySelector('.sl-next')?.innerHTML || '›';
    let shown = hc.children.length;
    let list = null;
    const cardHtml = (d) => {
      const n = Math.max(1, d.n || 1);
      const imgs = Array.from({ length: n }, (_, i) => `<img src="${d.img.replace(/1\.jpg$/, `${i + 1}.jpg`)}" alt="${d.t}, ${d.pl}" width="640" height="480" loading="lazy" decoding="async">`).join('');
      return `<article class="card" data-id="${d.id}"><div class="slider" data-slider><a class="slider-track" href="${d.u}" tabindex="-1">${d.img ? imgs : ''}</a>${n > 1 ? `<button class="sl-btn sl-prev" type="button" aria-label="${T('Предыдущее фото', 'Previous photo')}">${arrows}</button><button class="sl-btn sl-next" type="button" aria-label="${T('Следующее фото', 'Next photo')}">${arrowsN}</button><span class="sl-count" aria-hidden="true">1 / ${n}</span>` : ''}${d.nw ? `<span class="badges"><span class="badge">${T('Новое', 'New')}</span></span>` : ''}<button class="fav" type="button" data-fav="${d.id}" aria-label="${T('В избранное', 'Save')}" aria-pressed="false">${heart}</button></div>
        <div class="card-main"><p class="card-place">${d.pl}</p><h3 class="card-title"><a href="${d.u}">${d.t.charAt(0).toUpperCase() + d.t.slice(1)}</a></h3>
        <dl class="card-facts">${d.a ? `<div><dt>${T('Площадь', 'Area')}</dt><dd>${d.a} ${T('м²', 'm²')}</dd></div>` : ''}<div><dt>${T('Комнат', 'Rooms')}</dt><dd>${d.rl}</dd></div>${d.fl ? `<div><dt>${T('Этаж', 'Floor')}</dt><dd>${d.fl}</dd></div>` : ''}</dl></div>
        <div class="card-side"><p class="card-price">${d.p ? `<span class="pr" data-eur="${d.p}">${money(d.p)}</span><small>${d.d === 'rent' ? T(' / мес', ' / mo') : ''}</small>` : T('Цена по запросу', 'Price on request')}</p></div></article>`;
    };
    const render = (from) => {
      const deal = sw?.querySelector('input:checked')?.value || '';
      const items = list.filter((d) => !deal || d.d === deal);
      const part = items.slice(from, shown);
      const tmp = document.createElement('div');
      tmp.innerHTML = part.map(cardHtml).join('');
      const nodes = [...tmp.children];
      nodes.forEach((n) => hc.appendChild(n));
      nodes.forEach((n) => n.querySelector('[data-slider]') && bindSlider(n.querySelector('[data-slider]')));
      moreBtn.hidden = shown >= items.length;
      paintFavs();
    };
    moreBtn?.addEventListener('click', async () => {
      list ||= await lite();
      const from = shown;
      shown += PAGE;
      render(from);
    });
    sw?.addEventListener('change', async () => {
      list ||= await lite();
      hc.innerHTML = '';
      shown = PAGE;
      render(0);
    });
  }

  // ---------- карта на главной ----------
  const hm = document.querySelector('[data-home-map]');
  if (hm) {
    const io = new IntersectionObserver(async ([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      try { await loadLeafletLib(); } catch (e) { hm.textContent = T('Карта не загрузилась. Проверьте интернет и обновите страницу.', 'The map did not load. Check your connection and refresh the page.'); return; }
      const data = (await lite()).filter((d) => d.g);
      const map = L.map(hm, { scrollWheelZoom: false }).setView([44.8125, 20.4612], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      const sw = document.querySelector('[data-home-map-deal]');
      const draw = (fit) => {
        const deal = sw?.querySelector('input:checked')?.value || '';
        layer.clearLayers();
        const pts = [];
        data.filter((d) => !deal || d.d === deal).forEach((d) => {
          const icon = L.divIcon({ className: '', html: `<span class="pin">${d.p ? money(d.p) : '—'}</span>`, iconSize: [0, 0] });
          L.marker(d.g, { icon }).addTo(layer).bindPopup(`<div class="map-pop">${d.img ? `<img src="${d.img}" alt="">` : ''}<b>${money(d.p)}${d.d === 'rent' && d.p ? T(' / мес', ' / mo') : ''}</b><span>${d.t}</span><br><span>${d.ad || d.pl}</span><br><a href="${d.u}">Подробнее</a></div>`);
          pts.push(d.g);
        });
        if (fit && pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
      };
      sw?.addEventListener('change', () => draw(true));
      document.addEventListener('ns-cur', () => draw(false));
      draw(true);
    }, { rootMargin: '300px' });
    io.observe(hm);
  }

  // ---------- отдельная страница карты ----------
  const big = document.querySelector('[data-bigmap]');
  if (big) {
    const form = big.querySelector('[data-map-filter]');
    const canvas = big.querySelector('[data-map-canvas]');
    const listEl = big.querySelector('[data-map-list]');
    const foundEl = big.querySelector('[data-map-found]');
    const q = new URLSearchParams(location.search);
    for (const [k, v] of q) {
      if (k === 'deal') { const i = form.querySelector(`input[name="deal"][value="${CSS.escape(v)}"]`); if (i) i.checked = true; }
      else if (form.elements[k]) form.elements[k].value = v;
    }
    (async () => {
      try { await loadLeafletLib(); } catch (e) { canvas.textContent = T('Карта не загрузилась. Проверьте интернет и обновите страницу.', 'The map did not load. Check your connection and refresh the page.'); return; }
      const data = await lite();
      const map = L.map(canvas, { zoomControl: true }).setView([44.8125, 20.4612], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      let shown = [];
      const markers = new Map();
      const pass = (d) => {
        const f = form.elements;
        const deal = form.querySelector('input[name="deal"]:checked').value;
        const max = toEur(parseInt(String(f.max.value).replace(/\D/g, ''), 10) || 0);
        return (!deal || d.d === deal) && (!f.district.value || d.ds === f.district.value) && (!f.rooms.value || d.r === f.rooms.value) && (!max || (d.p && d.p <= max));
      };
      const item = (d) => `<a class="ml-item" href="${d.u}" data-id="${d.id}">${d.img ? `<img src="${d.img}" alt="" loading="lazy" width="160" height="120">` : '<span class="ml-noimg"></span>'}<span><b>${money(d.p)}${d.d === 'rent' && d.p ? T(' / мес', ' / mo') : ''}</b><span>${d.t}</span><small>${d.ad || d.pl}</small></span></a>`;
      const renderList = () => {
        const b = map.getBounds();
        const inView = shown.filter((d) => b.contains(d.g));
        listEl.innerHTML = inView.length ? inView.slice(0, 60).map(item).join('') : `<p class="ml-empty">${T('В этой части карты объектов нет. Отдалите карту или измените фильтр.', 'No listings in this part of the map. Zoom out or change the filter.')}</p>`;
        foundEl.textContent = `${T('На карте', 'On the map')}: ${objects(shown.length)}`;
      };
      const draw = (fit) => {
        layer.clearLayers(); markers.clear();
        shown = data.filter((d) => d.g && pass(d));
        shown.forEach((d) => {
          const icon = L.divIcon({ className: '', html: `<span class="pin">${d.p ? money(d.p) : '—'}</span>`, iconSize: [0, 0] });
          const m = L.marker(d.g, { icon }).addTo(layer).bindPopup(`<div class="map-pop">${d.img ? `<img src="${d.img}" alt="">` : ''}<b>${money(d.p)}</b><span>${d.t}</span><br><span>${d.ad || d.pl}</span><br><a href="${d.u}">${T('Подробнее', 'Details')}</a></div>`);
          markers.set(d.id, m);
        });
        if (fit && shown.length) map.fitBounds(shown.map((d) => d.g), { padding: [40, 40], maxZoom: 15 });
        renderList();
      };
      listEl.addEventListener('mouseover', (e) => { const a = e.target.closest('[data-id]'); const m = a && markers.get(a.dataset.id); if (m) m.openPopup(); });
      map.on('moveend', renderList);
      form.addEventListener('input', () => {
        draw(true);
        const u = new URLSearchParams();
        const deal = form.querySelector('input[name="deal"]:checked').value;
        if (deal) u.set('deal', deal);
        ['district', 'rooms', 'max'].forEach((k) => { if (form.elements[k].value) u.set(k, form.elements[k].value); });
        history.replaceState(null, '', u.toString() ? `?${u}` : location.pathname);
      });
      form.addEventListener('submit', (e) => e.preventDefault());
      document.addEventListener('ns-cur', () => draw(false));
      draw(true);
    })();
  }

  // ---------- форма собственника ----------
  const of = document.querySelector('[data-owner-form]');
  if (of) {
    of.elements.t0.value = Date.now();
    const deal0 = new URLSearchParams(location.search).get('deal');
    if (deal0 === 'sale') of.querySelector('input[name="deal"][value="Продать"]').checked = true;
    const syncDeal = () => {
      const sale = of.querySelector('input[name="deal"]:checked').value === 'Продать';
      $$('[data-rent-only]', of).forEach((el) => { el.hidden = sale; });
      $$('[data-sale-only]', of).forEach((el) => { el.hidden = !sale; });
      of.querySelector('[data-price-label]').textContent = sale ? T('Цена, € *', 'Price, € *') : T('Цена в месяц, € *', 'Monthly rent, € *');
    };
    of.addEventListener('change', (e) => { if (e.target.name === 'deal') syncDeal(); });
    syncDeal();

    // фото: уменьшаем в браузере до 1600 px, чтобы отправка была быстрой
    let photos = [];
    const input = of.querySelector('[data-photos]');
    const listBox = of.querySelector('[data-photo-list]');
    const shrink = async (file) => {
      try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
        return blob || file;
      } catch (e) { return file; }
    };
    const paint = () => {
      listBox.innerHTML = photos.map((p, i) => `<div class="ph"><img src="${p.url}" alt="${T('Фото', 'Photo')} ${i + 1}"><button type="button" data-rm="${i}" aria-label="${T('Убрать фото', 'Remove photo')} ${i + 1}">×</button>${i ? '' : `<span>${T('Обложка', 'Cover')}</span>`}</div>`).join('');
    };
    input.addEventListener('change', async () => {
      const files = [...input.files].filter((f) => f.type.startsWith('image/')).slice(0, 10 - photos.length);
      for (const f of files) { const b = await shrink(f); photos.push({ blob: b, url: URL.createObjectURL(b) }); }
      input.value = '';
      paint();
    });
    listBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      URL.revokeObjectURL(photos[+b.dataset.rm].url);
      photos.splice(+b.dataset.rm, 1);
      paint();
    });

    const note = of.querySelector('[data-owner-note]');
    of.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bad = $$('[required]', of).find((el) => (el.type === 'checkbox' ? !el.checked : !String(el.value).trim()));
      if (bad) { note.textContent = T('Заполните поля со звёздочкой и подтвердите согласие.', 'Fill in the fields marked with an asterisk and confirm your consent.'); note.classList.add('err'); bad.focus(); return; }
      const fd = new FormData(of);
      fd.delete('photos');
      photos.forEach((p, i) => fd.append('photos', p.blob, `photo_${i + 1}.jpg`));
      const btn = of.querySelector('[data-owner-submit]');
      btn.disabled = true;
      note.classList.remove('err');
      note.textContent = photos.length ? T(`Отправляю объявление и ${photos.length} фото…`, `Sending the listing and ${photos.length} photos…`) : T('Отправляю…', 'Sending…');
      try {
        const r = await fetch('/api/submit', { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || 'не удалось отправить');
        of.hidden = true;
        document.querySelector('[data-owner-done]').hidden = false;
        scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      } catch (err) {
        note.classList.add('err');
        note.innerHTML = T(`Не получилось отправить: ${err.message}. Напишите нам напрямую в <a href="https://t.me/${of.dataset.tg}">Telegram</a>.`, `Could not send: ${err.message}. Please message us directly on <a href="https://t.me/${of.dataset.tg}">Telegram</a>.`);
        btn.disabled = false;
      }
    });
  }

  // ---------- галерея объекта ----------
  const gal = document.querySelector('[data-gallery]');
  const lb = document.querySelector('[data-lightbox]');
  if (gal && lb) {
    const photos = JSON.parse(gal.dataset.gallery);
    const img = lb.querySelector('img');
    const cnt = lb.querySelector('.lb-count');
    let i = 0;
    const show = (n) => { i = (n + photos.length) % photos.length; img.src = photos[i]; img.alt = `${T('Фото', 'Photo')} ${i + 1}`; cnt.textContent = `${i + 1} / ${photos.length}`; };
    gal.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (!b) return; show(+b.dataset.open); lb.showModal(); });
    lb.querySelector('.lb-prev').onclick = () => show(i - 1);
    lb.querySelector('.lb-next').onclick = () => show(i + 1);
    lb.querySelector('[data-close]').onclick = () => lb.close();
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); });
    let x0 = null;
    lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1)); x0 = null; });
  }

  // ---------- карта на странице объекта ----------
  const one = document.querySelector('[data-point]');
  if (one) {
    const io = new IntersectionObserver(async ([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      if (!window.L) {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(css);
        await new Promise((res) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); });
      }
      if (!window.L) return;
      const [lat, lng] = one.dataset.point.split(',').map(Number);
      const m = L.map(one, { scrollWheelZoom: false }).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
      L.marker([lat, lng], { icon: L.divIcon({ className: '', html: `<span class="pin">${one.dataset.label || ''}</span>`, iconSize: [0, 0] }) }).addTo(m);
    }, { rootMargin: '200px' });
    io.observe(one);
  }

  // ---------- избранное: страница ----------
  const favBox = document.querySelector('[data-favs]');
  if (favBox) {
    lite().then((data) => {
      const ids = getFavs();
      const byId = new Map(data.map((d) => [d.id, d]));
      const list = ids.map((id) => byId.get(id)).filter(Boolean);
      document.querySelector('[data-favs-empty]').hidden = list.length > 0;
      favBox.innerHTML = list.map((d) => `<article class="card"><div class="slider"><a class="slider-track" href="${d.u}">${d.img ? `<img src="${d.img}" alt="" loading="lazy" width="640" height="480">` : ''}</a><button class="fav" type="button" data-fav="${d.id}" aria-pressed="true">${document.querySelector('.fav-link svg').outerHTML}</button></div><div class="card-side"><p class="card-price">${money(d.p)}${d.d === 'rent' && d.p ? `<small>${T(' / мес', ' / mo')}</small>` : ''}</p></div><div class="card-main"><p class="card-place">${d.pl}</p><h3 class="card-title"><a href="${d.u}">${d.t}</a></h3></div></article>`).join('');
      paintFavs();
    });
  }

  // ---------- форма подбора: заявка сразу уходит агенту в Telegram ----------
  async function postLead(fd) {
    const r = await fetch('/api/lead', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'не удалось отправить');
  }
  $$('[data-lead]').forEach((form) => {
    const t0 = Date.now();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const via = form.querySelector('input[name="via"]:checked')?.value || 'tg';
      const note = form.querySelector('[data-lead-note]');
      const btn = form.querySelector('button[type="submit"]');
      const fd = new FormData();
      fd.append('kind', 'podbor');
      fd.append('name', f.name.value.trim());
      fd.append('phone', f.phone.value.trim());
      fd.append('wish', f.wish.value.trim());
      fd.append('via', via === 'wa' ? 'WhatsApp' : 'Telegram');
      fd.append('website', f.website ? f.website.value : '');
      fd.append('t0', t0);
      btn.disabled = true;
      note.textContent = T('Отправляю…', 'Sending…');
      try {
        await postLead(fd);
        note.textContent = T('Спасибо! Заявка у агента, ответим в ближайшее время.', 'Thank you! Your request is with an agent; we will reply shortly.');
        form.reset();
      } catch (err) {
        // запасной путь: открыть мессенджер с готовым текстом
        const text = EN ? `Hello! My name is ${f.name.value.trim()}, phone ${f.phone.value.trim()}.${f.wish.value.trim() ? ` I am looking for: ${f.wish.value.trim()}.` : ''} Please send me a selection.` : `Здравствуйте! Меня зовут ${f.name.value.trim()}, телефон ${f.phone.value.trim()}.${f.wish.value.trim() ? ` Ищу: ${f.wish.value.trim()}.` : ''} Пришлите, пожалуйста, подборку.`;
        if (via === 'wa' && form.dataset.wa) window.open(`https://wa.me/${form.dataset.wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        else window.open(`https://t.me/${form.dataset.tg}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        note.textContent = T('Открыли мессенджер с готовым сообщением, нажмите «Отправить».', 'We opened the messenger with a ready message, just press Send.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ---------- заявка на консультацию по услуге ----------
  $$('[data-service-form]').forEach((form) => {
    const t0 = Date.now();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const via = form.querySelector('input[name="via"]:checked')?.value || 'tg';
      const viaName = via === 'wa' ? 'WhatsApp' : via === 'call' ? 'Звонок' : 'Telegram';
      const service = (f.service_pick ? f.service_pick.value : f.service.value) || '';
      const note = form.querySelector('[data-lead-note]');
      const btn = form.querySelector('button[type="submit"]');
      const fd = new FormData();
      fd.append('kind', 'service');
      fd.append('service', service);
      fd.append('name', f.name.value.trim());
      fd.append('phone', f.phone.value.trim());
      fd.append('wish', f.comment.value.trim());
      fd.append('via', viaName);
      fd.append('url', location.href);
      fd.append('website', f.website ? f.website.value : '');
      fd.append('t0', t0);
      btn.disabled = true;
      note.textContent = T('Отправляю…', 'Sending…');
      try {
        await postLead(fd);
        note.textContent = T('Спасибо! Заявка принята, специалист свяжется с вами в ближайшее время.', 'Thank you! Your request has been received; a specialist will contact you shortly.');
        form.reset();
      } catch (err) {
        const text = EN ? `Hello! My name is ${f.name.value.trim()}, phone ${f.phone.value.trim()}. I need a consultation: ${service}.${f.comment.value.trim() ? ` ${f.comment.value.trim()}` : ''}` : `Здравствуйте! Меня зовут ${f.name.value.trim()}, телефон ${f.phone.value.trim()}. Нужна консультация: ${service}.${f.comment.value.trim() ? ` ${f.comment.value.trim()}` : ''}`;
        if (via === 'wa' && form.dataset.wa) window.open(`https://wa.me/${form.dataset.wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        else window.open(`https://t.me/${form.dataset.tg}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        note.textContent = T('Открыли мессенджер с готовым сообщением, нажмите «Отправить».', 'We opened the messenger with a ready message, just press Send.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ---------- запись на просмотр ----------
  const vw = document.querySelector('[data-viewing]');
  if (vw) {
    const form = vw.querySelector('[data-viewing-form]');
    const done = vw.querySelector('[data-viewing-done]');
    const note = vw.querySelector('[data-viewing-note]');
    $$('[data-open-viewing]').forEach((b) => b.addEventListener('click', () => {
      form.hidden = false; done.hidden = true; note.textContent = '';
      form.elements.t0.value = Date.now();
      vw.showModal();
      form.elements.name.focus();
    }));
    $$('[data-close-viewing]', vw).forEach((b) => b.addEventListener('click', () => vw.close()));
    vw.addEventListener('click', (e) => { if (e.target === vw) vw.close(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.elements.name.value.trim() || !form.elements.phone.value.trim()) { note.textContent = T('Укажите имя и телефон.', 'Please enter your name and phone number.'); note.classList.add('err'); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; note.classList.remove('err'); note.textContent = T('Отправляю…', 'Sending…');
      try {
        await postLead(new FormData(form));
        form.hidden = true; done.hidden = false;
      } catch (err) {
        note.classList.add('err');
        note.textContent = T(`Не получилось отправить: ${err.message}. Напишите нам в WhatsApp или Telegram, кнопки на странице.`, `Could not send: ${err.message}. Please message us on WhatsApp or Telegram using the buttons on the page.`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Telegram: текст подставляется ссылкой; на случай старой версии Telegram копируем его в буфер
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tg-text]');
    if (a && navigator.clipboard) navigator.clipboard.writeText(a.dataset.tgText).catch(() => {});
  });
})();

// Каталог, карта, избранное, листание фото, форма подбора. Без скрипта всё содержимое доступно.
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const plural = (n, f) => { const a = n % 100, b = n % 10; return a >= 11 && a <= 14 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2]; };
  const objects = (n) => `${n} ${plural(n, ['объект', 'объекта', 'объектов'])}`;
  // ---------- валюта: евро, динары, рубли ----------
  let RATES = { EUR: 1 };
  try { RATES = { ...RATES, ...JSON.parse(document.documentElement.dataset.rates || '{}') }; } catch (e) { /* только евро */ }
  const SYM = { EUR: '€', RSD: 'дин.', RUB: '₽' };
  const CKEY = 'ns-cur';
  let cur = (() => { try { const c = localStorage.getItem(CKEY); return RATES[c] ? c : 'EUR'; } catch (e) { return 'EUR'; } })();
  const conv = (eur) => {
    if (cur === 'EUR') return Math.round(eur);
    const v = eur * RATES[cur];
    const step = v >= 100000 ? 1000 : 100;
    return Math.round(v / step) * step;
  };
  const fmt = (eur, suf = '') => `${conv(eur).toLocaleString('ru-RU')}\u00a0${SYM[cur]}${suf}`;
  const money = (n) => (n ? fmt(n) : 'Цена по запросу');
  const toEur = (v) => (v ? v / RATES[cur] : 0); // значения фильтров вводятся в выбранной валюте
  function paintCur() {
    $$('.pr[data-eur]').forEach((el) => { el.textContent = fmt(+el.dataset.eur, el.dataset.suf || ''); });
    $$('[data-cur-sym]').forEach((el) => { el.textContent = SYM[cur].replace('.', ''); });
    $$('[data-cur]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cur === cur)));
    $$('[data-rate-note]').forEach((el) => { el.hidden = cur === 'EUR'; });
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
  const lite = () => (liteCache ||= fetch('/data/lite.json').then((r) => r.json()).catch(() => []));

  // ---------- избранное ----------
  const FKEY = 'ns-favs';
  const getFavs = () => { try { return JSON.parse(localStorage.getItem(FKEY)) || []; } catch (e) { return []; } };
  const setFavs = (a) => { try { localStorage.setItem(FKEY, JSON.stringify(a)); } catch (e) { /* приватный режим */ } };
  function paintFavs() {
    const f = new Set(getFavs());
    $$('[data-fav]').forEach((b) => {
      const on = f.has(b.dataset.fav);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Убрать из избранного' : 'В избранное');
      const t = b.querySelector('span');
      if (t) t.textContent = on ? 'В избранном' : 'В избранное';
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

    const num = (v) => parseInt(String(v || '').replace(/\D/g, ''), 10) || 0;
    const vals = (name) => $$(`input[name="${name}"]:checked`, form).map((i) => i.value);

    // восстановить фильтры из адреса
    const q = new URLSearchParams(location.search);
    for (const [k, v] of q) {
      if (['district', 'rooms'].includes(k)) v.split(',').forEach((x) => { const i = form.querySelector(`input[name="${k}"][value="${CSS.escape(x)}"]`); if (i) i.checked = true; });
      else if (k === 'deal') { const i = form.querySelector(`input[name="deal"][value="${CSS.escape(v)}"]`); if (i) i.checked = true; }
      else if (form.elements[k]) form.elements[k].value = v;
    }
    if (q.get('sort')) sort.value = q.get('sort');
    if (q.get('view')) view = q.get('view');

    function labels() {
      $$('details.dd', form).forEach((d) => {
        const lab = d.querySelector('[data-dd-label]');
        const base = lab.dataset.ddLabel;
        const checked = $$('input:checked', d);
        const nums = $$('input[inputmode]', d).map((i) => num(i.value));
        let text = base;
        if (checked.length === 1) text = checked[0].closest('label').querySelector('span').textContent;
        else if (checked.length > 1) text = `${base}: ${checked.length}`;
        else if (nums.some(Boolean)) {
          const unit = base === 'Цена' ? ` ${SYM[cur]}` : ' м²';
          text = nums[0] && nums[1] ? `${nums[0].toLocaleString('ru-RU')}–${nums[1].toLocaleString('ru-RU')}${unit}` : nums[0] ? `от ${nums[0].toLocaleString('ru-RU')}${unit}` : `до ${nums[1].toLocaleString('ru-RU')}${unit}`;
        }
        lab.textContent = text;
        d.classList.toggle('is-set', text !== base);
      });
    }

    function apply(resetPage = true) {
      if (resetPage) shown = PAGE;
      const f = form.elements;
      const dists = vals('district'), rooms = vals('rooms');
      const deal = f.deal ? (form.querySelector('input[name="deal"]:checked')?.value || '') : '';
      const min = toEur(num(f.min.value)), max = toEur(num(f.max.value)), amin = num(f.amin.value), amax = num(f.amax.value);
      visible = cards.filter((c) => {
        const p = +c.dataset.price, a = +c.dataset.area;
        return (!deal || c.dataset.deal === deal)
          && (!dists.length || dists.includes(c.dataset.district))
          && (!rooms.length || rooms.includes(c.dataset.rooms))
          && (!min || p >= min) && (!max || (p && p <= max))
          && (!amin || a >= amin) && (!amax || (a && a <= amax));
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
      found.textContent = `Найдено: ${objects(visible.length)}`;
      empty.hidden = visible.length > 0;
      more.hidden = view === 'map' || visible.length <= shown;
      if (!more.hidden) more.textContent = `Показать ещё ${Math.min(PAGE, visible.length - shown)} из ${visible.length - shown}`;
      labels();
      if (view === 'map') drawMap();
      // адрес страницы
      const u = new URLSearchParams();
      if (deal) u.set('deal', deal);
      if (dists.length) u.set('district', dists.join(','));
      if (rooms.length) u.set('rooms', rooms.join(','));
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
      try { await loadLeaflet(); } catch (e) { mapBox.textContent = 'Карта не загрузилась. Проверьте интернет и обновите страницу.'; return; }
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
        L.marker(d.g, { icon }).addTo(layer).bindPopup(`<div class="map-pop">${d.img ? `<img src="${d.img}" alt="">` : ''}<b>${money(d.p)}</b><span>${d.t}</span><br><span>${d.pl}</span><br><a href="${d.u}">Подробнее</a></div>`);
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
    const btn = search.querySelector('[data-search-btn]');
    const count = async () => {
      const data = await lite();
      const f = search.elements;
      const deal = search.querySelector('input[name="deal"]:checked').value;
      const max = toEur(parseInt(String(f.max.value).replace(/\D/g, ''), 10) || 0);
      const n = data.filter((d) => d.d === deal && (!f.district.value || d.ds === f.district.value) && (!f.rooms.value || d.r === f.rooms.value) && (!max || (d.p && d.p <= max))).length;
      btn.textContent = `Показать ${objects(n)}`;
    };
    search.addEventListener('input', count);
    document.addEventListener('ns-cur', count);
    search.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = search.elements;
      const deal = search.querySelector('input[name="deal"]:checked').value;
      const u = new URLSearchParams();
      if (f.district.value) u.set('district', f.district.value);
      if (f.rooms.value) u.set('rooms', f.rooms.value);
      const max = parseInt(String(f.max.value).replace(/\D/g, ''), 10);
      if (max) u.set('max', max);
      location.href = `/${deal === 'sale' ? 'prodazha' : 'arenda'}/${u.toString() ? `?${u}` : ''}`;
    });
    count();
  }

  // ---------- галерея объекта ----------
  const gal = document.querySelector('[data-gallery]');
  const lb = document.querySelector('[data-lightbox]');
  if (gal && lb) {
    const photos = JSON.parse(gal.dataset.gallery);
    const img = lb.querySelector('img');
    const cnt = lb.querySelector('.lb-count');
    let i = 0;
    const show = (n) => { i = (n + photos.length) % photos.length; img.src = photos[i]; img.alt = `Фото ${i + 1}`; cnt.textContent = `${i + 1} / ${photos.length}`; };
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
      L.circle([lat, lng], { radius: 180, color: '#111', weight: 1, fillColor: '#111', fillOpacity: 0.12 }).addTo(m);
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
      favBox.innerHTML = list.map((d) => `<article class="card"><div class="slider"><a class="slider-track" href="${d.u}">${d.img ? `<img src="${d.img}" alt="" loading="lazy" width="640" height="480">` : ''}</a><button class="fav" type="button" data-fav="${d.id}" aria-pressed="true">${document.querySelector('.fav-link svg').outerHTML}</button></div><div class="card-side"><p class="card-price">${money(d.p)}${d.d === 'rent' && d.p ? '<small> / мес</small>' : ''}</p></div><div class="card-main"><p class="card-place">${d.pl}</p><h3 class="card-title"><a href="${d.u}">${d.t}</a></h3></div></article>`).join('');
      paintFavs();
    });
  }

  // ---------- форма подбора ----------
  $$('[data-lead]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const via = form.querySelector('input[name="via"]:checked')?.value || 'tg';
      const text = `Здравствуйте! Меня зовут ${f.name.value.trim()}, телефон ${f.phone.value.trim()}.${f.wish.value.trim() ? ` Ищу: ${f.wish.value.trim()}.` : ''} Пришлите, пожалуйста, подборку.`;
      const note = form.querySelector('[data-lead-note]');
      if (via === 'wa' && form.dataset.wa) {
        window.open(`https://wa.me/${form.dataset.wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        note.textContent = 'Открыли WhatsApp с готовым сообщением. Осталось нажать «Отправить».';
      } else {
        try { await navigator.clipboard.writeText(text); } catch (err) { /* без буфера */ }
        window.open(`https://t.me/${form.dataset.tg}`, '_blank', 'noopener');
        note.textContent = 'Текст скопирован. Вставьте его в открывшийся чат Telegram и отправьте.';
      }
    });
  });
})();

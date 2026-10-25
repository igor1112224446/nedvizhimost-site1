// Фильтр списка и листание фото. Без скрипта всё содержимое страницы доступно.
(() => {
  const plural = (n, f) => { const a = n % 100, b = n % 10; return a >= 11 && a <= 14 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2]; };

  const form = document.querySelector('[data-filter]');
  if (form) {
    const grid = document.querySelector('[data-grid]');
    const cards = [...grid.children];
    const found = document.querySelector('[data-found]');
    const empty = document.querySelector('[data-empty]');
    const params = new URLSearchParams(location.search);
    for (const el of form.elements) if (params.has(el.name)) el.value = params.get(el.name);

    const apply = () => {
      const f = form.elements;
      const max = parseInt(String(f.max.value).replace(/\D/g, ''), 10) || 0;
      const district = f.district ? f.district.value : '';
      let n = 0;
      for (const c of cards) {
        const ok = (!district || c.dataset.district === district)
          && (!f.rooms.value || c.dataset.rooms === f.rooms.value)
          && (!max || (+c.dataset.price && +c.dataset.price <= max));
        c.hidden = !ok;
        if (ok) n++;
      }
      const sort = f.sort.value;
      const sorted = [...cards].sort((a, b) => {
        if (sort === 'cheap') return (+a.dataset.price || 1e12) - (+b.dataset.price || 1e12);
        if (sort === 'dear') return (+b.dataset.price || 0) - (+a.dataset.price || 0);
        return b.dataset.added.localeCompare(a.dataset.added);
      });
      sorted.forEach((c) => grid.appendChild(c));
      found.textContent = `Найдено: ${n} ${plural(n, ['объект', 'объекта', 'объектов'])}`;
      empty.hidden = n > 0;
      const q = new URLSearchParams();
      for (const el of form.elements) if (el.value && !(el.name === 'sort' && el.value === 'new')) q.set(el.name, el.value);
      history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
    };
    form.addEventListener('input', apply);
    form.addEventListener('submit', (e) => e.preventDefault());
    apply();
  }

  document.querySelectorAll('[data-gallery]').forEach((g) => {
    const track = g.querySelector('.gallery-track');
    const counter = g.querySelector('[data-counter]');
    if (!counter) return;
    const total = track.children.length;
    const index = () => Math.round(track.scrollLeft / track.clientWidth);
    const go = (i) => track.scrollTo({ left: Math.max(0, Math.min(total - 1, i)) * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    g.querySelector('[data-prev]').addEventListener('click', () => go(index() - 1));
    g.querySelector('[data-next]').addEventListener('click', () => go(index() + 1));
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index() + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index() - 1); }
    });
    let t;
    track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { counter.textContent = `${index() + 1} из ${total}`; }, 60); }, { passive: true });
  });
})();

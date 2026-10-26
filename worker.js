// Cloudflare Worker: отдаёт сайт из dist/ и принимает заявки собственников с /podat-obyavlenie/.
// Заявка с фото уходит в Telegram агентства. Нужны переменные TG_TOKEN (секрет) и TG_CHAT.
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${method}`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram ${r.status}`);
  return j;
}

async function submit(request, env) {
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  if (!env.TG_TOKEN || !env.TG_CHAT) return json({ error: 'приём заявок ещё не настроен' }, 500);
  let fd;
  try { fd = await request.formData(); } catch (e) { return json({ error: 'неверные данные формы' }, 400); }
  // защита от спам-ботов: скрытое поле и слишком быстрая отправка
  if (String(fd.get('website') || '').trim()) return json({ ok: true });
  const t0 = Number(fd.get('t0')) || 0;
  if (t0 && Date.now() - t0 < 4000) return json({ ok: true });

  const g = (k) => String(fd.get(k) || '').trim().slice(0, 3000);
  if (!g('phone') || !g('price') || !g('area') || !g('district')) return json({ error: 'не заполнены обязательные поля' }, 400);
  const sale = g('deal') === 'Продать';
  const feats = fd.getAll('features').map(String).filter(Boolean).slice(0, 20);
  const line = (k, v) => (v ? `<b>${esc(k)}:</b> ${esc(v)}` : '');
  const text = [
    `🏠 <b>Новое объявление с сайта: ${sale ? 'продажа' : 'аренда'}</b>`,
    '',
    line('Тип', g('type')), line('Комнат', g('rooms')), line('Площадь', g('area') && `${g('area')} м²`),
    line('Этаж', [g('floor'), g('floors') && `из ${g('floors')}`].filter(Boolean).join(' ')), line('Год постройки', g('year')),
    line('Район', g('district')), line('Микрорайон', g('location')), line('Адрес', g('street')),
    line(sale ? 'Цена' : 'Цена в месяц', g('price') && `${g('price')} €`),
    sale ? line('Право собственности', g('owned')) : [line('Депозит', g('deposit') && `${g('deposit')} €`), line('Коммунальные', g('bills') && `${g('bills')} €`), line('Свободна с', g('from')), line('Мебель', g('furn'))].filter(Boolean).join('\n'),
    line('Отопление', g('heating')), line('Состояние', g('state')),
    line('Удобства', feats.join(', ')),
    g('description') ? `\n<b>Описание:</b>\n${esc(g('description').slice(0, 2000))}` : '',
    '',
    line('Собственник', g('name')), line('Телефон', g('phone')), line('Связь', g('messenger')),
  ].filter((x) => x !== '').join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 4000);

  const photos = fd.getAll('photos').filter((f) => f && typeof f === 'object' && f.size > 0 && f.size < 10e6 && /^image\//.test(f.type)).slice(0, 10);
  try {
    const m = new FormData();
    m.append('chat_id', env.TG_CHAT);
    m.append('text', text);
    m.append('parse_mode', 'HTML');
    await tg(env, 'sendMessage', m);
    if (photos.length === 1) {
      const p = new FormData();
      p.append('chat_id', env.TG_CHAT);
      p.append('photo', photos[0], 'photo_1.jpg');
      await tg(env, 'sendPhoto', p);
    } else if (photos.length > 1) {
      const p = new FormData();
      p.append('chat_id', env.TG_CHAT);
      p.append('media', JSON.stringify(photos.map((_, i) => ({ type: 'photo', media: `attach://p${i}` }))));
      photos.forEach((f, i) => p.append(`p${i}`, f, `photo_${i + 1}.jpg`));
      await tg(env, 'sendMediaGroup', p);
    }
  } catch (e) {
    return json({ error: 'сервер не смог передать заявку' }, 502);
  }
  return json({ ok: true });
}

// Заявки клиентов: запись на просмотр и подбор. Уходят в TG_LEADS (например, личный чат @Rentch_srb), иначе в TG_CHAT.
async function lead(request, env) {
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  const chat = env.TG_LEADS || env.TG_CHAT;
  if (!env.TG_TOKEN || !chat) return json({ error: 'приём заявок ещё не настроен' }, 500);
  let fd;
  try { fd = await request.formData(); } catch (e) { return json({ error: 'неверные данные формы' }, 400); }
  if (String(fd.get('website') || '').trim()) return json({ ok: true });
  const t0 = Number(fd.get('t0')) || 0;
  if (t0 && Date.now() - t0 < 2000) return json({ ok: true });
  const g = (k) => String(fd.get(k) || '').trim().slice(0, 1000);
  if (!g('name') || !g('phone')) return json({ error: 'укажите имя и телефон' }, 400);
  const line = (k, v) => (v ? `<b>${esc(k)}:</b> ${esc(v)}` : '');
  const viewing = g('kind') === 'viewing';
  const text = [
    viewing ? '📅 <b>Запись на просмотр</b>' : '🔎 <b>Заявка на подбор</b>',
    viewing ? line('Объект', [g('title'), g('price')].filter(Boolean).join(', ')) : line('Ищет', g('wish')),
    viewing && g('url') ? esc(g('url')) : '',
    line('Имя', g('name')),
    line('Телефон', g('phone')),
    line('Ответить в', g('via')),
  ].filter(Boolean).join('\n');
  try {
    const m = new FormData();
    m.append('chat_id', chat);
    m.append('text', text);
    m.append('parse_mode', 'HTML');
    m.append('link_preview_options', JSON.stringify({ is_disabled: !viewing }));
    await tg(env, 'sendMessage', m);
  } catch (e) {
    return json({ error: 'сервер не смог передать заявку' }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/submit') return submit(request, env);
    if (url.pathname === '/api/lead') return lead(request, env);
    return env.ASSETS.fetch(request);
  },
};

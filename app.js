'use strict';
const $ = id => document.getElementById(id);
const el = (t, txt, c) => { const e = document.createElement(t); if (txt != null) e.textContent = txt; if (c) e.className = c; return e; };
const num = v => { const s = String(v).trim().replace(',', '.'); return s === '' ? NaN : Number(s); };
const r1 = n => Math.round(n * 10) / 10;
const norm = s => String(s).toLowerCase().replace(/[-_ ]/g, '');
const local = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString(); };
const nid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

// ტელეფონის მეხსიერება (IndexedDB): რიგი და ბოლო მონაცემები ინტერნეტის გარეშეც რჩება
const idb = new Promise((ok, no) => { const r = indexedDB.open('fuel', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function tx(mode, fn) { const db = await idb; return new Promise((ok, no) => { const t = db.transaction('kv', mode), r = fn(t.objectStore('kv')); t.oncomplete = () => ok(r.result); t.onerror = t.onabort = () => no(t.error); }); }
const read = k => tx('readonly', s => s.get(k));
const write = (k, v) => tx('readwrite', s => s.put(v, k));

let who = { day: '', name: '', list: [] };
let me = null, data = null, queue = [], sel = null, busy = false, voiding = null, status = '';
function say(t) { const m = $('msg'); m.textContent = t; m.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => m.hidden = true, 4000); }
const ERR = { auth: 'სახელი ან PIN არასწორია.', locked: 'ბევრი არასწორი ცდა. სცადეთ 10 წუთში.', busy: 'სერვერი დაკავებულია.' };

async function call(user, ops) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 60000);
  try {
    // Content-Type არ იწერება განზრახ: ასე Apps Script მოთხოვნას დამატებითი შემოწმების გარეშე იღებს
    const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ name: user.name, pin: user.pin, ops }), signal: c.signal });
    return await r.json();
  } finally { clearTimeout(t); }
}

const keep = r => ({ fleet: r.fleet || [], me: r.me, trucks: r.trucks, entries: r.entries, equipment: r.equipment, cards: r.cards || [], cars: r.cars || [], cardEntries: r.cardEntries || [], users: r.users || [] });

// რიგში ცვლილებები სათითაოდ სრულდება, რომ პარალელურმა შენახვამ ჩანაწერი არ დაკარგოს
let chain = Promise.resolve();
function changeQueue(fn) { const p = chain.then(async () => { const next = fn(queue); await write('queue', next); queue = next; }); chain = p.catch(() => {}); return p; }
const myQueue = () => queue.filter(o => me && o.user === me.name);

async function sync() {
  if (!me || busy) return;
  busy = true; const user = me; status = 'იგზავნება…'; render();
  try {
    for (;;) {
      const ops = queue.filter(o => o.user === user.name && !o.error).slice(0, 5);
      const res = await call(user, ops);
      if (me !== user) break;
      if (!res.ok) {
        status = ERR[res.error] || 'სერვერის შეცდომა.';
        if (res.error === 'auth') { await logout(true); say('PIN აღარ მუშაობს. შედით თავიდან.'); }
        break;
      }
      const result = Object.fromEntries(res.results.map(x => [x.opId, x]));
      await changeQueue(q => q.flatMap(o => !result[o.opId] ? [o] : result[o.opId].ok ? [] : [{ ...o, error: result[o.opId].error }]));
      data = keep(res);
      Object.assign(me, { admin: res.me.admin, truck: res.me.truck, card: res.me.card }); areas();
      await write('data:' + user.name, data);
      status = 'ბოლო კავშირი ' + local().slice(11, 16);
      if (!queue.some(o => o.user === user.name && !o.error)) break;
    }
  } catch (x) { status = 'კავშირი არ არის. ჩანაწერები ტელეფონშია შენახული.'; }
  finally { busy = false; trucksUI(); eqList(); render(); }
}

// სერვერის მონაცემები + ჯერ გაუგზავნელი ჩანაწერები
function equipment() { return [...(data ? data.equipment : []), ...myQueue().filter(o => o.kind === 'equipment').map(o => o.data)]; }
function entries() {
  const map = new Map((data ? data.entries : []).map(e => [e.id, { ...e }]));
  for (const o of myQueue()) {
    if (o.error) continue;
    if (o.kind === 'entry' && !map.has(o.data.id)) map.set(o.data.id, { ...o.data, driver: me.name, pending: true });
    if (o.kind === 'void' && map.has(o.data.id)) Object.assign(map.get(o.data.id), { void: true, pending: true });
  }
  return [...map.values()];
}
const truckId = () => me && me.admin ? $('truck').value : me && me.truck;
const truckInfo = () => data && data.trucks.find(t => t.id === truckId());
function totals(t = truckInfo()) {
  const d = $('date').value;
  if (!t || !t.start || d < t.from) return null;
  const live = entries().filter(e => !e.void && (e.truck === t.id || e.to === t.id) && e.date >= t.from);
  const sum = a => {
    const s = f => a.filter(f).reduce((n, e) => n + e.liters, 0);
    return { in: s(e => (e.type === 'in' && e.truck === t.id) || (e.type === 'move' && e.to === t.id)), out: s(e => e.type === 'fill' && e.truck === t.id), moved: s(e => e.type === 'move' && e.truck === t.id) };
  };
  const before = sum(live.filter(e => e.date < d)), day = sum(live.filter(e => e.date === d));
  const open = r1(t.base + before.in - before.out - before.moved);
  return { open, in: r1(day.in), out: r1(day.out), moved: r1(day.moved), end: r1(open + day.in - day.out - day.moved) };
}
const SITE_NAME = { N1: 'დანართი 1', N3: 'დანართი 3' };
const fleet = () => (data && data.fleet) || [];
function trucksUI() {
  const s = $('truck'), c = s.value;
  s.replaceChildren(...(data ? data.trucks : []).map(t => new Option(t.id + ' · ' + (SITE_NAME[t.site] || ''), t.id)));
  if (c && [...s.options].some(o => o.value === c)) s.value = c;
  sources();
}
// საიდან ივსება: ბაზა ან იმავე ობიექტის სხვა დიზელმზიდი
function sources() {
  const s = $('src'), c = s.value, id = truckId(), mine = fleet().find(t => t.id === id);
  s.replaceChildren(new Option('აირჩიეთ…', ''), new Option('ბაზიდან (ვისოლი)', 'base'), ...fleet().filter(t => mine && t.site === mine.site && t.id !== id).map(t => new Option('დიზელმზიდი ' + t.id + ' ავსებს', t.id)));
  if ([...s.options].some(o => o.value === c)) s.value = c;
}

function eqList() {
  const q = norm($('q').value), box = $('eq'), all = equipment();
  const site = (truckInfo() || {}).site, here = x => {
    const tk = fleet().find(f => norm(f.id) === norm(x.p)); if (tk) return tk.site === site;
    return !(x.n1 || x.n3) || (site === 'N1' ? x.n1 : x.n3);
  };
  // ძებნის გარეშე ჩანს მხოლოდ ამ ობიექტის ტექნიკა, ძებნისას ყველა
  const list = sel ? all.filter(x => x.id === sel) : all.filter(x => q ? norm(x.p + x.m + x.t).includes(q) : here(x));
  box.replaceChildren(...list.map(x => {
    const b = el('button', null, 'item' + (sel === x.id ? ' picked' : '')); b.type = 'button';
    b.append(el('b', x.p || x.m), el('small', (x.t + ' ' + x.m).trim() + (sel ? ' · შეცვლა' : '')));
    b.onclick = () => { sel = sel ? null : x.id; eqList(); check(); if (sel) $('liters').focus(); };
    return b;
  }));
  if (!list.length) box.append(el('div', 'ვერ მოიძებნა. დაამატეთ ახალი ტექნიკა ქვემოთ.', 'mut'));
}
function check() {
  const w = [], L = num($('liters').value), M = num($('meter').value), d = $('date').value, t = totals(), all = entries().filter(e => !e.void);
  if (L > 0 && t && L > t.end) w.push('ავზში მხოლოდ ' + t.end + ' ლ არის.');
  if (sel) {
    const same = all.filter(e => e.type === 'fill' && e.eq === sel);
    if (same.some(e => e.date === d)) w.push('ეს ტექნიკა ამ დღეს უკვე შეივსო.');
    const prev = same.filter(e => e.meter !== '' && e.date <= d).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).pop();
    if (prev && M < num(prev.meter)) w.push('მრიცხველი წინა ჩვენებაზე (' + prev.meter + ') ნაკლებია.');
  }
  const s = $('seal').value.trim();
  if (s && all.some(e => e.seal === s)) w.push('ეს ლუქის ნომერი უკვე გამოყენებულია.');
  $('warns').hidden = $('reasonL').hidden = !w.length;
  $('warns').replaceChildren(...w.map(a => el('div', '⚠ ' + a)));
  return w;
}

function card(e) {
  const c = el('div', null, 'e' + (e.void ? ' void' : '')), h = el('div', null, 'row');
  const got = e.type === 'in' || (e.type === 'move' && e.to === truckId());
  h.append(el('strong', e.type === 'in' ? 'მიღება: ' + e.label : e.type === 'move' ? 'გადასხმა ' + e.truck + ' → ' + e.to : e.label), el('strong', (got ? '+' : '') + e.liters + ' ლ'));
  // თუ მითითებული დრო შენახვის დროს 10 წუთზე მეტით სცდება, ეს ჩანს
  const late = e.saved && Math.abs(Date.parse(e.saved.replace(' ', 'T')) - Date.parse(e.date + 'T' + e.time)) > 6e5;
  c.append(h, el('small', [e.time, late && 'შეყვანილია ' + e.saved.slice(8, 10) + '.' + e.saved.slice(5, 7) + ' ' + e.saved.slice(11), (e.person || me.admin || e.type === 'move') && (e.person || e.driver) + (me.admin && e.type !== 'move' ? ' · ' + e.truck : ''), e.meter && 'მრიცხ. ' + e.meter, e.seal && 'ლუქი ' + e.seal, e.who && 'მიმღები ' + e.who].filter(Boolean).join(' · ')));
  if (e.warns) c.append(el('small', '⚠ ' + e.warns + ' მიზეზი: ' + e.reason, 'bad'));
  const a = el('div', null, 'row');
  a.append(el('small', e.pending ? '⏳ გასაგზავნია' : '✓ გაგზავნილია'));
  if (me.admin && /^https:\/\//.test(e.photo || '')) { const l = el('a', 'ფოტო'); l.href = e.photo; l.target = '_blank'; l.rel = 'noopener'; a.append(l); }
  if (!e.void && (me.admin || e.driver === me.name)) {
    const b = el('button', voiding === e.id ? 'დაადასტურეთ' : 'გაუქმება');
    b.onclick = async () => { if (voiding !== e.id) { voiding = e.id; render(); return; } voiding = null; if (await enqueue('void', { id: e.id, person: person() })) say('ჩანაწერი გაუქმდა'); };
    a.append(b);
  }
  c.append(a); return c;
}
// დიზელმზიდზე ყოველდღე სხვა მძღოლი შეიძლება იჯდეს: სახელი მხოლოდ იმ დღეს ახსოვს, მერე თავიდან იწერება
const today = () => local().slice(0, 10);
const person = () => me && !me.admin && who.day === today() ? who.name : '';
function personUI() {
  $('personL').hidden = !me || me.admin;
  if (document.activeElement !== $('person')) $('person').value = person();
  const names = new Set([...who.list, ...entries().map(e => e.person).filter(Boolean)]);
  $('people').replaceChildren(...[...names].map(n => new Option(n)));
}
async function setPerson() {
  const name = $('person').value.trim().replace(/\s+/g, ' ');
  who = { day: today(), name, list: [...new Set([name, ...who.list].filter(Boolean))].slice(0, 15) };
  await write('person:' + me.name, who);
}
function personOk() { if (me.admin || person()) return true; $('person').focus(); $('person').scrollIntoView({ block: 'center' }); say('ჯერ ჩაწერეთ დღევანდელი მძღოლის სახელი.'); return false; }

function render() {
  if (!me) return;
  personUI();
  $('whoami').textContent = me.name + (me.admin ? ' · საკონტროლო' : me.truck ? ' · ' + me.truck : ' · ბარათი');
  $('truckL').hidden = !me.admin;
  const mine = myQueue(), waiting = mine.filter(o => !o.error).length;
  $('sync').textContent = (waiting ? '⏳ გასაგზავნია: ' + waiting + '. ' : '✓ ყველაფერი გაგზავნილია. ') + status;
  $('send').disabled = busy;
  $('errors').replaceChildren(...mine.filter(o => o.error).map(o => {
    const c = el('div', null, 'warn'); c.append(el('div', 'ვერ ჩაიწერა: ' + (o.data.label || o.data.p || o.data.num || o.data.id) + (o.data.liters || o.data.total ? ', ' + (o.data.liters || o.data.total) + ' ლ' : '') + '. ' + o.error));
    const again = el('button', 'თავიდან ცდა'), drop = el('button', 'წაშლა');
    again.onclick = async () => { await changeQueue(q => q.map(x => x.opId === o.opId ? { ...x, error: undefined } : x)); sync(); };
    drop.onclick = async () => { if (drop.textContent === 'წაშლა') { drop.textContent = 'დაადასტურეთ წაშლა'; return; } await changeQueue(q => q.filter(x => x.opId !== o.opId)); render(); };
    c.append(again, drop); return c;
  }));
  const t = totals();
  $('baltitle').textContent = 'ნაშთი ავზში · ' + (truckId() || '');
  $('end').textContent = t ? t.end : '—';
  $('parts').textContent = t ? 'საწყისი ' + t.open + ' · მიღება ' + t.in + ' · გაცემა ' + t.out + (t.moved ? ' · გადასხმა ' + t.moved : '') : (truckInfo() && !truckInfo().start ? 'საწყისი ნაშთი ჯერ არ არის შევსებული.' : 'ამ დღის ნაშთი აპში არ არის.');
  const day = entries().filter(e => e.date === $('date').value && (me.admin || e.truck === me.truck || e.to === me.truck)).sort((a, b) => b.time.localeCompare(a.time));
  $('daytitle').textContent = me.admin ? 'ყველა ჩანაწერი, არჩეული დღე' : 'დღის ჩანაწერები';
  const groups = {};
  // ადმინს: სამივე დიზელმზიდის ნაშთი და დღის ჯამები
  if (me.admin) {
    for (const x of (data ? data.trucks : [])) { const s = totals(x); groups['ნაშთი · ' + x.id + ' (' + (SITE_NAME[x.site] || '') + ')'] = s ? s.end : '—'; }
    for (const e of day) {
      if (e.void) continue;
      const k = e.type === 'fill' ? 'გაცემა · ' + e.truck + ' · ' + (e.person || e.driver) : e.type === 'move' ? 'გადასხმა · ' + e.truck + ' → ' + e.to : 'ბაზიდან · ' + e.truck;
      groups[k] = r1((groups[k] || 0) + e.liters);
    }
  }
  $('summary').replaceChildren(...Object.entries(groups).map(([k, v]) => { const r = el('div', null, 'row e'); r.append(el('strong', k), el('strong', v === '—' ? v : v + ' ლ')); return r; }));
  $('log').replaceChildren(...(day.length ? day.map(card) : [el('div', 'ამ დღეს ჩანაწერი არ არის.', 'mut')]));
  check();
  Cards.render();
}

async function enqueue(kind, d) {
  try { await changeQueue(q => [...q, { opId: nid(), user: me.name, kind, data: d }]); }
  catch (x) { say('ტელეფონში ვერ შეინახა. შეამოწმეთ თავისუფალი ადგილი.'); return false; }
  render(); sync(); return true;
}
function shrink(f, max = 1000) {
  return new Promise(ok => { if (!f) return ok(''); const u = URL.createObjectURL(f), i = new Image();
    i.onload = () => { const k = Math.min(1, max / Math.max(i.width, i.height)), c = el('canvas'); c.width = i.width * k; c.height = i.height * k; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .6)); };
    i.onerror = () => ok(''); i.src = u; });
}
// დროის ველი თავისით აჩვენებს მიმდინარე საათს, სანამ მძღოლი არ შეასწორებს
function tick() { for (const i of ['time', 'time2', 'ctime']) if (!$(i).dataset.edited) $(i).value = local().slice(11, 16); }
const stamp = () => local().slice(0, 16).replace('T', ' ');
function timeOf(id, day = 'date') {
  tick(); const v = $(id).value;
  if (!v) { say('მიუთითეთ დრო.'); return null; }
  if ($(day).value + ' ' + v > stamp()) { say('მითითებული დრო ჯერ არ დამდგარა. შეასწორეთ დღე ან საათი.'); return null; }
  return v;
}
const clearForm = () => { for (const i of ['time', 'time2', 'ctime']) delete $(i).dataset.edited; tick(); for (const i of ['q', 'liters', 'meter', 'seal', 'who', 'photo', 'reason', 'dl', 'src', 'np', 'nm', 'nt']) $(i).value = ''; sel = null; cams(); };
function dayOk() { const t = truckInfo(); if (!t) { say('დიზელმზიდი არ არის მითითებული.'); return false; } if (!t.start) { say('საწყისი ნაშთი ჯერ არ არის შევსებული. მიმართეთ ადმინს.'); return false; } if ($('date').value < t.from) { say('ამ თარიღზე ჩაწერა აპიდან აღარ შეიძლება.'); return false; } return true; }

$('addEq').onclick = async () => {
  const p = $('np').value.trim().toUpperCase(), m = $('nm').value.trim(), t = $('nt').value.trim();
  if (!p && !m) return say('ჩაწერეთ ნომერი ან მოდელი.');
  const dup = equipment().find(x => p ? norm(x.p) === norm(p) : !x.p && norm(x.m) === norm(m));
  const id = dup ? dup.id : 'n-' + nid();
  if (!dup && !await enqueue('equipment', { id, p, m, t })) return;
  sel = id; for (const i of ['np', 'nm', 'nt', 'q']) $(i).value = ''; $('addbox').open = false; eqList(); check();
  say(dup ? 'ეს ტექნიკა უკვე სიაშია. ავირჩიე.' : 'ტექნიკა დაემატა');
};
$('save').onclick = async () => {
  const L = num($('liters').value), meter = $('meter').value.trim().replace(',', '.');
  if (!personOk() || !dayOk()) return;
  if (!sel) return say('აირჩიეთ ტექნიკა.');
  if (!(L > 0)) return say('ჩაწერეთ ლიტრი (0-ზე მეტი).');
  if (meter && isNaN(num(meter))) return say('მრიცხველში მხოლოდ რიცხვი ჩაწერეთ.');
  const target = equipment().find(y => y.id === sel);
  const mineNow = truckInfo();
  if (L >= 200 && target && fleet().some(t => norm(t.id) === norm(target.p) && t.id !== mineNow.id && t.site === mineNow.site)) return say('დიზელმზიდში გადასხმას წერს მიმღები მძღოლი „მიღება“ ჩანართში.');
  const time = timeOf('time'); if (!time) return;
  const w = check(), reason = $('reason').value.trim();
  if (w.length && !reason) { $('reason').focus(); return say('ჩაწერეთ გაფრთხილების მიზეზი.'); }
  $('save').disabled = true;
  const x = equipment().find(y => y.id === sel);
  const d = { person: person(), id: nid(), type: 'fill', date: $('date').value, time, saved: stamp(), truck: truckId(), eq: sel, label: [x.p, x.m].filter(Boolean).join(' · '), liters: L, meter, seal: $('seal').value.trim(), who: $('who').value.trim(), warns: w.join(' '), reason: w.length ? reason : '' };
  d.photo = await shrink($('photo').files[0]);
  if (await enqueue('entry', d)) { clearForm(); eqList(); check(); say('შენახულია: ' + L + ' ლ'); }
  $('save').disabled = false;
};
$('saveIn').onclick = async () => {
  const L = num($('dl').value);
  if (!personOk() || !dayOk()) return;
  if (!(L > 0)) return say('ჩაწერეთ ლიტრი (0-ზე მეტი).');
  const from = $('src').value, mine = truckId();
  if (!from) return say('აირჩიეთ, საიდან ივსება.');
  const time = timeOf('time2'); if (!time) return;
  $('saveIn').disabled = true;
  const move = from !== 'base';
  if (await enqueue('entry', { person: person(), id: nid(), type: move ? 'move' : 'in', date: $('date').value, time, saved: stamp(), truck: move ? from : mine, to: move ? mine : '', eq: '', label: move ? from + ' → ' + mine : 'ბაზა (ვისოლი)', liters: L, meter: '', seal: '', who: '', warns: '', reason: '' })) { clearForm(); say('მიღება შენახულია'); }
  $('saveIn').disabled = false;
};

// რომელი ნაწილი ჩანს: დიზელმზიდი, ბარათები, ან ორივე
let area = 'tank';
function areas(pick) {
  const list = [(me.admin || me.truck) && ['tank', 'დიზელმზიდი'], (me.admin || me.card) && ['cards', 'ბარათები']].filter(Boolean);
  area = pick || area;
  if (!list.some(a => a[0] === area)) area = list.length ? list[0][0] : 'tank';
  $('areas').hidden = list.length < 2;
  $('areas').replaceChildren(...list.map(([k, n]) => { const b = el('button', n); b.setAttribute('aria-selected', k === area); b.onclick = () => { areas(k); render(); }; return b; }));
  $('tank').hidden = area !== 'tank'; $('cardarea').hidden = area !== 'cards';
}
function show(k) { for (const a of ['fill', 'in', 'day']) $('p-' + a).hidden = a !== k; for (const b of $('nav').children) b.setAttribute('aria-selected', b.dataset.k === k); }
async function open_(user) {
  me = user; data = await read('data:' + user.name) || null; who = await read('person:' + user.name) || { day: '', name: '', list: [] }; status = '';
  clearForm(); $('login').hidden = true; $('app').hidden = false; $('date').value = local().slice(0, 10);
  const tabs = user.admin ? [['day', 'კონტროლი'], ['fill', 'შევსება'], ['in', 'მიღება']] : [['fill', 'შევსება'], ['in', 'მიღება'], ['day', 'ჩემი დღე']];
  $('nav').replaceChildren(...tabs.map(([k, n]) => { const b = el('button', n); b.dataset.k = k; b.onclick = () => show(k); return b; }));
  show(tabs[0][0]); areas('tank'); trucksUI(); eqList(); Cards.open(); render();
}
async function logout(force) {
  if (!force && me.admin && myQueue().some(o => !o.error)) return say('ჯერ გააგზავნეთ შენახული ჩანაწერები.');
  me = null; data = null; await write('session', null); clearForm(); $('app').hidden = true; $('login').hidden = false; $('pin').value = '';
}
$('leave').onclick = () => {
  const b = $('leave');
  if (me && !me.admin && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'ნამდვილად გასვლა?'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'გასვლა'; }, 4000); return; }
  delete b.dataset.sure; b.textContent = 'გასვლა'; logout(false);
};
$('login').onsubmit = async ev => {
  ev.preventDefault();
  if (!API_URL) return say('config.js ფაილში ბმული არ არის ჩაწერილი.');
  const user = { name: $('name').value.trim(), pin: $('pin').value.trim() };
  if (!user.name || user.pin.length < 6) return say('ჩაწერეთ სახელი და 6-ნიშნა PIN.');
  $('enter').disabled = true;
  try {
    const res = await call(user, []);
    if (!res.ok) return say(ERR[res.error] || 'სერვერის შეცდომა.');
    Object.assign(user, { name: res.me.name, admin: res.me.admin, truck: res.me.truck, card: res.me.card });
    await write('data:' + user.name, keep(res));
    // მძღოლი ტელეფონს ამახსოვრდება; ადმინს კოდი ყოველ ჯერზე ეკითხება
    await write('session', user.admin ? null : user);
    $('pin').value = ''; await open_(user); sync();
  } catch (x) { say('კავშირი ვერ დამყარდა. შეამოწმეთ ინტერნეტი და ბმული.'); }
  finally { $('enter').disabled = false; }
};
$('q').oninput = () => { sel = null; eqList(); check(); };
for (const i of ['liters', 'meter', 'seal']) $(i).oninput = check;
for (const i of ['time', 'time2', 'ctime']) $(i).oninput = () => { if ($(i).value) $(i).dataset.edited = '1'; else delete $(i).dataset.edited; };
setInterval(tick, 10000);
$('date').onchange = () => { if (!$('date').value) $('date').value = local().slice(0, 10); render(); };
$('truck').onchange = () => { sel = null; sources(); eqList(); render(); };
// კამერის ღილაკი: გადაღების შემდეგ ჩანს ფოტო
function cams() {
  for (const box of document.querySelectorAll('.cam')) {
    const input = box.querySelector('input'), img = box.querySelector('img'), text = box.querySelector('span'), f = input.files[0];
    if (img.src) { URL.revokeObjectURL(img.src); img.removeAttribute('src'); }
    img.hidden = !f; if (f) img.src = URL.createObjectURL(f);
    text.textContent = f ? 'ხელახლა გადაღება' : text.dataset.text;
  }
}
for (const i of ['photo', 'cphoto']) $(i).onchange = cams;
$('person').onchange = async () => { await setPerson(); render(); };
$('person').oninput = () => { who = { ...who, day: today(), name: $('person').value.trim() }; };
$('send').onclick = sync;
addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); render(); sync(); } });
setInterval(() => { if (!document.hidden) sync(); }, 60000);
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  queue = await read('queue') || [];
  const user = await read('session');
  if (user) { await open_(user); sync(); }
})();

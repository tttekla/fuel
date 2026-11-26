'use strict';
// საბარათე ნაწილი
const Cards = (() => {
  const FUELS = ['დიზელი', 'ბენზინი'], SITE = { '': 'ობიექტის გარეშე', N1: 'დანართი 1', N3: 'დანართი 3' };
  const r2 = n => Math.round(n * 100) / 100;
  let lines = [], tab = '', edit = null, voidId = null, drawn = null;
  const opened = new Set();

  // სერვერის მონაცემები + ჯერ გაუგზავნელი ცვლილებები
  const ops = kind => myQueue().filter(o => o.kind === kind && !o.error);
  function cars() {
    const map = new Map(((data && data.cars) || []).map(c => [c.id, { ...c }]));
    for (const o of ops('car')) if (!map.has(o.data.id)) map.set(o.data.id, { t: '', site: '', ...o.data });
    for (const o of ops('carEdit')) if (map.has(o.data.id)) Object.assign(map.get(o.data.id), o.data);
    return [...map.values()];
  }
  function cards() {
    const map = new Map(((data && data.cards) || []).map(c => [c.id, c]));
    for (const o of myQueue().filter(o => !o.error)) {
      const d = o.data;
      if (o.kind === 'card') map.set(d.id, d);
      const id = o.kind === 'cardCar' ? d.id : o.kind === 'car' && d.card ? d.id : null, k = id && map.get(d.card);
      if (k && !k.cars.includes(id)) map.set(k.id, { ...k, cars: [...k.cars, id] });
    }
    return [...map.values()];
  }
  const carName = c => c ? [c.p, c.m].filter(Boolean).join(' · ') : '?';
  function entries() {
    const map = new Map(((data && data.cardEntries) || []).map(e => [e.id, { ...e }]));
    const cs = cars(), ks = cards();
    for (const o of ops('receipt')) {
      const d = o.data, k = ks.find(x => x.id === d.card) || {};
      if ([...map.values()].some(e => e.rid === d.id)) continue;
      d.lines.forEach((l, n) => { const c = cs.find(x => x.id === l.car); map.set(d.id + '-' + (n + 1), { rid: d.id, date: d.date, time: d.time, saved: d.saved, card: d.card, num: k.num, holder: k.holder, by: me.name, car: l.car, label: carName(c), site: c ? c.site : '', fuel: l.fuel, liters: l.liters, odo: l.odo, warns: d.warns, reason: d.reason, total: d.total, pending: true }); });
    }
    for (const o of ops('receiptVoid')) for (const e of map.values()) if (e.rid === o.data.id) Object.assign(e, { void: true, pending: true });
    return [...map.values()];
  }
  const siteOf = e => e.site || (cars().find(c => c.id === e.car) || {}).site || '';
  const match = (c, q) => norm(c.p + c.m).includes(norm(q));
  const button = (text, fn, cls) => { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; };
  const carButton = (c, fn) => { const b = button(null, fn, 'item'); b.append(el('b', c.p || c.m), el('small', [c.m, SITE[c.site || '']].filter(Boolean).join(' · '))); return b; };
  const select = (pairs, value, fn) => { const s = el('select'); s.append(...pairs.map(([v, n]) => new Option(n, v))); s.value = value; s.onchange = () => fn(s.value); return s; };
  const labelled = (text, node) => { const l = el('label', text); l.append(node); return l; };

  // ---- შევსება
  const myCards = () => cards().filter(c => c.active && (me.admin || c.holder === me.name || c.extra.split(',').map(s => s.trim()).includes(me.name)));
  const card = () => cards().find(c => c.id === $('cc').value);
  const own = () => { const k = card(), all = cars(); return k ? k.cars.map(id => all.find(c => c.id === id)).filter(Boolean) : []; };
  const header = () => { const l = me.admin ? [] : myCards(); if (l.length) $('whoami').textContent = [me.name, me.truck, 'ბარათი ' + l.map(c => c.num).join(', ')].filter(Boolean).join(' · '); };
  function cardSelect() {
    const s = $('cc'), old = s.value, list = myCards();
    s.replaceChildren(...list.map(c => new Option(c.num + ' · ' + c.holder, c.id)));
    if (list.some(c => c.id === old)) s.value = old;
    $('ccL').hidden = list.length < 2; $('cnone').hidden = !!list.length;
  }
  const newLine = () => ({ car: '', fuel: '', liters: '', odo: '' });
  // ცარიელ ხაზებს ავტომატურად ენიჭება ბარათის მანქანა
  function fillLines() {
    const list = own();
    if (!lines.length) lines.push(newLine());
    for (const l of lines) {
      if (!list.some(c => c.id === l.car)) { const c = list.find(c => !lines.some(x => x.car === c.id)); l.car = c ? c.id : ''; l.fuel = ''; }
      if (!l.fuel) l.fuel = (list.find(c => c.id === l.car) || {}).fuel || FUELS[0];
    }
  }
  function drawLines() {
    fillLines();
    const list = own();
    $('clines').replaceChildren(...lines.map((l, i) => {
      const c = list.find(x => x.id === l.car), box = el('div', null, lines.length > 1 ? 'line' : 'stack');
      if (lines.length > 1) { const head = el('div', null, 'row'); head.append(el('strong', 'ტექნიკა ' + (i + 1)), button('✕', () => { lines.splice(i, 1); drawLines(); })); box.append(head); }
      const pick = select(list.length ? list.map(x => [x.id, carName(x)]) : [['', 'ჯერ დაამატეთ ტექნიკა ქვემოთ']], l.car, v => { l.car = v; l.fuel = (list.find(x => x.id === v) || {}).fuel || l.fuel; l.odo = ''; drawLines(); });
      const fuel = el('div', null, 'two');
      fuel.append(...FUELS.map(f => { const b = button(f, () => { l.fuel = f; drawLines(); }, l.fuel === f ? 'chosen' : ''); b.setAttribute('aria-pressed', l.fuel === f); return b; }));
      const input = key => { const x = el('input', null, key === 'liters' ? 'big' : ''); x.inputMode = 'decimal'; x.autocomplete = 'off'; x.value = l[key]; x.dataset.k = key; x.oninput = () => { l[key] = x.value; check(); }; return x; };
      box.append(labelled('მანქანა / ტექნიკა', pick), fuel, labelled('ლიტრი', input('liters')));
      if (!c || c.odo) box.append(labelled('ოდომეტრი', input('odo')));
      return box;
    }));
    $('cmore').hidden = list.length < 2 || lines.length >= list.length;
    check();
  }
  const total = () => r2(lines.reduce((n, l) => n + (num(l.liters) || 0), 0));
  function check() {
    const sum = total(), w = [], all = entries().filter(e => !e.void);
    $('csum').textContent = lines.length > 1 ? 'ქვითრის ჯამი: ' + sum + ' ლ' : '';
    if (sum > 0 && all.some(e => e.card === $('cc').value && e.date === $('cdate').value && e.total === sum)) w.push('ამ დღეს ამ ბარათზე იგივე ლიტრაჟის ქვითარი უკვე შეყვანილია.');
    for (const l of lines) {
      const prev = all.filter(e => e.car === l.car && e.odo !== '' && e.date <= $('cdate').value).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).pop();
      if (prev && num(l.odo) < num(prev.odo)) w.push(carName(cars().find(c => c.id === l.car)) + ': ოდომეტრი წინა ჩვენებაზე (' + prev.odo + ') ნაკლებია.');
    }
    $('cwarns').hidden = $('creasonL').hidden = !w.length;
    $('cwarns').replaceChildren(...w.map(a => el('div', '⚠ ' + a)));
    return w;
  }
  function clear() { lines = []; for (const i of ['cphoto', 'creason', 'cnp', 'cnm']) $(i).value = ''; $('cfound').replaceChildren(); delete $('ctime').dataset.edited; tick(); cams(); drawLines(); }

  // ---- ტექნიკის დამატება საკუთარ ბარათზე
  function suggest() {
    const q = norm($('cnp').value), k = card();
    const found = q.length >= 2 && k ? cars().filter(c => !k.cars.includes(c.id) && norm(c.p).includes(q)).slice(0, 6) : [];
    $('cfound').replaceChildren(...found.map(c => carButton(c, () => attach(c.id))));
  }
  function useCar(id) {
    // თუ არის ჯერ შეუვსებელი ხაზი, ახალი ტექნიკა მასში ჩაჯდება
    const free = [...lines].reverse().find(l => !l.car || String(l.liters).trim() === '');
    if (free) Object.assign(free, { car: id, fuel: '', odo: '' }); else if (!lines.some(l => l.car === id)) lines.push({ ...newLine(), car: id });
    $('cnp').value = $('cnm').value = ''; $('cnodo').checked = true; $('cfound').replaceChildren(); $('caddbox').open = false; drawLines();
  }
  async function attach(id) { if (await enqueue('cardCar', { id, card: $('cc').value })) { useCar(id); say('ტექნიკა დაემატა'); } }
  async function addCar() {
    const p = $('cnp').value.trim().toUpperCase(), m = $('cnm').value.trim(), k = card();
    if (!k) return say('ბარათი არ არის მიბმული.');
    if (!p && !m) return say('ჩაწერეთ ნომერი ან დასახელება.');
    const dup = cars().find(c => p ? norm(c.p) === norm(p) : !c.p && norm(c.m) === norm(m));
    if (dup) { if (k.cars.includes(dup.id)) { useCar(dup.id); return say('ეს ტექნიკა უკვე სიაშია. ავირჩიე.'); } return attach(dup.id); }
    const id = 'v-' + nid();
    if (await enqueue('car', { id, p, m, site: '', fuel: lines.length ? lines[lines.length - 1].fuel : FUELS[0], odo: $('cnodo').checked, card: k.id })) { useCar(id); say('ტექნიკა დაემატა'); }
  }
  async function save() {
    if (!card()) return say('ბარათი არ არის მიბმული.');
    const out = [];
    for (const l of lines) {
      const c = own().find(x => x.id === l.car), liters = num(l.liters), odo = String(l.odo).trim().replace(',', '.');
      if (!c) return say('აირჩიეთ ან დაამატეთ ტექნიკა.');
      if (!(liters > 0)) return say(carName(c) + ': ჩაწერეთ ლიტრი.');
      if (c.odo && !(num(odo) >= 0)) return say(carName(c) + ': ჩაწერეთ ოდომეტრი (მხოლოდ რიცხვი).');
      out.push({ car: l.car, fuel: l.fuel, liters, odo: c.odo ? odo : '' });
    }
    if (!$('cphoto').files[0]) return say('გადაუღეთ ფოტო ქვითარს.');
    if (!$('cdate').value) return say('მიუთითეთ დღე.');
    const time = timeOf('ctime', 'cdate'); if (!time) return;
    const w = check(), reason = $('creason').value.trim(), sum = total();
    if (w.length && !reason) { $('creason').focus(); return say('ჩაწერეთ გაფრთხილების მიზეზი.'); }
    $('csave').disabled = true;
    const d = { id: nid(), card: $('cc').value, date: $('cdate').value, time, saved: stamp(), total: sum, lines: out, warns: w.join(' '), reason: w.length ? reason : '', label: 'ქვითარი ' + card().num };
    d.photo = await shrink($('cphoto').files[0], 1600);
    if (!d.photo) say('ფოტო ვერ წავიკითხე. გადაუღეთ თავიდან.');
    else if (await enqueue('receipt', d)) { clear(); say('შენახულია: ' + sum + ' ლ'); }
    $('csave').disabled = false;
  }

  // ---- ჩემი ცხრილი თვის მიხედვით
  function table(head, rows) {
    const wrap = el('div', null, 'wide'), t = el('table'), tr = el('tr');
    tr.append(...head.map(([h, c]) => el('th', h, c))); t.append(tr, ...rows); wrap.append(t); return wrap;
  }
  function monthView() {
    const month = $('mmonth').value, mine = new Set(myCards().map(k => k.id));
    const list = entries().filter(e => e.date.slice(0, 7) === month && (e.by === me.name || mine.has(e.card))).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const live = list.filter(e => !e.void), sum = a => r2(a.reduce((n, e) => n + e.liters, 0));
    $('mtotal').replaceChildren(el('small', 'სულ ამ თვეში'), el('b', sum(live) + ' ლ'), el('small', FUELS.map(f => f + ' ' + sum(live.filter(e => e.fuel === f))).join(' · ')));
    if (!list.length) return $('mtables').replaceChildren(el('div', 'ამ თვეში ჩანაწერი არ არის.', 'mut'));
    const groups = new Map();
    for (const e of live) { const k = e.car + '|' + e.fuel; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const totals = [...groups.values()].map(a => { const tr = el('tr'); tr.append(el('td', a[0].label), el('td', a[0].fuel), el('td', sum(a) + ' ლ', 'n')); return tr; });
    const seen = new Set();
    const rows = list.map(e => {
      const tr = el('tr', null, e.void ? 'void' : ''), what = el('td'), act = el('td');
      what.append(el('div', e.label), el('small', e.fuel + (e.pending ? ' · ⏳ გასაგზავნია' : '')));
      if (!e.void && !seen.has(e.rid) && e.by === me.name) act.append(button(voidId === e.rid ? 'დაადასტურეთ' : '✕', async () => { if (voidId !== e.rid) { voidId = e.rid; return monthView(); } voidId = null; if (await enqueue('receiptVoid', { id: e.rid })) say('ქვითარი გაუქმდა'); }));
      seen.add(e.rid);
      tr.append(el('td', e.date.slice(8) + '.' + e.date.slice(5, 7) + ' ' + e.time), what, el('td', String(e.liters), 'n'), el('td', e.odo, 'n'), act);
      return tr;
    });
    $('mtables').replaceChildren(el('h2', 'ტექნიკის მიხედვით'), table([['ტექნიკა'], ['საწვავი'], ['ჯამი', 'n']], totals), el('h2', 'ყველა ჩასხმა'), table([['დრო'], ['ტექნიკა'], ['ლ', 'n'], ['ოდომ.', 'n'], ['']], rows), el('small', '✕ აუქმებს მთელ ქვითარს.'));
  }

  // ---- ჩანაწერების ჩვენება
  function receipt(list) {
    const e = list[0], c = el('div', null, 'e' + (e.void ? ' void' : '')), head = el('div', null, 'row');
    head.append(el('strong', e.date.slice(8) + '.' + e.date.slice(5, 7) + ' ' + e.time), el('strong', r2(list.reduce((n, x) => n + x.liters, 0)) + ' ლ'));
    const late = e.saved && Math.abs(Date.parse(e.saved.replace(' ', 'T')) - Date.parse(e.date + 'T' + e.time)) > 6e5;
    c.append(head, el('small', ['ბარათი ' + e.num + ' · ' + e.holder, 'შეიყვანა ' + e.by, late && 'შეყვანის დრო ' + e.saved.slice(5)].filter(Boolean).join(' · ')));
    for (const x of list) c.append(el('div', [x.label, x.liters + ' ლ ' + x.fuel, x.odo !== '' && 'ოდომ. ' + x.odo, me.admin && SITE[siteOf(x)]].filter(Boolean).join(' · ')));
    if (e.warns) c.append(el('small', '⚠ ' + e.warns + ' მიზეზი: ' + e.reason, 'bad'));
    const foot = el('div', null, 'row');
    foot.append(el('small', e.pending ? '⏳ გასაგზავნია' : '✓ გაგზავნილია'));
    if (/^https:\/\//.test(e.photo || '') && me.admin) { const a = el('a', 'ქვითრის ფოტო'); a.href = e.photo; a.target = '_blank'; a.rel = 'noopener'; foot.append(a); }
    if (!e.void && (me.admin || e.by === me.name)) foot.append(button(voidId === e.rid ? 'დაადასტურეთ' : 'გაუქმება', async () => { if (voidId !== e.rid) { voidId = e.rid; render(); return; } voidId = null; if (await enqueue('receiptVoid', { id: e.rid })) say('ქვითარი გაუქმდა'); }));
    c.append(foot); return c;
  }
  const byReceipt = list => { const m = new Map(); for (const e of list) { if (!m.has(e.rid)) m.set(e.rid, []); m.get(e.rid).push(e); } return [...m.values()].sort((a, b) => (b[0].date + b[0].time).localeCompare(a[0].date + a[0].time)); };

  function report() {
    const mode = $('rmode').value, date = $('rdate').value, site = $('rsite').value, fuel = $('rfuel').value, all = entries(), ks = cards();
    const person = $('rperson').value, people = [...new Set([...ks.map(k => k.holder), ...all.map(e => e.by)])].filter(Boolean).sort();
    $('rperson').replaceChildren(new Option('ყველა', ''), ...people.map(p => new Option(p, p))); $('rperson').value = people.includes(person) ? person : '';
    const p = $('rperson').value;
    const list = all.filter(e => (mode === 'day' ? e.date === date : e.date.slice(0, 7) === date.slice(0, 7)) && (!site || (siteOf(e) || '-') === site) && (!fuel || e.fuel === fuel) && (!p || e.by === p || e.holder === p));
    const sum = (a, f) => r2(a.filter(e => !e.void && (!f || e.fuel === f)).reduce((n, e) => n + e.liters, 0));
    $('rtotal').replaceChildren(el('small', mode === 'day' ? 'სულ ამ დღეს' : 'სულ ამ თვეში'), el('b', sum(list) + ' ლ'), el('small', FUELS.map(f => f + ' ' + sum(list, f)).join(' · ')));
    const ids = [...new Set([...ks.filter(k => k.active).map(k => k.id), ...list.map(e => e.card)])];
    const filtered = site || fuel || p;
    $('rlist').replaceChildren(...ids.map(id => {
      const mine = list.filter(e => e.card === id), k = ks.find(x => x.id === id) || { num: (mine[0] || {}).num, holder: (mine[0] || {}).holder };
      if (!mine.length && filtered) return null;
      const d = el('details', null, 'e'), s = el('summary');
      s.textContent = k.num + ' · ' + k.holder + ' — ' + sum(mine) + ' ლ';
      const body = el('div'); body.append(...(mine.length ? byReceipt(mine).map(receipt) : [el('div', 'ჩანაწერი არ არის.', 'mut')]));
      d.append(s, body); d.open = opened.has(id); d.ontoggle = () => d.open ? opened.add(id) : opened.delete(id);
      return d;
    }).filter(Boolean));
  }

  // ---- ბარათების მართვა (ადმინი)
  function manageList() {
    $('mlist').replaceChildren(...cards().map(k => {
      const b = button(null, () => openEdit(k), 'item');
      b.append(el('b', k.num + ' · ' + k.holder), el('small', (k.cars.map(id => (cars().find(c => c.id === id) || {}).p).filter(Boolean).join(', ') || 'ტექნიკა არ არის მიბმული') + (k.active ? '' : ' · გამორთული')));
      return b;
    }));
  }
  function openEdit(k) {
    edit = k ? { ...k, cars: [...k.cars], sites: {} } : { id: 'c-' + nid(), num: '', holder: '', extra: '', cars: [], active: true, sites: {} };
    $('mnum').value = edit.num; $('mholder').value = edit.holder; $('mextra').value = edit.extra; $('mactive').checked = edit.active; $('mq').value = '';
    $('ulist').replaceChildren(...((data && data.users) || []).map(u => new Option(u)));
    $('medit').hidden = false; editCars(); userCheck(); $('medit').scrollIntoView();
  }
  function userCheck() {
    const known = (data && data.users) || [], names = [$('mholder').value, ...$('mextra').value.split(',')].map(s => s.trim()).filter(s => s && !known.includes(s));
    $('muser').hidden = !names.length;
    $('muser').textContent = 'შესასვლელად დაამატეთ „მომხმარებლები“ ფურცელში (PIN, როლი „ბარათი“): ' + names.join(', ');
  }
  function editCars() {
    const all = cars(), q = $('mq').value.trim();
    $('mcars').replaceChildren(...edit.cars.map(id => {
      const c = all.find(x => x.id === id), box = el('div', null, 'line'), head = el('div', null, 'row');
      head.append(el('strong', carName(c)), button('✕', () => { edit.cars = edit.cars.filter(x => x !== id); editCars(); }));
      box.append(head);
      if (c) box.append(labelled('ობიექტი', select(Object.entries(SITE), id in edit.sites ? edit.sites[id] : c.site || '', v => { edit.sites[id] = v; })));
      return box;
    }));
    const found = q ? all.filter(c => !edit.cars.includes(c.id) && match(c, q)).slice(0, 20) : [];
    $('mfound').replaceChildren(...found.map(c => carButton(c, () => { edit.cars.push(c.id); $('mq').value = ''; editCars(); })));
  }
  async function saveCard() {
    const num_ = $('mnum').value.trim(), holder = $('mholder').value.trim();
    if (!num_ || !holder) return say('ჩაწერეთ ბარათის ნომერი და მფლობელი.');
    if (cards().some(k => k.id !== edit.id && k.num === num_)) return say('ეს ბარათის ნომერი უკვე არის.');
    for (const [id, site] of Object.entries(edit.sites)) { const c = cars().find(x => x.id === id); if (c && edit.cars.includes(id) && (c.site || '') !== site) await enqueue('carEdit', { id, site, fuel: c.fuel || FUELS[0], odo: !!c.odo }); }
    if (await enqueue('card', { id: edit.id, num: num_, holder, extra: $('mextra').value.trim(), cars: edit.cars, active: $('mactive').checked })) { $('medit').hidden = true; edit = null; manageList(); say('ბარათი შენახულია'); }
  }
  function vehicles() {
    const q = $('vq').value.trim(), f = $('vfilter').value, linked = new Set(cards().flatMap(k => k.cars));
    const list = cars().filter(c => q ? match(c, q) : f === 'card' ? linked.has(c.id) : f === 'none' ? !c.site : true).slice(0, 40);
    $('vlist').replaceChildren(...list.map(c => {
      const box = el('div', null, 'line'), two = el('div', null, 'two'), now = { id: c.id, site: c.site || '', fuel: c.fuel || FUELS[0], odo: !!c.odo };
      const change = (k, v) => { now[k] = v; enqueue('carEdit', { ...now }); };
      two.append(labelled('ობიექტი', select(Object.entries(SITE), now.site, v => change('site', v))), labelled('საწვავი', select(FUELS.map(x => [x, x]), now.fuel, v => change('fuel', v))));
      const check_ = el('input'); check_.type = 'checkbox'; check_.checked = now.odo; check_.onchange = () => change('odo', check_.checked);
      const l = el('label', null, 'check'); l.append(check_, ' ოდომეტრი სავალდებულოა');
      box.append(el('strong', carName(c)), two, l); return box;
    }));
    if (!list.length) $('vlist').append(el('div', 'ვერ მოიძებნა.', 'mut'));
  }

  function showTab(k) {
    tab = k;
    for (const a of ['fill', 'mine', 'report', 'manage', 'cars']) $('c-' + a).hidden = a !== k;
    for (const b of $('cnav').children) b.setAttribute('aria-selected', b.dataset.k === k);
    if (k === 'manage') manageList();
    if (k === 'cars') vehicles();
    render_();
  }
  // სინქრონიზაციის შემდეგ: შესავსები ველები ხელუხლებელი რჩება
  function render_() {
    if (!me || !data) return;
    header();
    if (tab === 'fill') {
      cardSelect();
      // თუ ბარათის მანქანები შეიცვალა (მაგ. სინქრონიზაციის შემდეგ), ფორმა თავიდან იხატება; აკრეფილი რჩება
      const key = own().map(c => c.id + c.odo + c.p).join();
      if (key !== drawn) { drawn = key; drawLines(); } else check();
    }
    if (tab === 'mine') monthView();
    if (tab === 'report') report();
    if (tab === 'manage' && !edit) manageList();
  }
  function open() {
    const tabs = me.admin ? [['report', 'ანგარიში'], ['manage', 'ბარათები'], ['cars', 'ტექნიკა'], ['fill', 'შევსება']] : [['fill', 'შევსება'], ['mine', 'ჩემი ცხრილი']];
    $('cnav').replaceChildren(...tabs.map(([k, n]) => { const b = button(n, () => showTab(k)); b.dataset.k = k; return b; }));
    edit = null; $('medit').hidden = true; opened.clear(); $('cdate').value = $('rdate').value = local().slice(0, 10); $('mmonth').value = local().slice(0, 7); drawn = null;
    cardSelect(); clear(); showTab(tabs[0][0]);
  }

  $('cc').onchange = () => { lines = []; drawn = null; render_(); };
  $('cmore').onclick = () => { lines.push(newLine()); drawLines(); };
  $('cnp').oninput = suggest;
  $('cdate').onchange = check; $('mmonth').onchange = monthView;
  $('csave').onclick = save;
  $('caddcar').onclick = addCar;
  for (const i of ['rmode', 'rdate', 'rsite', 'rfuel', 'rperson']) $(i).onchange = report;
  $('mnew').onclick = () => openEdit(null);
  $('mq').oninput = editCars;
  $('mholder').oninput = $('mextra').oninput = userCheck;
  $('msave').onclick = saveCard;
  $('mcancel').onclick = () => { edit = null; $('medit').hidden = true; manageList(); };
  $('vq').oninput = vehicles; $('vfilter').onchange = vehicles;
  return { open, render: render_ };
})();

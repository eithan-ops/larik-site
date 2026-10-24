/* commentator.js — the football-style announcer that runs only on the host's phone.
   Lines are stitched from short recorded fragments (voice/<lang>/<id>.mp3): a colour phrase ("Pink takes"),
   a country ("Brazil!") and a tail ("What a move!"). Players are named by their colour so every fragment can be
   recorded once. If a fragment is missing the whole line falls back to the browser voice. */
window.Commentator = (function () {
  'use strict';
  const COLOR_KEY = { '#38f0c8': 'tq', '#ff5aa7': 'pk', '#ffb020': 'or', '#8a7bff': 'pu', '#4ddbff': 'sk', '#8dff57': 'gr' };
  const COLOR_WORD = { he: { tq: 'הטורקיז', pk: 'הוורוד', or: 'הכתום', pu: 'הסגול', sk: 'התכלת', gr: 'הירוק' }, en: { tq: 'Turquoise', pk: 'Pink', or: 'Orange', pu: 'Purple', sk: 'Sky Blue', gr: 'Green' } };
  // Spoken fallback text per fragment id (browser voice), generated from the same manifest the recordings used
  const T = {
    he: { t_bang: '!', t_move: 'איזה מהלך!', t_giant: 'מדינה ענקית!', t_def: 'ההתקפה נהדפה!', t_atk: 'איזה לחץ!', g_start1: 'המשחק מתחיל! מי יכבוש את העולם?', g_start2: 'יוצאים לדרך! כל העולם פתוח!', g_golden: 'דקת הזהב! כל מדינה שווה כפול! עכשיו או לעולם לא!', g_ten: 'עשר שניות לסיום!', g_five: 'חמש… ארבע… שלוש… שתיים… אחת!', g_tense: 'איזה מתח! זה צמוד!',
      claim1: '{c} כובש את', claim2: '{c} לוקח את', claim3: 'ו{c} מרחיב את האימפריה!', big: 'וואו! {c} כובש את', steal: 'דרמה! {c} גונב את', from: 'מ{c}!', attack: '{c} תוקף את', defend: '{c} מחזיק את', streak: '{c} ברצף! אי אפשר לעצור אותו!', lead: '{c} עולה להובלה!', win: 'זהו! נגמר! {c} שולט בעולם!' },
    en: { t_bang: '!', t_move: 'What a move!', t_giant: 'A giant!', t_def: 'Attack repelled!', t_atk: 'What pressure!', g_start1: 'The game is on! Who will conquer the world?', g_start2: 'And we are off! The whole planet is up for grabs!', g_golden: 'Golden minute! Every country counts double! Now or never!', g_ten: 'Ten seconds left!', g_five: 'Five… four… three… two… one!', g_tense: 'So tense! Neck and neck!',
      claim1: '{c} takes', claim2: '{c} conquers', claim3: 'And {c} expands the empire!', big: 'Wow! {c} takes', steal: 'Drama! {c} steals', from: 'from {c}!', attack: '{c} is attacking', defend: '{c} holds', streak: '{c} is on fire! Unstoppable!', lead: '{c} takes the lead!', win: "That's it! {c} rules the world!" }
  };
  const VOICE_V = '1792833268'; // bump when the recordings change (Krümel King set)
  let lang = 'he', enabled = false, queue = [], playing = false, onDuck = null, base = 'voice/', ac = null;
  const bufCache = new Map(); let recordedOk = null; // null = unknown, false = no recordings on the server
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const ck = (p) => COLOR_KEY[(p && p.color) || ''] || null;
  const cword = (k) => (COLOR_WORD[lang] || COLOR_WORD.he)[k] || '';
  const nameOfCountry = (c) => lang === 'he' ? c.he : c.en;

  function init(opts) { lang = opts.lang || 'he'; onDuck = opts.onDuck || null; if (opts.base) base = opts.base; }
  function setEnabled(on) { enabled = !!on; if (!on) { queue = []; try { speechSynthesis.cancel(); } catch (e) { } } }
  function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } } if (ac && ac.state === 'suspended') ac.resume(); return ac; }

  // A line is a list of fragments: {id, text}. id is the recording; text is the browser-voice fallback.
  function frag(id, text) { return { id, text }; }
  function colorFrag(kind, k) { return frag(`c_${k}_${kind}`, (T[lang][kind] || '').replace('{c}', cword(k))); }
  function countryFrag(c) { return frag(`k_${c.a2}`, nameOfCountry(c) + '!'); }
  function plain(id) { return frag(id, T[lang][id] || ''); }

  function line(kind, v) {
    const k = ck(v.p), vk = ck(v.v); const c = v.c;
    switch (kind) {
      case 'start': return [plain(pick(['g_start1', 'g_start2']))];
      case 'claim': if (!k || !c) return null; return v.big ? [colorFrag('big', k), countryFrag(c), plain('t_giant')] : [colorFrag(pick(['claim1', 'claim2']), k), countryFrag(c), plain(pick(['t_bang', 't_move']))];
      case 'steal': if (!k || !c) return null; return vk ? [colorFrag('steal', k), countryFrag(c), colorFrag('from', vk)] : [colorFrag('steal', k), countryFrag(c)];
      case 'attack': if (!k || !c) return null; return [colorFrag('attack', k), countryFrag(c), plain('t_atk')];
      case 'defend': if (!vk || !c) return null; return [colorFrag('defend', vk), countryFrag(c), plain('t_def')];
      case 'streak': return k ? [colorFrag('streak', k)] : null;
      case 'lead': return k ? [colorFrag('lead', k)] : null;
      case 'end': return k ? [colorFrag('win', k)] : null;
      case 'golden': return [plain('g_golden')];
      case 'ten': return [plain('g_ten')];
      case 'five': return [plain('g_five')];
      case 'close': return [plain('g_tense')];
    }
    return null;
  }
  // v: { p: player (has .color), v: victim player, c: country {a2,he,en}, big }
  function say(kind, v, priority) {
    if (!enabled) return; const frags = line(kind, v || {}); if (!frags) return;
    if (priority === 'high') queue.unshift(frags); else if (queue.length < 2) queue.push(frags);
    pump();
  }
  async function pump() {
    if (playing || !queue.length) return; playing = true; const frags = queue.shift();
    try { if (onDuck) onDuck(true); await speakFrags(frags); } catch (e) { } finally { if (onDuck) onDuck(false); playing = false; if (queue.length) setTimeout(pump, 120); }
  }
  async function loadBuf(id) {
    const key = lang + '/' + id; if (bufCache.has(key)) return bufCache.get(key);
    const p = (async () => { try { const r = await fetch(base + lang + '/' + id + '.mp3?v=' + VOICE_V, { cache: 'force-cache' }); if (!r.ok) return null; const ab = await r.arrayBuffer(); const a = audio(); if (!a) return null; return await a.decodeAudioData(ab); } catch (e) { return null; } })();
    bufCache.set(key, p); const b = await p; if (!b) bufCache.delete(key); return b;
  }
  async function speakFrags(frags) {
    if (recordedOk !== false) {
      const bufs = await Promise.all(frags.map(f => loadBuf(f.id)));
      if (bufs.every(Boolean)) { await playBufs(bufs); return; }
      if (bufs.every(b => !b) && recordedOk === null) { // nothing at all → recordings not deployed; stop probing
        const probe = await loadBuf('g_ten'); if (!probe) recordedOk = false;
      }
    }
    await speakBrowser(frags.map(f => f.text).join(' '));
  }
  function playBufs(bufs) {
    return new Promise((resolve) => {
      const a = audio(); if (!a) return resolve(); let t = a.currentTime + 0.03; let last = null;
      for (const b of bufs) { const s = a.createBufferSource(); s.buffer = b; const g = a.createGain(); g.gain.value = 1; s.connect(g); g.connect(a.destination); s.start(t); t += Math.max(0.05, b.duration - 0.04); last = s; }
      if (last) last.onended = () => resolve(); setTimeout(resolve, (t - a.currentTime) * 1000 + 300);
    });
  }
  function speakBrowser(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !text.trim()) return resolve();
      try {
        const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'he' ? 'he-IL' : 'en-US'; u.rate = 1.12; u.pitch = 1.15; u.volume = 1;
        const voices = speechSynthesis.getVoices(); const v = voices.find(x => x.lang && x.lang.toLowerCase().startsWith(lang === 'he' ? 'he' : 'en')); if (v) u.voice = v;
        u.onend = () => resolve(); u.onerror = () => resolve(); speechSynthesis.speak(u); setTimeout(resolve, 7000);
      } catch (e) { resolve(); }
    });
  }
  // Preload the generic and colour fragments so the first lines play instantly; countries load on first use.
  async function prewarm(colors) {
    if (!enabled) return; audio();
    const ids = ['g_start1', 'g_start2', 'g_golden', 'g_ten', 'g_five', 't_bang', 't_move', 't_giant', 't_def', 't_atk'];
    for (const col of colors || []) { const k = COLOR_KEY[col]; if (k) for (const kind of ['claim1', 'claim2', 'big', 'steal', 'from', 'attack', 'defend', 'streak', 'lead', 'win']) ids.push(`c_${k}_${kind}`); }
    for (const id of ids) loadBuf(id);
  }
  function warmCountry(c) { if (enabled && c && recordedOk !== false) loadBuf('k_' + c.a2); }
  return { init, setEnabled, say, prewarm, warmCountry, get enabled() { return enabled; } };
})();

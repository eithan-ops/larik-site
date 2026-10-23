/* לכבוש את העולם — Conquer the World
   Globe trivia conquest. Solo (90s) + friends (3 min, phones only, real-time room).
   Everything in one file on purpose: it is a prototype meant to be read and reshaped. */
(function () {
  'use strict';

  /* ======================= i18n ======================= */
  const T = {
    he: {
      title: 'לכבוש את העולם', tagline: 'ענו נכון — המדינה שלכם. כבשו כמה שיותר מכדור הארץ.',
      namePh: 'השם שלך', solo: '⚡ סולו — 90 שניות', create: '👑 פתח חדר', join: '🔑 הצטרף', joinGo: 'הצטרף',
      mpNote: 'משחק עם חברים עובד כאן רק למי שקיבל הזמנה לעמוד הזה (לא דרך קישור ציבורי).',
      roomCode: 'קוד החדר', shareCode: 'כולם פותחים את אותו עמוד ומכניסים את הקוד', start: '🚀 התחל (3 דקות)',
      waitHost: 'מחכים שהמארח יתחיל…', leave: 'יציאה', countries: 'מדינות', points: 'נק׳', ofEarth: 'מכדור הארץ נכבש',
      bestStreak: 'רצף שיא', share: '📣 שתף', save: '⬇️ שמור פוסטר', again: 'שחק שוב', host: 'מארח', you: 'זה אני',
      hint: 'צבטו לזום · געו במדינה כדי לכבוש אותה', loading: 'טוען את כדור הארץ…', locked: 'נעול עוד {s} שנ׳',
      lvl: ['קלה', 'בינונית', 'קשה'], yours: 'כבר שלך', defended: 'מגן: {n}',
      conq: '{c} נכבשה על ידי {n}', took: '{n} לקח/ה ממך את {c}!', attacking: '⚔️ {n} בהתקפה על {c}!',
      repelled: '🛡️ ההגנה על {c} הצליחה! +{p}', youFailed: 'ההתקפה נכשלה — {c} נשארת אצל {n}', streak: '🔥 רצף {k}! +{p}',
      timeUp: 'הזמן נגמר!', copied: 'הטקסט הועתק — שלחו לחברים', noClip: 'לא ניתן להעתיק כאן', saved: 'הפוסטר נשמר',
      shareText: 'כבשתי {p} מכדור הארץ ({c} מדינות, {s} נק׳) ב"לכבוש את העולם" 🌍',
      shareTextMulti: 'סיימתי במקום {r} עם {p} מכדור הארץ ב"לכבוש את העולם" 🌍',
      winner: '🏆 {n} על ראש העולם', noRoom: 'חיבור לחדר לא זמין בעמוד הזה', joinFail: 'לא הצלחנו להיכנס לחדר', min2: 'צריך לפחות 2 שחקנים',
      youWin: 'ניצחת! 🏆', place: 'מקום {r}', wrong: 'טעות!', correct: 'נכון!', go: 'צא לדרך!', next: 'המשך ל{c} ←',
      posterTitle: 'לכבוש את העולם', posterOf: 'מכדור הארץ', posterStats: '{c} מדינות · {s} נק׳', soloLbl: 'סולו · 90 שניות', multiLbl: 'מקום {r} מתוך {n}',
      medals: { continent: 'כובש {r}', islands: '🏝️ מלך האיים', streak5: '🔥 רצף {n}', giant: '🗺️ ענק', fast: '⚡ בזק', defender: '🛡️ מגן', raider: '⚔️ שודד', world: '👑 שליט העולם', first: '🎖️ כיבוש ראשון' },
      regions: { Europe: 'אירופה', Asia: 'אסיה', Africa: 'אפריקה', Americas: 'אמריקה', Oceania: 'אוקיאניה' },
      mute: 'השתק', unmute: 'הפעל צליל', pick: 'סובבו את הגלובוס ובחרו מאיפה להתחיל', pickS: 'מתחילים בעוד {s}',
      pu5050: 'מחק 2 תשובות', puTime: '+10 שניות', puSwap: 'שאלה אחרת', puShield: 'מגן 30 שנ׳', shielded: '🛡️ {c} מוגנת ל-30 שנ׳', isShielded: 'מוגנת! עוד {s} שנ׳',
      golden: '⚡ דקת הזהב — כל מדינה ×2!', revenge: 'נקמה ⚔️', streakChip: '🔥 ×{k}',
      titles: ['כפר קטן', 'נסיכות', 'ממלכה', 'אימפריה', 'שליט העולם'], empireOf: 'ה{t} של {n}',
      board: '🏆 טבלת שיאים', world: 'עולם', country: 'מדינה', city: 'עיר', friends: 'חברים', today: 'היום', week: 'השבוע', all: 'כל הזמנים',
      yourCode: 'קוד החבר שלך', addFriend: 'הוסף חבר לפי קוד', add: 'הוסף', friendAdded: '{n} נוסף לחברים!', friendFail: 'קוד לא נמצא', noRows: 'עדיין אין תוצאות — תהיה הראשון!',
      inviteRoom: '📲 הזמן חברים', inviteText: 'בוא לשחק איתי "לכבוש את העולם"! קוד חדר: {code}', commentator: '🎙️ פרשן (רק אצלך)', commentatorOn: 'הפרשן פועל', commentatorOff: 'הפרשן כבוי',
      colorChanged: 'הצבע שלך היה תפוס — קיבלת צבע חדש', rankToday: 'מקום {r} בעולם היום', back: 'חזרה', me: 'אני', offline: 'אין חיבור לשרת — משחק סולו בלבד', you2: 'אתה',
    },
    en: {
      title: 'Conquer the World', tagline: 'Answer right — the country is yours. Take as much of Earth as you can.',
      namePh: 'Your name', solo: '⚡ Solo — 90 seconds', create: '👑 Open a room', join: '🔑 Join', joinGo: 'Join',
      mpNote: 'Playing with friends works here only for people invited to this page (not via a public link).',
      roomCode: 'Room code', shareCode: 'Everyone opens this same page and enters the code', start: '🚀 Start (3 minutes)',
      waitHost: 'Waiting for the host to start…', leave: 'Leave', countries: 'countries', points: 'pts', ofEarth: 'of Earth conquered',
      bestStreak: 'best streak', share: '📣 Share', save: '⬇️ Save poster', again: 'Play again', host: 'host', you: 'you',
      hint: 'Pinch to zoom · tap a country to conquer it', loading: 'Loading Earth…', locked: 'Locked {s}s',
      lvl: ['Easy', 'Medium', 'Hard'], yours: 'Already yours', defended: 'Defender: {n}',
      conq: '{n} conquered {c}', took: '{n} took {c} from you!', attacking: '⚔️ {n} is attacking {c}!',
      repelled: '🛡️ {c} held! +{p}', youFailed: 'Attack failed — {c} stays with {n}', streak: '🔥 Streak {k}! +{p}',
      timeUp: "Time's up!", copied: 'Copied — send it to your friends', noClip: 'Copy not available here', saved: 'Poster saved',
      shareText: 'I conquered {p} of Earth ({c} countries, {s} pts) in "Conquer the World" 🌍',
      shareTextMulti: 'I finished #{r} with {p} of Earth in "Conquer the World" 🌍',
      winner: '🏆 {n} rules the world', noRoom: 'Room connection is not available on this page', joinFail: 'Could not join that room', min2: 'Need at least 2 players',
      youWin: 'You win! 🏆', place: 'Place {r}', wrong: 'Wrong!', correct: 'Correct!', go: 'GO!', next: 'Next: {c} →',
      posterTitle: 'Conquer the World', posterOf: 'of Earth', posterStats: '{c} countries · {s} pts', soloLbl: 'Solo · 90 seconds', multiLbl: 'Place {r} of {n}',
      medals: { continent: 'Conqueror of {r}', islands: '🏝️ Island King', streak5: '🔥 Streak {n}', giant: '🗺️ Giant', fast: '⚡ Lightning', defender: '🛡️ Defender', raider: '⚔️ Raider', world: '👑 World Ruler', first: '🎖️ First conquest' },
      regions: { Europe: 'Europe', Asia: 'Asia', Africa: 'Africa', Americas: 'the Americas', Oceania: 'Oceania' },
      mute: 'Mute', unmute: 'Sound on', pick: 'Spin the globe and choose where to start', pickS: 'Starting in {s}',
      pu5050: 'Remove 2 answers', puTime: '+10 seconds', puSwap: 'Swap question', puShield: '30s shield', shielded: '🛡️ {c} is shielded for 30s', isShielded: 'Shielded! {s}s left',
      golden: '⚡ Golden minute — every country ×2!', revenge: 'Revenge ⚔️', streakChip: '🔥 ×{k}',
      titles: ['Tiny Village', 'Principality', 'Kingdom', 'Empire', 'Ruler of the World'], empireOf: "{n}'s {t}",
      board: '🏆 Leaderboard', world: 'World', country: 'Country', city: 'City', friends: 'Friends', today: 'Today', week: 'This week', all: 'All time',
      yourCode: 'Your friend code', addFriend: 'Add a friend by code', add: 'Add', friendAdded: '{n} added!', friendFail: 'Code not found', noRows: 'No scores yet — be the first!',
      inviteRoom: '📲 Invite friends', inviteText: 'Come play "Conquer the World" with me! Room code: {code}', commentator: '🎙️ Commentator (host only)', commentatorOn: 'Commentator on', commentatorOff: 'Commentator off',
      colorChanged: 'Your colour was taken — here is a new one', rankToday: '#{r} in the world today', back: 'Back', me: 'me', offline: 'No server connection — solo only', you2: 'you',
    }
  };
  // Short display names for the globe badges (full names stay on the question card)
  const SHORT = {
    he: { CF: 'מרכז אפריקה', CD: 'קונגו-קינשאסה', CG: 'קונגו-ברזאויל', BA: 'בוסניה', AE: 'האמירויות', US: 'ארה"ב', GB: 'בריטניה', KR: 'דרום קוריאה', KP: 'צפון קוריאה', DO: 'דומיניקנה', SA: 'סעודיה', MK: 'מקדוניה', ZA: 'דרום אפריקה', SS: 'דרום סודאן', KN: 'סנט קיטס', VC: 'סנט וינסנט', AG: 'אנטיגואה', TT: 'טרינידד', ST: 'סאו טומה', PG: 'פפואה', SB: 'איי שלמה', MH: 'איי מרשל', GQ: 'גינאה המשוונית', LK: 'סרי לנקה', NZ: 'ניו זילנד', PS: 'פלסטין' },
    en: { CF: 'C. African Rep.', CD: 'DR Congo', CG: 'Congo', BA: 'Bosnia', AE: 'UAE', US: 'USA', GB: 'UK', KR: 'S. Korea', KP: 'N. Korea', DO: 'Dominican Rep.', SA: 'Saudi Arabia', MK: 'N. Macedonia', KN: 'St Kitts', VC: 'St Vincent', AG: 'Antigua', TT: 'Trinidad', ST: 'São Tomé', PG: 'Papua N.G.', GQ: 'Eq. Guinea' }
  };
  const DATA_V = '1792786897';
  let lang = 'he';
  // language: ?l= in the link (LARIK passes its own) → this game's saved choice → LARIK's saved choice (same origin) → browser → Israel time zone
  (function () {
    const he = (x) => x === 'he' ? 'he' : null, en = (x) => x && x !== 'he' ? 'en' : null;
    const url = new URLSearchParams(location.search).get('l'); let saved = null, larik = null;
    try { saved = localStorage.getItem('cw.lang'); larik = localStorage.getItem('larik-lang'); } catch (e) { }
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    lang = he(url) || en(url) || he(saved) || en(saved) || he(larik) || en(larik) || ((navigator.language || '').toLowerCase().startsWith('he') || tz === 'Asia/Jerusalem' ? 'he' : 'en');
  })();
  const t = (k, vars) => { let s = (T[lang][k] != null ? T[lang][k] : T.he[k]) || k; if (typeof s !== 'string') return s; if (vars) for (const v in vars) s = s.split('{' + v + '}').join(vars[v]); return s; };
  const tm = (k, vars) => { let s = T[lang].medals[k] || k; if (vars) for (const v in vars) s = s.split('{' + v + '}').join(vars[v]); return s; };

  /* ======================= constants ======================= */
  const COLORS = ['#38f0c8', '#ff5aa7', '#ffb020', '#8a7bff', '#4ddbff', '#8dff57'];
  const VAL = { 1: 10, 2: 20, 3: 30, 4: 40 };
  const BASE_LEVEL = { 1: 1, 2: 2, 3: 2, 4: 3 };
  const DEBUG = (location.hash || '') === '#debug';
  const Q_TIME = DEBUG ? 60 : 12;
  const SOLO_TIME = 90, MULTI_TIME = 180, COUNTDOWN = 3, PICK_S = 8;
  const LOCK_MS = 10000, ATTACK_LOCK_MS = 15000, SHIELD_MS = 30000, GOLDEN_S = 15;

  /* ======================= DOM ======================= */
  const $ = (id) => document.getElementById(id);
  const el = {
    app: $('app'), home: $('home'), lobby: $('lobby'), end: $('end'), hud: $('hud'), hint: $('hint'), sheet: $('sheet'), card: $('card'),
    name: $('name'), colors: $('colors'), soloBtn: $('soloBtn'), createBtn: $('createBtn'), joinBtn: $('joinBtn'),
    joinRow: $('joinRow'), codeIn: $('codeIn'), joinGo: $('joinGo'), mpNote: $('mpNote'), codeBig: $('codeBig'), players: $('players'),
    startBtn: $('startBtn'), waitHost: $('waitHost'), leaveBtn: $('leaveBtn'), time: $('time'), cnt: $('cnt'), score: $('score'), ticker: $('ticker'),
    alert: $('alert'), closeQ: $('closeQ'), flagwrap: $('flagwrap'), prog: $('prog'), qflag: $('qflag'), qname: $('qname'), qpts: $('qpts'),
    qlevel: $('qlevel'), qshield: $('qshield'), qtext: $('qtext'), opts: $('opts'), pct: $('pct'), eCnt: $('eCnt'), eScore: $('eScore'), eStreak: $('eStreak'),
    passport: $('passport'), ranking: $('ranking'), shareBtn: $('shareBtn'), saveBtn: $('saveBtn'), againBtn: $('againBtn'), empire: $('empire'), vignette: $('vignette'),
    langBtn: $('langBtn'), pctLbl: $('pctLbl'), tbar: $('tbar'), pickHint: $('pickHint'), pickSec: $('pickSec'), qexpl: $('qexpl'), nextBtn: $('nextBtn'), count: $('count'), countNum: $('countNum'),
    muteBtn: $('muteBtn'), livebar: $('livebar'), boardBtn: $('boardBtn'), board: $('board'), boardTabs: $('boardTabs'), boardPeriods: $('boardPeriods'), boardList: $('boardList'), boardBack: $('boardBack'), myCode: $('myCode'), friendIn: $('friendIn'), friendAdd: $('friendAdd'), friendsBox: $('friendsBox'), inviteBtn: $('inviteBtn'), commBtn: $('commBtn'), rankLine: $('rankLine'), netNote: $('netNote'), pus: $('pus'), puFifty: $('puFifty'), puTime: $('puTime'), puSwap: $('puSwap'), puShield: $('puShield'), streakChip: $('streakChip'), reacts: $('reacts'), empireTitle: $('empireTitle'), medals: $('medals'), posterImg: $('posterImg'), fx: $('fx'), stars: $('stars'), globe: $('globe'),
  };

  /* ======================= state ======================= */
  const S = {
    mode: null,            // 'solo' | 'multi'
    active: false, ended: false, ready: false,
    me: { pid: 'me', name: '', color: COLORS[0] },
    players: {},           // pid -> {name, color, host}
    owners: {},            // a2 -> {pid, ts}
    bonuses: {},           // pid -> points
    locked: {},            // a2 -> unlockAt (ms)
    hot: new Set(),        // suggested next targets
    streak: 0, best: 0, defends: 0, steals: 0,
    used: new Set(),
    t0: 0, dur: SOLO_TIME, remaining: SOLO_TIME,
    selected: null, question: null,
    host: false, code: '', rank: 1, posterUrl: null,
    pu: { fifty: true, time: true, swap: true, shield: true }, shields: {}, golden: false,
  };
  let C = [], byA2 = {}, FEATS = [], QB = {}; // data
  let globe = null, pov = { lat: 31.5, lng: 35, altitude: 2.3 };
  let TOTAL_AREA = 1;
  let muted = false; try { muted = localStorage.getItem('cw.muted') === '1'; } catch (e) { }

  /* ======================= sound (synthesized) ======================= */
  let AC = null, master = null;
  function audio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = muted ? 0 : 1; master.connect(AC.destination); } catch (e) { AC = null; } }
    if (AC && AC.state === 'suspended') AC.resume(); return AC;
  }
  function tone(f, dur, type, vol, when, slide) {
    const ac = audio(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(); const t0 = ac.currentTime + (when || 0);
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, when) {
    const ac = audio(); if (!ac) return; const n = Math.floor(ac.sampleRate * dur); const b = ac.createBuffer(1, n, ac.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = b; const g = ac.createGain(); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    g.gain.value = vol || 0.15; src.connect(f); f.connect(g); g.connect(master); src.start(ac.currentTime + (when || 0));
  }
  const SFX = {
    tap() { tone(520, 0.06, 'triangle', 0.08); },
    open() { tone(330, 0.12, 'sine', 0.1, 0, 660); },
    correct() { tone(660, 0.12, 'triangle', 0.18); tone(880, 0.16, 'triangle', 0.18, 0.1); tone(1320, 0.28, 'sine', 0.14, 0.2); },
    wrong() { tone(180, 0.28, 'sawtooth', 0.12, 0, 90); noise(0.15, 0.06); },
    conquest() { noise(0.5, 0.12); tone(392, 0.5, 'triangle', 0.14, 0.05); tone(523, 0.5, 'triangle', 0.14, 0.1); tone(784, 0.7, 'sine', 0.16, 0.18); },
    tick() { tone(1200, 0.05, 'square', 0.05); },
    count() { tone(660, 0.12, 'square', 0.08); },
    go() { tone(660, 0.1, 'square', 0.1); tone(990, 0.35, 'square', 0.1, 0.1); noise(0.4, 0.08); },
    alarm() { tone(880, 0.12, 'square', 0.1); tone(660, 0.12, 'square', 0.1, 0.14); tone(880, 0.12, 'square', 0.1, 0.28); },
    shield() { tone(440, 0.15, 'triangle', 0.12); tone(660, 0.3, 'sine', 0.14, 0.12); },
    end() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.14, i * 0.13)); noise(0.8, 0.08, 0.4); },
    whoosh() { noise(0.35, 0.05); tone(200, 0.35, 'sine', 0.05, 0, 900); },
  };
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* no haptics */ } };

  // Ambient music: a quiet arpeggio over Am–F–C–G, scheduled a bar ahead. Speeds up when time runs out.
  const music = {
    on: false, urgent: false, timer: null, bar: 0,
    chords: [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8 * 2, 164.8 * 2, 196 * 2], [196, 246.9, 293.7]],
    start() { if (this.on) return; this.on = true; this.bar = 0; this.schedule(); },
    stop() { this.on = false; clearTimeout(this.timer); this.urgent = false; },
    schedule() {
      if (!this.on) return; const ac = audio(); if (!ac) { this.timer = setTimeout(() => this.schedule(), 1000); return; }
      const beat = this.urgent ? 0.22 : 0.42; const chord = this.chords[this.bar % 4]; const base = ac.currentTime + 0.05;
      for (let i = 0; i < 8; i++) { const n = chord[i % 3] * (i >= 4 ? 2 : 1) * (this.urgent ? 2 : 1); tone(n, beat * 0.9, 'sine', 0.035, i * beat); } tone(chord[0] / 2, beat * 7.5, 'triangle', 0.03, 0);
      if (this.urgent && this.bar % 2 === 0) tone(1760, 0.05, 'square', 0.02, 0);
      this.bar++; this.timer = setTimeout(() => this.schedule(), beat * 8 * 1000 - 60);
    },
    setUrgent(u) { if (u !== this.urgent) { this.urgent = u; clearTimeout(this.timer); if (this.on) this.schedule(); } },
  };
  function setMuted(m) { muted = m; try { localStorage.setItem('cw.muted', m ? '1' : '0'); } catch (e) { } if (master) master.gain.value = m ? 0 : 1; el.muteBtn.textContent = m ? '🔇' : '🔊'; el.muteBtn.setAttribute('aria-label', t(m ? 'unmute' : 'mute')); }

  /* ======================= helpers ======================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = Math.PI / 180;
  function angDist(lat1, lng1, lat2, lng2) {
    const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2;
    return 2 * Math.asin(Math.sqrt(a)) / rad;
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  const nameOf = (c) => lang === 'he' ? c.he : c.en;
  const shortOf = (c) => (SHORT[lang] && SHORT[lang][c.a2]) || nameOf(c);
  const initial = (p) => { const s = (p && p.name ? String(p.name).trim() : ''); return s ? [...s][0].toUpperCase() : '?'; };
  const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const now = () => Date.now();
  function toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; el.app.appendChild(d); setTimeout(() => d.remove(), 2500); }
  function ticker(msg) { const d = document.createElement('div'); d.textContent = msg; el.ticker.replaceChildren(d); }
  function floatText(txt, cls) { const d = document.createElement('div'); d.className = 'float ' + (cls || ''); d.textContent = txt; el.app.appendChild(d); setTimeout(() => d.remove(), 1300); }
  function alertBanner(msg, good, onTap, tapLabel) { const d = document.createElement('div'); if (good) d.className = 'good'; d.textContent = msg; if (onTap) { const b = document.createElement('button'); b.type = 'button'; b.className = 'revenge'; b.textContent = tapLabel; b.addEventListener('click', (e) => { e.stopPropagation(); d.remove(); onTap(); }); d.append(b); d.classList.add('tap'); } el.alert.replaceChildren(d); setTimeout(() => { if (d.parentNode) d.remove(); }, onTap ? 5000 : 3000); }
  function flyAlt(area) { return area > 5e6 ? 1.2 : area > 1e6 ? 0.75 : area > 3e5 ? 0.5 : area > 5e4 ? 0.36 : 0.28; }
  function playerOf(pid) { return S.players[pid] || (pid === S.me.pid ? S.me : { name: '?', color: '#999' }); }
  function ownerOf(a2) { const o = S.owners[a2]; return o ? o.pid : null; }
  function scoreOf(pid) { let s = S.bonuses[pid] || 0; for (const a2 in S.owners) if (S.owners[a2].pid === pid) s += VAL[byA2[a2].tier]; return s; }
  function countOf(pid) { let n = 0; for (const a2 in S.owners) if (S.owners[a2].pid === pid) n++; return n; }
  function areaOf(pid) { let n = 0; for (const a2 in S.owners) if (S.owners[a2].pid === pid) n += byA2[a2].area; return n; }
  function pctOf(pid) { return (areaOf(pid) / TOTAL_AREA * 100); }
  const fmtPct = (p) => (p < 10 ? p.toFixed(1) : Math.round(p)) + '%';
  function levelFor(a2) { const c = byA2[a2]; const o = ownerOf(a2); return (o && o !== S.me.pid) ? Math.min(3, BASE_LEVEL[c.tier] + 1) : BASE_LEVEL[c.tier]; }
  function avatarEl(p, cls) { const s = document.createElement('span'); s.className = 'av ' + (cls || ''); s.textContent = initial(p); s.style.setProperty('--c', p.color); return s; }
  function homeCountry() {
    let cc = ''; try { const loc = JSON.parse(localStorage.getItem('cw.loc') || 'null'); cc = (loc && loc.cc) || ''; } catch (e) { }
    if (!cc && lang === 'he') cc = 'IL';
    if (!cc) { const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || ''); cc = tz === 'Asia/Jerusalem' ? 'IL' : ''; }
    const c = cc && byA2[cc]; return c ? { lat: c.lat, lng: c.lng } : { lat: 28, lng: 10 };
  }
  function screenShake() { el.app.classList.remove('shake-screen'); void el.app.offsetWidth; el.app.classList.add('shake-screen'); setTimeout(() => el.app.classList.remove('shake-screen'), 420); }

  /* ======================= stars background ======================= */
  (function stars() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const x = c.getContext('2d');
    x.fillStyle = '#050a18'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) { const r = Math.random(); x.fillStyle = `rgba(${200 + Math.random() * 55},${210 + Math.random() * 45},255,${0.25 + Math.random() * 0.7})`; x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, r < 0.9 ? 0.7 : 1.4, 0, 7); x.fill(); }
    el.stars.style.backgroundImage = `radial-gradient(ellipse at 50% 120%, rgba(60,90,200,.25), transparent 60%), url(${c.toDataURL()})`;
    el.stars.style.backgroundSize = 'auto, 512px 512px';
  })();

  /* ======================= confetti ======================= */
  const fx = el.fx.getContext('2d'); let parts = []; let fxRun = false; let fxLast = 0;
  function sizeFx() { el.fx.width = el.app.clientWidth * (devicePixelRatio > 1 ? 1.5 : 1); el.fx.height = el.app.clientHeight * (devicePixelRatio > 1 ? 1.5 : 1); }
  function confetti(colors, n, x, y) {
    sizeFx(); const W = el.fx.width, H = el.fx.height; x = x == null ? W / 2 : x * W; y = y == null ? H * 0.42 : y * H;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 11; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, g: 0.35, r: 3 + Math.random() * 5, c: colors[i % colors.length], life: 70 + Math.random() * 40, rot: Math.random() * 6, vr: (Math.random() - .5) * .3 }); }
    fxLast = performance.now();
    if (!fxRun) { fxRun = true; requestAnimationFrame(fxLoop); }
  }
  function fxLoop() {
    fx.clearRect(0, 0, el.fx.width, el.fx.height);
    const nowT = performance.now(); const dt = clamp((nowT - fxLast) / 16.7, 0.5, 4); fxLast = nowT;
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= Math.pow(0.985, dt); p.life -= dt; p.rot += p.vr * dt; fx.save(); fx.translate(p.x, p.y); fx.rotate(p.rot); fx.globalAlpha = clamp(p.life / 30, 0, 1); fx.fillStyle = p.c; fx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); fx.restore(); }
    if (parts.length) requestAnimationFrame(fxLoop); else { fxRun = false; fx.clearRect(0, 0, el.fx.width, el.fx.height); }
  }

  /* ======================= data ======================= */
  async function loadData() {
    const [c, b, q] = await Promise.all(['data/countries.json', 'data/borders.json', 'data/questions.json'].map(u => u + '?v=' + DATA_V).map(u => fetch(u).then(r => r.json())));
    C = c; byA2 = {}; TOTAL_AREA = 0; for (const x of C) { byA2[x.a2] = x; TOTAL_AREA += x.area; }
    FEATS = b.features.filter(f => byA2[f.properties.a2]);
    QB = {};
    for (const raw of q) {
      let qq = raw;
      if (raw.country_code) { // real bank format (question-bank-v1)
        qq = { a2: raw.country_code, level: +raw.difficulty || 1, q: { he: raw.question_he, en: raw.question_en || raw.question_he },
          options: (raw.options_he || []).map((h, i) => ({ he: h, en: (raw.options_en || [])[i] || h })), answer: +raw.answer_index, expl: { he: raw.explanation_he || '', en: raw.explanation_en || '' }, cat: raw.category || '', hasEn: !!raw.question_en, bank: true };
      }
      if (!qq.a2 || !byA2[qq.a2] || !qq.options || qq.options.length < 2) continue;
      (QB[qq.a2] = QB[qq.a2] || []).push(qq);
    }
  }

  /* ======================= globe ======================= */
  let badgeCache = {}, badgeKey = '';
  function capColor(f) {
    const a2 = f.properties.a2, o = S.owners[a2];
    if (o) { const p = playerOf(o.pid); const mine = o.pid === S.me.pid; if (S.ended && !mine) return hexA(p.color, 0.22); return hexA(p.color, S.selected === a2 ? 0.98 : 0.8); }
    if (S.selected === a2) return 'rgba(150,180,255,1)';
    if (S.ended) return 'rgba(34,48,90,0.35)';
    if (S.hot.has(a2)) return 'rgba(96,120,200,0.98)';
    return 'rgba(34,48,90,0.92)';
  }
  function strokeColor(f) { const a2 = f.properties.a2; const o = S.owners[a2]; if (o) return hexA(playerOf(o.pid).color, S.ended && o.pid !== S.me.pid ? 0.25 : 0.95); if (S.selected === a2) return '#fff'; if (S.hot.has(a2)) return 'rgba(255,204,77,0.9)'; return 'rgba(150,180,255,0.5)'; }
  function sideColor(f) { const o = S.owners[f.properties.a2]; return o ? hexA(playerOf(o.pid).color, 0.35) : 'rgba(20,30,60,0.6)'; }
  let polyT = 0;
  function refreshPolygons() { if (polyT) return; polyT = requestAnimationFrame(() => { polyT = 0; globe.polygonCapColor(capColor).polygonStrokeColor(strokeColor).polygonSideColor(sideColor); }); }
  function refreshSelection() { refreshPolygons(); }

  function initGlobe() {
    globe = new Globe(el.globe, { rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } })
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor('#6a93ff').atmosphereAltitude(0.16)
      .globeCurvatureResolution(6)
      .polygonsData(FEATS)
      .polygonCapColor(capColor).polygonSideColor(sideColor).polygonStrokeColor(strokeColor)
      .polygonAltitude(0.004).polygonsTransitionDuration(0).polygonCapCurvatureResolution(5)
      .polygonLabel(() => '')
      .onPolygonClick((f) => select(f.properties.a2))
      .onGlobeClick(({ lat, lng }) => magnetic(lat, lng))
      .htmlElementsData([]).htmlLat(d => d.lat).htmlLng(d => d.lng).htmlAltitude(0.03)
      .htmlElement(d => badgeEl(d)).htmlElementVisibilityModifier((e, vis) => { e.style.opacity = vis ? '' : '0'; e.style.pointerEvents = vis ? '' : 'none'; })
      .ringsData([]).ringLat(d => d.lat).ringLng(d => d.lng).ringAltitude(0.012).ringColor(d => (x) => hexA(d.color, 1 - x)).ringMaxRadius(d => d.r).ringPropagationSpeed(d => d.speed).ringRepeatPeriod(1200)
      .onZoom(p => { pov = p; scheduleLOD(); });
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency || 4) <= 4 ? 1.5 : 2));
    const mat = globe.globeMaterial(); mat.color.set('#0b1733'); mat.emissive && mat.emissive.set('#06102a'); mat.shininess = 8; mat.specular && mat.specular.set('#102a5a');
    const ctl = globe.controls(); ctl.enablePan = false; ctl.minDistance = 118; ctl.maxDistance = 430; ctl.rotateSpeed = 0.55; ctl.zoomSpeed = 1.1; ctl.enableDamping = true; ctl.dampingFactor = 0.12; ctl.autoRotate = true; ctl.autoRotateSpeed = 0.6;
    globe.pointOfView({ lat: 25, lng: 30, altitude: 2.4 }, 0);
    sizeGlobe(); window.addEventListener('resize', sizeGlobe);
  }
  function sizeGlobe() { globe.width(el.app.clientWidth).height(el.app.clientHeight); sizeFx(); }

  /* ----- badges (LOD) ----- */
  function badgeEl(d) {
    let w = badgeCache[d.a2]; if (w) return w.parentNode;
    const c = byA2[d.a2]; const b = document.createElement('div'); b.className = 'badge'; w = document.createElement('div'); w.className = 'bw'; w.appendChild(b);
    const img = document.createElement('img'); img.src = 'flags/' + d.a2.toLowerCase() + '.svg'; img.alt = ''; img.loading = 'lazy';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = shortOf(c);
    const val = document.createElement('span'); val.className = 'val'; val.textContent = '+' + VAL[c.tier];
    const dot = document.createElement('span'); dot.className = 'dot';
    const own = document.createElement('span'); own.className = 'own'; own.hidden = true;
    b.append(img, nm, val, dot, own);
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    b.addEventListener('click', (e) => { e.stopPropagation(); select(d.a2); });
    badgeCache[d.a2] = b; styleBadge(d.a2); return w;
  }
  function styleBadge(a2) {
    const b = badgeCache[a2]; if (!b) return; const o = S.owners[a2]; const c = byA2[a2];
    b.classList.toggle('owned', !!o); b.classList.toggle('mine', !!o && o.pid === S.me.pid); b.classList.toggle('locked', (S.locked[a2] || 0) > now()); b.classList.toggle('shielded', (S.shields[a2] || 0) > now()); b.classList.toggle('target', S.selected === a2); b.classList.toggle('hot', S.hot.has(a2) && !o);
    const own = b.querySelector('.own'), val = b.querySelector('.val'), dot = b.querySelector('.dot');
    dot.className = 'dot l' + levelFor(a2); dot.hidden = !!o && o.pid === S.me.pid;
    if (o) { const p = playerOf(o.pid); b.style.setProperty('--c', p.color); own.hidden = false; own.textContent = initial(p); own.style.background = p.color; val.textContent = '+' + VAL[c.tier] * (S.golden ? 2 : 1) + (o.pid === S.me.pid ? '' : '⚔'); }
    else { own.hidden = true; val.textContent = '+' + VAL[c.tier] * (S.golden ? 2 : 1); b.style.removeProperty('--c'); }
  }
  function restyleAll() { for (const a2 in badgeCache) styleBadge(a2); }
  let lodT = null;
  function scheduleLOD() { if (lodT) return; lodT = setTimeout(() => { lodT = null; updateLOD(); }, 90); }
  function updateLOD() {
    if (!globe) return; const alt = pov.altitude;
    if (S.ended) { if (badgeKey !== '') { badgeKey = ''; globe.htmlElementsData([]); } return; }
    const minArea = alt > 1.7 ? 2e6 : alt > 1.1 ? 7e5 : alt > 0.7 ? 2.4e5 : alt > 0.4 ? 5e4 : alt > 0.26 ? 8e3 : 0;
    const maxDeg = clamp(28 + alt * 32, 20, 95);
    const list = [];
    for (const c of C) {
      const owned = !!S.owners[c.a2]; const hot = S.hot.has(c.a2);
      if (c.area < minArea && !(owned && alt < 1.3 && c.area > minArea / 6) && !(hot && alt < 1.3) && S.selected !== c.a2) continue;
      if (angDist(pov.lat, pov.lng, c.lat, c.lng) > maxDeg) continue;
      list.push(c);
    }
    list.sort((a, b) => (b.a2 === S.selected) - (a.a2 === S.selected) || S.hot.has(b.a2) - S.hot.has(a.a2) || (!!S.owners[b.a2]) - (!!S.owners[a.a2]) || b.area - a.area);
    const placed = [], cut = []; const W = el.app.clientWidth, H = el.app.clientHeight; const narrow = W < 480; const bw = (narrow ? 96 : 118) * clamp(1.06 - (alt - 0.9) * 0.3, 0.8, 1.28), bh = narrow ? 26 : 30;
    for (const c of list) {
      if (cut.length >= (alt < 0.4 ? 44 : 32)) break;
      const sc = globe.getScreenCoords(c.lat, c.lng, 0.03); if (!sc || sc.x < -60 || sc.y < -30 || sc.x > W + 60 || sc.y > H + 30) continue;
      let clash = false; for (const p of placed) { if (Math.abs(p.x - sc.x) < bw && Math.abs(p.y - sc.y) < bh) { clash = true; break; } }
      if (clash && c.a2 !== S.selected) continue;
      placed.push(sc); cut.push(c);
    }
    const key = cut.map(c => c.a2).join(',');
    const s = clamp(1.06 - (alt - 0.9) * 0.3, 0.8, 1.28);
    for (const a2 in badgeCache) badgeCache[a2].style.setProperty('--s', s);
    if (key !== badgeKey) { badgeKey = key; globe.htmlElementsData(cut); }
  }

  /* ----- tap handling ----- */
  function magnetic(lat, lng) {
    if (!S.active || !S.ready) return; let best = null, bd = 1e9;
    for (const c of C) { const d = angDist(lat, lng, c.lat, c.lng); if (d < bd) { bd = d; best = c; } }
    const th = 2.2 + pov.altitude * 4.5; if (best && bd < th) select(best.a2);
  }
  function select(a2) {
    if (!S.active || !S.ready || S.question) return; const c = byA2[a2]; if (!c) return; SFX.tap();
    const lockLeft = (S.locked[a2] || 0) - now();
    if (lockLeft > 0) { buzz(30); toast(t('locked', { s: Math.ceil(lockLeft / 1000) })); shakeBadge(a2); return; }
    const shLeft = (S.shields[a2] || 0) - now();
    if (shLeft > 0 && ownerOf(a2) !== S.me.pid) { buzz(30); toast(t('isShielded', { s: Math.ceil(shLeft / 1000) })); shakeBadge(a2); return; }
    const o = ownerOf(a2); if (o === S.me.pid) { toast(t('yours')); return; }
    S.selected = a2; refreshSelection(); styleBadge(a2); updateLOD();
    globe.controls().autoRotate = false; SFX.whoosh();
    const alt = Math.min(flyAlt(c.area), Math.max(pov.altitude, 0.2));
    globe.pointOfView({ lat: clamp(c.lat - 14 * alt, -85, 85), lng: c.lng, altitude: alt }, 750);
    setTimeout(() => openQuestion(a2), 420);
  }
  function shakeBadge(a2) { const b = badgeCache[a2]; if (b) { b.style.animation = 'none'; b.offsetHeight; b.style.animation = 'shake .4s'; setTimeout(() => b.style.animation = '', 450); } }
  // Suggested next targets: free, unlocked neighbours of the country just taken (largest first)
  function setHot(a2) {
    S.hot = new Set(); const c = byA2[a2];
    if (c) { const nb = (c.nb || []).map(x => byA2[x]).filter(x => x && !S.owners[x.a2] && !((S.locked[x.a2] || 0) > now())).sort((a, b) => b.area - a.area).slice(0, 3); nb.forEach(x => S.hot.add(x.a2)); }
    refreshSelection(); restyleAll(); updateLOD();
  }
  function bestNext() { for (const a2 of S.hot) if (!S.owners[a2]) return a2; return null; }

  /* ======================= questions ======================= */
  function pickQuestion(a2, level) {
    // Hebrew UI prefers the curated bank; English UI prefers questions that have an English text.
    const prefer = lang === 'he' ? (q => !!q.bank) : (q => q.bank ? q.hasEn : true);
    for (let pass = 0; pass < 2; pass++) for (let L = level; L >= 1; L--) {
      const pool = (QB[a2] || []).filter(q => q.level === L && !S.used.has(q) && (pass === 1 || prefer(q)));
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    const any = QB[a2] || []; if (!any.length) return null; return any[Math.floor(Math.random() * any.length)];
  }
  let qTimer = null, qStart = 0, qTicked = 0, pendingClose = null;
  function openQuestion(a2) {
    const c = byA2[a2]; const o = ownerOf(a2); const attack = o && o !== S.me.pid;
    const level = levelFor(a2);
    const q = pickQuestion(a2, level); if (!q) { S.selected = null; refreshSelection(); return; }
    S.used.add(q); S.question = { a2, q, attack, defender: o, level, answered: false };
    el.qflag.src = 'flags/' + a2.toLowerCase() + '.svg'; el.qname.textContent = nameOf(c); el.qpts.textContent = '+' + VAL[c.tier];
    el.qlevel.textContent = t('lvl')[q.level - 1]; el.qlevel.className = 'lvl l' + q.level;
    if (attack) { const p = playerOf(o); el.qshield.hidden = false; el.qshield.style.setProperty('--c', p.color); el.qshield.textContent = '🛡️ ' + t('defended', { n: p.name }); }
    else el.qshield.hidden = true;
    el.qtext.textContent = q.q[lang] || q.q.he; el.qexpl.hidden = true; el.nextBtn.hidden = true;
    el.opts.replaceChildren(...q.options.map((op, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.textContent = op[lang] || op.he; b.addEventListener('click', () => answer(i)); return b; }));
    el.flagwrap.classList.remove('hot'); el.prog.style.strokeDashoffset = '0';
    el.sheet.classList.add('open'); el.app.classList.add('asking'); SFX.open(); buzz(15);
    if (attack && S.mode === 'multi') { net.emit('attack', { a2, atk: S.me.pid, def: o, ts: now() }); Commentator.say('attack', { p: S.me, c, v: playerOf(o) }); }
    qExtra = 0; renderPowerups();
    qStart = now(); qTicked = 0; cancelAnimationFrame(qTimer); qTimer = requestAnimationFrame(qLoop);
  }
  let qExtra = 0;
  function renderPowerups() {
    const Q = S.question; const show = !!Q && !Q.answered;
    el.pus.hidden = !show; if (!show) return;
    el.puFifty.disabled = !S.pu.fifty; el.puTime.disabled = !S.pu.time; el.puFifty.title = t('pu5050'); el.puTime.title = t('puTime'); el.puSwap.title = t('puSwap'); el.puShield.title = t('puShield');
    el.puSwap.hidden = S.mode === 'multi'; el.puShield.hidden = S.mode !== 'multi';
    el.puSwap.disabled = !S.pu.swap; el.puShield.disabled = !S.pu.shield || !countOf(S.me.pid);
  }
  function usePowerup(kind) {
    const Q = S.question; if (!Q || Q.answered || !S.pu[kind]) return; S.pu[kind] = false; SFX.open(); buzz([20, 20, 20]);
    if (kind === 'fifty') { const wrong = [...el.opts.children].map((b, i) => i).filter(i => i !== Q.q.answer).sort(() => Math.random() - 0.5).slice(0, 2); wrong.forEach(i => { const b = el.opts.children[i]; b.disabled = true; b.classList.add('dim'); }); }
    else if (kind === 'time') { qExtra += 10; el.flagwrap.classList.remove('hot'); floatText('+10s', 'big'); }
    else if (kind === 'swap') { const q2 = pickQuestion(Q.a2, Q.level); if (q2) { S.used.add(q2); Q.q = q2; el.qlevel.textContent = t('lvl')[q2.level - 1]; el.qlevel.className = 'lvl l' + q2.level; el.qtext.textContent = q2.q[lang] || q2.q.he; el.opts.replaceChildren(...q2.options.map((op, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.textContent = op[lang] || op.he; b.addEventListener('click', () => answer(i)); return b; })); qStart = now(); qExtra = 0; } }
    else if (kind === 'shield') { const mine = Object.keys(S.owners).filter(x => S.owners[x].pid === S.me.pid).map(x => byA2[x]).sort((x, y) => y.area - x.area)[0]; if (mine) { const until = now() + SHIELD_MS; S.shields[mine.a2] = until; styleBadge(mine.a2); net.emit('shield', { a2: mine.a2, until }); alertBanner(t('shielded', { c: nameOf(mine) }), true); } }
    renderPowerups();
  }
  function qLoop() {
    if (!S.question || S.question.answered) return;
    const left = Q_TIME + qExtra - (now() - qStart) / 1000;
    el.prog.style.strokeDashoffset = String(182.2 * clamp(1 - left / (Q_TIME + qExtra), 0, 1));
    if (left < 4) { el.flagwrap.classList.add('hot'); const sec = Math.ceil(left); if (sec !== qTicked && sec > 0) { qTicked = sec; SFX.tick(); buzz(10); } }
    if (left <= 0) { answer(-1); return; }
    qTimer = requestAnimationFrame(qLoop);
  }
  function closeQuestion() {
    cancelAnimationFrame(qTimer); clearTimeout(pendingClose); pendingClose = null; el.sheet.classList.remove('open'); el.app.classList.remove('asking');
    const a2 = S.selected; S.question = null; S.selected = null; refreshSelection(); if (a2) styleBadge(a2); updateLOD();
  }
  function answer(i) {
    const Q = S.question; if (!Q || Q.answered) return; Q.answered = true; cancelAnimationFrame(qTimer); el.pus.hidden = true;
    const ok = i === Q.q.answer; const btns = [...el.opts.children];
    btns.forEach((b, k) => { b.disabled = true; if (k === Q.q.answer) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); else b.classList.add('dim'); });
    if (ok) { SFX.correct(); buzz([30, 40, 60]); }
    else { SFX.wrong(); buzz(200); el.card.classList.add('shake'); setTimeout(() => el.card.classList.remove('shake'), 500); }
    const ex = Q.q.expl && (Q.q.expl[lang] || Q.q.expl.he); if (ex) { el.qexpl.textContent = (ok ? '✓ ' : '✗ ') + ex; el.qexpl.hidden = false; el.qexpl.className = 'qexpl ' + (ok ? 'good' : 'bad'); }
    const finish = () => { closeQuestion(); if (ok) conquer(Q.a2, Q.attack, Q.defender); else fail(Q.a2, Q.attack, Q.defender); };
    // "Continue to neighbour" — skip the dwell and jump straight to the next free neighbour
    if (ok) {
      const c = byA2[Q.a2]; const nb = (c.nb || []).map(x => byA2[x]).filter(x => x && !S.owners[x.a2] && !((S.locked[x.a2] || 0) > now())).sort((a, b) => b.area - a.area)[0];
      if (nb) { el.nextBtn.textContent = t('next', { c: nameOf(nb) }); el.nextBtn.hidden = false; el.nextBtn.onclick = () => { if (!S.active) return; finish(); if (S.active && pov.altitude < 0.55) globe.pointOfView({ altitude: 0.6 }, 0); setTimeout(() => select(nb.a2), 120); }; }
    }
    const dwell = ex ? (ok ? 2600 : 2400) : (ok ? 900 : 1100);
    pendingClose = setTimeout(() => { finish(); if (S.active && pov.altitude < 0.55) globe.pointOfView({ altitude: 0.6 }, 700); }, dwell);
  }

  /* ======================= game rules ======================= */
  function conquer(a2, attack, defender) {
    const c = byA2[a2]; const ts = now();
    S.streak++; S.best = Math.max(S.best, S.streak); if (attack) S.steals++;
    let bonus = 0; if (S.streak >= 3) bonus += (S.streak - 2) * 5; if (S.golden) bonus += VAL[c.tier];
    if (bonus) S.bonuses[S.me.pid] = (S.bonuses[S.me.pid] || 0) + bonus;
    applyClaim({ a2, pid: S.me.pid, ts, prev: defender || null }, true);
    if (S.mode === 'multi') net.emit('claim', { a2, pid: S.me.pid, ts, prev: defender || null, bonus });
    // juice
    SFX.conquest(); buzz([40, 30, 80]); screenShake();
    el.vignette.classList.remove('flash'); void el.vignette.offsetWidth; el.vignette.classList.add('flash');
    globe.ringsData([{ lat: c.lat, lng: c.lng, color: S.me.color, r: Math.max(3, Math.min(14, Math.sqrt(c.area) / 160)), speed: 4 }]); setTimeout(() => globe.ringsData([]), 1300);
    confetti([S.me.color, '#fff', '#ffcc4d', S.me.color], 90);
    floatText('+' + (VAL[c.tier] + bonus) + (attack ? ' ⚔️' : '') + (S.golden ? ' ×2' : ''), '');
    if (bonus) setTimeout(() => ticker(t('streak', { k: S.streak, p: bonus })), 300);
    el.vignette.classList.toggle('on', S.streak >= 3);
    setHot(a2); updateHUD(); commentClaim(S.me, c, attack, defender ? playerOf(defender) : null);
    if (S.mode === 'solo' && Object.keys(S.owners).length >= C.length) endGame();
  }
  let lastLeader = null;
  function commentClaim(p, c, attack, victim) {
    if (!Commentator.enabled) return;
    if (attack && victim) Commentator.say('steal', { p, c, v: victim }, 'high');
    else Commentator.say('claim', { p, c, big: c.area > 2e6 });
    if (p === S.me || p.pid === S.me.pid) { if (S.streak === 3) Commentator.say('streak', { p }); }
    const pids = new Set([S.me.pid, ...Object.keys(S.players)]); const lead = [...pids].map(pid => ({ pid, s: scoreOf(pid) })).sort((a, b) => b.s - a.s)[0];
    if (lead && lead.s > 0 && lead.pid !== lastLeader) { if (lastLeader) Commentator.say('lead', { p: playerOf(lead.pid) }); lastLeader = lead.pid; }
    (c.nb || []).slice(0, 4).forEach(n => Commentator.warmCountry(byA2[n]));
  }
  function fail(a2, attack, defender) {
    const c = byA2[a2]; S.streak = 0; el.streakChip.hidden = true; el.vignette.classList.remove('on');
    S.locked[a2] = now() + (attack ? ATTACK_LOCK_MS : LOCK_MS); S.hot.delete(a2); styleBadge(a2); refreshSelection();
    floatText(t('wrong'), 'bad');
    if (attack && S.mode === 'multi') { net.emit('defend', { a2, atk: S.me.pid, def: defender, ts: now() }); ticker(t('youFailed', { c: nameOf(c), n: playerOf(defender).name })); Commentator.say('defend', { p: S.me, c, v: playerOf(defender) }); }
    updateHUD();
  }
  function applyClaim(d, mine) {
    const cur = S.owners[d.a2]; if (cur && cur.ts >= d.ts) return; const c = byA2[d.a2]; if (!c) return;
    S.owners[d.a2] = { pid: d.pid, ts: d.ts }; S.hot.delete(d.a2);
    if (!mine) {
      const p = playerOf(d.pid);
      if (d.bonus) S.bonuses[d.pid] = (S.bonuses[d.pid] || 0) + d.bonus;
      if (d.prev === S.me.pid) { alertBanner(t('took', { n: p.name, c: nameOf(c) }), false, () => { if (S.active && !S.question) select(d.a2); }, t('revenge')); SFX.alarm(); buzz([60, 40, 60, 40, 120]); el.vignette.classList.add('danger'); setTimeout(() => el.vignette.classList.remove('danger'), 1200); }
      else ticker(t('conq', { n: p.name, c: nameOf(c) }));
      commentClaim(p, c, !!d.prev, d.prev ? playerOf(d.prev) : null);
      globe.ringsData([{ lat: c.lat, lng: c.lng, color: p.color, r: Math.max(3, Math.min(12, Math.sqrt(c.area) / 180)), speed: 3.5 }]); setTimeout(() => globe.ringsData([]), 1300);
      if (S.locked[d.a2]) delete S.locked[d.a2];
    }
    refreshPolygons(); styleBadge(d.a2); updateLOD(); updateHUD();
  }
  function updateHUD() {
    el.cnt.textContent = countOf(S.me.pid); el.score.textContent = scoreOf(S.me.pid);
    el.streakChip.hidden = S.streak < 2; if (S.streak >= 2) el.streakChip.textContent = t('streakChip', { k: S.streak });
    el.empire.querySelector('i').style.height = clamp(pctOf(S.me.pid) * 2.2, 0, 100) + '%';
    renderLivebar();
  }
  // Live player strip (multiplayer): initial chips with country counts, leader glows
  function renderLivebar() {
    if (S.mode !== 'multi') { el.livebar.hidden = true; return; }
    const pids = new Set([S.me.pid, ...Object.keys(S.players), ...Object.values(S.owners).map(o => o.pid)]);
    const rows = [...pids].map(pid => ({ pid, p: playerOf(pid), s: scoreOf(pid), n: countOf(pid) })).sort((a, b) => b.s - a.s || b.n - a.n);
    el.livebar.hidden = false;
    el.livebar.replaceChildren(...rows.slice(0, 8).map((r, i) => { const d = document.createElement('div'); d.className = 'lp' + (i === 0 && r.s > 0 ? ' lead' : '') + (r.pid === S.me.pid ? ' me' : ''); d.style.setProperty('--c', r.p.color); d.append(avatarEl(r.p, 'sm')); const n = document.createElement('b'); n.textContent = r.n; d.append(n); return d; }));
  }

  /* ======================= game loop ======================= */
  let loopT = null, lastSec = -1, lastSnap = 0, lastCount = -1;
  function startGame(mode, dur, remaining, startAt) {
    S.mode = mode; S.active = true; S.ended = false; S.dur = dur;
    const rem = remaining != null ? remaining : dur;
    S.t0 = startAt != null ? startAt : now() + (PICK_S + COUNTDOWN) * 1000; if (remaining != null && startAt == null) S.t0 = now() - (dur - rem) * 1000;
    S.remaining = rem; S.ready = now() >= S.t0;
    S.streak = 0; S.best = 0; S.defends = 0; S.steals = 0; S.golden = false; S.pu = { fifty: true, time: true, swap: true, shield: true }; S.shields = {}; el.app.classList.remove('golden'); el.reacts.hidden = mode !== 'multi'; S.used = new Set(); S.locked = {}; S.hot = new Set(); S.selected = null; S.question = null; lastSec = -1; lastCount = -1; S.posterUrl = null;
    if (mode === 'solo') { S.owners = {}; S.bonuses = {}; S.players = {}; }
    el.home.hidden = true; el.lobby.hidden = true; el.end.hidden = true; el.hud.hidden = false; el.empire.hidden = false; el.vignette.className = '';
    el.app.style.setProperty('--me', S.me.color); el.langBtn.parentNode.hidden = true; el.app.classList.add('playing');
    el.hint.hidden = false; el.hint.className = ''; el.hint.textContent = t('hint');
    refreshSelection(); restyleAll(); updateHUD(); updateLOD();
    const ctl = globe.controls(); ctl.autoRotate = false;
    const home = homeCountry(); globe.pointOfView({ lat: home.lat, lng: home.lng, altitude: S.ready ? 1.9 : 1.1 }, 1200);
    SFX.whoosh(); buzz(20); music.start(); music.setUrgent(false);
    Commentator.init({ lang, onDuck: (d) => { if (master) master.gain.value = muted ? 0 : (d ? 0.35 : 1); } }); if (mode !== 'multi' || !S.host) Commentator.setEnabled(false);
    if (mode === 'multi' && S.host) { setTimeout(() => Commentator.say('start', {}, 'high'), (PICK_S + COUNTDOWN) * 1000); Commentator.prewarm([S.me.color, ...Object.values(S.players).map(p => p.color)]); }
    el.tbar.style.width = '100%'; el.tbar.classList.remove('hot');
    if (!S.ready) { el.count.hidden = false; el.count.classList.add('pick'); el.countNum.textContent = ''; el.pickHint.textContent = t('pick'); }
    cancelAnimationFrame(loopT); loopT = requestAnimationFrame(loop);
  }
  function loop() {
    if (!S.active) return;
    const tnow = now();
    if (tnow < S.t0) { // pre-game: pick a starting area, then 3-2-1
      const n = Math.ceil((S.t0 - tnow) / 1000);
      if (n !== lastCount) {
        lastCount = n;
        if (n > COUNTDOWN) { el.count.classList.add('pick'); el.pickSec.textContent = t('pickS', { s: n - COUNTDOWN }); el.countNum.textContent = ''; }
        else { el.count.classList.remove('pick'); el.countNum.textContent = n; el.countNum.classList.remove('pop'); void el.countNum.offsetWidth; el.countNum.classList.add('pop'); SFX.count(); buzz(15); }
      }
      el.time.textContent = fmtTime(S.dur);
      loopT = requestAnimationFrame(loop); return;
    }
    if (!S.ready) { S.ready = true; el.count.classList.remove('pick'); el.countNum.textContent = t('go'); el.countNum.classList.remove('pop'); void el.countNum.offsetWidth; el.countNum.classList.add('pop'); SFX.go(); buzz([30, 30, 60]); setTimeout(() => { el.count.hidden = true; }, 650); }
    S.remaining = S.dur - (tnow - S.t0) / 1000;
    el.tbar.style.width = clamp(S.remaining / S.dur * 100, 0, 100) + '%';
    const sec = Math.ceil(S.remaining);
    if (sec !== lastSec) {
      lastSec = sec; el.time.textContent = fmtTime(S.remaining); el.time.classList.toggle('hot', sec <= 10); el.tbar.classList.toggle('hot', sec <= 10);
      music.setUrgent(sec <= 15);
      if (!S.golden && sec <= GOLDEN_S && sec > 0) { S.golden = true; alertBanner(t('golden'), true); SFX.go(); buzz([40, 40, 40]); el.app.classList.add('golden'); restyleAll(); Commentator.say('golden', {}, 'high'); }
      if (sec === 10) Commentator.say('ten', {}, 'high'); if (sec === 5) Commentator.say('five', {}, 'high');
      if (sec <= 5 && sec > 0) { SFX.tick(); }
      for (const a2 in S.locked) if (S.locked[a2] <= tnow) { delete S.locked[a2]; styleBadge(a2); }
      if (S.mode === 'multi' && S.host && tnow - lastSnap > 5000) { lastSnap = tnow; net.emit('snap', snapshot()); }
    }
    if (S.remaining <= 0) { endGame(); return; }
    loopT = requestAnimationFrame(loop);
  }
  function snapshot() { return { owners: S.owners, bonuses: S.bonuses, remaining: Math.max(0, S.remaining), dur: S.dur, epoch: S.t0 }; }
  function mergeSnapshot(d) {
    for (const a2 in d.owners) { const o = d.owners[a2]; if (!S.owners[a2] || S.owners[a2].ts < o.ts) S.owners[a2] = o; }
    for (const pid in d.bonuses) S.bonuses[pid] = Math.max(S.bonuses[pid] || 0, d.bonuses[pid]);
    refreshPolygons(); restyleAll(); updateHUD(); updateLOD();
  }

  /* ======================= end ======================= */
  function medalsFor() {
    const mine = Object.keys(S.owners).filter(a2 => S.owners[a2].pid === S.me.pid).map(a2 => byA2[a2]);
    const out = [];
    if (mine.length >= 1) out.push(tm('first'));
    const byRegion = {}; mine.forEach(c => { byRegion[c.region] = (byRegion[c.region] || 0) + 1; });
    for (const r in byRegion) if (byRegion[r] >= 4) out.push(tm('continent', { r: (T[lang].regions[r] || r) }));
    if (mine.filter(c => !c.nb || !c.nb.length).length >= 3) out.push(tm('islands'));
    if (S.best >= 5) out.push(tm('streak5', { n: S.best }));
    if (mine.some(c => c.area > 5e6)) out.push(tm('giant'));
    if (S.mode === 'solo' && mine.length >= 8) out.push(tm('fast'));
    if (S.defends >= 1) out.push(tm('defender'));
    if (S.steals >= 2) out.push(tm('raider'));
    if (S.mode === 'multi' && S.rank === 1 && mine.length > 0) out.push(tm('world'));
    return out;
  }
  function endGame() {
    if (!S.active) return; S.active = false; S.ended = true; S.ready = false; cancelAnimationFrame(loopT); cancelAnimationFrame(qTimer); clearTimeout(pendingClose);
    if (S.question) { el.sheet.classList.remove('open'); el.app.classList.remove('asking'); S.question = null; }
    S.selected = null; S.hot = new Set(); el.count.hidden = true; el.hint.hidden = true; el.langBtn.parentNode.hidden = false; el.app.classList.remove('playing'); el.vignette.className = ''; el.hud.hidden = true; el.empire.hidden = true; el.livebar.hidden = true; el.reacts.hidden = true; el.pus.hidden = true; el.app.classList.remove('golden');
    if (S.mode === 'multi' && S.host) net.emit('end', snapshot());
    music.stop(); SFX.end(); buzz([80, 60, 80, 60, 200]);
    refreshSelection(); restyleAll(); globe.htmlElementsData([]); badgeKey = '';
    const myCountries = Object.keys(S.owners).filter(a2 => S.owners[a2].pid === S.me.pid).map(a2 => byA2[a2]).sort((a, b) => b.area - a.area);
    const focus = myCountries[0] || byA2.IL; globe.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 2.0 }, 1500);
    const ctl = globe.controls(); ctl.autoRotate = false;
    confetti([S.me.color, '#ffcc4d', '#fff', S.me.color], 180, 0.5, 0.3);
    // stats
    el.pct.textContent = fmtPct(pctOf(S.me.pid)); el.eCnt.textContent = myCountries.length; el.eScore.textContent = scoreOf(S.me.pid); el.eStreak.textContent = S.best;
    el.passport.replaceChildren(...myCountries.slice(0, 24).map((c, i) => { const im = document.createElement('img'); im.src = 'flags/' + c.a2.toLowerCase() + '.svg'; im.alt = nameOf(c); im.style.setProperty('--d', (i * 60) + 'ms'); return im; }));
    el.ranking.replaceChildren();
    let rows = [];
    if (S.mode === 'multi') {
      const pids = new Set([S.me.pid, ...Object.keys(S.players), ...Object.values(S.owners).map(o => o.pid)]);
      rows = [...pids].map(pid => ({ pid, p: playerOf(pid), s: scoreOf(pid), n: countOf(pid) })).sort((a, b) => b.s - a.s || b.n - a.n);
      S.rank = rows.findIndex(r => r.pid === S.me.pid) + 1;
      el.ranking.replaceChildren(...rows.map((r, i) => { const d = document.createElement('div'); d.className = 'rank' + (r.pid === S.me.pid ? ' me' : ''); d.style.setProperty('--c', r.p.color);
        const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = (i + 1) + '.';
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.p.name + (r.pid === S.me.pid ? ' (' + t('you') + ')' : ''); const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.s + ' · ' + r.n + ' 🌍'; d.append(pos, avatarEl(r.p, 'sm'), nm, sc); return d; }));
      if (rows[0]) { ticker(t('winner', { n: rows[0].p.name })); Commentator.say('end', { p: rows[0].p }, 'high'); }
      el.pctLbl.textContent = (S.rank === 1 ? t('youWin') : t('place', { r: S.rank })) + ' · ' + t('ofEarth');
    } else { S.rank = 1; el.pctLbl.textContent = t('ofEarth'); }
    const pc = pctOf(S.me.pid); const ti = T[lang].titles[pc < 1 ? 0 : pc < 3 ? 1 : pc < 8 ? 2 : pc < 20 ? 3 : 4];
    el.empireTitle.textContent = t('empireOf', { t: ti, n: S.me.name });
    const medals = medalsFor();
    el.medals.replaceChildren(...medals.map((m, i) => { const d = document.createElement('span'); d.className = 'medal'; d.style.setProperty('--d', (i * 120) + 'ms'); d.textContent = m; return d; }));
    el.posterImg.hidden = true; el.saveBtn.hidden = true; el.rankLine.hidden = true;
    setTimeout(() => { el.end.hidden = false; }, 900);
    (async () => { const r = await CW.saveRun({ name: S.me.name, color: S.me.color, mode: S.mode, score: scoreOf(S.me.pid), countries: myCountries.length, pct: +pctOf(S.me.pid).toFixed(2), best: S.best, rank: S.rank, players: Math.max(1, rows.length) }); if (!r) return; const rk = await CW.myRank('today', S.mode); if (rk && rk.rank) { el.rankLine.textContent = t('rankToday', { r: rk.rank }); el.rankLine.hidden = false; } })();
    // poster: wait for the camera to settle, then snapshot the globe
    setTimeout(() => { try { makePoster(myCountries, rows.length); } catch (e) { /* poster is optional */ } }, 1800);
  }
  function makePoster(myCountries, nPlayers) {
    const W = 1080, H = 1920; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1430'); g.addColorStop(1, '#030610'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.7})`; x.beginPath(); x.arc(Math.random() * W, Math.random() * H, Math.random() < 0.9 ? 1.3 : 2.6, 0, 7); x.fill(); }
    // globe snapshot (square crop around the centre of the WebGL canvas)
    const src = el.globe.querySelector('canvas');
    try { globe.renderer().render(globe.scene(), globe.camera()); } catch (e) { }
    if (src) { const s = Math.min(src.width, src.height) * 0.92; const sx = (src.width - s) / 2, sy = (src.height - s) / 2; const d = 900; x.save(); x.beginPath(); x.arc(W / 2, 760, d / 2, 0, 7); x.clip(); x.drawImage(src, sx, sy, s, s, W / 2 - d / 2, 760 - d / 2, d, d); x.restore();
      const glow = x.createRadialGradient(W / 2, 760, d / 2 - 20, W / 2, 760, d / 2 + 70); glow.addColorStop(0, 'rgba(106,147,255,0)'); glow.addColorStop(0.5, 'rgba(106,147,255,0.35)'); glow.addColorStop(1, 'rgba(106,147,255,0)'); x.fillStyle = glow; x.beginPath(); x.arc(W / 2, 760, d / 2 + 70, 0, 7); x.fill(); }
    x.textAlign = 'center'; x.direction = lang === 'he' ? 'rtl' : 'ltr';
    x.fillStyle = '#ffcc4d'; x.font = '900 72px Rubik, Heebo, sans-serif'; x.fillText(t('posterTitle'), W / 2, 160);
    x.fillStyle = 'rgba(255,255,255,.8)'; x.font = '700 44px Heebo, Rubik, sans-serif'; x.fillText(el.empireTitle.textContent || S.me.name || '', W / 2, 228);
    x.fillStyle = '#fff'; x.font = '900 230px Rubik, Heebo, sans-serif'; x.shadowColor = 'rgba(255,204,77,.6)'; x.shadowBlur = 40; x.fillText(fmtPct(pctOf(S.me.pid)), W / 2, 1420); x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,.8)'; x.font = '700 46px Heebo, Rubik, sans-serif'; x.fillText(t('posterOf'), W / 2, 1495);
    x.fillStyle = '#ffcc4d'; x.font = '800 44px Rubik, Heebo, sans-serif'; x.fillText(t('posterStats', { c: myCountries.length, s: scoreOf(S.me.pid) }), W / 2, 1570);
    x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '600 34px Heebo, Rubik, sans-serif'; x.fillText(S.mode === 'multi' ? t('multiLbl', { r: S.rank, n: nPlayers }) : t('soloLbl'), W / 2, 1625);
    // flag strip
    const flags = myCountries.slice(0, 12); const fw = 72, fh = 54, gap = 12; const total = flags.length * (fw + gap) - gap; let fxp = (W - total) / 2; let loaded = 0;
    const finish = () => { S.posterUrl = cv.toDataURL('image/png'); el.posterImg.src = S.posterUrl; el.posterImg.hidden = false; el.saveBtn.hidden = !downloadsNs; };
    if (!flags.length) { finish(); return; }
    flags.forEach((c, i) => { const im = new Image(); im.onload = im.onerror = () => { try { x.save(); roundRect(x, fxp + i * (fw + gap), 1700, fw, fh, 8); x.clip(); x.drawImage(im, fxp + i * (fw + gap), 1700, fw, fh); x.restore(); } catch (e) { } if (++loaded === flags.length) finish(); }; im.src = 'flags/' + c.a2.toLowerCase() + '.svg'; });
  }
  function roundRect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  async function share() {
    const txt = S.mode === 'multi' ? t('shareTextMulti', { r: S.rank || 1, p: fmtPct(pctOf(S.me.pid)) }) : t('shareText', { p: fmtPct(pctOf(S.me.pid)), c: countOf(S.me.pid), s: scoreOf(S.me.pid) });
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) {
        let files; if (S.posterUrl && navigator.canShare) { try { const blob = await (await fetch(S.posterUrl)).blob(); const f = new File([blob], 'conquer.png', { type: 'image/png' }); if (navigator.canShare({ files: [f] })) files = [f]; } catch (e) { } }
        await navigator.share(Object.assign({ title: t('title'), text: txt, url }, files ? { files } : {})); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const done = () => toast(t('copied'));
    try { navigator.clipboard.writeText(txt).then(done).catch(() => fallback()); } catch (e) { fallback(); }
    function fallback() { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); toast(ok ? t('copied') : t('noClip')); }
  }
  let downloadsNs = true;
  function savePoster() { if (!S.posterUrl) return; const a = document.createElement('a'); a.href = S.posterUrl; a.download = 'conquer-the-world.png'; document.body.appendChild(a); a.click(); a.remove(); toast(t('saved')); }
  function resetToHome() {
    S.active = false; S.ended = false; S.ready = false; S.mode = null; S.owners = {}; S.bonuses = {}; S.players = {}; S.locked = {}; S.hot = new Set(); S.selected = null; S.question = null; S.host = false; S.code = '';
    net.leave(); music.stop(); Commentator.setEnabled(false); lastLeader = null; el.count.hidden = true; el.end.hidden = true; el.lobby.hidden = true; el.hud.hidden = true; el.empire.hidden = true; el.livebar.hidden = true; el.reacts.hidden = true; el.home.hidden = false; el.sheet.classList.remove('open'); el.app.classList.remove('asking'); el.vignette.className = '';
    refreshSelection(); restyleAll(); badgeKey = ''; updateLOD(); const ctl = globe.controls(); ctl.autoRotate = true; ctl.autoRotateSpeed = 0.6;
    globe.pointOfView({ lat: 25, lng: 30, altitude: 2.4 }, 1200);
  }

  /* ======================= networking (room) ======================= */
  const net = {
    sub: null, myPeer: null, available: null,
    async probe() { this.available = await CW.roomAvailable(); return this.available; },
    async connect(code) {
      if (!(await this.probe())) return false;
      this.sub = await CW.room(code, { name: S.me.name, color: S.me.color, host: S.host }, {
        topics: ['claim', 'attack', 'defend', 'start', 'snap', 'end', 'react', 'shield'],
        onMsg: (topic, m) => onMsg(topic, m),
        onPeers: (peers) => onPeers({ peers, joined: [] }),
        onJoin: (np) => { if (S.active && S.host) net.emit('snap', snapshot()); },
        onPeer: (id) => { this.myPeer = id; S.me.pid = id; },
      });
      if (!this.sub) return false; this.myPeer = this.sub.peer; S.me.pid = this.sub.peer; return true;
    },
    emit(topic, data) { if (this.sub) this.sub.emit(topic, data); },
    presence(p) { if (this.sub) this.sub.presence(p); },
    leave() { if (this.sub) { this.sub.leave(); this.sub = null; } this.myPeer = null; },
  };
  let hostWatch = null;
  function onPeers(ch) {
    S.players = {};
    for (const p of ch.peers) { const pr = p.presence || {}; if (pr.name && !p.isMe) S.players[p.peer] = { name: String(pr.name).slice(0, 14), color: COLORS.includes(pr.color) ? pr.color : '#999', host: !!pr.host }; }
    if (!S.active && net.myPeer) { // keep colours unique inside the room: on a clash, the peer with the greater id switches
      const others = ch.peers.filter(p => !p.isMe && p.presence && p.presence.color);
      const clash = others.some(p => p.presence.color === S.me.color && p.peer < net.myPeer);
      if (clash) { const used = new Set(others.map(p => p.presence.color)); const free = COLORS.find(c => !used.has(c)); if (free) { S.me.color = free; el.app.style.setProperty('--me', free); renderPickers(); net.presence({ color: free }); toast(t('colorChanged')); } }
    }
    if (S.me.name) S.players[S.me.pid] = { name: S.me.name, color: S.me.color, host: S.host };
    renderLobby();
    const hasHost = ch.peers.some(p => p.presence && p.presence.host);
    clearTimeout(hostWatch);
    if (!hasHost) hostWatch = setTimeout(() => { const ids = ch.peers.map(p => p.peer).sort(); if (ids[0] === net.myPeer && !S.host) becomeHost(); }, 4000);
    if (S.active) { refreshPolygons(); restyleAll(); renderLivebar(); }
  }
  function onMsg(topic, m) {
    const d = m.data || {}; if (typeof d !== 'object') return;
    if (topic === 'start') { if (!S.active) { S.host = false; const cd = clamp(+d.countdownMs || (PICK_S + COUNTDOWN) * 1000, 0, 20000); startGame('multi', +d.dur || MULTI_TIME, null, now() + cd); } }
    else if (topic === 'claim') { if (S.active && typeof d.a2 === 'string' && byA2[d.a2]) applyClaim({ a2: d.a2, pid: m.peer, ts: +d.ts || now(), prev: d.prev, bonus: clamp(+d.bonus || 0, 0, 100) }); }
    else if (topic === 'attack') { if (S.active && byA2[d.a2] && d.def) Commentator.say('attack', { p: playerOf(m.peer), c: byA2[d.a2], v: playerOf(d.def) }); if (S.active && d.def === S.me.pid && byA2[d.a2]) { const p = playerOf(m.peer); alertBanner(t('attacking', { n: p.name, c: nameOf(byA2[d.a2]) })); SFX.alarm(); buzz([50, 50, 50, 50, 150]); el.vignette.classList.add('danger'); setTimeout(() => el.vignette.classList.remove('danger'), 1500); } }
    else if (topic === 'defend') { if (S.active && byA2[d.a2]) { const p = playerOf(m.peer); if (d.def) Commentator.say('defend', { p, c: byA2[d.a2], v: playerOf(d.def) }); if (d.def === S.me.pid) { S.defends++; S.bonuses[S.me.pid] = (S.bonuses[S.me.pid] || 0) + 10; alertBanner(t('repelled', { c: nameOf(byA2[d.a2]), p: 10 }), true); SFX.shield(); buzz([30, 30, 30]); updateHUD(); } else if (d.def) { S.bonuses[d.def] = (S.bonuses[d.def] || 0) + 10; ticker('🛡️ ' + playerOf(d.def).name + ' ← ' + p.name); updateHUD(); } } }
    else if (topic === 'snap') { if (d.owners) { if (!S.active && !S.ended && !el.lobby.hidden) startGame('multi', +d.dur || MULTI_TIME, clamp(+d.remaining || 0, 0, 600)); if (S.active) { mergeSnapshot(d); if (!S.host && S.ready) S.t0 = now() - (S.dur - (+d.remaining || 0)) * 1000; } } }
    else if (topic === 'end') { if (S.active) { if (d.owners) mergeSnapshot(d); endGame(); } }
    else if (topic === 'react') { if (typeof d.e === 'string' && REACTS.includes(d.e)) floatReact(d.e, playerOf(m.peer)); }
    else if (topic === 'shield') { if (S.active && byA2[d.a2] && +d.until) { S.shields[d.a2] = Math.min(+d.until, now() + SHIELD_MS); styleBadge(d.a2); ticker(t('shielded', { c: nameOf(byA2[d.a2]) })); } }
  }
  const REACTS = ['👏', '🔥', '😱', '😂'];
  function floatReact(e, p) { const d = document.createElement('div'); d.className = 'react'; d.style.setProperty('--x', (15 + Math.random() * 70) + '%'); d.style.setProperty('--c', p.color); d.textContent = e; const s = document.createElement('span'); s.textContent = initial(p); d.append(s); el.app.appendChild(d); setTimeout(() => d.remove(), 2200); }
  function renderLobby() {
    const rows = Object.entries(S.players).map(([pid, p]) => ({ pid, ...p })).sort((a, b) => (b.host - a.host) || a.name.localeCompare(b.name));
    el.players.replaceChildren(...rows.map(p => { const d = document.createElement('div'); d.className = 'player'; d.style.setProperty('--c', p.color); const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name + (p.pid === S.me.pid ? ' (' + t('you') + ')' : ''); const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = p.host ? '👑 ' + t('host') : ''; d.append(avatarEl(p), nm, tg); return d; }));
    el.startBtn.hidden = !S.host; el.waitHost.hidden = S.host; el.startBtn.disabled = rows.length < 2;
  }
  async function createRoom() {
    const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
    if (!(await enterRoom(code, true))) return;
  }
  async function joinRoom() { const code = (el.codeIn.value || '').trim().toUpperCase(); if (code.length !== 4) { el.codeIn.focus(); return; } await enterRoom(code, false); }
  async function enterRoom(code, host) {
    readMe(); if (!S.me.name) { el.name.focus(); toast(t('namePh')); return false; }
    el.createBtn.disabled = el.joinGo.disabled = true;
    S.host = host; S.code = code; S.players = {};
    let ok = false; try { ok = await net.connect(code); } catch (e) { ok = false; } el.createBtn.disabled = el.joinGo.disabled = false;
    if (!ok) { toast(t(net.available === false ? 'noRoom' : 'joinFail')); el.mpNote.hidden = false; return false; }
    S.owners = {}; S.bonuses = {};
    el.codeBig.textContent = code; el.home.hidden = true; el.lobby.hidden = false; renderLobby(); SFX.open();
    if (host) becomeHost(); else el.commBtn.hidden = true;
    return true;
  }
  function becomeHost() { S.host = true; net.presence({ host: true }); el.commBtn.hidden = false; let on = true; try { on = localStorage.getItem('cw.comm') !== '0'; } catch (e) { } Commentator.setEnabled(on); el.commBtn.classList.toggle('sel', on); renderLobby(); }
  function hostStart() { if (Object.keys(S.players).length < 2) { toast(t('min2')); return; } const startAt = now() + (PICK_S + COUNTDOWN) * 1000; net.emit('start', { dur: MULTI_TIME, countdownMs: (PICK_S + COUNTDOWN) * 1000 }); startGame('multi', MULTI_TIME, null, startAt); lastSnap = now(); }
  function roomLink(code) { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('room', code); return u.toString(); }
  async function shareRoom() { const url = roomLink(S.code); const text = t('inviteText', { code: S.code }); try { if (navigator.share) { await navigator.share({ title: t('title'), text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; } try { await navigator.clipboard.writeText(text + ' ' + url); toast(t('copied')); } catch (e) { toast(url); } }

  /* ======================= leaderboard ======================= */
  let bScope = 'world', bPeriod = 'today', bMode = 'solo';
  async function openBoard() {
    el.home.hidden = true; el.board.hidden = false; SFX.open();
    const meRow = await CW.getMe(); if (meRow && meRow.friend_code) el.myCode.textContent = meRow.friend_code;
    renderBoardTabs(meRow); loadBoard();
  }
  function renderBoardTabs(meRow) {
    const scopes = [['world', t('world')], ['country', (meRow && meRow.country) || t('country')], ['city', (meRow && meRow.city) || t('city')], ['friends', t('friends')]];
    el.boardTabs.replaceChildren(...scopes.map(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.classList.toggle('sel', k === bScope); b.addEventListener('click', () => { bScope = k; renderBoardTabs(meRow); loadBoard(); }); return b; }));
    const periods = [['today', t('today')], ['week', t('week')], ['all', t('all')]];
    el.boardPeriods.replaceChildren(...periods.map(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.classList.toggle('sel', k === bPeriod); b.addEventListener('click', () => { bPeriod = k; renderBoardTabs(meRow); loadBoard(); }); return b; }));
    el.friendsBox.hidden = bScope !== 'friends';
  }
  async function loadBoard() {
    el.boardList.replaceChildren(); const sk = document.createElement('div'); sk.className = 'small'; sk.textContent = '…'; el.boardList.append(sk);
    const { rows } = await CW.leaderboard(bScope, bPeriod, bMode);
    if (!rows.length) { sk.textContent = t('noRows'); return; }
    el.boardList.replaceChildren(...rows.map((r, i) => { const d = document.createElement('div'); d.className = 'rank' + (r.player_id === CW.uid ? ' me' : ''); d.style.setProperty('--c', COLORS.includes(r.color) ? r.color : '#999');
      const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = (r.rank || i + 1) + '.';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = (r.name || '?') + (r.player_id === CW.uid ? ' (' + t('me') + ')' : ''); const sub = document.createElement('small'); sub.textContent = [r.city, r.country].filter(Boolean).join(', '); nm.append(document.createElement('br'), sub);
      const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.score + ' · ' + r.countries + ' 🌍'; d.append(pos, avatarEl({ name: r.name, color: r.color }, 'sm'), nm, sc); return d; }));
  }
  async function addFriendByCode() {
    const code = el.friendIn.value.trim(); if (code.length < 4) return; el.friendAdd.disabled = true;
    const r = await CW.addFriend(code); el.friendAdd.disabled = false;
    if (r.ok) { toast(t('friendAdded', { n: (r.friend && r.friend.name) || '' })); el.friendIn.value = ''; loadBoard(); } else toast(t('friendFail'));
  }

  /* ======================= home UI ======================= */
  function readMe() { S.me.name = (el.name.value || '').trim().slice(0, 14); try { localStorage.setItem('cw.me', JSON.stringify({ name: S.me.name, color: S.me.color })); } catch (e) { } if (S.me.name) CW.savePlayer(S.me.name, S.me.color).then(p => { if (p && p.friend_code) el.myCode.textContent = p.friend_code; }); }
  function renderPickers() {
    el.colors.replaceChildren(...COLORS.map(c => { const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', c); b.classList.toggle('sel', c === S.me.color); b.setAttribute('aria-label', c); b.addEventListener('click', () => { S.me.color = c; el.app.style.setProperty('--me', c); renderPickers(); SFX.tap(); readMe(); }); return b; }));
  }
  function applyLang() {
    el.app.dir = lang === 'he' ? 'rtl' : 'ltr'; el.app.style.setProperty('--dir', el.app.dir); el.langBtn.textContent = lang === 'he' ? 'EN' : 'עב';
    document.querySelectorAll('[data-t]').forEach(n => { n.textContent = t(n.dataset.t); });
    el.name.placeholder = t('namePh'); document.title = t('title'); setMuted(muted);
    for (const a2 in badgeCache) { const nm = badgeCache[a2].querySelector('.nm'); if (nm) nm.textContent = shortOf(byA2[a2]); }
    if (!el.hint.hidden && S.active) el.hint.textContent = t('hint');
  }
  function bindUI() {
    el.langBtn.addEventListener('click', () => { lang = lang === 'he' ? 'en' : 'he'; try { localStorage.setItem('cw.lang', lang); } catch (e) { } applyLang(); SFX.tap(); });
    el.soloBtn.addEventListener('click', () => { readMe(); if (!S.me.name) { S.me.name = lang === 'he' ? 'אני' : 'Me'; el.name.value = S.me.name; readMe(); } S.me.pid = 'me'; S.players = {}; startGame('solo', SOLO_TIME); });
    el.createBtn.addEventListener('click', createRoom);
    el.joinBtn.addEventListener('click', () => { el.joinRow.hidden = !el.joinRow.hidden; if (!el.joinRow.hidden) el.codeIn.focus(); });
    el.joinGo.addEventListener('click', joinRoom);
    el.codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
    el.startBtn.addEventListener('click', hostStart);
    el.leaveBtn.addEventListener('click', resetToHome);
    el.closeQ.addEventListener('click', () => { if (S.question && !S.question.answered) { S.question.answered = true; closeQuestion(); } });
    el.shareBtn.addEventListener('click', share);
    el.saveBtn.addEventListener('click', savePoster);
    el.againBtn.addEventListener('click', resetToHome);
    el.muteBtn.addEventListener('click', () => { setMuted(!muted); if (!muted) SFX.tap(); });
    el.boardBtn.addEventListener('click', openBoard); el.boardBack.addEventListener('click', () => { el.board.hidden = true; el.home.hidden = false; });
    el.friendAdd.addEventListener('click', addFriendByCode); el.friendIn.addEventListener('keydown', e => { if (e.key === 'Enter') addFriendByCode(); });
    el.inviteBtn.addEventListener('click', shareRoom);
    el.commBtn.addEventListener('click', () => { const on = !Commentator.enabled; Commentator.setEnabled(on); try { localStorage.setItem('cw.comm', on ? '1' : '0'); } catch (e) { } el.commBtn.classList.toggle('sel', on); toast(t(on ? 'commentatorOn' : 'commentatorOff')); if (on) Commentator.say('start', {}, 'high'); });
    el.puFifty.addEventListener('click', () => usePowerup('fifty')); el.puTime.addEventListener('click', () => usePowerup('time')); el.puSwap.addEventListener('click', () => usePowerup('swap')); el.puShield.addEventListener('click', () => usePowerup('shield'));
    el.reacts.replaceChildren(...REACTS.map(e => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e; let last = 0; b.addEventListener('click', () => { if (now() - last < 700) return; last = now(); floatReact(e, S.me); net.emit('react', { e }); SFX.tap(); }); return b; }));
    document.addEventListener('pointerdown', () => audio(), { once: true });
    el.name.addEventListener('change', readMe);
  }

  /* ======================= boot ======================= */
  async function init() {
    try { const m = JSON.parse(localStorage.getItem('cw.me') || 'null'); if (m) { S.me.name = m.name || ''; if (COLORS.includes(m.color)) S.me.color = m.color; } } catch (e) { }
    el.name.value = S.me.name; el.app.style.setProperty('--me', S.me.color);
    applyLang(); renderPickers(); bindUI();
    el.hint.hidden = false; el.hint.className = 'stay'; el.hint.textContent = t('loading');
    try { await loadData(); } catch (e) { el.hint.textContent = 'Data failed to load'; return; }
    initGlobe(); updateLOD(); el.hint.hidden = true;
    CW.ready.then(ok => { el.mpNote.hidden = true; el.netNote.hidden = ok; el.createBtn.disabled = el.joinBtn.disabled = el.boardBtn.disabled = !ok; if (ok && S.me.name) readMe(); });
    const rc = new URLSearchParams(location.search).get('room'); if (rc && /^[A-Za-z]{4}$/.test(rc)) { el.codeIn.value = rc.toUpperCase(); el.joinRow.hidden = false; CW.ready.then(ok => { if (ok && S.me.name) joinRoom(); else el.name.focus(); }); }
  }
  init();
})();

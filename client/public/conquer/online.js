/* online.js — Supabase layer for Conquer the World (standalone site)
   - anonymous auth → stable player id
   - realtime rooms (broadcast + presence) with the same emit/on/presence/onPeers shape the game uses
   - players / runs / friends tables + leaderboard RPC
   - commentator TTS via the `tts` edge function (ElevenLabs), cached in storage */
window.CW = (function () {
  'use strict';
  const cfg = window.CW_CONFIG || {};
  let sb = null, uid = null, me = null;
  const ready = (async () => {
    if (!cfg.url || !cfg.anonKey || !window.supabase) return false;
    try {
      sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
      let { data: { session } } = await sb.auth.getSession();
      if (!session) { const r = await sb.auth.signInAnonymously(); session = r.data && r.data.session; }
      uid = session && session.user ? session.user.id : null;
      return !!uid;
    } catch (e) { console.warn('supabase init failed', e); return false; }
  })();

  /* ---------- location (city / country) ---------- */
  async function locate() {
    try { const c = JSON.parse(localStorage.getItem('cw.loc') || 'null'); if (c && c.ts > Date.now() - 7 * 864e5) return c; } catch (e) { }
    let loc = null;
    try { const r = await fetch('https://ipwho.is/?fields=success,country,country_code,city,region'); const j = await r.json(); if (j && j.success) loc = { country: j.country, cc: j.country_code, city: j.city || j.region || '', ts: Date.now() }; } catch (e) { }
    if (!loc) { const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || ''); const cc = tz === 'Asia/Jerusalem' ? 'IL' : ''; loc = { country: cc === 'IL' ? 'Israel' : '', cc, city: '', ts: Date.now() }; }
    try { localStorage.setItem('cw.loc', JSON.stringify(loc)); } catch (e) { }
    return loc;
  }

  /* ---------- player profile ---------- */
  function friendCode() { return Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''); }
  async function savePlayer(name, color) {
    if (!(await ready)) return null;
    const loc = await locate();
    const row = { id: uid, name: String(name || '').slice(0, 14), color, country: loc.country, country_code: loc.cc, city: loc.city, updated_at: new Date().toISOString() };
    const { data, error } = await sb.from('cw_players').upsert(row, { onConflict: 'id' }).select('id,name,color,country,country_code,city').single();
    if (error) { console.warn(error); return null; }
    me = data; try { const r = await sb.rpc('cw_my_code'); if (r.data) me.friend_code = r.data; } catch (e) { }
    return me;
  }
  async function getMe() { if (!(await ready)) return null; if (me) return me; const { data } = await sb.from('cw_players').select('id,name,color,country,country_code,city').eq('id', uid).maybeSingle(); me = data; if (me) { try { const r = await sb.rpc('cw_my_code'); if (r.data) me.friend_code = r.data; } catch (e) { } } return me; }

  /* ---------- runs + leaderboard ---------- */
  async function saveRun(run) {
    if (!(await ready)) return null;
    if (!me && !(await getMe())) await savePlayer(run.name || '', run.color || '#38f0c8');
    if (!me) return null;
    const { data, error } = await sb.from('cw_runs').insert({ player_id: uid, mode: run.mode, score: run.score, countries: run.countries, pct: run.pct, best_streak: run.best, rank: run.rank || 1, players: run.players || 1 }).select().single();
    if (error) { console.warn(error); return null; } return data;
  }
  async function leaderboard(scope, period, mode) {
    if (!(await ready)) return { rows: [], me: null };
    const { data, error } = await sb.rpc('cw_leaderboard', { p_scope: scope, p_period: period, p_mode: mode || 'solo' });
    if (error) { console.warn(error); return { rows: [], me: null }; }
    const rows = data || []; const mine = rows.find(r => r.player_id === uid) || null;
    return { rows, me: mine };
  }
  async function myRank(period, mode) {
    if (!(await ready)) return null;
    const { data } = await sb.rpc('cw_my_rank', { p_period: period, p_mode: mode || 'solo' });
    return data && data[0] ? data[0] : null;
  }
  async function addFriend(code) {
    if (!(await ready)) return { ok: false };
    const { data, error } = await sb.rpc('cw_befriend', { p_code: String(code || '').trim().toUpperCase() });
    if (error) return { ok: false, error: error.message }; const f0 = Array.isArray(data) ? data[0] : data; const f = f0 ? { id: f0.friend_id, name: f0.friend_name, color: f0.friend_color } : null; return { ok: !!f, friend: f };
  }
  async function friends() {
    if (!(await ready)) return [];
    const { data } = await sb.rpc('cw_friends'); return data || [];
  }

  /* ---------- realtime room ---------- */
  function room(code, presenceInit, handlers) {
    // one peer per open tab (not per account): lets two tabs of the same browser join one room, e.g. for testing
    const peerId = uid + '.' + Math.random().toString(36).slice(2, 7);
    if (handlers.onPeer) handlers.onPeer(peerId);
    const ch = sb.channel('cw-room-' + code.toLowerCase(), { config: { broadcast: { self: false, ack: false }, presence: { key: peerId } } });
    const subs = {};
    const api = {
      peer: peerId,
      emit(topic, data) { try { const p = ch.send({ type: 'broadcast', event: topic, payload: Object.assign({}, data, { from: peerId }) }); if (p && p.catch) p.catch(() => { }); } catch (e) { } },
      presence(patch) { pres = Object.assign({}, pres, patch); try { const p = ch.track(pres); if (p && p.catch) p.catch(() => { }); } catch (e) { } },
      peers() { const st = ch.presenceState(); const out = []; for (const k in st) { const p = st[k][0]; if (p) out.push({ peer: k, presence: p, isMe: k === peerId }); } return out; },
      leave() { try { sb.removeChannel(ch); } catch (e) { } },
    };
    let pres = Object.assign({}, presenceInit);
    for (const topic of handlers.topics) ch.on('broadcast', { event: topic }, ({ payload }) => { if (!payload || payload.from === peerId) return; handlers.onMsg(topic, { peer: payload.from, data: payload }); });
    ch.on('presence', { event: 'sync' }, () => handlers.onPeers(api.peers()));
    ch.on('presence', { event: 'join' }, ({ newPresences }) => handlers.onJoin && handlers.onJoin(newPresences));
    return new Promise((resolve) => {
      let done = false;
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { try { await ch.track(pres); } catch (e) { } if (!done) { done = true; resolve(api); } }
        else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !done) { done = true; resolve(null); }
      });
      setTimeout(() => { if (!done) { done = true; resolve(null); } }, 8000);
    });
  }
  async function roomAvailable() { return await ready; }

  /* ---------- TTS (commentator) ---------- */
  const ttsMem = new Map();
  let ttsDisabled = false;
  async function tts(text, lang) {
    if (!(await ready) || ttsDisabled) return null;
    const key = lang + '|' + text; if (ttsMem.has(key)) return ttsMem.get(key);
    const p = (async () => {
      try {
        const { data, error } = await sb.functions.invoke('tts', { body: { text, lang } });
        if (error || !data || !data.url) { const st = error && error.context && error.context.status; if (st === 503) ttsDisabled = true; return null; }
        return data.url;
      } catch (e) { return null; }
    })();
    ttsMem.set(key, p); const r = await p; if (!r) ttsMem.delete(key); return r;
  }
  async function ttsStatus() { if (!(await ready)) return false; try { const { data } = await sb.functions.invoke('tts', { body: { ping: true } }); return !!(data && data.ok); } catch (e) { return false; } }

  return { ready, get uid() { return uid; }, get sb() { return sb; }, locate, savePlayer, getMe, saveRun, leaderboard, myRank, addFriend, friends, room, roomAvailable, tts, ttsStatus };
})();

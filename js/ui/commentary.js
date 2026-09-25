/* Pro BBALL Coach — the broadcast booth (PBC.Commentary).
 * Two announcers call the live game: a play-by-play voice (the calls) and a color analyst (context, stats,
 * personalities, runs, playoff stakes). Lines are built from the engine's events and the live box score, shown as
 * captions by the TV graphics package and spoken with text-to-speech:
 *  - Browser voices (Web Speech API): picks the most natural voices the device has (Edge "Online (Natural)" neural
 *    voices, Apple Premium/Enhanced voices, Google voices) and gives each announcer a distinct voice, rate and pitch.
 *    Utterances stay short (Chrome cuts long ones), voices load asynchronously (voiceschanged) and every utterance
 *    has a watchdog in case onend never fires.
 *  - Optional premium AI voices (OpenAI gpt-4o-mini-tts with announcer "instructions", or ElevenLabs) with the
 *    player's own API key, kept only in this browser's localStorage. Audio for a possession's calls is requested as
 *    soon as the possession starts (the engine already knows what will happen), so it is ready when the play is.
 *    Any failure falls back to the browser voices. */
(function () {
  'use strict';
  const PBC = window.PBC;
  const U = PBC.U;

  const pick = a => a[Math.floor(Math.random() * a.length)];
  const chance = p => Math.random() < p;
  const TTS_KEY = 'pbc_tts_cloud';

  function loadCloud() { try { return JSON.parse(localStorage.getItem(TTS_KEY) || 'null') || { provider: 'off' }; } catch (e) { return { provider: 'off' }; } }
  function saveCloud(c) { try { localStorage.setItem(TTS_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------ voices (Web Speech)
  const MALE = /\b(guy|andrew|brian|christopher|eric|roger|steffan|davis|tony|jason|ryan|thomas|george|david|mark|alex|daniel|aaron|fred|evan|nathan|tom|oliver|arthur|gordon|lee|rishi|james|william|liam|connor|male)\b/i;
  const FEMALE = /\b(aria|jenny|ava|emma|michelle|sonia|libby|samantha|nicky|zoe|allison|susan|karen|moira|tessa|victoria|serena|ana|female|joanna|salli|kimberly|kendra|ivy|amy|emily)\b/i;
  function voiceScore(v) {
    const n = v.name || '';
    let s = 0;
    if (/natural/i.test(n)) s += 100;
    if (/neural/i.test(n)) s += 90;
    if (/premium/i.test(n)) s += 85;
    if (/enhanced/i.test(n)) s += 75;
    if (/siri/i.test(n)) s += 70;
    if (/google/i.test(n)) s += 55;
    if (/^(alex|daniel|samantha|aaron|nicky|evan|nathan|zoe|jamie)\b/i.test(n)) s += 45;
    if (/microsoft/i.test(n) && !/natural/i.test(n)) s += 20;
    if (/^en[-_]us/i.test(v.lang)) s += 12; else if (/^en[-_](gb|au|ca|ie)/i.test(v.lang)) s += 6;
    if (/multilingual/i.test(n)) s -= 4;
    if (/(novelty|whisper|bells|bubbles|cellos|zarvox|trinoids|boing|jester|organ|superstar|bad news|good news|wobble|albert|hysterical)/i.test(n)) s -= 200;
    if (v.localService === false) s += 3;
    return s;
  }
  function genderOf(v) { const n = v.name || ''; return MALE.test(n) ? 'm' : FEMALE.test(n) ? 'f' : '?'; }

  const BOOTH = {
    men: { pbp: 'Marv Delaney', color: 'Reggie Knox', gender: 'm' },
    women: { pbp: 'Ann Kessler', color: 'Tasha Monroe', gender: 'f' },
  };

  // Premium voice catalogue (defaults first). OpenAI recommends marin and cedar for the best quality.
  // ElevenLabs "default" voices are shared by every account; the settings screen can also load the account's own.
  const CLOUD = {
    openai: {
      name: 'OpenAI',
      models: [['gpt-4o-mini-tts', 'gpt-4o-mini-tts (steerable, recommended)']],
      voices: [['cedar', 'Cedar ★', 'm'], ['marin', 'Marin ★', 'f'], ['ash', 'Ash', 'm'], ['onyx', 'Onyx', 'm'], ['echo', 'Echo', 'm'],
        ['verse', 'Verse', 'm'], ['ballad', 'Ballad', 'm'], ['fable', 'Fable', 'm'], ['coral', 'Coral', 'f'], ['nova', 'Nova', 'f'],
        ['shimmer', 'Shimmer', 'f'], ['sage', 'Sage', 'f'], ['alloy', 'Alloy', 'f']],
      defaults: { m: ['cedar', 'ash'], f: ['marin', 'coral'] },
      keyHint: 'sk-...',
    },
    elevenlabs: {
      name: 'ElevenLabs',
      models: [['eleven_flash_v2_5', 'Flash v2.5 (fastest, cheapest)'], ['eleven_multilingual_v2', 'Multilingual v2 (richest quality)'], ['eleven_v3', 'Eleven v3 (most expressive)']],
      voices: [['nPczCjzI2devNBz1zQrb', 'Brian (deep, American)', 'm'], ['iP95p4xoKVk53GoZ742B', 'Chris (casual, American)', 'm'],
        ['TX3LPaxmHKxFdv7VOQHJ', 'Liam (young, American)', 'm'], ['pNInz6obpgDQGcFmaJgB', 'Adam (deep, American)', 'm'],
        ['TxGEqnHWrfWFTfGW9XjX', 'Josh (deep, American)', 'm'], ['29vD33N1CtxCmqQRPOHJ', 'Drew (American)', 'm'],
        ['5Q0t7uMcjvnagumLfvZi', 'Paul (reporter, American)', 'm'], ['JBFqnCBsd6RMkjVDRZzb', 'George (warm, British)', 'm'],
        ['cgSgspJ2msm6clMCkdW9', 'Jessica (lively, American)', 'f'], ['XrExE9yKIg1WjnnlVkGX', 'Matilda (warm, American)', 'f'],
        ['EXAVITQu4vr4xnSDxMaL', 'Sarah (news, American)', 'f'], ['pMsXgVXv3BLzUgSXRplE', 'Serena (calm, American)', 'f'],
        ['LcfcDJNUP1GQjkzn1xUU', 'Emily (clear, American)', 'f'], ['pFZP5JQG7iQjIQuC4Bku', 'Lily (British)', 'f']],
      defaults: { m: ['nPczCjzI2devNBz1zQrb', 'iP95p4xoKVk53GoZ742B'], f: ['cgSgspJ2msm6clMCkdW9', 'XrExE9yKIg1WjnnlVkGX'] },
      keyHint: 'xi-api-key',
    },
  };

  /** read a failed response into a short message a player can act on */
  function cloudErrorText(status, body) {
    let msg = '';
    try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error)) || (j.detail && (j.detail.message || j.detail)) || j.message || ''; } catch (e) { msg = body || ''; }
    msg = String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 160);
    if (status === 401 || status === 403) return 'The service did not accept that API key' + (msg ? ` (${msg})` : '.');
    if (status === 429) return 'The service says you are over your rate or credit limit' + (msg ? ` (${msg})` : '.');
    if (status === 402) return 'Your account is out of credit' + (msg ? ` (${msg})` : '.');
    return `Voice request failed (${status})${msg ? ': ' + msg : ''}`;
  }
  function netErrorText(e) {
    return e && /fetch|network|load/i.test(String(e.message || e)) ? 'Could not reach the voice service. Check your internet connection (some browsers block requests from pages opened as local files; if so, open the game from a local web server).' : String((e && e.message) || e);
  }
  /** the account's own ElevenLabs voices: [{ id, label, gender }] */
  function listElevenVoices(key) {
    return fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key, Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(cloudErrorText(r.status, t)); }), e => { throw new Error(netErrorText(e)); })
      .then(j => (j.voices || []).map(v => {
        const lb = v.labels || {};
        const bits = [lb.description || lb.descriptive, lb.accent].filter(Boolean).join(', ');
        return { id: v.voice_id, label: `${v.name}${bits ? ' (' + bits + ')' : ''}${v.category && v.category !== 'premade' ? ' · ' + v.category : ''}`, gender: /female|woman/i.test(lb.gender || '') ? 'f' : /male|man/i.test(lb.gender || '') ? 'm' : '?' };
      }));
  }

  function create(host) {
    const S = host.S, g = host.g, teams = host.teams, stakes = host.stakes;
    const st = S.settings;
    const L = g.L;
    const booth = BOOTH[L.key] || BOOTH.men;
    const B = {
      enabled: st.commentary !== false, voice: st.voice !== false, speed: 2, paused: false, unlocked: false,
      queue: [], speaking: null, lastLineAt: 0, since: 0, destroyed: false,
      voices: [], vPbp: null, vColor: null, keep: [], cloud: loadCloud(), cache: new Map(), actx: null,
      said: {}, runSaid: 0, lastPossColor: 0, possN: 0, lastSub: -9, milestones: {}, foulNoted: {}, lastInjury: 0,
    };

    // ---------------------------------------------------------- helpers
    const T = teams, nick = i => T[i].name, city = i => T[i].city;
    const full = i => `${city(i)} ${nick(i)}`;
    const arena = i => (PBC.UI && PBC.UI.teamArena ? PBC.UI.teamArena(T[i]) : T[i].arena || '');
    const pc = id => { for (const Tm of g.t) { const c = Tm.players.find(x => x.id === id); if (c) return c; } return null; };
    const pl = id => (id != null && S.players[id]) || null;
    const last = id => { const p = pl(id); return p ? p.last : 'he'; };
    const pron = id => { const p = pl(id); const f = p && p.gender === 'f'; return { he: f ? 'she' : 'he', He: f ? 'She' : 'He', his: f ? 'her' : 'his', him: f ? 'her' : 'him' }; };
    const score = sc => `${sc[0]} to ${sc[1]}`;
    const lead = (sc) => {
      const d = sc[0] - sc[1];
      if (d === 0) return `We're tied at ${sc[0]}`;
      const i = d > 0 ? 0 : 1;
      return `${nick(i)} ${chance(0.5) ? 'lead' : 'up'} ${Math.max(sc[0], sc[1])} to ${Math.min(sc[0], sc[1])}`;
    };
    const periodWord = p => (p <= L.periods ? ['first', 'second', 'third', 'fourth', 'fifth'][p - 1] + ' quarter' : (p - L.periods > 1 ? 'the ' + (p - L.periods) + ' overtime' : 'overtime'));
    const clockWords = sec => {
      sec = Math.max(0, Math.round(sec));
      if (sec < 60) return `${sec} seconds`;
      const m = Math.floor(sec / 60), s = sec % 60;
      return s ? `${m} ${s < 10 ? 'oh ' + s : s}` : `${m} minute${m > 1 ? 's' : ''}`;
    };
    const statLine = c => {
      if (!c) return '';
      const s = c.st, reb = s.orb + s.drb;
      const parts = [`${s.pts} point${s.pts === 1 ? '' : 's'}`];
      if (reb >= 6) parts.push(`${reb} boards`);
      if (s.ast >= 5) parts.push(`${s.ast} assists`);
      return parts.join(', ');
    };
    const seasonAvg = id => { const p = pl(id); const s = p && PBC.Stats.season(p, S.season, false); return s && s.gp >= 3 ? s : null; };
    const persona = id => { const p = pl(id); return p && PBC.Persona ? PBC.Persona.of(p) : 'quiet'; };
    const blurb = id => { const p = pl(id); return p && PBC.Persona ? PBC.Persona.blurb(p) : ''; };
    const star = i => U.maxBy(g.t[i].players, c => (c.p.ovr || 0) + (g.t[i].strat.goTo1 === c.id ? 8 : 0));
    const intensity = () => (stakes.playoff ? stakes.level : 0);
    const chatty = () => ({ light: 0.45, normal: 0.8, full: 1.15 }[st.booth || 'normal']);
    const periodOf = P => (P && P.period) || g.period;

    // ---------------------------------------------------------- voices
    function refreshVoices() {
      if (!('speechSynthesis' in window)) return;
      const all = window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      B.voices = all.slice().sort((a, b) => voiceScore(b) - voiceScore(a));
      const want = booth.gender;
      const byId = id => B.voices.find(v => (v.voiceURI || v.name) === id);
      const pref = B.voices.filter(v => genderOf(v) === want);
      const pool = pref.length ? pref : B.voices;
      B.vPbp = (st.voicePbp && byId(st.voicePbp)) || pool[0] || B.voices[0] || null;
      const others = pool.filter(v => v !== B.vPbp);
      B.vColor = (st.voiceColor && byId(st.voiceColor)) || others.find(v => voiceScore(v) >= voiceScore(B.vPbp || {}) - 60) || others[0] || B.vPbp;
    }
    if ('speechSynthesis' in window) {
      refreshVoices();
      try { window.speechSynthesis.addEventListener('voiceschanged', refreshVoices); } catch (e) { window.speechSynthesis.onvoiceschanged = refreshVoices; }
    }

    // ---------------------------------------------------------- premium cloud voices (optional)
    const INSTR = {
      pbp: 'You are an energetic, professional NBA play-by-play announcer calling a live game on national TV. Natural broadcast cadence, quick and crisp, excitement rising with the action. Never robotic.',
      color: 'You are the color analyst on a national NBA TV broadcast, a former player: conversational, confident, relaxed, a little funny, reacting like a real person watching the game.',
      hype: 'Deliver this call with huge, genuine excitement, like the biggest play of the night on a national broadcast.',
    };
    function cloudOn() { const c = B.cloud; return c && c.provider && c.provider !== 'off' && c.key; }
    function cloudVoice(speaker) {
      const c = B.cloud, set = (CLOUD[c.provider] || CLOUD.openai).defaults, gen = booth.gender;
      const custom = speaker === 'pbp' ? c.voicePbp : c.voiceColor;
      if (custom) return custom;
      const list = set[gen] || set.m;
      return speaker === 'pbp' ? list[0] : list[1] || list[0];
    }
    function actx() {
      if (B.actx) return B.actx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { B.actx = new AC(); } catch (e) { return null; }
      return B.actx;
    }
    function fetchCloud(line) {
      const c = B.cloud;
      const key = `${c.provider}|${cloudVoice(line.who)}|${line.hype ? 1 : 0}|${line.text}`;
      if (B.cache.has(key)) return B.cache.get(key);
      const ctx = actx();
      if (!ctx) return null;
      let req;
      if (c.provider === 'elevenlabs') {
        const model = c.model || 'eleven_flash_v2_5', v3 = /v3/.test(model);
        // v3 takes audio tags for delivery and only the preset stability values (0 creative, 0.5 natural, 1 robust)
        const text = v3 && line.hype ? '[excited] ' + line.text : line.text;
        const vs = v3 ? { stability: line.hype ? 0 : 0.5, similarity_boost: 0.75 } : { stability: line.hype ? 0.25 : 0.4, similarity_boost: 0.75, style: line.hype ? 0.7 : 0.35, use_speaker_boost: true };
        req = fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cloudVoice(line.who))}?output_format=mp3_44100_128`, {
          method: 'POST', headers: { 'xi-api-key': c.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: model, voice_settings: vs }),
        });
      } else {
        req = fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST', headers: { Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: c.model || 'gpt-4o-mini-tts', voice: cloudVoice(line.who), input: line.text, instructions: INSTR[line.who] + (line.hype ? ' ' + INSTR.hype : ''), response_format: 'mp3' }),
        });
      }
      const p = req.then(r => r.ok ? r.arrayBuffer() : r.text().then(t => { throw new Error(cloudErrorText(r.status, t)); }), e => { throw new Error(netErrorText(e)); })
        .then(buf => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej)))
        .then(ab => { entry.buf = ab; return ab; })
        .catch(e => { entry.err = e; B.lastCloudError = e.message || String(e); B.cloudErrors = (B.cloudErrors || 0) + 1; if (B.cloudErrors === 1) console.warn('Premium voice request failed, using browser voices:', B.lastCloudError); return null; });
      const entry = { p, buf: null, err: null };
      B.cache.set(key, entry);
      if (B.cache.size > 240) B.cache.delete(B.cache.keys().next().value);
      return entry;
    }

    // ---------------------------------------------------------- queue & playback
    /** queue a line. who: 'pbp' | 'color'; pri 1..10; ttl seconds of real time; hype = excited delivery */
    function say(who, text, o) {
      if (!text || !B.enabled || B.destroyed) return;
      o = o || {};
      const pri = o.pri || 4;
      // fast playback: only the big moments survive
      if (B.speed >= 8 && pri < 9) return;
      if (B.speed >= 4 && pri < 7) return;
      text = String(text).replace(/\s+/g, ' ').replace(/[🔥🎯🏀💥]/g, '').trim();
      const line = { who, text, pri, hype: !!o.hype, at: performance.now(), ttl: (o.ttl || 6) * 1000, dur: estDur(text, who), wait: o.wait || 1400 };
      if (cloudOn() && B.voice) line.cloud = fetchCloud(line);
      // keep the queue short: a new important call replaces stale filler
      B.queue = B.queue.filter(l => l.pri >= pri - 2 || performance.now() - l.at < 1200);
      B.queue.push(line);
      B.queue.sort((a, b) => b.pri - a.pri || a.at - b.at);
      if (B.queue.length > 3) B.queue.length = 3;
      // a big call cuts off low-priority chatter
      if (B.speaking && pri >= 8 && B.speaking.pri <= 4) stopSpeaking();
      pump();
    }
    function estDur(text, who) { const words = text.split(' ').length; return Math.max(0.9, words / (who === 'pbp' ? 3.1 : 2.7)) * 1000 + 250; }
    function stopSpeaking() {
      const s = B.speaking;
      B.speaking = null;
      if (s && s.src) { try { s.src.stop(); } catch (e) { /* ignore */ } }
      if ('speechSynthesis' in window && s && s.utter) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
      if (host.au) host.au.duck(false);
    }
    function pump() {
      if (B.speaking || B.paused || !B.queue.length || B.destroyed) return;
      const now = performance.now();
      let line = null;
      while (B.queue.length) {
        const l = B.queue.shift();
        if (now - l.at <= l.ttl) { line = l; break; }
      }
      if (!line) return;
      // natural breathing room between speakers
      if (now - B.lastLineAt < 220) { B.queue.unshift(line); setTimeout(pump, 240); return; }
      B.speaking = line;
      line.start = now;
      if (host.bc && host.bc.caption) host.bc.caption(line.who === 'pbp' ? booth.pbp : booth.color, line.text, line.who, line.dur);
      const done = () => {
        if (B.speaking !== line) return;
        B.speaking = null; B.lastLineAt = performance.now();
        if (host.au) host.au.duck(false);
        setTimeout(pump, 60);
      };
      const speakBrowser = () => {
        if (!B.voice || !('speechSynthesis' in window) || !B.unlocked) { setTimeout(done, line.dur); return; }
        const u = new SpeechSynthesisUtterance(line.text);
        const v = line.who === 'pbp' ? B.vPbp : B.vColor;
        if (v) { u.voice = v; u.lang = v.lang; }
        const same = B.vPbp === B.vColor;
        u.rate = line.who === 'pbp' ? (line.hype ? 1.14 : 1.06) : 0.98;
        u.pitch = line.who === 'pbp' ? (line.hype ? 1.08 : 1.0) : (same ? 0.82 : 0.95);
        u.volume = Math.min(1, (st.volume == null ? 0.7 : st.volume) + 0.3);
        line.utter = u;
        B.keep.push(u); if (B.keep.length > 8) B.keep.shift(); // Chrome drops onend if the utterance is garbage collected
        u.onend = done; u.onerror = done;
        if (host.au) host.au.duck(true);
        try { window.speechSynthesis.speak(u); } catch (e) { done(); return; }
        setTimeout(done, line.dur * 1.9 + 2500); // watchdog: onend sometimes never fires
      };
      const c = line.cloud;
      if (c && B.voice && B.unlocked) {
        const playBuf = buf => {
          const ctx = actx();
          if (!ctx || !buf) { speakBrowser(); return; }
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          const s = ctx.createBufferSource(), gn = ctx.createGain();
          gn.gain.value = Math.min(1, (st.volume == null ? 0.7 : st.volume) + 0.3);
          s.buffer = buf; s.connect(gn); gn.connect(ctx.destination);
          line.src = s;
          s.onended = done;
          if (host.au) host.au.duck(true);
          s.start();
          setTimeout(done, buf.duration * 1000 + 1500);
        };
        if (c.buf) playBuf(c.buf);
        else if (c.err) speakBrowser();
        else {
          // wait a moment for the audio; a late line falls back to the browser voice
          let settled = false;
          c.p.then(buf => { if (settled) return; settled = true; if (buf) playBuf(buf); else speakBrowser(); });
          setTimeout(() => { if (!settled) { settled = true; speakBrowser(); } }, line.wait);
        }
      } else speakBrowser();
    }

    // ---------------------------------------------------------- call libraries
    function shotSetup(ev) {
      const n = last(ev.shooter);
      if (ev.kind === 'catch_shoot' && ev.pts === 3) return pick([`${n} for three`, `Kick out to ${n}, three-point try`, `${n}, catch and shoot`, `Swing to ${n} in the corner`]).replace('in the corner', ev.zone === 'c3' ? 'in the corner' : 'on the wing');
      if (ev.pts === 3) return pick([`${n}, pull-up three`, `${n} rises from deep`, `${n} from downtown`, `${n} launches from way out`]);
      if (ev.kind === 'stepback') return pick([`${n}, step-back`, `${n} creates space`]);
      if (ev.kind === 'fadeaway') return pick([`${n}, turnaround fadeaway`, `${n} fading`]);
      if (ev.kind === 'hook') return `${n}, hook shot`;
      if (ev.kind === 'floater') return `${n}, floater in the lane`;
      if (ev.kind === 'pullup' || ev.kind === 'jumper') return pick([`${n}, pull-up jumper`, `${n} from the elbow`, `${n} for two`, `${n} in the mid-range`]);
      return '';
    }
    function madeCall(sh, ev) {
      const n = last(sh.shooter);
      const k = sh.kind;
      const big = intensity() > 0.8;
      if (k === 'dunk') return pick([`${n} throws it down!`, `Oh, ${n} with the hammer!`, `${n} flushes it!`, `Slam dunk, ${n}!`, `${n} rises and throws it down!`, `Get out of the way, ${n} dunks it!`]);
      if (k === 'alley') return pick([`Alley-oop! ${n} slams it home!`, `Lob to ${n}, oh what a finish!`, `Up top, and ${n} throws it down!`]);
      if (k === 'tip') return pick([`${n} tips it in`, `Put back by ${n}`, `${n} cleans it up`]);
      if (k === 'layup' || k === 'reverse') return pick([`${n} lays it in`, `${n} finishes at the rim`, `${n} to the basket, good`, k === 'reverse' ? `${n} with the reverse, beautiful` : `${n} scoops it in`, `Nice take by ${n}`]);
      if (k === 'floater') return pick([`${n} floats it in`, `Floater, good`, `Soft touch by ${n}`]);
      if (k === 'hook') return pick([`Hook shot, good`, `${n} with the jump hook, got it`]);
      if (k === 'heave') return `From half court... ${n}... ARE YOU KIDDING ME?`;
      if (sh.pts === 3) return big ? pick(['BANG!', 'GOT IT! What a shot!', 'Nothing but the bottom of the net!', 'Money!']) : pick(['Got it!', 'Bang!', 'Money!', 'Splash!', 'Good!', 'Nothing but net!', 'Knocks it down!', `${n} drills it!`]);
      return pick(['Good.', 'Got it.', 'Money.', `${n} knocks it down.`, 'Hits it.', 'Nice shot.']);
    }
    function missCall(sh) {
      if (sh.blocked) return pick([`Rejected by ${last(sh.blocker)}!`, `Oh, ${last(sh.blocker)} sends it away!`, `Blocked! ${last(sh.blocker)}!`, `Get that out of here! ${last(sh.blocker)} with the block!`]);
      if (sh.kind === 'dunk' || sh.kind === 'alley') return pick([`Oh, ${pron(sh.shooter).he} missed the dunk!`, 'Off the back iron on the dunk!', `${last(sh.shooter)} tried to throw it down, off the rim!`]);
      if (sh.pts === 3) return pick(['No good.', 'Off the rim.', 'Front rim.', 'In and out!', 'Long.', 'Short.', 'Rattles out.']);
      return pick(['No good.', 'Off the mark.', 'Won\'t go.', 'Rims out.', 'Can\'t get it to fall.']);
    }

    // ---------------------------------------------------------- color library
    function colorAfterScore(ev, P, sc) {
      const sh = ev.shotEvent || {};
      const c = pc(sh.shooter);
      if (!c) return null;
      const n = last(sh.shooter), pr = pron(sh.shooter);
      const pts = c.st.pts;
      // milestones
      const ms = [40, 30, 20].find(m => pts >= m && pts - sh.pts < m);
      if (ms && !B.milestones[c.id + ':' + ms]) {
        B.milestones[c.id + ':' + ms] = 1;
        return pick([`That's ${pts} for ${n} tonight. ${pr.He} has been unstoppable.`, `${n} is up to ${pts}. They have no answer for ${pr.him}.`, `${pts} points for ${n}, and ${pr.he} is not done.`]);
      }
      if (sh.kind === 'dunk' || sh.kind === 'alley') {
        return pick([`Watch the explosion there. ${n} was up and through before anybody could rotate.`, `That's a statement. The whole building felt that one.`, `You just don't leave the lane open against ${n}.`, `${n} ${blurb(sh.shooter)}.`, `That's the kind of play that changes the energy in a game.`]);
      }
      if (sh.andOne) return pick([`And the foul! That's a tough finish through the contact.`, `Strong. ${pr.He} went right into the chest and still finished.`]);
      if (sh.pts === 3 && c.st.tpm >= 4 && chance(0.6)) return pick([`${c.st.tpm} threes for ${n}. When ${pr.he} is feeling it like this, you have to run ${pr.him} off the line.`, `${n} is ${c.st.tpm} for ${c.st.tpa} from deep. That's a problem.`]);
      if (sh.assist != null && chance(0.3)) { const a = pc(sh.assist); if (a && a.st.ast >= 5) return pick([`Great vision by ${a.last}. That's assist number ${a.st.ast}.`, `${a.last} is running the show tonight, ${a.st.ast} dimes already.`]); }
      if (chance(0.22)) { const b = blurb(sh.shooter); if (b) return `${n}, ${b}.`; }
      if (chance(0.25) && c.st.pts >= 10) return `${n} has ${statLine(c)}.`;
      return null;
    }
    /** hot underdogs, cold favorites and upsets brewing (said once, at halftime or after the third) */
    function storyOfTheNight(bx, sc) {
      if (B.said.story) return false;
      const fg = i => { const t = bx.teams[i]; return t.fga ? Math.round(t.fgm / t.fga * 100) : 0; };
      const strength = i => PBC.League.teamStrength(S, T[i].id);
      const gap = strength(0) - strength(1);
      const dog = gap >= 4 ? 1 : gap <= -4 ? 0 : -1;
      let line = null;
      if (g.magic != null && fg(g.magic) >= 50) {
        const m = g.magic;
        line = pick([`${nick(m)} cannot miss tonight. ${fg(m)} percent from the field. When a team gets this hot, the talent gap goes out the window.`,
          `Everything is going in for ${nick(m)}. ${fg(m)} percent shooting. This is one of those nights.`]);
      } else if (g.offNight != null && fg(g.offNight) <= 42) {
        const o = g.offNight;
        line = pick([`${nick(o)} just cannot buy a bucket. ${fg(o)} percent from the field. You do not see that from them very often.`,
          `Open looks are not falling for ${nick(o)}. ${fg(o)} percent shooting. Sometimes it is just that kind of night.`]);
      } else if (dog >= 0 && sc[dog] > sc[1 - dog]) {
        line = pick([`Nobody expected this. ${nick(dog)} are playing loose, and ${nick(1 - dog)} look rattled.`,
          `${nick(dog)} came in as big underdogs and they are the ones in control. Stunning stuff so far.`]);
      }
      if (!line) return false;
      B.said.story = 1;
      say('color', line, { pri: 8, ttl: 12 });
      return true;
    }
    function runCheck(sc) {
      const run = g.run || {};
      if (run.pts >= 8 && run.pts !== B.runSaid && run.team >= 0) {
        B.runSaid = run.pts;
        const i = run.team;
        if (run.pts >= 12) return pick([`That's a ${run.pts} to nothing run for the ${nick(i)}. Somebody has to stop the bleeding.`, i === 0 ? `${run.pts} straight points for ${nick(i)}. This building is rocking.` : `${run.pts} straight for ${nick(i)}. They have taken the crowd right out of it.`]);
        return pick([`${nick(i)} on an ${run.pts} to nothing run.`, `That's ${run.pts} unanswered for ${nick(i)}.`, `${nick(i)} have ripped off ${run.pts} straight.`]);
      }
      if (run.pts < 8) B.runSaid = 0;
      return null;
    }

    // ---------------------------------------------------------- public API
    const api = {
      unlock() {
        B.unlocked = true;
        if (B.actx && B.actx.state === 'suspended') B.actx.resume().catch(() => {});
      },
      intro(silent) {
        const i0 = 0, i1 = 1;
        const stn = PBC.League.standings(S);
        const rec = i => { const r = stn[T[i].id]; return r && r.gp ? `${r.w} and ${r.l}` : ''; };
        const an = arena(i0);
        const where = an ? (an.toLowerCase().includes(String(city(i0)).toLowerCase()) ? an : `${an} in ${city(i0)}`) : city(i0);
        if (silent) return;
        say('pbp', pick([`Good evening everybody, and welcome to ${where}.`, `Hello again everyone, we are live from ${where}.`, `Welcome in to ${where}, what a night for basketball.`]), { pri: 9, ttl: 12 });
        if (stakes.playoff) {
          const sw = stakes.seriesW;
          let s = '';
          if (stakes.playIn) s = `It's the Play-In Tournament, and ${stakes.elimination ? 'the loser goes home.' : 'the winner is in the playoffs.'}`;
          else {
            s = `Game ${stakes.gameNum} of the ${stakes.roundName}. `;
            s += sw[0] === sw[1] ? `Series tied at ${sw[0]}.` : `${nick(sw[0] > sw[1] ? 0 : 1)} lead the series ${Math.max(sw[0], sw[1])} games to ${Math.min(sw[0], sw[1])}.`;
          }
          say('pbp', s, { pri: 9, ttl: 14 });
          if (stakes.game7) say('color', pick(['Game 7. The two best words in sports. Everything you have, you leave out there tonight.', 'It does not get any bigger than this. Win and advance, lose and go home.']), { pri: 9, ttl: 16 });
          else if (stakes.elimination) {
            const close = stakes.clinch[0] ? 0 : 1;
            say('color', `${nick(close)} can close it out tonight. The other side's season is on the line, so expect their best punch.`, { pri: 8, ttl: 16 });
          } else say('color', pick(['Playoff basketball. Every possession matters now, and you will feel the physicality right away.', 'This is where the intensity goes up a notch. Tighter rotations, stars playing heavy minutes.']), { pri: 7, ttl: 16 });
        } else {
          say('pbp', `The ${nick(i1)}${rec(i1) ? ', ' + rec(i1) + ',' : ''} visiting the ${nick(i0)}${rec(i0) ? ' at ' + rec(i0) : ''}.`, { pri: 8, ttl: 14 });
        }
        const s0 = star(0), s1 = star(1);
        if (s0 && s1) {
          const a0 = seasonAvg(s0.id), a1 = seasonAvg(s1.id);
          const line = a0 && a1 ? `All eyes on ${s0.last}, averaging ${(a0.pts / a0.gp).toFixed(1)} a night, and ${s1.last} at ${(a1.pts / a1.gp).toFixed(1)}.` : `The matchup to watch: ${s0.name} against ${s1.name}.`;
          say('color', line, { pri: 7, ttl: 18 });
          const pe = persona(s0.id);
          if (chance(0.7)) say('color', `${s0.last}${pe === 'cocky' || pe === 'showman' ? ' loves the big stage' : pe === 'cold' ? ' is ice cold in big moments' : pe === 'leader' ? ' runs everything for this team' : ' sets the tone for this group'}. ${pick(['Should be a good one.', 'Let us get it going.', 'Here we go.'])}`, { pri: 5, ttl: 20 });
        }
      },
      onPossession(P) {
        B.possN++;
        // set calls, occasional scene setting between trips
        if (P.play && P.play !== 'transition' && P.setName && chance(0.12 * chatty())) say('pbp', pick([`They'll run ${P.setName.toLowerCase()}.`, `${nick(P.off)} into their half-court set.`, `${P.setName.toLowerCase()} for ${nick(P.off)}.`]), { pri: 2, ttl: 4 });
        const per = periodOf(P);
        // late game situations
        // (a Game Impact Moment possession has no end score until the shot is taken)
        const es = P.endScore || g.score;
        if (per >= L.periods && P.clockStart <= 130 && P.clockStart > 20 && !B.said['late' + per] && Math.abs(es[0] - es[1]) <= 12) {
          B.said['late' + per] = 1;
          say('pbp', `Under ${P.clockStart > 60 ? 'two minutes' : 'a minute'} to go in ${per > L.periods ? 'overtime' : 'the fourth'}.`, { pri: 6, ttl: 5 });
        }
        // playoff stakes reminders in crunch time
        if (stakes.elimination && per >= L.periods && P.clockStart <= 90 && !B.said.stakesLate) {
          B.said.stakesLate = 1;
          const close = stakes.clinch[0] && !stakes.clinch[1] ? 0 : stakes.clinch[1] && !stakes.clinch[0] ? 1 : -1;
          say('color', close >= 0 ? `${nick(close)} are a couple of stops away from closing this series out.` : 'Season on the line for both teams. This is why you play the game.', { pri: 7, ttl: 6 });
        }
      },
      onEvent(ev, P, sc) {
        if (!B.enabled) return;
        sc = sc || g.score;
        const per = periodOf(P);
        switch (ev.type) {
          case 'jump_ball': say('pbp', pick([`${last(ev.jumpers && ev.jumpers[0])} and ${last(ev.jumpers && ev.jumpers[1])} for the tip, and we are underway.`, `Here's the tip... ${nick(ev.winner)} control it.`]), { pri: 7, ttl: 4 }); break;
          case 'shot': {
            if (ev.pending) break;
            const setup = shotSetup(ev);
            if (setup && chance(0.55 * chatty())) say('pbp', setup + '...', { pri: 5, ttl: 1.6 });
            if (ev.made === false) {
              const mc = missCall(ev);
              if (ev.blocked) say('pbp', mc, { pri: 8, ttl: 3, hype: true });
              else if (chance(0.5 * chatty())) say('pbp', mc, { pri: 4, ttl: 2.2 });
              if (ev.blocked && chance(0.6)) say('color', pick([`Great timing by ${last(ev.blocker)}. ${pron(ev.blocker).He} stayed vertical and just erased it.`, `You don't bring that weak stuff in here!`, `${last(ev.blocker)} protecting the rim. That's ${pc(ev.blocker) ? pc(ev.blocker).st.blk : 1} blocks tonight.`]), { pri: 5, ttl: 6 });
            }
            break;
          }
          case 'score': {
            const sh = ev.shotEvent || {};
            const big = sh.kind === 'dunk' || sh.kind === 'alley' || sh.kind === 'heave' || sh.andOne;
            const endClock = P && P.clockEnd != null ? P.clockEnd : 99;
            const lateClose = per >= L.periods && Math.abs(sc[0] - sc[1]) <= 3 && endClock <= 30;
            let call = madeCall(sh, ev);
            if (sh.andOne) call += pick([' And one!', ' And the foul!', ' Plus the harm!']);
            const ahead = (sc[ev.team] - sc[1 - ev.team]);
            if (per >= L.periods && endClock <= 0.6 && ahead > 0 && ahead <= sh.pts) call = pick([`${last(sh.shooter)}... AT THE BUZZER... GOOD! ${nick(ev.team)} WIN IT!`, `${last(sh.shooter)} for the win... BANG! UNBELIEVABLE!`]);
            else if (per >= L.periods && endClock <= 0.6 && ahead === 0) call = `${last(sh.shooter)} ties it at the buzzer! We are going to overtime!`;
            else if (lateClose) call += ` ${lead(sc)}!`;
            say('pbp', call, { pri: big || lateClose ? 9 : 7, ttl: 3.2, hype: big || lateClose || sh.pts === 3 && intensity() > 0.8 });
            const r = runCheck(sc);
            if (r && chance(0.9)) say('color', r, { pri: 6, ttl: 7 });
            else if (chance((big ? 0.7 : 0.28) * chatty())) { const cl = colorAfterScore(ev, P, sc); if (cl) say('color', cl, { pri: big ? 6 : 3, ttl: 7 }); }
            break;
          }
          case 'rebound': {
            if (ev.player == null) break;
            if (ev.off && chance(0.55 * chatty())) say('pbp', pick([`Offensive rebound, ${last(ev.player)}!`, `${last(ev.player)} keeps it alive!`, `Second chance for ${nick(ev.team)}.`]), { pri: 5, ttl: 2.5 });
            else if (chance(0.22 * chatty())) say('pbp', pick([`${last(ev.player)} with the board.`, `Rebound ${last(ev.player)}.`, `${last(ev.player)} cleans the glass.`]), { pri: 3, ttl: 2 });
            break;
          }
          case 'turnover': {
            if (ev.stealer) say('pbp', pick([`Stolen by ${last(ev.stealer)}!`, `${last(ev.stealer)} picks ${pron(ev.player).his} pocket!`, `Steal, ${last(ev.stealer)}, and they're off!`]), { pri: 7, ttl: 2.5, hype: true });
            else if (ev.kind === 'offensive_foul') say('pbp', pick(['Offensive foul, charge.', 'They call the charge!', 'Took the charge! Great defense.']), { pri: 6, ttl: 3 });
            else if (ev.kind === 'shot_clock') say('pbp', pick(['Shot clock violation!', 'And that is a shot clock violation. Great defense.']), { pri: 6, ttl: 3 });
            else if (chance(0.6)) say('pbp', pick([`Turnover, ${nick(ev.team)}.`, `Loose with it, ${last(ev.player)}.`, 'Traveling, they say.', `Careless pass by ${last(ev.player)}.`].filter(s => ev.kind === 'travel' || !/Traveling/.test(s))), { pri: 4, ttl: 2.5 });
            if (ev.stealer && chance(0.35 * chatty())) say('color', pick([`Jumped the passing lane. ${last(ev.stealer)} read that the whole way.`, 'Active hands. That is how you start a fast break.']), { pri: 3, ttl: 6 });
            break;
          }
          case 'foul': {
            const f = pc(ev.fouler);
            if (ev.kind === 'shooting' && chance(0.5)) say('pbp', pick([`Foul on ${last(ev.fouler)}.`, `And there is contact. ${ev.fts} shots.`, `Whistle. ${last(ev.on)} is going to the line.`]), { pri: 4, ttl: 3 });
            else if (ev.kind === 'intentional') say('pbp', pick(['They foul intentionally to stop the clock.', `Take foul on ${last(ev.fouler)}. Every second matters now.`]), { pri: 6, ttl: 3 });
            if (f && f.pf >= 4 && !B.foulNoted[f.id + ':' + f.pf] && per <= L.periods) {
              B.foulNoted[f.id + ':' + f.pf] = 1;
              say('color', f.pf >= 5 ? `That's five on ${f.last}. One more and ${pron(f.id).he} is done for the night.` : `${f.last} picks up number four. That's big foul trouble ${per <= 2 ? 'in the first half' : 'with a lot of game left'}.`, { pri: 5, ttl: 6 });
            }
            if (persona(ev.fouler) === 'hothead' && chance(0.3)) say('color', `${last(ev.fouler)} does not like that call one bit.`, { pri: 3, ttl: 5 });
            break;
          }
          case 'ft': {
            if (ev.num === 1 && ev.of >= 2 && chance(0.35 * chatty())) say('pbp', pick([`${last(ev.shooter)} at the line for ${ev.of === 3 ? 'three' : 'two'}.`, `${last(ev.shooter)} to the line.`]), { pri: 3, ttl: 2.5 });
            if (ev.num === ev.of) {
              const c = pc(ev.shooter);
              const late = per >= L.periods && P && P.clockEnd != null && P.clockEnd < 60;
              if (late) say('pbp', ev.made ? `Knocks it down. ${lead(sc)}.` : `Misses. ${lead(sc)}.`, { pri: 7, ttl: 3 });
              else if (c && chance(0.25 * chatty())) say('pbp', ev.made ? pick(['Good.', 'Both good.', 'Money at the line.']) : 'Leaves one out there.', { pri: 3, ttl: 2 });
            }
            break;
          }
          case 'timeout': {
            say('pbp', `Timeout, ${nick(ev.team)}. ${lead(sc)}.`, { pri: 6, ttl: 4 });
            const run = g.run || {};
            if (run.pts >= 6 && run.team !== ev.team) say('color', pick([`They had to call that. ${run.pts} straight points and the crowd was taking over.`, 'Smart timeout. You have to stop the momentum and settle everybody down.']), { pri: 5, ttl: 8 });
            else if (chance(0.5 * chatty())) {
              const s0 = star(ev.team);
              if (s0) say('color', `${s0.last} has ${statLine(s0)}. ${pick(['They need even more from ' + pron(s0.id).him + '.', 'Everything runs through ' + pron(s0.id).him + '.', 'Coming out of this timeout, look for ' + pron(s0.id).him + ' again.'])}`, { pri: 4, ttl: 9 });
            }
            break;
          }
          case 'sub': {
            if (per <= L.periods && B.possN - B.lastSub > 6 && chance(0.15 * chatty())) {
              B.lastSub = B.possN;
              const p = pl(ev.in);
              if (p) say('pbp', pick([`${p.last} checks in for ${nick(ev.team)}.`, `Here comes ${p.first} ${p.last} off the bench.`]), { pri: 2, ttl: 4 });
            }
            break;
          }
          case 'period_end': break;
          default: break;
        }
        // injuries noted by the engine
        const inj = g.pbp.slice(-6).find(x => x.type === 'injury' && x !== B.lastInjury);
        if (inj) { B.lastInjury = inj; say('color', 'Uh oh. That does not look good. We will keep an eye on the injury update.', { pri: 6, ttl: 8 }); }
      },
      onBreak(per) {
        const sc = g.score;
        const bx = PBC.Sim.box(g);
        if ((per === 2 || per === L.periods - 1) && storyOfTheNight(bx, sc)) { /* the booth had a bigger story to tell */ }
        const top = U.maxBy(bx.teams.flatMap(t => t.players), x => x.pts);
        if (per === 2) {
          say('pbp', `That's halftime here${arena(0) ? ' at ' + arena(0) : ''}. ${lead(sc)}.`, { pri: 9, ttl: 8 });
          const t0 = bx.teams[0], t1 = bx.teams[1];
          const fg = t => (t.fga ? Math.round(t.fgm / t.fga * 100) : 0);
          const diff = Math.abs(fg(t0) - fg(t1));
          if (diff >= 8) { const i = fg(t0) > fg(t1) ? 0 : 1; say('color', `${nick(i)} shooting ${fg(bx.teams[i])} percent from the field. That's the difference so far.`, { pri: 7, ttl: 10 }); }
          else if (Math.abs((t0.tov || 0) - (t1.tov || 0)) >= 4) { const i = t0.tov < t1.tov ? 0 : 1; say('color', `Ball security. ${nick(1 - i)} with ${bx.teams[1 - i].tov} turnovers, and ${nick(i)} are making them pay.`, { pri: 7, ttl: 10 }); }
          else if (top) say('color', `${top.name} leads everybody with ${top.pts}. The second half is going to come down to who gets the stops.`, { pri: 7, ttl: 10 });
        } else if (per >= L.periods && sc[0] === sc[1]) {
          say('pbp', pick([`We are going to overtime! Tied at ${sc[0]}!`, `Free basketball! Tied at ${sc[0]} after regulation!`]), { pri: 10, ttl: 8, hype: true });
          say('color', pick(['What a game. Legs are going to be heavy, so it is about who wants it more.', 'You could not script it any better. Five more minutes.']), { pri: 7, ttl: 10 });
        } else {
          say('pbp', `That will do it for the ${periodWord(per)}. ${lead(sc)}.`, { pri: 8, ttl: 8 });
          if (top && chance(0.8)) say('color', `${top.last} with ${top.pts} to lead all scorers.`, { pri: 5, ttl: 9 });
        }
      },
      onReplay(hl) {
        const s = hl.shot || {};
        say('pbp', pick(['Let us take another look.', 'Here it is again.', 'Watch this again.']), { pri: 6, ttl: 3 });
        let c;
        if (s.blocked) c = pick([`Look at the timing by ${last(s.blocker)}. Perfectly vertical, all ball.`, 'Pinned it! Absolutely no chance.']);
        else if (s.kind === 'dunk' || s.kind === 'alley') c = pick([`Look at the lift by ${last(s.shooter)}. Nobody wanted any part of that.`, 'Watch the help defender come over late. Too late.', `${last(s.shooter)} made that look easy. It is not easy.`]);
        else if (s.pts === 3) c = pick(['Great footwork. Squared up, high release, no hesitation.', `Watch ${last(s.shooter)} create the space. The defender had no chance.`]);
        else c = pick(['That is just great basketball.', 'Textbook.']);
        say('color', c, { pri: 6, ttl: 8 });
      },
      gimSetup(ctx) {
        say('pbp', `${ctx.situation.replace(/·/g, ',')}. Big possession coming up.`, { pri: 8, ttl: 8 });
        const o = ctx.options && ctx.options[0];
        if (o) say('color', `You have to put the ball in ${o.player}'s hands here. This is what the moment is for.`, { pri: 6, ttl: 10 });
      },
      onJump() { B.queue = []; stopSpeaking(); say('pbp', `We pick it up in crunch time. ${lead(g.score)}.`, { pri: 8, ttl: 6 }); },
      onAdjust(key, val) {
        if (!chance(0.5)) return;
        const labels = PBC.Config[{ off: 'OFFENSES', def: 'DEFENSES', tempo: 'TEMPOS', focus: 'FOCUS', crash: 'CRASH', pressure: 'PRESSURE' }[key]];
        const l = labels && labels[val] ? labels[val].label : val;
        say('color', `Looks like a change from the bench: ${String(l).toLowerCase()}. Let us see if it works.`, { pri: 4, ttl: 8 });
      },
      onFinal(box) {
        B.queue = [];
        const w = box.hs > box.as ? 0 : 1;
        const sc = [box.hs, box.as];
        let s = pick([`And that's the ballgame! The ${nick(w)} win it, ${Math.max(sc[0], sc[1])} to ${Math.min(sc[0], sc[1])}.`, `Final here: ${nick(w)} ${Math.max(sc[0], sc[1])}, ${nick(1 - w)} ${Math.min(sc[0], sc[1])}.`]);
        if (stakes.playoff && S.playoffs) {
          const sg = host.sg;
          const ser = sg.series && S.playoffs.series.find(x => x.id === sg.series);
          if (ser) {
            const wt = T[w].id;
            if (ser.done && ser.winner === wt) s += S.playoffs.champion === wt ? ` The ${nick(w)} are your champions!` : ` The ${nick(w)} win the series and move on!`;
            else if (!ser.done) { const ww = ser.hi === wt ? ser.w[0] : ser.w[1], ll = ser.hi === wt ? ser.w[1] : ser.w[0]; s += ww === ll ? ` The series is tied at ${ww}.` : ww > ll ? ` ${nick(w)} lead the series ${ww} to ${ll}.` : ` ${nick(w)} trim it to ${ll} to ${ww}.`; }
          }
        }
        say('pbp', s, { pri: 10, ttl: 14, hype: stakes.playoff });
        const pog = box.pog != null ? S.players[box.pog] : null;
        const line = pog ? box.teams.flatMap(t => t.players).find(x => x.pid === pog.id) : null;
        if (pog && line) say('color', `${pog.first} ${pog.last} was the difference: ${line.pts} points, ${line.orb + line.drb} rebounds, ${line.ast} assists. ${pick(['What a performance.', 'Took over when it mattered.', 'Just a complete game.'])}`, { pri: 9, ttl: 16 });
      },
      update() {
        if (!B.speaking && B.queue.length) pump();
      },
      /** plays a short booth intro; resolves { cloud: bool, ok: bool, error } once any premium audio has loaded */
      test() {
        B.unlocked = true;
        refreshVoices();
        stopSpeaking(); B.queue = [];
        const a = { pbp: `This is ${booth.pbp}, and it's a beautiful night for basketball.`, color: `And I'm ${booth.color}. Let's have some fun tonight.` };
        const wasEnabled = B.enabled; B.enabled = true;
        say('pbp', a.pbp, { pri: 10, ttl: 20, wait: 9000 });
        say('color', a.color, { pri: 10, ttl: 30, wait: 9000 });
        B.enabled = wasEnabled;
        if (!(cloudOn() && B.voice)) return Promise.resolve({ cloud: false, ok: true });
        const lines = B.queue.concat(B.speaking ? [B.speaking] : []).filter(l => l.cloud);
        return Promise.all(lines.map(l => l.cloud.p)).then(() => {
          const bad = lines.find(l => l.cloud.err);
          return bad ? { cloud: true, ok: false, error: bad.cloud.err.message || String(bad.cloud.err) } : { cloud: true, ok: true };
        });
      },
      lastCloudError() { return B.lastCloudError || null; },
      voiceOptions() {
        refreshVoices();
        return B.voices.slice(0, 40).map(v => ({ id: v.voiceURI || v.name, label: `${v.name} (${v.lang})${voiceScore(v) >= 85 ? ' ★' : ''}` }));
      },
      voiceHint() {
        if (cloudOn()) return `Premium AI voices are on (${(CLOUD[B.cloud.provider] || {}).name || B.cloud.provider}). Browser voices are used as a backup.`;
        if (!('speechSynthesis' in window)) return 'This browser has no speech voices. Captions still show the commentary.';
        const best = B.voices[0];
        if (!best) return 'Voices are still loading...';
        if (voiceScore(best) >= 85) return `Using natural voices: ${B.vPbp ? B.vPbp.name : ''} and ${B.vColor ? B.vColor.name : ''}.`;
        return 'Tip: Microsoft Edge has free natural-sounding neural voices (Guy, Andrew, Christopher...). On a Mac, download a Premium or Enhanced voice in System Settings, Accessibility, Spoken Content. You can also add an OpenAI or ElevenLabs key below for studio-quality AI announcers.';
      },
      cloudConfig() { return Object.assign({}, B.cloud); },
      setCloud(c) { B.cloud = Object.assign({ provider: 'off' }, c || {}); saveCloud(B.cloud); B.cache.clear(); B.cloudErrors = 0; },
      refreshVoices,
      setEnabled(b) { B.enabled = !!b; if (!b) { B.queue = []; stopSpeaking(); if (host.bc && host.bc.caption) host.bc.caption(null); } },
      setVoiceEnabled(b) { B.voice = !!b; if (!b) stopSpeaking(); },
      setSpeed(s) { B.speed = s; if (s >= 8) { B.queue = B.queue.filter(l => l.pri >= 9); } },
      setPaused(p) {
        B.paused = !!p;
        if ('speechSynthesis' in window) { try { if (p) window.speechSynthesis.pause(); else window.speechSynthesis.resume(); } catch (e) { /* ignore */ } }
        if (!p) pump();
      },
      destroy() {
        B.destroyed = true; B.queue = [];
        stopSpeaking();
        if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices); } catch (e) { /* ignore */ } }
        if (B.actx) { try { B.actx.close(); } catch (e) { /* ignore */ } }
      },
    };
    return api;
  }

  PBC.Commentary = { create, BOOTH, CLOUD, loadCloud, saveCloud, listElevenVoices };
})();

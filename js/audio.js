/* ==========================================================================
   牡丹亭 · 声音
   全部由 Web Audio 实时合成：古琴（拨弦）、笛（气声正弦）、磬（钟）、
   水声与风声（滤波噪声）。不含任何现有录音采样。
   ========================================================================== */
(function (global) {
  'use strict';

  const SCALE = {
    spring:  [293.66, 329.63, 369.99, 440.00, 493.88, 587.33], // D E F# A B D
    dream:   [220.00, 261.63, 293.66, 329.63, 392.00, 440.00], // A C D E G A
    boudoir: [196.00, 220.00, 261.63, 293.66, 329.63, 392.00], // G A C D E G
    night:   [146.83, 174.61, 196.00, 220.00, 261.63, 293.66], // D F G A C D
    dawn:    [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]  // C D E G A C
  };
  const MOOD = {
    spring:  { tempo: 0.62, pluck: 0.55, flute: 0.16, bell: 0.05, water: 0.10, cutoff: 2600 },
    dream:   { tempo: 0.86, pluck: 0.34, flute: 0.26, bell: 0.09, water: 0.05, cutoff: 2200 },
    boudoir: { tempo: 0.70, pluck: 0.48, flute: 0.10, bell: 0.04, water: 0.00, cutoff: 1900 },
    night:   { tempo: 1.05, pluck: 0.30, flute: 0.14, bell: 0.08, water: 0.16, cutoff: 1500 },
    dawn:    { tempo: 0.66, pluck: 0.40, flute: 0.22, bell: 0.07, water: 0.06, cutoff: 3000 }
  };

  const A = {
    ctx: null, master: null, music: null, sfx: null, wet: null,
    enabled: true, volume: 0.6, scene: 'spring', ready: false,
    timer: null, nextTime: 0, step: 0, lastNote: 2, mood: 0,
    noiseBuf: null, noiseSrc: null, noiseGain: null, filter: null,
    drone: null, droneGain: null, active: []
  };

  function now() { return A.ctx ? A.ctx.currentTime : 0; }

  /* ---------- 初始化 ---------- */
  function init() {
    if (A.ready) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try { A.ctx = new AC(); } catch (e) { return; }
    const ctx = A.ctx;

    A.master = ctx.createGain();
    A.master.gain.value = A.enabled ? A.volume : 0;
    A.master.connect(ctx.destination);

    // 混响：程序生成的衰减噪声脉冲
    const conv = ctx.createConvolver();
    conv.buffer = impulse(3.4, 2.6);
    A.wet = ctx.createGain(); A.wet.gain.value = 0.5;
    A.wet.connect(conv); conv.connect(A.master);

    A.music = ctx.createGain(); A.music.gain.value = 0.34;
    A.sfx = ctx.createGain(); A.sfx.gain.value = 0.5;
    A.filter = ctx.createBiquadFilter(); A.filter.type = 'lowpass';
    A.filter.frequency.value = 2400; A.filter.Q.value = 0.4;
    A.filter.connect(A.music); A.music.connect(A.master);
    A.filter.connect(A.wet);

    A.noiseBuf = noiseBuffer(4);
    buildDrone();
    A.ready = true;
    start();
  }

  function impulse(sec, decay) {
    const ctx = A.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function noiseBuffer(sec) {
    const ctx = A.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  /* ---------- 乐器 ---------- */
  function pluck(freq, time, gain, bright) {
    const ctx = A.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(bright || 2600, time);
    lp.frequency.exponentialRampToValueAtTime(420, time + 1.6);
    const o1 = ctx.createOscillator(); o1.type = 'triangle';
    const o2 = ctx.createOscillator(); o2.type = 'sine';
    o1.frequency.value = freq; o2.frequency.value = freq * 2.005;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(A.filter);
    o1.start(time); o2.start(time);
    o1.stop(time + 2.6); o2.stop(time + 2.6);
    // 轻微滑音，像按弦
    o1.frequency.setValueAtTime(freq * 1.006, time);
    o1.frequency.exponentialRampToValueAtTime(freq, time + 0.16);
  }

  function flute(freq, time, dur, gain) {
    const ctx = A.ctx;
    const g = ctx.createGain();
    const o = ctx.createOscillator(); o.type = 'sine';
    const o2 = ctx.createOscillator(); o2.type = 'triangle';
    const vib = ctx.createOscillator(); vib.frequency.value = 4.6;
    const vibG = ctx.createGain(); vibG.gain.value = freq * 0.006;
    vib.connect(vibG); vibG.connect(o.frequency); vibG.connect(o2.frequency);
    o.frequency.value = freq;
    o2.frequency.value = freq; 
    const g2 = ctx.createGain(); g2.gain.value = 0.14;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.28);
    g.gain.setValueAtTime(gain, time + dur * 0.62);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(A.filter);
    o.start(time); o2.start(time); vib.start(time);
    o.stop(time + dur + 0.05); o2.stop(time + dur + 0.05); vib.stop(time + dur + 0.05);
  }

  function bell(freq, time, gain) {
    const ctx = A.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 4.2);
    [1, 2.76, 5.4].forEach(function (m, i) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = freq * m;
      const og = ctx.createGain(); og.gain.value = i ? 0.22 / (i + 1) : 1;
      o.connect(og); og.connect(g);
      o.start(time); o.stop(time + 4.3);
    });
    g.connect(A.wet); g.connect(A.music);
  }

  function buildDrone() {
    const ctx = A.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    [1, 1.5, 2.01].forEach(function (m, i) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = 73.42 * m;
      const og = ctx.createGain(); og.gain.value = i ? 0.18 : 0.5;
      o.connect(og); og.connect(lp);
      o.start();
    });
    lp.connect(g); g.connect(A.music);
    A.drone = lp; A.droneGain = g;
    g.gain.linearRampToValueAtTime(0.055, now() + 6);
  }

  function water(on) {
    const ctx = A.ctx;
    if (!A.noiseSrc) {
      const src = ctx.createBufferSource();
      src.buffer = A.noiseBuf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(A.master);
      src.start();
      A.noiseSrc = src; A.noiseGain = g;
    }
    A.noiseGain.gain.cancelScheduledValues(now());
    A.noiseGain.gain.linearRampToValueAtTime(on ? 0.035 : 0, now() + 2.4);
  }

  /* ---------- 生成式乐句 ---------- */
  function start() {
    if (!A.ready || A.timer) return;
    A.nextTime = now() + 0.3;
    A.timer = setInterval(tick, 240);
  }

  function stop() {
    if (A.timer) { clearInterval(A.timer); A.timer = null; }
  }

  function tick() {
    if (!A.ctx || A.ctx.state !== 'running') return;
    const cfg = MOOD[A.scene] || MOOD.spring;
    while (A.nextTime < now() + 0.7) {
      schedule(A.nextTime, cfg);
      A.nextTime += cfg.tempo * (0.84 + Math.random() * 0.32);
    }
  }

  function schedule(t, cfg) {
    const scale = SCALE[A.scene] || SCALE.spring;
    A.step++;
    // 古琴：走音，多在中低音区
    if (Math.random() < cfg.pluck) {
      let idx = A.lastNote + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
      idx = Math.max(0, Math.min(scale.length - 1, idx));
      A.lastNote = idx;
      const f = scale[idx] * (Math.random() < 0.12 ? 0.5 : 1);
      pluck(f, t, 0.11 + Math.random() * 0.05, cfg.cutoff);
      // 偶尔双音，像按弦带出的泛音
      if (Math.random() < 0.18) pluck(f * 1.5, t + 0.04, 0.045, cfg.cutoff);
    }
    // 笛：长音
    if (Math.random() < cfg.flute) {
      const f = scale[3 + Math.floor(Math.random() * 3)] * (A.scene === 'night' ? 0.5 : 1);
      flute(f, t, 2.2 + Math.random() * 1.6, 0.035 + Math.random() * 0.02);
    }
    // 磬：极稀疏
    if (Math.random() < cfg.bell) bell(scale[0] * 2, t, 0.03);
    // 低音持续
    if (A.step % 9 === 0 && A.droneGain) {
      A.droneGain.gain.cancelScheduledValues(t);
      A.droneGain.gain.linearRampToValueAtTime(A.enabled ? 0.045 + Math.random() * 0.02 : 0, t + 3);
    }
  }

  /* ---------- 音效 ---------- */
  function sfx(name) {
    if (!A.ready || !A.enabled) return;
    const t = now();
    const ctx = A.ctx;
    if (name === 'tap' || name === 'select') {
      pluck(587.33, t, 0.09, 3000);
      pluck(880, t + 0.02, 0.03, 3200);
    } else if (name === 'back') {
      pluck(392, t, 0.07, 1800);
    } else if (name === 'collect') {
      bell(659.25, t, 0.10);
      bell(987.77, t + 0.18, 0.07);
    } else if (name === 'good') {
      [523.25, 659.25, 783.99].forEach(function (f, i) { bell(f, t + i * 0.1, 0.07); });
    } else if (name === 'bad') {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 196;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(A.sfx);
      o.start(t); o.stop(t + 0.55);
    } else if (name === 'brush') {
      const src = ctx.createBufferSource(); src.buffer = A.noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      src.connect(bp); bp.connect(g); g.connect(A.sfx);
      src.start(t); src.stop(t + 0.3);
    } else if (name === 'wind') {
      const src = ctx.createBufferSource(); src.buffer = A.noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1400, t + 2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 1.2);
      g.gain.linearRampToValueAtTime(0.0001, t + 3);
      src.connect(bp); bp.connect(g); g.connect(A.master);
      src.start(t); src.stop(t + 3.2);
    }
  }

  /* ---------- 控制 ---------- */
  function setScene(key) {
    if (SCALE[key]) {
      A.scene = key;
      A.lastNote = 2;
      const cfg = MOOD[key];
      if (A.filter) {
        A.filter.frequency.cancelScheduledValues(now());
        A.filter.frequency.linearRampToValueAtTime(cfg.cutoff, now() + 2);
      }
      water(cfg.water > 0.05);
    }
  }

  function setVolume(v) {
    A.volume = Math.max(0, Math.min(1, v));
    if (A.master) A.master.gain.setTargetAtTime(A.enabled ? A.volume : 0, now(), 0.15);
  }

  function setEnabled(on) {
    A.enabled = !!on;
    if (A.master) A.master.gain.setTargetAtTime(A.enabled ? A.volume : 0, now(), 0.12);
    if (on) { init(); start(); }
  }

  global.Audio2 = {
    init: init,
    scene: setScene,
    sfx: sfx,
    setVolume: setVolume,
    setEnabled: setEnabled,
    isEnabled: function () { return A.enabled; },
    suspend: function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); },
    resume: function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); },
    get ctxState() { return A.ctx ? A.ctx.state : 'none'; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

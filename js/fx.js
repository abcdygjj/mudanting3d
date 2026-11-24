/* ==========================================================================
   牡丹亭 · 粒子层
   花瓣 / 梦尘 / 浮尘 / 萤火 —— 只用 canvas 2D，随场景切换
   ========================================================================== */
(function () {
  'use strict';

  var cv = null, ctx = null, W = 0, H = 0, dpr = 1;
  var mode = 'spring', reduced = false, raf = 0, last = 0, parts = [], running = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  var PAL = {
    spring: { petals: ['#f6c9d2', '#efb0bd', '#fbe0e4', '#e9a7b6'], glow: 'rgba(255,240,214,' },
    dream:  { petals: ['#efe7ff', '#dcd2ff', '#fff4d6', '#cfd6ff'], glow: 'rgba(232,224,255,' },
    boudoir:{ petals: ['#fff5e4', '#f5e3c8', '#efe0c6'], glow: 'rgba(255,242,214,' },
    night:  { petals: ['#ffe6a8', '#ffd783', '#f6c96b'], glow: 'rgba(255,220,150,' },
    dawn:   { petals: ['#fff3d8', '#ffe7c9', '#f9dcc4'], glow: 'rgba(255,244,224,' }
  };

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || cv.parentElement.clientWidth || window.innerWidth;
    H = cv.clientHeight || cv.parentElement.clientHeight || window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makePetal() {
    return {
      k: 'petal', x: rnd(0, W), y: rnd(-H * 0.2, H),
      vx: rnd(-0.25, 0.45), vy: rnd(0.22, 0.62),
      r: rnd(2.2, 5.4), rot: rnd(0, Math.PI * 2), vr: rnd(-0.012, 0.012),
      a: rnd(0.35, 0.8), ph: rnd(0, 6.28), sw: rnd(0.4, 1.2)
    };
  }
  function makeMote() {
    return {
      k: 'mote', x: rnd(0, W), y: rnd(0, H),
      vx: rnd(-0.12, 0.12), vy: rnd(-0.35, -0.08),
      r: rnd(1.1, 3.4), a: rnd(0.25, 0.7), ph: rnd(0, 6.28), sp: rnd(0.4, 1.4)
    };
  }
  function makeDust() {
    return {
      k: 'dust', x: rnd(0, W), y: rnd(0, H),
      vx: rnd(-0.08, 0.18), vy: rnd(-0.16, 0.04),
      r: rnd(0.6, 1.9), a: rnd(0.12, 0.4), ph: rnd(0, 6.28), sp: rnd(0.2, 0.7)
    };
  }
  function makeFly() {
    return {
      k: 'fly', x: rnd(0, W), y: rnd(H * 0.35, H),
      vx: rnd(-0.2, 0.2), vy: rnd(-0.14, 0.02),
      r: rnd(1.2, 2.6), a: rnd(0.5, 0.95), ph: rnd(0, 6.28), sp: rnd(0.8, 2.0)
    };
  }

  function build() {
    parts = [];
    var n, i, pal = PAL[mode] || PAL.spring;
    if (reduced) n = 8;
    else if (mode === 'spring' || mode === 'dawn') n = 30;
    else if (mode === 'dream') n = 36;
    else if (mode === 'boudoir') n = 22;
    else n = 20;
    for (i = 0; i < n; i++) {
      var p;
      if (mode === 'spring' || mode === 'dawn') p = makePetal();
      else if (mode === 'dream') p = makeMote();
      else if (mode === 'boudoir') p = makeDust();
      else p = makeFly();
      p.color = pick(pal.petals);
      p.x = rnd(0, W); p.y = rnd(0, H);
      parts.push(p);
    }
    if (reduced) draw(0);
  }

  function draw(dt) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    var t = performance.now() / 1000;
    var pal = PAL[mode] || PAL.spring;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!reduced) {
        if (p.k === 'petal') {
          p.x += (p.vx + Math.sin(t * p.sw + p.ph) * 0.35) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > H + 20) { p.y = -20; p.x = rnd(0, W); }
          if (p.x < -30) p.x = W + 20; else if (p.x > W + 30) p.x = -20;
        } else if (p.k === 'mote') {
          p.x += (p.vx + Math.sin(t * 0.5 + p.ph) * 0.12) * dt;
          p.y += p.vy * dt;
          if (p.y < -20) { p.y = H + 20; p.x = rnd(0, W); }
          if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        } else if (p.k === 'dust') {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W); }
          if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        } else {
          p.x += (p.vx + Math.sin(t * 0.7 + p.ph) * 0.2) * dt;
          p.y += (p.vy + Math.cos(t * 0.5 + p.ph) * 0.12) * dt;
          if (p.y < H * 0.3) p.y = H + 10;
          if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        }
      }
      var alpha = p.a;
      if (p.k === 'fly' || p.k === 'mote') alpha = p.a * (0.55 + 0.45 * Math.sin(t * p.sp + p.ph));
      if (alpha <= 0.01) continue;

      if (p.k === 'petal') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4.2);
        g.addColorStop(0, pal.glow + alpha + ')');
        g.addColorStop(1, pal.glow + '0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = Math.min((ts - last) / 16.667, 3);
    last = ts;
    draw(dt);
  }

  function start() {
    if (running) return;
    running = true; last = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  var FX = {
    init: function (canvas) {
      cv = canvas;
      ctx = cv.getContext('2d');
      resize();
      build();
      if (!reduced) start();
      window.addEventListener('resize', function () {
        resize(); build();
      });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else if (!reduced) start();
      });
    },
    scene: function (key) {
      if (!PAL[key]) return;
      mode = key;
      build();
      if (!reduced) start();
    },
    reduce: function (on) {
      reduced = !!on;
      build();
      if (reduced) { stop(); draw(0); } else start();
    }
  };

  window.FX = FX;
})();

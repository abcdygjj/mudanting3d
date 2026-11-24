/* ==========================================================================
   牡丹亭 · 谜题
   五种小游戏：窗影（转格引光）、题画诗（填字）、描画（落笔时机）、
   双视角（读画）、叫画（三声连呼）。
   规则：全部可跳过；失败只给反馈，不阻断剧情。
   ========================================================================== */
(function (global) {
  'use strict';

  const root = function () { return document.getElementById('modalRoot'); };
  const el = function (tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  let seq = 0;

  /* ---------- 弹窗骨架 ---------- */
  function shell(o) {
    const wrap = el('div', 'modal');
    const id = 'pz' + (++seq);
    wrap.innerHTML =
      '<div class="modal-paper" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t">' +
        '<div class="modal-head"><div><h2 id="' + id + '-t">' + o.title + '</h2>' +
        (o.sub ? '<p class="modal-sub">' + o.sub + '</p>' : '') + '</div>' +
        '<button class="icon-btn" data-close aria-label="关闭">×</button></div>' +
        '<div class="modal-body"></div>' +
        '<div class="modal-actions"><button class="btn ghost" data-skip>' + (o.skipText || '跳过此事') + '</button>' +
        '<div class="right"><span class="hint-line" data-hint></span>' +
        '<button class="btn primary" data-next hidden>继续</button></div></div>' +
      '</div>';
    root().appendChild(wrap);
    const body = wrap.querySelector('.modal-body');
    const hint = wrap.querySelector('[data-hint]');
    const next = wrap.querySelector('[data-next]');
    const skip = wrap.querySelector('[data-skip]');
    let done = false;
    let resolveFn;
    const p = new Promise(function (r) { resolveFn = r; });

    function close(result) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      if (o.onClose) { try { o.onClose(); } catch (e) {} }
      wrap.remove();
      resolveFn(o.result || result);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close({ ok: false, skipped: true }); }
    }
    document.addEventListener('keydown', onKey, true);
    wrap.querySelector('[data-close]').addEventListener('click', function () { close({ ok: false, skipped: true }); });
    skip.addEventListener('click', function () { close({ ok: false, skipped: true }); });
    next.addEventListener('click', function () { close(o.result || { ok: true }); });

    function succeed(msg, result) {
      o.result = result || { ok: true };
      skip.hidden = true;
      hint.innerHTML = msg || '成了。';
      hint.style.color = 'var(--vermilion)';
      next.hidden = false;
      next.focus({ preventScroll: true });
      if (global.Audio2) Audio2.sfx('good');
    }
    function note(msg) { hint.textContent = msg; }

    return { wrap: wrap, body: body, hint: hint, next: next, skip: skip, p: p, close: close, succeed: succeed, note: note };
  }

  /* ==========================================================================
     一、窗影：转动九格窗棂，让光从左进、右出
     ========================================================================== */
  function latticePuzzle() {
    const s = shell({
      title: '窗影',
      sub: '光从左边进来。转动窗格，让它从右边出去。',
      skipText: '跳过（也算看过，不挡剧情）'
    });
    const dirs = [{ b: 1, d: 'M50 50 L50 0' }, { b: 2, d: 'M50 50 L100 50' },
                  { b: 4, d: 'M50 50 L50 100' }, { b: 8, d: 'M50 50 L0 50' }];
    const SOLVED = [
      [6, 10, 12],
      [9, 10, 3],
      [5, 5, 5]
    ];
    const FIXED = { '1,1': true, '2,0': true, '2,1': true, '2,2': true };
    /* 开局打乱：五个可转格各偏转 1–3 个直角（共需十一次转动） */
    const state = [[1, 3, 2], [2, 0, 1], [0, 0, 0]];
    const wrap = el('div', 'lattice-wrap');
    const side = el('div', 'lattice-side',
      '<div class="lt">窗 影</div>' +
      '<p>石桌旁的花窗漏下光来，本该在团扇上落成一小片窗棂——可如今，光在第三格就断了。</p>' +
      '<p style="color:var(--ink-3);font-size:.9em">点一格，顺时针转九十度。光只走相通的路。</p>' +
      '<p class="lattice-route">光路：左中进 → 上左 → 上中 → 上右 → 右中 → 右出。</p>' +
      '<div class="ent-exit"><span><i class="e1"></i>光从左边进</span><span><i class="e2"></i>影从右边出</span></div>');
    const grid = el('div', 'lattice');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', '九格窗棂');
    const cells = [];
    for (let r = 0; r < 3; r++) {
      cells[r] = [];
      for (let c = 0; c < 3; c++) {
        const cell = el('div', 'cell' + (FIXED[r + ',' + c] ? ' deco' : ''));
        cell.tabIndex = FIXED[r + ',' + c] ? -1 : 0;
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', '第' + (r + 1) + '行第' + (c + 1) + '格，点击转动');
        cell.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"></svg><span class="num">' + (r * 3 + c + 1) + '</span>';
        const svg = cell.querySelector('svg');
        svg.innerHTML = '<path class="path"></path><circle cx="50" cy="50" r="4.5" fill="#8c5a2f"></circle>';
        cell.addEventListener('click', function () {
          if (FIXED[r + ',' + c]) return;
          state[r][c] = (state[r][c] + 1) % 4;
          draw();
          if (global.Audio2) Audio2.sfx('tap');
          check();
        });
        cell.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); }
        });
        grid.appendChild(cell);
        cells[r][c] = cell;
      }
    }
    wrap.appendChild(grid); wrap.appendChild(side);
    s.body.appendChild(wrap);

    function rot(mask, k) {
      let m = mask;
      for (let i = 0; i < k; i++) {
        m = ((m << 1) | (m >> 3)) & 15;
      }
      return m;
    }
    function maskAt(r, c) { return rot(SOLVED[r][c], state[r][c]); }

    function draw() {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const m = maskAt(r, c);
        const path = cells[r][c].querySelector('.path');
        path.setAttribute('d', dirs.filter(function (d) { return m & d.b; }).map(function (d) { return d.d; }).join(' '));
        cells[r][c].querySelector('svg').setAttribute('viewBox', '0 0 100 100');
      }
    }

    function check() {
      if (!(maskAt(1, 0) & 8)) return false;
      const seen = {}; const q = [[1, 0]]; seen['1,0'] = 1;
      const opp = { 1: 4, 2: 8, 4: 1, 8: 2 };
      const dr = { 1: -1, 2: 0, 4: 1, 8: 0 }, dc = { 1: 0, 2: 1, 4: 0, 8: -1 };
      while (q.length) {
        const [r, c] = q.shift();
        const m = maskAt(r, c);
        dirs.forEach(function (d) {
          if (!(m & d.b)) return;
          const nr = r + dr[d.b], nc = c + dc[d.b];
          if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;
          if (!(maskAt(nr, nc) & opp[d.b])) return;
          const k = nr + ',' + nc;
          if (!seen[k]) { seen[k] = 1; q.push([nr, nc]); }
        });
      }
      if (seen['1,2'] && (maskAt(1, 2) & 2)) {
        grid.classList.add('lattice-solved');
        grid.querySelectorAll('.path').forEach(function (p) { p.classList.add('lit'); });
        cells[1][2].querySelectorAll('.path').forEach(function (p) { p.classList.add('lit'); });
        s.succeed('光穿过最后一格，落在团扇上。扇子底下，压着一张对折的花笺。');
        return true;
      }
      return false;
    }

    // 打乱：每格随机转 1-2 次，确保开局不是通的，也不至于太难
    state.forEach(function (row, r) {
      row.forEach(function (_, c) {
        if (FIXED[r + ',' + c]) return;
        state[r][c] = 1 + Math.floor(Math.random() * 2);
      });
    });
    draw();
    if (check()) {
      // 极小概率：随机后直接通了，再转一格
      state[0][0] = (state[0][0] + 1) % 4;
      draw();
    }
    s.note('光只走相通的路。转错了，再转回来就是。');
    return s.p;
  }

  /* ==========================================================================
     二、题画诗：填三个字
     ========================================================================== */
  function poemPuzzle() {
    const s = shell({
      title: POEM.title,
      sub: POEM.note + ' · 三个空，三个字。填错可以重填。',
      skipText: '跳过（画上留白也不算坏）'
    });
    const wrap = el('div', 'poem-wrap');
    const linesBox = el('div', 'poem-lines');
    const tokensBox = el('div', 'tokens');
    const noteBox = el('div', 'poem-note', '先读一遍，凭语感填。 <b>填错不会怎样。</b>');
    const filled = [null, null, null];
    let active = 0;
    let locked = false;

    POEM.lines.forEach(function (line) {
      const ln = el('div', 'poem-line');
      line.forEach(function (ch) {
        const m = ch.match(/^\{(\d)\}$/);
        if (m) {
          const slot = el('span', 'slot', '');
          slot.dataset.i = m[1];
          slot.tabIndex = 0;
          slot.setAttribute('role', 'button');
          slot.setAttribute('aria-label', '第' + (+m[1] + 1) + '个空');
          slot.addEventListener('click', function () {
            if (locked) return;
            const i = +slot.dataset.i;
            if (filled[i]) {
              filled[i] = null;
              slot.textContent = ''; slot.classList.remove('filled');
              renderTokens();
              if (global.Audio2) Audio2.sfx('back');
            }
            active = i; paint();
          });
          ln.appendChild(slot);
        } else {
          ln.appendChild(el('span', '', ch));
        }
      });
      linesBox.appendChild(ln);
    });

    POEM.tokens.forEach(function (ch, idx) {
      const t = el('button', 'token', ch);
      t.dataset.ch = ch;
      t.setAttribute('aria-label', '选字：' + ch);
      t.addEventListener('click', function () {
        if (locked || t.classList.contains('used')) return;
        let use = active;
        if (filled[use]) {
          const empty = filled.indexOf(null);
          use = empty === -1 ? use : empty;
        }
        filled[use] = ch;
        active = Math.min(2, use + 1);
        if (global.Audio2) Audio2.sfx('tap');
        paint(); renderTokens();
        if (filled.every(Boolean)) judge();
      });
      tokensBox.appendChild(t);
    });

    wrap.appendChild(linesBox); wrap.appendChild(tokensBox); wrap.appendChild(noteBox);
    s.body.appendChild(wrap);

    function paint() {
      wrap.querySelectorAll('.slot').forEach(function (slot) {
        const i = +slot.dataset.i;
        slot.textContent = filled[i] || '';
        slot.classList.toggle('filled', !!filled[i]);
        slot.classList.toggle('active', i === active && !locked);
      });
    }
    function renderTokens() {
      // 同一字只能用一次：按已填数量精确标记
      const count = {};
      filled.forEach(function (c) { if (c) count[c] = (count[c] || 0) + 1; });
      tokensBox.querySelectorAll('.token').forEach(function (t) {
        const c = count[t.dataset.ch] || 0;
        t.classList.toggle('used', c > 0);
        t.setAttribute('aria-disabled', c > 0 ? 'true' : 'false');
      });
    }

    function judge() {
      if (filled.join('') === POEM.slots.join('')) {
        locked = true;
        s.succeed('一字不差。画上的人像轻轻松了一口气。');
        wrap.querySelectorAll('.slot').forEach(function (x) { x.classList.add('filled'); });
      } else {
        s.note('读起来不太顺。再想想：春衫、旧梦、花魂。');
        if (global.Audio2) Audio2.sfx('bad');
        wrap.querySelectorAll('.slot').forEach(function (x) { x.classList.add('bad'); });
        setTimeout(function () {
          wrap.querySelectorAll('.slot').forEach(function (x) { x.classList.remove('bad'); });
          filled[0] = filled[1] = filled[2] = null;
          active = 0; paint(); renderTokens();
        }, 700);
      }
    }
    paint(); renderTokens();
    return s.p;
  }

  /* ==========================================================================
     三、描画：三笔，落在该落的地方
     ========================================================================== */
  function tracePuzzle() {
    let running = true, raf = 0;
    const s = shell({
      title: '描画',
      sub: '笔在走。等它走到该落笔的地方，点「落笔」——或按空格。',
      skipText: '跳过（画得像不像，都不要紧）',
      onClose: function () { running = false; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true); }
    });
    const wrap = el('div', 'trace-wrap');
    const canvas = el('div', 'trace-canvas',
      '<img src="assets/img/fig_du.jpg" alt="">' +
      '<svg viewBox="0 0 200 290" aria-hidden="true"></svg>' +
      '<span class="stamp">丽娘</span>');
    const right = el('div', '');
    const track = el('div', 'track', '<div class="zone"></div><div class="brush"></div>');
    const info = el('div', 'trace-info', '<span class="trace-dots"><i></i><i></i><i></i></span><span data-state>第一笔</span>');
    const tip = el('div', 'trace-tip', '不必一笔不差。差一点，也还是她。');
    const btn = el('button', 'btn primary', '落 笔');
    btn.style.marginTop = '14px';
    right.appendChild(track); right.appendChild(info); right.appendChild(tip); right.appendChild(btn);
    wrap.appendChild(canvas); wrap.appendChild(right);
    s.body.appendChild(wrap);

    const zone = track.querySelector('.zone');
    const brush = track.querySelector('.brush');
    const svg = canvas.querySelector('svg');
    const dots = info.querySelectorAll('i');
    const stateTxt = info.querySelector('[data-state]');
    let stroke = 0, pos = 0, dir = 1, speed = 0.010, last = 0;
    let zStart = 0.55, zW = 0.21;
    const paths = [
      'M60 96 C86 82 122 84 146 96',
      'M82 132 C96 146 104 168 100 196',
      'M64 210 C84 200 112 202 132 214'
    ];

    function newZone() {
      zW = Math.max(0.16, 0.26 - stroke * 0.03);
      zStart = 0.18 + Math.random() * (0.64 - zW);
      zone.style.left = (zStart * 100) + '%';
      zone.style.width = (zW * 100) + '%';
      speed = 0.0085 + stroke * 0.0022;
      stateTxt.textContent = ['第一笔', '第二笔', '第三笔'][stroke] || '收笔';
    }
    function loop(t) {
      if (!running) return;
      if (!last) last = t;
      const dt = Math.min(48, t - last); last = t;
      pos += dir * speed * (dt / 16.7);
      if (pos > 1) { pos = 1; dir = -1; }
      if (pos < 0) { pos = 0; dir = 1; }
      brush.style.left = (pos * 100) + '%';
      raf = requestAnimationFrame(loop);
    }
    function hitTest() {
      const center = zStart + zW / 2;
      return Math.abs(pos - center) <= zW / 2;
    }
    function land() {
      if (!running) return;
      if (hitTest()) {
        dots[stroke].classList.add('hit');
        drawStroke(stroke);
        stroke++;
        if (global.Audio2) Audio2.sfx('brush');
        if (stroke >= 3) {
          running = false;
          cancelAnimationFrame(raf);
          canvas.classList.add('stamped');
          s.succeed('最后一笔收了。画上的人眉目很清楚，像刚从一场很长的梦里坐起来。');
          return;
        }
        newZone();
      } else {
        dots[stroke].classList.add('miss');
        setTimeout(function () { dots[stroke].classList.remove('miss'); }, 500);
        if (global.Audio2) Audio2.sfx('bad');
        s.note('落早了，或落晚了。不急，再来一笔。');
      }
    }
    function drawStroke(i) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', paths[i]);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#3a2a1e');
      p.setAttribute('stroke-width', i === 0 ? '3.2' : '2.2');
      p.setAttribute('stroke-linecap', 'round');
      p.style.opacity = 0;
      svg.appendChild(p);
      requestAnimationFrame(function () { p.style.transition = 'opacity .5s'; p.style.opacity = 1; });
    }
    btn.addEventListener('click', land);
    function onKey(e) {
      if (e.code === 'Space') { e.preventDefault(); land(); }
    }
    document.addEventListener('keydown', onKey, true);

    newZone();
    brush.style.left = '0%';
    raf = requestAnimationFrame(loop);
    s.note('看准了再落。');
    return s.p;
  }

  /* ==========================================================================
     四、双视角：读画
     ========================================================================== */
  function dualPuzzle() {
    const s = shell({
      title: '读画',
      sub: '同一幅画，两个人读。先都看过，再回答。',
      skipText: '跳过（不读也不碍事）'
    });
    const wrap = el('div', '');
    const head = el('div', 'dual-head',
      '<button class="on" data-side="0">柳梦梅 · 读画</button>' +
      '<button data-side="1">杜丽娘 · 题画</button>');
    const body = el('div', 'dual-body');
    wrap.appendChild(head); wrap.appendChild(body);
    const q = el('div', '');
    q.style.marginTop = '18px';
    q.innerHTML = '<p style="font-family:var(--kai);letter-spacing:.1em;color:var(--vermilion);margin:0 0 8px">这四句诗，是谁写给谁的？</p>' +
      '<div data-choices style="display:flex;flex-direction:column;gap:8px"></div>';
    wrap.appendChild(q); s.body.appendChild(wrap);

    const sides = [
      {
        img: 'assets/img/item_portrait.jpg',
        tag: '梦梅读',
        html: '<span class="dt">他提着灯，把画凑近</span>' +
          '<p>画上的人立在花间，手里执一柄团扇。扇面上也画着花，花是半开的。</p>' +
          '<p>“画里春衫薄，眉间旧梦长。”——他读到这一句，停了一下。春衫薄，是画中人穿得少，还是画这画的人，心里冷？</p>' +
          '<p>“花魂随月影，一夜到君旁。”他念到“君”字，灯焰晃了晃。君是谁？写诗的人，总不会没有指望。</p>' +
          '<p style="color:var(--ink-3);font-size:.86em">他把画翻过来。背面没有字，只有一点旧墨，像一滴没落下的泪。</p>'
      },
      {
        img: 'assets/img/item_portrait.jpg',
        tag: '丽娘题',
        html: '<span class="dt">她坐在案前，写完最后一笔</span>' +
          '<p>“画里春衫薄”——写的是画上的自己。她故意画得单薄些，好像这样，就能从礼教的厚衣裳里透一口气。</p>' +
          '<p>“眉间旧梦长”——梦是旧的，人却还停在梦里。她没有写“愁”，愁字太直，她不喜欢。</p>' +
          '<p>“花魂随月影，一夜到君旁。”</p>' +
          '<p>君是谁？她写下这两个字时，窗外正好有月光。她没有答案。她只是把“也许有一个人”写进了诗里。</p>' +
          '<p style="color:var(--ink-3);font-size:.86em">春香问：小姐写给谁？她说：写给一个会来寻的人。若他不来，就当写给花。</p>'
      }
    ];
    let seen = [false, false];

    function paint(i) {
      seen[i] = true;
      head.querySelectorAll('button').forEach(function (b, k) { b.classList.toggle('on', k === i); });
      const d = sides[i];
      body.innerHTML = '<img src="' + d.img + '" alt="画像">' +
        '<div class="dual-text"><span class="dt">' + d.tag + '</span>' + d.html + '</div>';
      if (seen[0] && seen[1] && !q.dataset.on) {
        q.dataset.on = '1';
        renderChoices();
      }
    }

    function renderChoices() {
      const opts = [
        ['画师画好了，卖给买画的人。', false],
        ['丽娘写给自己，也写给将来拾到画的人。', true],
        ['柳梦梅在梦里写给梦中人的。', false]
      ];
      const box = q.querySelector('[data-choices]');
      box.innerHTML = '';
      opts.forEach(function (o) {
        const b = el('button', 'listen-opt', o[0]);
        b.style.textAlign = 'left';
        b.addEventListener('click', function () {
          if (box.dataset.done) return;
          if (o[1]) {
            box.dataset.done = '1';
            b.style.borderColor = 'var(--vermilion)';
            s.succeed('是。她写给自己，也写给一个也许永远不会来的人。所以这诗里既有自怜，也有指望。');
          } else {
            b.style.borderColor = 'rgba(156,59,46,.5)';
            b.style.opacity = .6;
            s.note('再想想：画是谁画的？诗是谁题的？');
            if (global.Audio2) Audio2.sfx('bad');
          }
        });
        box.appendChild(b);
      });
    }

    head.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        paint(+b.dataset.side);
        if (global.Audio2) Audio2.sfx('tap');
      });
    });
    paint(0);
    s.note('两页都翻过，才有得选。');
    return s.p;
  }

  /* ==========================================================================
     五、叫画：三声，不可回头
     ========================================================================== */
  function callPuzzle() {
    const s = shell({
      title: '叫画',
      sub: '对着画，叫她的名字。三声要连着，中间别停。',
      skipText: '跳过（就当没敢叫出口）',
      onClose: function () { document.removeEventListener('keydown', onKey, true); }
    });
    const wrap = el('div', 'call-wrap');
    wrap.innerHTML =
      '<div class="call-portrait"><img src="assets/img/fig_du.jpg" alt="画中女子"><span class="ring"></span></div>' +
      '<p class="call-count" data-count>—</p>' +
      '<p style="font-size:.8em;color:var(--ink-3);letter-spacing:.06em">点画，或按空格。三声之间不要超过两息。</p>';
    const btn = el('button', 'btn primary', '叫 她 的 名 字');
    btn.style.marginTop = '18px';
    wrap.appendChild(btn);
    s.body.appendChild(wrap);
    const portrait = wrap.querySelector('.call-portrait');
    const countEl = wrap.querySelector('[data-count]');
    let n = 0, last = 0, done = false;
    const marks = ['一', '二', '三'];

    function call() {
      if (done) return;
      const t = performance.now();
      if (n > 0 && t - last > 1900) {
        n = 0;
        s.note('停太久了。道姑说：三声要连着叫。');
        if (global.Audio2) Audio2.sfx('bad');
      }
      n++;
      last = t;
      if (global.Audio2) Audio2.sfx('collect');
      countEl.textContent = marks.slice(0, n).join(' · ');
      portrait.style.transform = 'scale(1.012)';
      setTimeout(function () { portrait.style.transform = ''; }, 120);
      if (n >= 3) {
        done = true;
        portrait.classList.add('lit');
        if (global.Audio2) Audio2.sfx('wind');
        s.succeed('第三声落下。灯焰直了。画上的人，眼睛像是抬了起来。');
      }
    }
    btn.addEventListener('click', call);
    portrait.addEventListener('click', call);
    function onKey(e) { if (e.code === 'Space') { e.preventDefault(); call(); } }
    document.addEventListener('keydown', onKey, true);
    s.note('第一声，她会听见。');
    return s.p;
  }

  /* ==========================================================================
     六、听曲（不是谜题，是一段可选聆听）
     ========================================================================== */
  function listen() {
    let raf = 0;
    const s = shell({
      title: '听曲',
      sub: '春香哼的调子没有词。你听见了什么，它就是什么。',
      skipText: '跳过（不听也不要紧）',
      onClose: function () { if (raf) cancelAnimationFrame(raf); }
    });
    const wrap = el('div', 'listen-wrap');
    const bars = el('div', 'listen-bars');
    for (let i = 0; i < 34; i++) bars.appendChild(document.createElement('i'));
    const opts = el('div', 'listen-opts');
    const choices = [
      ['很远的地方有人在唱', '听不清词，只觉得那声音是软的'],
      ['风穿过空亭子', '柱子之间，风绕了一下'],
      ['有人在哭，又像在笑', '分不清，也不必分清']
    ];
    let chosen = false;
    const answer = el('p', 'poem-note', '');
    choices.forEach(function (c, i) {
      const b = el('button', 'listen-opt', c[0] + '<small>' + c[1] + '</small>');
      b.addEventListener('click', function () {
        if (chosen) return;
        chosen = true;
        opts.querySelectorAll('button').forEach(function (x) { x.style.opacity = .45; });
        b.style.opacity = 1; b.style.borderColor = 'var(--vermilion)';
        const lines = [
          '“很远。”她说，“远得像是上一辈子的事。”',
          '“风。”春香说，“风什么也没带走。”',
          '“都有。”她说，“哭和笑，本来就是一回事。”'
        ];
        answer.textContent = lines[i];
        s.succeed('你听见的，就是你听见的。');
      });
      opts.appendChild(b);
    });
    wrap.appendChild(bars); wrap.appendChild(opts); wrap.appendChild(answer);
    s.body.appendChild(wrap);

    let t0 = performance.now();
    function anim(t) {
      const barsArr = bars.children;
      for (let i = 0; i < barsArr.length; i++) {
        const v = 0.12 + 0.55 * Math.abs(Math.sin((t - t0) / 900 + i * 0.7) * Math.sin((t - t0) / 2300 + i * 0.21));
        barsArr[i].style.height = (v * 100) + '%';
      }
      raf = requestAnimationFrame(anim);
    }
    raf = requestAnimationFrame(anim);
    if (global.Audio2) Audio2.sfx('wind');
    s.note('点一句，说说你听见的。');
    return s.p;
  }

  const map = { lattice: latticePuzzle, poem: poemPuzzle, trace: tracePuzzle, dual: dualPuzzle, call: callPuzzle };

  global.Puzzles = {
    open: function (kind) {
      const fn = map[kind];
      if (!fn) return Promise.resolve({ ok: true });
      return fn();
    },
    listen: listen
  };
})(window);

/* ==========================================================================
   牡丹亭 · 主程序
   流程：开始 → 章回片头 → 剧情 / 探索 → 目标达成 → 下一出 → 结局
   ========================================================================== */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const SAVE = 'mudanting.save.v2';
  const PREF = 'mudanting.prefs.v1';

  const stage = $('stage');
  const dlg = $('dialogue');
  const dlgText = $('dlgText');
  const dlgName = $('dlgName');
  const dlgRole = $('dlgRole');
  const dlgSrc = $('dlgSrc');
  const dlgHint = $('dlgHint');
  const dlgCaret = $('dlgCaret');
  const dlgChoices = $('dlgChoices');
  const portrait = $('portrait');
  const portraitImg = $('portraitImg');
  const hotspotsEl = $('hotspots');
  const objectiveEl = $('objective');
  const toastEl = $('toast');
  const journal = $('journal');
  const journalBody = $('journalBody');
  const guide = $('guide');
  const guideBody = $('guideBody');
  const settings = $('settings');
  const ending = $('ending');

  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const CN = function (n) { return NUM[n - 1] || String(n); };

  /* ---------- 状态 ---------- */
  let S = freshState();
  let prefs = loadPrefs();
  let bgFlip = 0;
  let toastTimer = 0;
  let sceneTagTimer = 0;
  let busy = false;
  let transitioning = false;
  let currentChoices = null;

  function freshState() {
    return {
      v: 2, started: false, chapter: 0, scene: 'spring', mood: null,
      images: {}, notes: {}, canon: {}, flags: {}, done: {}, met: {},
      ending: null, newItems: 0
    };
  }
  function loadPrefs() {
    const def = { font: 'md', vol: 60, sound: true, motion: false, hints: true, lantern: true };
    try {
      const p = JSON.parse(localStorage.getItem(PREF) || 'null');
      if (p && typeof p === 'object') return Object.assign(def, p);
    } catch (e) {}
    return def;
  }
  function savePrefs() {
    try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) {}
  }
  function save() {
    if (!S.started) return;
    try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {}
  }
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE) || 'null');
      if (s && s.v === 2 && typeof s.chapter === 'number') return s;
    } catch (e) {}
    return null;
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE); } catch (e) {}
  }

  /* ---------- 提示 ---------- */
  function toast(msg) {
    if (!msg) return;
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }
  function live(msg) {
    const l = $('live');
    if (l) l.textContent = msg;
  }

  /* ---------- 声音 ---------- */
  function bootAudio() {
    if (!window.Audio2) return;
    Audio2.init();
    Audio2.setVolume(prefs.vol / 100);
    Audio2.setEnabled(prefs.sound);
    Audio2.scene(S.scene);
  }
  function applySoundUI() {
    $('soundGlyph').textContent = prefs.sound ? '音' : '静';
    $('btnSound').classList.toggle('off', !prefs.sound);
    $('btnSound').setAttribute('aria-label', prefs.sound ? '关闭声音' : '打开声音');
  }

  /* ---------- 场景 ---------- */
  function setScene(key, o) {
    o = o || {};
    S.scene = key;
    const sc = SCENES[key];
    if (!sc) return;
    stage.classList.remove('scene-spring', 'scene-dream', 'scene-boudoir', 'scene-night');
    stage.classList.add('scene-' + key);
    const layers = stage.querySelectorAll('.bg');
    const cur = layers[bgFlip % 2];
    const next = layers[(bgFlip + 1) % 2];
    next.style.backgroundImage = 'url("' + sc.img + '")';
    next.classList.add('on');
    if (cur !== next) cur.classList.remove('on');
    bgFlip++;
    const tag = $('sceneTag');
    tag.querySelector('.tag-name').textContent = sc.name;
    tag.querySelector('.tag-en').textContent = sc.en;
    tag.classList.remove('hide');
    clearTimeout(sceneTagTimer);
    sceneTagTimer = setTimeout(function () { tag.classList.add('hide'); }, 4200);
    if (window.Audio2) Audio2.scene(key);
    if (window.FX) FX.scene(key);
    if (window.ThreeStage) ThreeStage.enter(key, { dawn: stage.classList.contains('dawn') });
  }
  function setMood(m) {
    S.mood = m;
    stage.classList.remove('mood-0', 'mood-1', 'mood-2');
    if (m !== null && m !== undefined) stage.classList.add('mood-' + m);
  }
  function setDawn(on) { stage.classList.toggle('dawn', !!on); if (window.ThreeStage) ThreeStage.dawn(!!on); }

  /* ---------- 章回 ---------- */
  function updateHUD(ch) {
    $('chapterNo').textContent = CN(ch.n);
    $('chapterNum').textContent = CN(ch.n);
    $('chapterName').textContent = ch.title;
  }
  function setObjective(txt) {
    objectiveEl.innerHTML = txt || '';
  }

  function chapterCard(ch) {
    return new Promise(function (resolve) {
      $('ccNo').textContent = '第' + CN(ch.n) + '出';
      $('ccTitle').textContent = ch.title;
      $('ccEpi').textContent = ch.epigraph ? '「' + ch.epigraph + '」' : '';
      $('ccNote').textContent = ch.note || '';
      const card = $('chapterCard');
      card.hidden = false;
      card.classList.remove('leaving');
      const btn = $('ccEnter');
      btn.textContent = ch.n === 1 ? '掀 帘' : '入 梦';
      const go = function () {
        btn.removeEventListener('click', go);
        bootAudio();
        card.classList.add('leaving');
        setTimeout(function () {
          card.hidden = true;
          card.classList.remove('leaving');
          resolve();
        }, 620);
      };
      btn.addEventListener('click', go);
      setTimeout(function () { btn.focus({ preventScroll: true }); }, 60);
    });
  }

  async function enterChapter(idx, replay) {
    const ch = CHAPTERS[idx];
    if (!ch) return;
    S.chapter = idx;
    S.started = true;
    S.ending = null;
    stage.classList.toggle('dawn', !!ch.dawn);
    setScene(ch.scene);
    setMood(ch.mood === null || ch.mood === undefined ? null : ch.mood);
    if (ch.dawn) setDawn(true);
    updateHUD(ch);
    setObjective('');
    hotspotsEl.innerHTML = '';
    dlg.hidden = true;
    toggleLantern(ch.key === 'shihua' && prefs.lantern);
    save();
    await chapterCard(ch);
    busy = true;
    try { await runSteps(ch.intro); } catch (err) { console.error(err); }
    busy = false;
    hideDialogue();
    if (ch.key === 'huanhun') return;
    if (replay) {
      // 续梦：已完成的探索保留，不再重复触发结局
    }
    spawnHotspots();
    setObjective(objectiveText(ch));
    if (goalMet(ch)) { completeChapter(); }
    else { hintFresh(); }
  }

  function objectiveText(ch) {
    const d = S.done[ch.key] || {};
    const need = (ch.goal && ch.goal.seen) || [];
    const got = need.filter(function (id) { return d[id]; }).length;
    let tail = '';
    if (got > 0 && got < need.length) {
      const left = need.filter(function (id) { return !d[id]; }).map(function (id) {
        const h = (ch.hotspots || []).find(function (x) { return x.id === id; });
        return h ? h.label : id;
      });
      tail = '　<span class="obj-left">还差：' + left.join('、') + '</span>';
    }
    return ch.objective + (need.length ? '　<span style="opacity:.7">（' + got + ' / ' + need.length + '）</span>' : '') + tail;
  }

  function goalMet(ch) {
    if (!ch.goal || !ch.goal.seen || !ch.goal.seen.length) return false;
    const d = S.done[ch.key] || {};
    return ch.goal.seen.every(function (id) { return !!d[id]; });
  }

  async function completeChapter() {
    if (transitioning) return;
    transitioning = true;
    busy = true;
    hotspotsEl.style.pointerEvents = 'none';
    const ch = CHAPTERS[S.chapter];
    await runSteps(ch.outro || []);
    busy = false;
    hotspotsEl.innerHTML = '';
    dlg.hidden = true;
    if (S.chapter < CHAPTERS.length - 1) {
      transitioning = false;
      await enterChapter(S.chapter + 1);
    } else {
      transitioning = false;
    }
  }

  /* ---------- 剧情推进 ---------- */
  async function runSteps(steps) {
    if (!steps || !steps.length) return;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (st.n != null) {
        await present({ narr: true, text: st.n });
      } else if (st.say) {
        const picked = await present({
          who: st.say, text: st.text, src: st.src, choices: st.choices
        });
        if (picked) {
          if (picked.set) Object.keys(picked.set).forEach(function (k) { S.flags[k] = picked.set[k]; });
          if (picked.ending) S.lastEnding = picked.ending;
          save();
          if (picked.do) await runSteps(picked.do);
        }
      } else if (st.do) {
        await doStep(st);
      }
    }
  }

  function applySet(set) {
    if (!set) return;
    Object.keys(set).forEach(function (k) { S.flags[k] = set[k]; });
    save();
  }

  async function doStep(st) {
    const key = st.do;
    if (key === 'collect') {
      const it = IMAGES[st.id];
      if (it && !S.images[st.id]) {
        S.images[st.id] = 1; S.newItems++;
        toast('收入札记 · ' + it.t);
        if (window.Audio2) Audio2.sfx('collect');
        save(); markDot();
      }
    } else if (key === 'canon') {
      const c = CANON[st.id];
      if (c && !S.canon[st.id]) {
        S.canon[st.id] = 1; S.newItems++;
        toast('记下曲词 · ' + c.src.replace('《牡丹亭·', '').replace('》', ''));
        if (window.Audio2) Audio2.sfx('collect');
        save(); markDot();
      }
    } else if (key === 'note') {
      const n = NOTES[st.id];
      if (n && !S.notes[st.id]) {
        S.notes[st.id] = 1; S.newItems++;
        toast('札记 · ' + n.t);
        save(); markDot();
      }
    } else if (key === 'flag') {
      S.flags[st.k] = st.v;
      save();
      refreshHotspots();
    } else if (key === 'mood') {
      setMood(st.v);
    } else if (key === 'scene') {
      setScene(st.to);
    } else if (key === 'puzzle') {
      try { await Puzzles.open(st.kind); } catch (err) { console.error(err); }
      if (window.Audio2) Audio2.sfx('tap');
    } else if (key === 'listen') {
      try { await Puzzles.listen(); } catch (err) { console.error(err); }
    } else if (key === 'end') {
      showEnding(S.lastEnding || 'C');
    } else if (key === 'chapter') {
      await enterChapter(st.n || 0);
    }
  }

  function hideDialogue() {
    if (window.ThreeStage) ThreeStage.clearSpeaker();
    if (dlg.hidden) return;
    dlg.classList.add('leaving');
    setTimeout(function () {
      if (dlg.classList.contains('leaving')) {
        dlg.hidden = true;
        dlg.classList.remove('leaving');
      }
    }, 320);
  }

  /* ---------- 对白 ---------- */
  let presentSeq = 0, presentTimer = null;
  function present(opts) {
    return new Promise(function (resolve) {
      const mySeq = ++presentSeq;
      if (presentTimer) { clearInterval(presentTimer); presentTimer = null; }
      const ch = opts.who ? CHARS[opts.who] : null;
      if (ch && !S.met[opts.who]) { S.met[opts.who] = 1; save(); }
      dlg.hidden = false;
      dlg.classList.remove('leaving');
      if (window.ThreeStage) ThreeStage.speaker(opts.who || null, !!opts.narr);
      dlg.classList.toggle('narrator', !!opts.narr);
      portrait.classList.toggle('empty', !ch || !ch.fig);
      if (ch && ch.fig) {
        if (portraitImg.getAttribute('src') !== ch.fig) portraitImg.src = ch.fig;
        portraitImg.alt = ch.name;
      }
      dlgName.textContent = opts.narr ? '旁白' : (ch ? ch.name : '');
      dlgRole.textContent = opts.narr ? '' : (ch ? ch.role : '');
      dlgSrc.textContent = opts.src ? '原文 · ' + opts.src : '';
      dlgChoices.innerHTML = '';
      dlgHint.textContent = '';
      dlgCaret.classList.remove('on');
      dlgText.textContent = '';
      live((opts.narr ? '' : (ch ? ch.name + '：' : '')) + opts.text);

      const chars = Array.from(opts.text || '');
      let i = 0;
      let typing = true;
      let finished = false;
      let timer = null;
      const reduce = prefs.motion || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

      function cleanup() {
        clearInterval(timer);
        document.removeEventListener('keydown', onKey, true);
        dlg.removeEventListener('click', onDlgClick);
        currentChoices = null;
        dlgChoices.innerHTML = '';
      }
      function finish(res, choice) {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(choice || null);
      }
      function showTyped() {
        typing = false;
        clearInterval(timer);
        dlgText.textContent = chars.join('');
        caretOn();
      }
      function caretOn() {
        if (opts.choices && opts.choices.length) {
          buildChoices();
          dlgHint.textContent = '选一个';
          dlgCaret.classList.remove('on');
        } else {
          dlgCaret.classList.add('on');
          dlgHint.textContent = '轻点继续';
        }
      }
      function buildChoices() {
        currentChoices = opts.choices;
        opts.choices.forEach(function (c, k) {
          const b = document.createElement('button');
          b.className = 'choice';
          b.dataset.k = ['一', '二', '三', '四', '五'][k] || String(k + 1);
          b.textContent = c.t;
          b.addEventListener('click', function (e) {
            e.stopPropagation();
            if (finished) return;
            if (window.Audio2) Audio2.sfx('tap');
            finish(null, c);
          });
          dlgChoices.appendChild(b);
        });
      }
      function onDlgClick(e) {
        if (e.target.closest('.choice')) return;
        if (typing) { showTyped(); return; }
        if (opts.choices && opts.choices.length) return;
        if (window.Audio2) Audio2.sfx('tap');
        finish(null, null);
      }
      function onKey(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          if (typing) { e.preventDefault(); showTyped(); return; }
          if (opts.choices && opts.choices.length) return;
          e.preventDefault();
          if (window.Audio2) Audio2.sfx('tap');
          finish(null, null);
        } else if (/^[1-5]$/.test(e.key) && currentChoices) {
          const c = currentChoices[+e.key - 1];
          if (c) { e.preventDefault(); if (window.Audio2) Audio2.sfx('tap'); finish(null, c); }
        }
      }

      dlg.addEventListener('click', onDlgClick);
      document.addEventListener('keydown', onKey, true);

      if (reduce) {
        dlgText.textContent = chars.join('');
        typing = false;
        caretOn();
      } else {
        timer = setInterval(function () {
          if (mySeq !== presentSeq) { clearInterval(timer); return; }
          if (i < chars.length) {
            dlgText.textContent += chars[i++];
          } else {
            showTyped();
          }
        }, 26);
        presentTimer = timer;
      }
    });
  }


  /* 场景图使用 cover 裁切；把图内百分比换算成舞台坐标，保证任意比例下热点对准画面 */
  const SCENE_AR = { spring:2048/1152, dream:2048/1152, boudoir:2048/1152, night:2048/1152 };
  function placeHotspot(node, x, y) {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    if (window.ThreeStage && ThreeStage.active()) {
      const p = ThreeStage.project(S.scene, node.dataset.id, x, y);
      if (p) {
        node.style.display = '';
        node.style.left = p.x.toFixed(1) + 'px';
        node.style.top = p.y.toFixed(1) + 'px';
      } else {
        node.style.display = 'none';
      }
      return;
    }
    const ar = SCENE_AR[S.scene] || 1.56;
    const scale = Math.max(W / ar, H);
    const dw = ar * scale, dh = scale;
    const left = (W - dw) / 2, top = (H - dh) / 2;
    node.style.left = ((left + (x / 100) * dw) / W * 100).toFixed(2) + '%';
    node.style.top = ((top + (y / 100) * dh) / H * 100).toFixed(2) + '%';
  }
  function layoutHotspots() {
    const nodes = hotspotsEl.children;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.dataset.x) placeHotspot(n, parseFloat(n.dataset.x), parseFloat(n.dataset.y));
    }
  }
  /* ---------- 探索 ---------- */
  function spawnHotspots() {
    const ch = CHAPTERS[S.chapter];
    const need = (ch.goal && ch.goal.seen) || [];
    const dc = S.done[ch.key] || {};
    const leftCount = need.filter(function (id) { return !dc[id]; }).length;
    hotspotsEl.innerHTML = '';
    hotspotsEl.style.pointerEvents = 'none';
    (ch.hotspots || []).forEach(function (h) {
      if (h.requires && h.requires.flag && !S.flags[h.requires.flag]) return;
      const d = S.done[ch.key] || {};
      const node = document.createElement('div');
      const isGoal = leftCount === 1 && need.indexOf(h.id) >= 0 && !d[h.id];
      node.className = 'hs' + (d[h.id] ? ' done' : '') + (isGoal ? ' goal' : '')
        + (h.x < 10 ? ' edge-l' : '') + (h.x > 90 ? ' edge-r' : '');
      node.dataset.id = h.id;
      node.dataset.x = h.x;
      node.dataset.y = h.y;
      placeHotspot(node, h.x, h.y);
      node.setAttribute('role', 'button');
      node.tabIndex = 0;
      node.setAttribute('aria-label', (d[h.id] ? '已看过：' : '可查看：') + h.label);
      node.innerHTML = '<span class="diamond"></span><span class="ring"></span><span class="hs-label">' + h.label + '</span>';
      if (h.id === 'butterfly') node.insertAdjacentHTML('beforeend', '<i class="dream-butterfly" aria-hidden="true"></i>');
      node.addEventListener('click', function () { onHotspot(h); });
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHotspot(h); }
      });
      hotspotsEl.appendChild(node);
    });
    if (window.ThreeStage) {
      ThreeStage.hotspots([].map.call(hotspotsEl.children, function (n) {
        return { id: n.dataset.id, done: n.classList.contains('done') };
      }));
    }
    hotspotsEl.style.pointerEvents = 'auto';
  }

  let rzTimer = 0;
  window.__layoutHS = layoutHotspots;
  window.addEventListener('resize', function () {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(layoutHotspots, 120);
  });

  function refreshHotspots() {
    if (busy) return;
    const ch = CHAPTERS[S.chapter];
    if (!ch || !ch.hotspots || !ch.hotspots.length) return;
    spawnHotspots();
  }

  async function onHotspot(h) {
    if (busy || transitioning) return;
    if (h.requires && h.requires.flag && !S.flags[h.requires.flag]) return;
    busy = true;
    hotspotsEl.style.pointerEvents = 'none';
    dlg.hidden = false;
    try { await runSteps(h.run || []); } catch (err) { console.error(err); }
    const ch = CHAPTERS[S.chapter];
    if (!S.done[ch.key]) S.done[ch.key] = {};
    if (!S.done[ch.key][h.id]) {
      S.done[ch.key][h.id] = 1;
      save();
    }
    busy = false;
    hideDialogue();
    if (ch.key === 'huanhun') return;
    spawnHotspots();
    setObjective(objectiveText(ch));
    if (goalMet(ch)) {
      await completeChapter();
    }
  }

  function hintFresh() {
    if (!prefs.hints) return;
    const ch = CHAPTERS[S.chapter];
    const d = S.done[ch.key] || {};
    hotspotsEl.querySelectorAll('.hs').forEach(function (n) {
      if (!d[n.dataset.id]) {
        n.classList.add('fresh');
        setTimeout(function () { n.classList.remove('fresh'); }, 4600);
      }
    });
  }

  /* ---------- 提灯 ---------- */
  function toggleLantern(on) {
    stage.classList.toggle('lantern', !!on);
    if (on) {
      stage.style.setProperty('--mx', '50%');
      stage.style.setProperty('--my', '58%');
      revealNear(innerWidth / 2, innerHeight * 0.58);
    }
  }
  function revealNear(x, y) {
    if (!stage.classList.contains('lantern')) return;
    hotspotsEl.querySelectorAll('.hs').forEach(function (n) {
      const r = n.getBoundingClientRect();
      const dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y;
      n.classList.toggle('revealed', Math.sqrt(dx * dx + dy * dy) < 210);
    });
  }
  stage.addEventListener('pointermove', function (e) {
    if (!stage.classList.contains('lantern')) return;
    stage.style.setProperty('--mx', e.clientX + 'px');
    stage.style.setProperty('--my', e.clientY + 'px');
    revealNear(e.clientX, e.clientY);
  }, { passive: true });
  stage.addEventListener('pointerdown', function (e) {
    if (!stage.classList.contains('lantern')) return;
    stage.style.setProperty('--mx', e.clientX + 'px');
    stage.style.setProperty('--my', e.clientY + 'px');
    revealNear(e.clientX, e.clientY);
  }, { passive: true });

  /* ---------- 札记 ---------- */
  function openJournal(tab) {
    renderJournal(tab || 'image');
    journal.hidden = false;
    requestAnimationFrame(function () { journal.classList.add('open'); });
    S.newItems = 0;
    markDot();
    setTimeout(function () { journal.focus(); }, 200);
  }
  function closeJournal() {
    journal.classList.remove('open');
    setTimeout(function () { journal.hidden = true; }, 460);
  }
  function markDot() {
    $('journalDot').hidden = S.newItems <= 0;
  }

  function renderJournal(tab) {
    journal.querySelectorAll('#journalTabs .tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    let html = '';
    if (tab === 'image') {
      html = '<div class="j-grid">';
      Object.keys(IMAGES).forEach(function (id) {
        const it = IMAGES[id];
        const got = !!S.images[id];
        html += '<div class="j-card' + (got ? '' : ' locked') + '">' +
          (got ? '<img src="' + it.img + '" alt="' + it.t + '">' : '<div class="jc-ph">？</div>') +
          '<div><div class="jc-t">' + it.t + '</div>' +
          '<div class="jc-d">' + (got ? it.d : '') + '</div></div></div>';
      });
      html += '</div>';
    } else if (tab === 'canon') {
      const keys = Object.keys(CANON);
      const got = keys.filter(function (k) { return S.canon[k]; });
      if (!got.length) html = '<p class="guide-p">还没有在园中听见曲词。看见特别的句子时，会自己记下来。</p>';
      got.forEach(function (k) {
        const c = CANON[k];
        html += '<div class="canon-card"><div class="canon-q">' + c.q + '</div>' +
          '<div class="canon-src">' + c.src + ' · 原文</div>' +
          '<div class="canon-note">' + c.d + '</div></div>';
      });
      html += '<p class="guide-p" style="color:var(--ink-3);font-size:.74em">已录 ' + got.length + ' / ' + keys.length + ' 段。标注「原文」者为汤显祖原文；其余为题画诗、花笺小句与对白，均属游戏原创。</p>';
    } else if (tab === 'person') {
      Object.keys(PEOPLE).forEach(function (k) {
        const p = PEOPLE[k];
        const got = !!S.met[k];
        const fig = CHARS[k] && CHARS[k].fig;
        html += '<div class="person-row" style="' + (got ? '' : 'opacity:.45') + '">' +
          (fig ? '<img src="' + fig + '" alt="' + p.n + '" style="object-position:top center">' :
            '<div style="width:64px;height:96px;border:1px solid rgba(120,92,58,.3);display:grid;place-items:center;font-family:var(--kai);font-size:1.6em;color:var(--ink-3);flex:none">道</div>') +
          '<div><span class="pr-n">' + p.n + '</span><span class="pr-r">' + p.r + '</span>' +
          '<div class="pr-d">' + (got ? p.d + '<br><span style="color:var(--ink-3);font-size:.9em">说话方式：' + p.voice + '</span>' : '尚未相遇。') + '</div></div></div>';
      });
    } else if (tab === 'note') {
      const keys = Object.keys(NOTES);
      const got = keys.filter(function (k) { return S.notes[k]; });
      if (!got.length) html = '<p class="guide-p">札记还是空的。看看园子里的东西，它们会留下字。</p>';
      got.forEach(function (k) {
        const n = NOTES[k];
        html += '<div class="note-row"><div class="nr-t">' + n.t + '</div><div class="nr-d">' + n.d + '</div></div>';
      });
    }
    journalBody.innerHTML = html;
    journalBody.scrollTop = 0;
    const nImg = Object.keys(S.images).length, nCanon = Object.keys(S.canon).length, nNote = Object.keys(S.notes).length;
    $('journalCount').textContent = '意象 ' + nImg + ' · 曲词 ' + nCanon + ' · 札记 ' + nNote;
  }

  /* ---------- 导读 ---------- */
  function openGuide() {
    renderGuide('story');
    guide.hidden = false;
    requestAnimationFrame(function () { guide.classList.add('open'); });
    setTimeout(function () { guide.focus(); }, 200);
  }
  function closeGuide() {
    guide.classList.remove('open');
    setTimeout(function () { guide.hidden = true; }, 460);
  }
  function renderGuide(tab) {
    guide.querySelectorAll('#guideTabs .tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    let html = '';
    if (tab === 'story') {
      html += '<div class="guide-h">一个梦，五出戏</div>';
      GUIDE.story.forEach(function (p) { html += '<p class="guide-p">' + p + '</p>'; });
      html += '<p class="guide-p" style="color:var(--ink-3);font-size:.76em">不想读也没关系。所有你需要知道的，都会在园子里遇见。</p>';
    } else if (tab === 'people') {
      html += '<div class="guide-h">人物之间</div>' +
        '<div class="rel-list">' +
        '<div class="rel"><b>杜丽娘</b><i></i>杜宝之女<i></i>柳梦梅的梦中人</div>' +
        '<div class="rel"><b>春香</b><i></i>丽娘的侍女<i></i>替她开门、守秘的人</div>' +
        '<div class="rel"><b>杜宝</b><i></i>南安太守<i></i>以规矩爱女儿的父亲</div>' +
        '<div class="rel"><b>陈最良</b><i></i>塾师<i></i>教她读诗的人</div>' +
        '<div class="rel"><b>石道姑</b><i></i>紫阳宫<i></i>交代还魂规矩的人</div>' +
        '</div>';
      GUIDE.people.forEach(function (p) {
        html += '<div class="person-row"><div><span class="pr-n">' + p[0] + '</span><span class="pr-r">' + p[1] + '</span>' +
          '<div class="pr-d">' + p[2] + '</div></div></div>';
      });
    } else if (tab === 'lines') {
      GUIDE.lines.forEach(function (p) {
        html += '<div class="guide-h">' + p[0] + '</div><p class="guide-p">' + p[1] + '</p>';
      });
      html += '<div class="canon-card" style="margin-top:18px"><div class="canon-q">原来姹紫嫣红开遍，似这般都付与断井颓垣。</div>' +
        '<div class="canon-src">《牡丹亭·游园》【皂罗袍】 · 原文</div>' +
        '<div class="canon-note">这是全剧最著名的唱段之一。园子越美，越显出无人看顾的荒凉。你在第一章走过牡丹亭时，会听见它。</div></div>';
    } else if (tab === 'allusion') {
      GUIDE.allusion.forEach(function (p) {
        html += '<div class="guide-h">' + p[0] + '</div><p class="guide-p">' + p[1] + '</p>';
      });
    }
    guideBody.innerHTML = html;
    guideBody.scrollTop = 0;
  }

  /* ---------- 设置 ---------- */
  function openSettings() {
    settings.hidden = false;
    syncSettings();
  }
  function closeSettings() { settings.hidden = true; }
  function syncSettings() {
    $('setFont').querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.v === prefs.font);
    });
    $('setVolume').value = prefs.vol;
    $('volVal').textContent = prefs.vol;
    setSwitch($('setMotion'), !prefs.motion ? false : true);
    setSwitch($('setHints'), prefs.hints);
    setSwitch($('setLamp'), prefs.lantern);
  }
  function setSwitch(node, on) {
    node.classList.toggle('on', !!on);
    node.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  function applyFont(f) {
    prefs.font = f;
    document.body.classList.remove('font-sm', 'font-md', 'font-lg');
    document.body.classList.add('font-' + f);
    savePrefs();
  }
  function applyMotion() { document.body.classList.toggle('reduce-motion', !!prefs.motion); }

  function confirmBox(title, text, okText) {
    return new Promise(function (resolve) {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = '<div class="modal-paper" style="width:min(460px,92vw)">' +
        '<div class="modal-head"><h2>' + title + '</h2></div>' +
        '<p class="guide-p" style="margin:10px 0 4px">' + text + '</p>' +
        '<div class="modal-actions"><button class="btn ghost" data-no>再想想</button>' +
        '<button class="btn primary" data-yes>' + (okText || '确定') + '</button></div></div>';
      $('modalRoot').appendChild(wrap);
      wrap.querySelector('[data-yes]').addEventListener('click', function () { wrap.remove(); resolve(true); });
      wrap.querySelector('[data-no]').addEventListener('click', function () { wrap.remove(); resolve(false); });
    });
  }

  /* ---------- 结局 ---------- */
  function showEnding(key) {
    const e = ENDINGS[key] || ENDINGS.C;
    S.ending = key;
    S.started = false;
    clearSave();
    ending.querySelector('.ending-bg').style.backgroundImage =
      'url("' + (key === 'B' ? SCENES.night.img : key === 'A' ? SCENES.boudoir.img : SCENES.spring.img) + '")';
    $('endingKicker').textContent = e.kicker;
    $('endingTitle').textContent = e.title;
    $('endingText').innerHTML = e.text.map(function (p) { return '<p>' + p + '</p>'; }).join('');
    ending.hidden = false;
    dlg.hidden = true;
    hotspotsEl.innerHTML = '';
    if (window.Audio2) { Audio2.scene('dawn'); Audio2.sfx('good'); }
    live('结局：' + e.title);
  }

  /* ---------- 开始 / 继续 ---------- */
  function startNew() {
    S = freshState();
    S.started = true;
    clearSave();
    $('start').hidden = true;
    $('game').hidden = false;
    $('ending').hidden = true;
    bootAudio();
    if (window.matchMedia && window.matchMedia('(orientation: portrait) and (max-width: 820px)').matches) {
      setTimeout(function () { toast('建议横屏游玩，园林画面更完整'); }, 900);
    }
    enterChapter(0);
  }
  function startContinue() {
    const s = loadSave();
    if (!s) { startNew(); return; }
    S = Object.assign(freshState(), s);
    S.started = true;
    $('start').hidden = true;
    $('game').hidden = false;
    $('ending').hidden = true;
    bootAudio();
    enterChapter(Math.max(0, Math.min(CHAPTERS.length - 1, s.chapter)), true);
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('btnStart').addEventListener('click', startNew);
    $('btnContinue').addEventListener('click', startContinue);
    $('btnStartJournal').addEventListener('click', openGuide);

    $('btnGuide').addEventListener('click', openGuide);
    $('btnJournal').addEventListener('click', function () { openJournal('image'); });
    $('btnSettings').addEventListener('click', openSettings);
    $('btnSound').addEventListener('click', function () {
      prefs.sound = !prefs.sound;
      savePrefs();
      if (prefs.sound) { bootAudio(); Audio2.setEnabled(true); }
      else if (window.Audio2) Audio2.setEnabled(false);
      applySoundUI();
      toast(prefs.sound ? '声音：开' : '声音：关');
    });

    $('journalClose').addEventListener('click', closeJournal);
    $('guideClose').addEventListener('click', closeGuide);
    $('settingsClose').addEventListener('click', closeSettings);
    $('settingsOk').addEventListener('click', closeSettings);

    journal.querySelectorAll('#journalTabs .tab').forEach(function (b) {
      b.addEventListener('click', function () { renderJournal(b.dataset.tab); if (window.Audio2) Audio2.sfx('tap'); });
    });
    guide.querySelectorAll('#guideTabs .tab').forEach(function (b) {
      b.addEventListener('click', function () { renderGuide(b.dataset.tab); if (window.Audio2) Audio2.sfx('tap'); });
    });

    $('setFont').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { applyFont(b.dataset.v); syncSettings(); });
    });
    $('setVolume').addEventListener('input', function (e) {
      prefs.vol = +e.target.value;
      $('volVal').textContent = prefs.vol;
      if (window.Audio2) Audio2.setVolume(prefs.vol / 100);
      savePrefs();
    });
    $('setMotion').addEventListener('click', function () {
      prefs.motion = !prefs.motion;
      applyMotion(); syncSettings(); savePrefs();
      if (window.FX) FX.reduce(prefs.motion);
    });
    $('setHints').addEventListener('click', function () {
      prefs.hints = !prefs.hints; setSwitch($('setHints'), prefs.hints); savePrefs();
    });
    $('setLamp').addEventListener('click', function () {
      prefs.lantern = !prefs.lantern; setSwitch($('setLamp'), prefs.lantern); savePrefs();
      if (S.started && CHAPTERS[S.chapter].key === 'shihua') toggleLantern(prefs.lantern);
    });
    $('setRestart').addEventListener('click', async function () {
      const yes = await confirmBox('从头开始', '当前的札记与进度会清空。梦可以重做，但这一次读到的字不会留下。', '重 来');
      if (yes) { clearSave(); location.reload(); }
    });

    $('endingJournal').addEventListener('click', function () {
      journal.classList.add('over-ending');
      openJournal('image');
    });
    $('endingAgain').addEventListener('click', async function () {
      const yes = await confirmBox('再走一遍', '回到开始，重新游园。', '入 园');
      if (yes) location.reload();
    });

    // 点空白处关抽屉
    document.addEventListener('click', function (e) {
      if (!journal.hidden && journal.classList.contains('open') && !journal.contains(e.target) && !e.target.closest('#btnJournal') && !e.target.closest('#endingJournal')) closeJournal();
      if (!guide.hidden && guide.classList.contains('open') && !guide.contains(e.target) && !e.target.closest('#btnGuide') && !e.target.closest('#btnStartJournal')) closeGuide();
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        if (!settings.hidden) { closeSettings(); return; }
        if (!journal.hidden) { closeJournal(); return; }
        if (!guide.hidden) { closeGuide(); return; }
      }
      if (!S.started) return;
      if (e.key === 'j' || e.key === 'J') { openJournal('image'); }
      if (e.key === 'g' || e.key === 'G') { openGuide(); }
      if ((e.key === 'l' || e.key === 'L') && CHAPTERS[S.chapter] && CHAPTERS[S.chapter].key === 'shihua') {
        stage.classList.toggle('lamp-full');
        toast(stage.classList.contains('lamp-full') ? '举灯 · 全亮' : '掩灯 · 只照身前三步');
        revealNear(innerWidth / 2, innerHeight * 0.58);
      }
    });

    // 首次点击初始化音频（浏览器要求）
    document.addEventListener('pointerdown', function once() {
      bootAudio();
      document.removeEventListener('pointerdown', once);
    }, { once: true });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    document.body.classList.remove('font-sm', 'font-md', 'font-lg');
    document.body.classList.add('font-' + prefs.font);
    applyMotion();
    applySoundUI();
    syncSettings();
    const save = loadSave();
    if (save) $('btnContinue').hidden = false;
    if (window.FX) FX.init($('fx'));
    if (window.FX) { FX.scene('spring'); FX.reduce(prefs.motion); }
    bind();
    setTimeout(function () {
      const l = $('loader');
      l.classList.add('done');
      setTimeout(function () { l.hidden = true; }, 900);
      $('start').classList.add('ready');
    }, 700);
    // 供调试
    window.__MDT = { S: function () { return S; }, chapter: function (i) { enterChapter(i); }, ending: showEnding };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

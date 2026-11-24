/* ==========================================================================
   《牡丹亭》3D 舞台
   用 Three.js 把四幅场景与六个人物做成可环绕的低多边形纸偶舞台。
   叙事、对白、谜题仍由原引擎驱动；本文件只负责“三维那一层”。
   ========================================================================== */
(function () {
  'use strict';

  var TS = window.ThreeStage = {};
  var canvas, renderer, camera, scene, root, clock;
  var W = 1, H = 1, DPR = 1;
  var active = false, currentScene = null, built = {};
  var HYBRID = true, bgMesh = null, BG = { w: 1, h: 1, z: -20 };
  var chars = {}, speakerKey = null, guests = [];
  var beacons = [];
  var cam = { az: 0, pol: 0.16, dist: 17, tx: 0, ty: 2, tz: -1 };
  var target = new THREE.Vector3(0, 2, -1);
  var drag = null;
  var time = 0;
  var texCache = {};

  /* ---------- 小工具 ---------- */
  function lam(color, opts) {
    var m = new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {}));
    return m;
  }
  function std(color, rough, metal) {
    return new THREE.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.85 : rough, metalness: metal || 0 });
  }
  function box(w, h, d, color, x, y, z, ry, rx, rz) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), (color && color.isMaterial) ? color : lam(color));
    m.position.set(x || 0, y || 0, z || 0);
    if (ry) m.rotation.y = ry;
    if (rx) m.rotation.x = rx;
    if (rz) m.rotation.z = rz;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function cyl(rt, rb, h, seg, color, x, y, z) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), (color && color.isMaterial) ? color : lam(color));
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function sph(r, color, x, y, z, sx, sy, sz) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), (color && color.isMaterial) ? color : lam(color));
    m.position.set(x || 0, y || 0, z || 0);
    if (sx || sy || sz) m.scale.set(sx || 1, sy || 1, sz || 1);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function group(x, y, z) { var g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); return g; }

  function glowTexture(inner, outer) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  function glowSprite(size, colorA, colorB) {
    var key = colorA + colorB;
    if (!texCache[key]) texCache[key] = glowTexture(colorA, colorB);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texCache[key], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(size, size, 1);
    return s;
  }

  /* ---------- 天空 / 光 ---------- */
  function clearRoot() {
    if (root) {
      scene.remove(root);
      root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.map && o.material.map.__generated) o.material.map.dispose();
      });
    }
    chars = {}; beacons = []; speakerKey = null; guests = [];
    root = group();
    scene.add(root);
  }
  function setSky(color, fogColor, fogNear, fogFar) {
    scene.background = new THREE.Color(color);
    scene.fog = new THREE.Fog(fogColor || color, fogNear || 26, fogFar || 70);
  }
  function lights(opt) {
    opt = opt || {};
    var hemi = new THREE.HemisphereLight(opt.sky || 0xfff3dd, opt.ground || 0x6e6252, opt.hemi == null ? 0.72 : opt.hemi);
    root.add(hemi);
    var dir = new THREE.DirectionalLight(opt.sun || 0xfff0d0, opt.dir == null ? 0.82 : opt.dir);
    dir.position.set(opt.sunX == null ? -8 : opt.sunX, opt.sunY == null ? 14 : opt.sunY, opt.sunZ == null ? 10 : opt.sunZ);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -14; dir.shadow.camera.right = 14;
    dir.shadow.camera.top = 14; dir.shadow.camera.bottom = -14;
    dir.shadow.camera.near = 2; dir.shadow.camera.far = 40;
    dir.shadow.bias = -0.0015;
    root.add(dir);
    return dir;
  }

  /* ---------- 材质小品 ---------- */
  var COL = {
    wood: 0x6d4b35, woodDark: 0x3f2c22, woodLight: 0x8a6244,
    tile: 0x4c5152, tileDark: 0x343a3c,
    stone: 0xcfc5b0, stoneDark: 0x928a7d,
    water: 0x7fa5a0, moss: 0x74855f, leaf: 0x5f7b54,
    peony: 0xe7a3af, peonyDeep: 0xd07f8c, pink: 0xf2c9cf,
    gold: 0xc9a25e, red: 0x9c3b2e, paper: 0xefe3cd, ink: 0x2b221c
  };

  /* ---------- 场景：春日花园 ---------- */
  function buildSpring() {
    setSky(0xe9dfc9, 0xd9cdb6, 30, 78);
    lights({ sky: 0xfff4de, ground: 0x8a7d64, sun: 0xffe8c2, dir: 1.0, sunX: -6, sunY: 16, sunZ: 12 });
    var g = root;

    // 地
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), lam(0xd8cdb2));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
    var grass = new THREE.Mesh(new THREE.CircleGeometry(26, 48), lam(0x93a37b));
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0.01, -8); grass.receiveShadow = true; g.add(grass);

    // 池
    var pond = new THREE.Mesh(new THREE.CircleGeometry(4.4, 48), new THREE.MeshPhongMaterial({ color: 0x6f9894, transparent: true, opacity: 0.92, shininess: 110, specular: 0xdfeee8 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(0, 0.06, -2.5); pond.receiveShadow = true; g.add(pond);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(4.44, 0.13, 6, 40), lam(0xbdb39b));
    rim.rotation.x = -Math.PI / 2; rim.position.set(0, 0.1, -2.5); g.add(rim);
    for (var i = 0; i < 14; i++) {
      var ang = i * 1.7, r = 2 + (i % 5) * 0.6;
      var pad = new THREE.Mesh(new THREE.CircleGeometry(0.3 + (i % 3) * 0.1, 10), lam(0x4f6a48));
      pad.rotation.x = -Math.PI / 2; pad.position.set(Math.cos(ang) * r, 0.09, Math.sin(ang) * r * 0.8); g.add(pad);
    }

    // 石桥（拱桥）
    var bx0 = -7.2, bx1 = -1.0, bz = -2.5, segs = 16;
    for (var s = 0; s < segs; s++) {
      var t = s / (segs - 1);
      var x = bx0 + (bx1 - bx0) * t;
      var y = 0.35 + Math.sin(t * Math.PI) * 1.05;
      var rot = Math.cos(t * Math.PI) * 0.38;
      var deck = box(0.8, 0.2, 1.9, COL.stone, x, y, bz, 0, 0, rot);
      g.add(deck);
      if (s % 2 === 0) {
        [-0.86, 0.86].forEach(function (dz) {
          g.add(cyl(0.05, 0.06, 0.62, 6, COL.stoneDark, x, y + 0.34, bz + dz));
          var cap = sph(0.075, COL.stone, x, y + 0.68, bz + dz); g.add(cap);
        });
      }
      if (s < segs - 1) {
        [-0.86, 0.86].forEach(function (dz) {
          var rail = box(0.8, 0.08, 0.07, COL.stone, x + 0.4, y + 0.55, bz + dz, 0, 0, rot);
          g.add(rail);
        });
      }
    }

    // 牡丹亭（六角亭）
    var pav = group(6.2, 0, -3.8); pav.scale.setScalar(0.94);
    pav.add(cyl(3.1, 3.3, 0.22, 6, COL.stone, 0, 0.12, 0));
    for (var c = 0; c < 6; c++) {
      var a = c * Math.PI / 3 + Math.PI / 6;
      var px = Math.cos(a) * 2.55, pz = Math.sin(a) * 2.55;
      pav.add(cyl(0.1, 0.12, 3.2, 8, COL.wood, px, 1.85, pz));
      pav.add(cyl(0.22, 0.26, 0.16, 8, COL.stoneDark, px, 0.3, pz));
    }
    // 美人靠
    for (var b = 0; b < 6; b++) {
      var a2 = b * Math.PI / 3 + Math.PI / 6, a3 = (b + 1) * Math.PI / 3 + Math.PI / 6;
      var mx = (Math.cos(a2) + Math.cos(a3)) * 1.27, mz = (Math.sin(a2) + Math.sin(a3)) * 1.27;
      var len = 2.55 * 0.98, rot2 = -((a2 + a3) / 2) + Math.PI / 2;
      if (b !== 1) {
        pav.add(box(len, 0.1, 0.4, COL.woodLight, mx, 0.72, mz, rot2));
        pav.add(box(len, 0.08, 0.3, COL.wood, mx, 1.12, mz, rot2));
      }
    }
    // 屋面：Lathe 做出上翘的六角檐
    var prof = [];
    prof.push(new THREE.Vector2(0.05, 4.52));
    prof.push(new THREE.Vector2(0.7, 4.38));
    prof.push(new THREE.Vector2(1.4, 4.14));
    prof.push(new THREE.Vector2(2.1, 3.86));
    prof.push(new THREE.Vector2(2.75, 3.52));
    prof.push(new THREE.Vector2(3.22, 3.18));
    var roof = new THREE.Mesh(new THREE.LatheGeometry(prof, 6), lam(COL.tileDark, { side: THREE.DoubleSide }));
    roof.castShadow = true; pav.add(roof);

    pav.add(cyl(0.04, 0.04, 0.55, 6, COL.gold, 0, 4.78, 0));
    pav.add(sph(0.13, COL.gold, 0, 5.08, 0));
    // 檐角上翘
    for (var e = 0; e < 6; e++) {
      var ea = e * Math.PI / 3 + Math.PI / 6;
      var tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 4), lam(COL.tileDark));
      tip.position.set(Math.cos(ea) * 3.15, 3.28, Math.sin(ea) * 3.15);
      tip.rotation.z = -Math.cos(ea) * 0.85; tip.rotation.x = Math.sin(ea) * 0.85;
      pav.add(tip);
    }
    // 匾额
    var bian = box(1.5, 0.42, 0.08, COL.woodDark, 0, 3.35, 2.52); pav.add(bian);
    var bianFace = box(1.3, 0.3, 0.02, 0x2a1d16, 0, 3.35, 2.47); pav.add(bianFace);
    // 挂着的香囊
    var string = cyl(0.008, 0.008, 0.9, 4, 0x5a4632, 1.6, 2.9, 1.1); pav.add(string);
    pav.add(sph(0.17, COL.gold, 1.6, 2.4, 1.1, 1, 1.15, 1));
    // 琴
    var qin = group(1.9, 0.23, 1.2); qin.rotation.y = 0.25;
    qin.add(box(1.9, 0.09, 0.4, 0x3a2a22, 0, 0, 0));
    qin.add(box(1.75, 0.02, 0.32, 0x6d4a32, 0, 0.055, 0));
    pav.add(qin);
    g.add(pav);

    // 矮篱，压住地平线
    for (var hg = 0; hg < 8; hg++) {
      g.add(box(2.6, 0.55, 0.5, 0x7d8a63, -9.1 + hg * 2.6, 0.28, -9.3));
    }

    // 太湖石
    var rockGeo = new THREE.IcosahedronGeometry(2.2, 2);
    var pos = rockGeo.attributes.position;
    for (var v = 0; v < pos.count; v++) {
      var vx = pos.getX(v), vy = pos.getY(v), vz = pos.getZ(v);
      var n = 0.75 + 0.45 * Math.sin(vx * 2.1 + vy * 1.7) * Math.cos(vz * 2.3);
      pos.setXYZ(v, vx * n, vy * n * 1.15, vz * n);
    }
    rockGeo.computeVertexNormals();
    var rock = new THREE.Mesh(rockGeo, lam(0x958c7d, { flatShading: true }));
    rock.position.set(-7.9, 1.8, 0.5); rock.scale.set(0.8, 0.8, 0.8); rock.rotation.y = 0.5; rock.castShadow = true; g.add(rock);
    g.add(sph(0.9, 0x8d8578, -9.6, 0.55, 3.6, 1.2, 0.7, 1));

    // 牡丹丛
    var bushMat = lam(0x526a47, { flatShading: true });
    var flowerMat = lam(COL.peony, { flatShading: true });
    for (var bb = 0; bb < 9; bb++) {
      var bxp = -6.6 + (bb % 3) * 0.95 + (bb > 5 ? 0.35 : 0);
      var bzp = 3.6 + Math.floor(bb / 3) * 0.75;
      var bush = sph(0.44 + (bb % 3) * 0.09, bushMat, bxp, 0.38 + (bb % 2) * 0.06, bzp, 1.5, 1.0, 1.25);
      bush.castShadow = false; g.add(bush);
      for (var ff = 0; ff < 5; ff++) {
        var fx = bxp + (Math.sin(ff * 2.4 + bb) * 0.55), fz = bzp + (Math.cos(ff * 1.9 + bb) * 0.45);
        g.add(sph(0.16 + (ff % 3) * 0.03, ff % 2 ? flowerMat : lam(COL.peonyDeep), fx, 0.78 + (ff % 3) * 0.07, fz, 1.2, 0.7, 1.1));
      }
    }
    // 亭侧花丛（小）
    for (var rb = 0; rb < 4; rb++) {
      var rx = 8.6 + (rb % 2) * 1.1, rz = -5.6 + Math.floor(rb / 2) * 0.8;
      g.add(sph(0.42, 0x4f6846, rx, 0.34, rz, 1.3, 0.9, 1.2));
      g.add(sph(0.14, COL.peony, rx + 0.15, 0.72, rz, 1.1, 0.8, 1.1));
    }

    // 石桌 + 团扇 + 花笺
    var table = group(-4.0, 0, 6.4);
    table.add(cyl(1.12, 1.18, 0.14, 20, COL.stone, 0, 0.82, 0));
    table.add(cyl(0.42, 0.55, 0.74, 8, COL.stoneDark, 0, 0.41, 0));
    var fan = cyl(0.4, 0.4, 0.03, 20, 0xefe4cf, -0.42, 0.9, 0.12); fan.rotation.x = 0.06; table.add(fan);
    var fanInk = cyl(0.31, 0.31, 0.002, 16, 0xcf9aa2, -0.42, 0.92, 0.12); table.add(fanInk);
    var paper = box(0.56, 0.01, 0.4, 0xf6ecd8, 0.4, 0.9, 0.1, 0.25); table.add(paper);
    g.add(table);

    // 石径：前景通向池边
    for (var ps = 0; ps < 9; ps++) {
      var pz2 = 9.4 - ps * 0.92, px2 = -1.9 + Math.sin(ps * 0.55) * 0.9 - ps * 0.12;
      g.add(box(1.55, 0.07, 0.82, 0xbdb197, px2, 0.035, pz2, 0, (ps % 2 ? 0.05 : -0.04)));
    }

    // 石灯
    var lantern = group(9.2, 0, 4.6);
    lantern.add(cyl(0.4, 0.5, 0.16, 6, COL.stoneDark, 0, 0.08, 0));
    lantern.add(cyl(0.14, 0.18, 1.1, 8, COL.stone, 0, 0.66, 0));
    lantern.add(cyl(0.42, 0.42, 0.55, 6, COL.stone, 0, 1.45, 0));
    var lampGlow = box(0.4, 0.35, 0.4, new THREE.MeshBasicMaterial({ color: 0xffd39a }), 0, 1.45, 0);
    lantern.add(lampGlow);
    var lampLight = new THREE.PointLight(0xffb469, 0.9, 9, 2);
    lampLight.position.set(0, 1.5, 0); lantern.add(lampLight);
    g.add(lantern);

    // 远山 / 树
    for (var mt = 0; mt < 7; mt++) {
      var mm = new THREE.Mesh(new THREE.ConeGeometry(5 + mt % 3, 7 + mt % 4, 5), lam(0xa8ac92));
      mm.position.set(-24 + mt * 8, 2.5, -26 - (mt % 3) * 4); g.add(mm);
    }
    for (var tr = 0; tr < 10; tr++) {
      var tx = -15 + tr * 3.15, tz = -13 - (tr % 3) * 2.4;
      g.add(cyl(0.14, 0.2, 3.0, 6, 0x5a4535, tx, 1.5, tz));
      g.add(sph(1.1 + (tr % 3) * 0.22, tr % 2 ? 0x8fa57a : 0xa8b98a, tx, 3.55, tz, 1.2, 0.85, 1.05));
    }
    // 飘落花瓣（低多边形）
    var petals = new THREE.Group();
    for (var p = 0; p < 60; p++) {
      var pm = new THREE.Mesh(new THREE.CircleGeometry(0.05, 5), lam(0xf1c3cb, { side: THREE.DoubleSide }));
      pm.position.set((Math.random() - 0.5) * 26, 1 + Math.random() * 8, (Math.random() - 0.5) * 18);
      pm.userData.spin = (Math.random() - 0.5) * 2;
      petals.add(pm);
    }
    petals.name = 'petals'; g.add(petals);


    g.userData.petals = petals;
  }

  /* ---------- 场景：梦境园林 ---------- */
  function buildDream() {
    setSky(0x242c4d, 0x2d3658, 22, 80);
    lights({ sky: 0xcfd9ff, ground: 0x2b3050, sun: 0xbcc8ff, dir: 0.75, sunX: 8, sunY: 14, sunZ: 12 });
    var g = root;

    // 云海
    var cloudMat = new THREE.MeshBasicMaterial({ color: 0xcfd6e8, transparent: true, opacity: 0.32, depthWrite: false });
    for (var i = 0; i < 46; i++) {
      var a = i * 2.399, r = 6 + (i % 9) * 2.2;
      var cs = sph(1.4 + (i % 4) * 0.5, cloudMat, Math.cos(a) * r, -1.7 + (i % 3) * 0.25, Math.sin(a) * r * 0.7 - 4, 1.8, 0.5, 1.2);
      cs.castShadow = false; g.add(cs);
    }

    // 浮岛与断桥
    var isle = cyl(5.6, 6.4, 1.2, 12, 0x6b6f74, 0, -0.5, 0); g.add(isle);
    var isleTop = cyl(5.6, 5.6, 0.12, 12, 0x8b8f86, 0, 0.12, 0); g.add(isleTop);
    for (var s2 = 0; s2 < 10; s2++) {
      if (s2 === 4 || s2 === 5) continue; // 断口
      var t2 = s2 / 9, x2 = -5.4 + t2 * 10.8, y2 = 0.5 + Math.sin(t2 * Math.PI) * 0.9;
      g.add(box(0.6, 0.16, 1.5, 0x9a9c98, x2, y2, 0, 0, 0, Math.cos(t2 * Math.PI) * 0.3));
    }

    // 左亭（浮空）
    g.add(makePavilion(-10.5, 1.2, -9.0, 1.5, 0x59606e, 0x3b4252));
    // 右亭 + 月洞门
    var rp = makePavilion(8.5, 1.4, -8.0, 1.7, 0x5b6270, 0x3d4454);
    g.add(rp);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.16, 8, 30), lam(0x8b8f84));
    ring.position.set(8.5, 3.05, -6.2); ring.scale.setScalar(0.78); g.add(ring);
    var ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.05, 8, 30), new THREE.MeshBasicMaterial({ color: 0xa9c4ff, transparent: true, opacity: 0.55 }));
    ring2.position.copy(ring.position); ring2.scale.setScalar(0.78); g.add(ring2);

    // 光带（彩虹）
    var ribbonColors = [0xffc7d9, 0xffe3a8, 0xa8f0e0, 0xb8c7ff];
    for (var rb = 0; rb < 4; rb++) {
      var pts = [];
      for (var p2 = 0; p2 < 12; p2++) {
        var tt = p2 / 11;
        pts.push(new THREE.Vector3(-10 + tt * 20 + rb * 0.6, 1.2 + Math.sin(tt * Math.PI * 1.3 + rb) * 2.2 + rb * 0.35, -4 + Math.cos(tt * 4 + rb) * 1.6));
      }
      var curve = new THREE.CatmullRomCurve3(pts);
      var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.07, 4, false), new THREE.MeshBasicMaterial({ color: ribbonColors[rb], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
      g.add(tube);
      var halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.2, 4, false), new THREE.MeshBasicMaterial({ color: ribbonColors[rb], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending }));
      g.add(halo);
    }

    // 月
    var moon = sph(2.4, new THREE.MeshBasicMaterial({ color: 0xfff5dd }), 0.5, 12.0, -30); g.add(moon);
    var mg = glowSprite(16, 'rgba(255,248,225,.9)', 'rgba(220,225,255,.25)'); mg.position.copy(moon.position); g.add(mg);

    // 星
    var starGeo = new THREE.BufferGeometry();
    var starPos = [];
    for (var st = 0; st < 220; st++) {
      starPos.push((Math.random() - 0.5) * 90, 6 + Math.random() * 24, -30 - Math.random() * 30);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    g.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdde5ff, size: 0.14, transparent: true, opacity: 0.8 })));

    // 莲叶
    for (var lp = 0; lp < 12; lp++) {
      var la = lp * 0.9;
      var pad2 = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), lam(0x5d7a6c, { side: THREE.DoubleSide }));
      pad2.rotation.x = -Math.PI / 2; pad2.position.set(-6 + Math.cos(la) * 2.2, 0.35, 5 + Math.sin(la) * 1.4); g.add(pad2);
    }
    // 石灯
    var dl = group(6.0, 0.2, 4.2);
    dl.add(cyl(0.15, 0.2, 1.1, 8, 0x8d8d8a, 0, 0.55, 0));
    dl.add(box(0.5, 0.45, 0.5, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), 0, 1.25, 0));
    dl.add(cyl(0.35, 0.5, 0.18, 4, 0x6f7070, 0, 1.58, 0));
    var dlLight = new THREE.PointLight(0xffbf7a, 1.0, 10, 2); dlLight.position.y = 1.3; dl.add(dlLight);
    g.add(dl);
    // 白蝶
    var bflyTex = new THREE.TextureLoader().load('assets/img/butterfly.png');
    var bfly = new THREE.Sprite(new THREE.SpriteMaterial({ map: bflyTex, transparent: true, depthWrite: false }));
    bfly.scale.set(1.1, 1.05, 1); bfly.position.set(2.8, 4.3, 0.4); g.add(bfly);
    bfly.name = 'butterfly';

    // 飘浮花瓣
    var petals = new THREE.Group();
    for (var q = 0; q < 40; q++) {
      var qm = new THREE.Mesh(new THREE.CircleGeometry(0.05, 5), new THREE.MeshBasicMaterial({ color: 0xf5d6de, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      qm.position.set((Math.random() - 0.5) * 24, 1 + Math.random() * 7, (Math.random() - 0.5) * 16);
      petals.add(qm);
    }
    petals.name = 'petals'; g.add(petals); g.userData.petals = petals;
  }

  function makePavilion(x, y, z, scale, bodyColor, roofColor) {
    var p = group(x, y, z); p.scale.setScalar(scale);
    p.add(cyl(2.4, 2.6, 0.18, 6, 0x8d8e88, 0, 0.09, 0));
    for (var c = 0; c < 6; c++) {
      var a = c * Math.PI / 3 + Math.PI / 6;
      p.add(cyl(0.09, 0.11, 3.0, 6, bodyColor, Math.cos(a) * 2.1, 1.6, Math.sin(a) * 2.1));
    }
    var prof = [new THREE.Vector2(0.05, 4.1), new THREE.Vector2(0.6, 3.94), new THREE.Vector2(1.3, 3.64), new THREE.Vector2(1.9, 3.3), new THREE.Vector2(2.4, 3.0), new THREE.Vector2(2.7, 2.8)];
    var roof = new THREE.Mesh(new THREE.LatheGeometry(prof, 6), lam(roofColor, { side: THREE.DoubleSide }));
    roof.castShadow = true; p.add(roof);
    p.add(sph(0.1, 0xc9c6b8, 0, 4.22, 0));
    var warm = new THREE.PointLight(0xffc98a, 0.55, 8, 2); warm.position.set(0, 2.0, 0); p.add(warm);
    return p;
  }

  /* ---------- 场景：闺房 ---------- */
  function buildBoudoir() {
    setSky(0x1b1714, 0x1b1714, 14, 40);
    lights({ sky: 0x9fb4c8, ground: 0x3a2a20, hemi: 0.55, sun: 0xc8d8e8, dir: 0.55, sunX: -6, sunY: 8, sunZ: -8 });
    var g = root;

    // 房间
    var floor = box(16, 0.2, 12, 0x4a3528, 0, -0.1, 0); g.add(floor);
    for (var f = 0; f < 12; f++) g.add(box(15.6, 0.02, 0.04, 0x5b4232, 0, 0.01, -5.4 + f));
    g.add(box(16, 5.4, 0.2, 0x3b2d24, 0, 2.6, -6.0));
    g.add(box(0.2, 5.4, 12, 0x3b2d24, -8, 2.6, 0));
    g.add(box(0.2, 5.4, 12, 0x3b2d24, 8, 2.6, 0));
    g.add(box(16, 0.2, 12, 0x2e221b, 0, 5.3, 0));
    // 梁
    g.add(box(16, 0.25, 0.3, 0x2b1f19, 0, 4.6, -3));
    g.add(box(0.3, 0.25, 12, 0x2b1f19, 0, 4.6, 0));

    // 后窗：格心 + 窗外夜园
    var win = group(-3.0, 3.1, -5.85);
    win.add(box(4.6, 3.0, 0.12, 0x241a15, 0, 0, 0));
    var nightPane = box(4.2, 2.6, 0.04, new THREE.MeshBasicMaterial({ color: 0x4a5a66 }), 0, 0, 0.09);
    win.add(nightPane);
    for (var wx = -2; wx <= 2; wx++) win.add(box(0.07, 2.7, 0.06, 0x1a1210, wx * 0.8, 0, 0.12));
    for (var wy = -1; wy <= 1; wy++) win.add(box(4.2, 0.07, 0.06, 0x1a1210, 0, wy * 0.85, 0.12));
    win.add(box(5.0, 0.18, 0.5, 0x2a1d16, 0, 1.55, 0));
    g.add(win);

    // 屏风（山水）
    var screen = group(3.9, 0, -4.4);
    var mountainTex = makeMountainTexture();
    for (var sp = 0; sp < 4; sp++) {
      var panel = box(1.05, 2.9, 0.08, 0x2c211a, sp * 1.02 - 1.5, 1.55, 0, (sp - 1.5) * 0.04);
      screen.add(panel);
      var art = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 2.6), new THREE.MeshLambertMaterial({ map: mountainTex }));
      art.position.set(sp * 1.02 - 1.5, 1.55, 0.05); art.rotation.y = (sp - 1.5) * 0.04; screen.add(art);
    }
    g.add(screen);

    // 书案
    var desk = group(0, 0, 0.8);
    desk.add(box(5.2, 0.16, 1.9, 0x4a3225, 0, 1.0, 0));
    [-2.2, 2.2].forEach(function (dx) { desk.add(box(0.22, 0.9, 1.4, 0x3a271d, dx, 0.5, 0)); });
    [-0.6, 0.6].forEach(function (dz) { desk.add(box(4.6, 0.14, 0.18, 0x3a271d, 0, 0.5, dz)); });
    // 画了一半的绢本
    var scroll = box(2.4, 0.02, 1.1, 0xe8ddc8, -0.4, 1.1, 0.15, 0.04); desk.add(scroll);
    var ink = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.75), new THREE.MeshBasicMaterial({ map: makePortraitTexture(), transparent: true }));
    ink.rotation.x = -Math.PI / 2; ink.rotation.z = 0.04; ink.position.set(-0.4, 1.12, 0.15); desk.add(ink);
    // 笔砚
    desk.add(cyl(0.12, 0.14, 0.1, 8, 0x1d1a18, 1.2, 1.14, 0.1));
    desk.add(cyl(0.03, 0.03, 0.55, 5, 0x6a4a30, 1.7, 1.3, -0.1, 0));
    g.add(desk);

    // 铜镜
    var mir = group(2.7, 1.25, -0.2);
    mir.add(cyl(0.08, 0.1, 1.2, 8, 0x3a2a20, 0, -0.6, 0));
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.07, 8, 28), std(0x8a6a3e, 0.4, 0.8));
    mir.add(rim);
    var disc = new THREE.Mesh(new THREE.CircleGeometry(0.53, 28), new THREE.MeshStandardMaterial({ color: 0xb9c2c0, roughness: 0.15, metalness: 0.95 }));
    disc.position.z = -0.03; mir.add(disc);
    g.add(mir);

    // 空瓶
    var vasePts = [];
    for (var vp = 0; vp <= 10; vp++) {
      var vt = vp / 10;
      vasePts.push(new THREE.Vector2(0.18 + Math.sin(vt * Math.PI) * 0.32, vt * 1.35));
    }
    var vase = new THREE.Mesh(new THREE.LatheGeometry(vasePts, 16), std(0x9aa9a2, 0.6, 0.1));
    vase.position.set(3.7, 0, -1.7); vase.castShadow = true; g.add(vase);

    // 衣架
    var rack = group(6.0, 0, -2.2);
    [-0.9, 0.9].forEach(function (dx) { rack.add(cyl(0.06, 0.08, 2.2, 6, 0x3b2a20, dx, 1.1, 0)); });
    rack.add(box(2.1, 0.1, 0.1, 0x3b2a20, 0, 2.15, 0));
    var robe = box(1.7, 1.7, 0.05, 0xb7c0c8, 0, 1.25, 0.06); rack.add(robe);
    g.add(rack);

    // 香炉
    var censer = group(-5.6, 0.4, 3.2);
    censer.add(cyl(0.35, 0.5, 0.5, 12, 0x4a3d2c, 0, 0.25, 0));
    censer.add(sph(0.42, 0x53452f, 0, 0.55, 0, 1.2, 0.7, 1.2));
    censer.add(cyl(0.05, 0.05, 0.12, 6, 0x9c7a44, 0, 0.95, 0));
    g.add(censer);

    // 烛
    var candle = group(-3.3, 1.1, 1.6);
    candle.add(cyl(0.06, 0.07, 0.5, 8, 0xe8dcc2, 0, 0.25, 0));
    var flame = sph(0.09, new THREE.MeshBasicMaterial({ color: 0xffd08a }), 0, 0.58, 0, 1, 1.5, 1); candle.add(flame);
    var cl = new THREE.PointLight(0xffa85c, 1.2, 8, 2); cl.position.set(0, 0.6, 0); candle.add(cl);
    g.add(candle);

    // 窗外冷光
    var moonLight = new THREE.PointLight(0x8fb0cc, 0.7, 16, 2); moonLight.position.set(-3, 3.6, -4); g.add(moonLight);

    // 书堆
    for (var bk = 0; bk < 4; bk++) g.add(box(0.7, 0.1, 0.5, bk % 2 ? 0x6a5a44 : 0x7d6a50, -3.6 + bk * 0.08, 1.12 + bk * 0.1, 1.4));
  }

  function makeMountainTexture() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 512;
    var x = c.getContext('2d');
    var gr = x.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#d8cdb6'); gr.addColorStop(1, '#a99a80');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 512);
    x.fillStyle = 'rgba(80,74,62,.55)';
    x.beginPath(); x.moveTo(0, 360); x.lineTo(70, 190); x.lineTo(120, 300); x.lineTo(170, 150); x.lineTo(256, 330); x.lineTo(256, 512); x.lineTo(0, 512); x.closePath(); x.fill();
    x.fillStyle = 'rgba(50,46,40,.4)';
    x.beginPath(); x.moveTo(0, 430); x.lineTo(90, 300); x.lineTo(150, 400); x.lineTo(220, 310); x.lineTo(256, 380); x.lineTo(256, 512); x.lineTo(0, 512); x.closePath(); x.fill();
    var t = new THREE.CanvasTexture(c); t.__generated = true; return t;
  }
  function makePortraitTexture() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256;
    var x = c.getContext('2d');
    x.fillStyle = '#efe4cf'; x.fillRect(0, 0, 512, 256);
    x.strokeStyle = 'rgba(70,60,50,.5)'; x.lineWidth = 3;
    // 简笔仕女：发髻、侧脸、衣纹
    x.beginPath(); x.arc(210, 92, 34, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(210, 74, 22, Math.PI * 1.1, Math.PI * 2.1); x.stroke();
    x.beginPath(); x.moveTo(196, 120); x.quadraticCurveTo(210, 140, 230, 122); x.stroke();
    x.beginPath(); x.moveTo(170, 210); x.quadraticCurveTo(210, 150, 255, 212); x.stroke();
    x.beginPath(); x.moveTo(160, 230); x.quadraticCurveTo(210, 250, 280, 225); x.stroke();
    x.fillStyle = 'rgba(60,50,40,.75)'; x.font = '22px serif'; x.fillText('畫 中 人', 330, 150);
    var t = new THREE.CanvasTexture(c); t.__generated = true; return t;
  }

  /* ---------- 场景：夜园书斋 ---------- */
  function buildNight() {
    setSky(0x0c1422, 0x101a2a, 18, 60);
    lights({ sky: 0x6f86a8, ground: 0x1a1a22, hemi: 0.5, sun: 0x9db6d8, dir: 0.55, sunX: 5, sunY: 12, sunZ: 8 });
    var g = root;

    // 地面 + 水
    g.add(box(26, 0.2, 16, 0x2a2a26, 0, -0.1, 1));
    var pond2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 20), new THREE.MeshPhongMaterial({ color: 0x1e3440, transparent: true, opacity: 0.9, shininess: 120, specular: 0x9fc3d8 }));
    pond2.rotation.x = -Math.PI / 2; pond2.position.set(9, 0.02, -1); g.add(pond2);

    // 书斋（左侧）
    g.add(box(12, 0.18, 10, 0x3a2c22, -3, 0.05, 0));
    g.add(box(12, 5, 0.2, 0x2b211a, -3, 2.5, -5));
    g.add(box(0.2, 5, 10, 0x2b211a, -9, 2.5, 0));
    g.add(box(12, 0.2, 10, 0x201813, -3, 5, 0));
    // 书架
    var shelf = group(-1.2, 0, -4.4);
    shelf.add(box(3.4, 4.2, 0.5, 0x3a271c, 0, 2.1, 0));
    for (var sh = 0; sh < 5; sh++) shelf.add(box(3.2, 0.08, 0.6, 0x5a3f2c, 0, 0.5 + sh * 0.8, 0.02));
    for (var bo = 0; bo < 34; bo++) {
      var bw = 0.12 + (bo % 4) * 0.03, bh = 0.4 + (bo % 3) * 0.08;
      shelf.add(box(bw, bh, 0.34, [0x6d5a44, 0x5a4a3a, 0x7d6a50, 0x4a3b30][bo % 4], -1.4 + (bo % 3) * 0.18, 0.5 + Math.floor(bo / 3) * 0.8 - 0.4 + bh / 2, 0.12));
    }
    g.add(shelf);

    // 书桌 + 画卷 + 烛
    var desk2 = group(-3.6, 0, 1.8);
    desk2.add(box(4.6, 0.16, 1.9, 0x4a3225, 0, 1.0, 0));
    [-1.9, 1.9].forEach(function (dx) { desk2.add(box(0.2, 0.95, 1.5, 0x35241b, dx, 0.5, 0)); });
    var scrollTex = makeScrollTexture();
    var bigScroll = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4), new THREE.MeshLambertMaterial({ map: scrollTex, transparent: true }));
    bigScroll.rotation.x = -Math.PI / 2; bigScroll.rotation.z = -0.03; bigScroll.position.set(0, 1.1, 0.2); desk2.add(bigScroll);
    // 垂下来的卷轴
    var hang = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshLambertMaterial({ map: scrollTex, transparent: true }));
    hang.position.set(0, 0.25, 1.2); hang.rotation.x = 0.12; desk2.add(hang);
    desk2.add(cyl(0.05, 0.06, 0.5, 8, 0xe8dcc2, -1.4, 1.35, -0.2));
    var fl2 = sph(0.08, new THREE.MeshBasicMaterial({ color: 0xffd08a }), -1.4, 1.65, -0.2, 1, 1.5, 1); desk2.add(fl2);
    var cl2 = new THREE.PointLight(0xffa85c, 1.1, 10, 2); cl2.position.set(-1.4, 1.7, -0.2); desk2.add(cl2);
    g.add(desk2);

    // 石灯
    var sl = group(7.6, 0, 4.4);
    sl.add(cyl(0.42, 0.55, 0.18, 6, 0x6e6a60, 0, 0.1, 0));
    sl.add(cyl(0.16, 0.2, 1.2, 8, 0x7a766c, 0, 0.7, 0));
    sl.add(cyl(0.44, 0.44, 0.55, 6, 0x7a766c, 0, 1.55, 0));
    sl.add(box(0.42, 0.4, 0.42, new THREE.MeshBasicMaterial({ color: 0xffcf8a }), 0, 1.56, 0));
    var sll = new THREE.PointLight(0xffb066, 1.4, 12, 2); sll.position.set(0, 1.7, 0); sl.add(sll);
    g.add(sl);

    // 碑与画匣
    g.add(box(0.9, 1.9, 0.25, 0x5a574c, 8.8, 0.95, 6.6, 0.2));
    g.add(box(1.2, 0.5, 0.8, 0x5a4a38, 6.6, 0.25, 7.2));

    // 远处桥与楼
    var bridge2 = group(7.8, 0.2, -7.5);
    bridge2.add(box(7, 0.2, 1.4, 0x3d3f3c, 0, 0.9, 0, 0, 0.12));
    [-0.6, 0.6].forEach(function (dz) { bridge2.add(box(7, 0.1, 0.08, 0x2f312e, 0, 1.6, dz)); });
    g.add(bridge2);
    g.add(makePavilion(11, 1.2, -11, 2.2, 0x333a40, 0x232a30));

    // 月
    var moon2 = sph(2.2, new THREE.MeshBasicMaterial({ color: 0xfff3d6 }), 3, 10.5, -24); g.add(moon2);
    var mg2 = glowSprite(14, 'rgba(255,244,214,.9)', 'rgba(190,205,235,.22)'); mg2.position.copy(moon2.position); g.add(mg2);

    // 水面浮灯
    for (var lf = 0; lf < 7; lf++) {
      var lx = 5 + (lf % 4) * 2.2, lz = 2 - Math.floor(lf / 4) * 4;
      var fl = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), new THREE.MeshBasicMaterial({ color: 0xffcf8a }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(lx, 0.06, lz); g.add(fl);
      var gl2 = glowSprite(1.6, 'rgba(255,190,110,.8)', 'rgba(255,170,80,0)'); gl2.position.set(lx, 0.3, lz); g.add(gl2);
    }

    // 星与萤火
    var fg = new THREE.BufferGeometry(); var fp = [];
    for (var k = 0; k < 60; k++) fp.push((Math.random() - 0.5) * 24, 0.5 + Math.random() * 5, -6 + Math.random() * 14);
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    var fire = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xffd28a, size: 0.1, transparent: true, opacity: 0.85 }));
    fire.name = 'fireflies'; g.add(fire);
  }

  function makeScrollTexture() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 512;
    var x = c.getContext('2d');
    x.fillStyle = '#e9dfc9'; x.fillRect(0, 0, 256, 512);
    x.strokeStyle = 'rgba(75,60,45,.65)'; x.lineWidth = 2;
    for (var col = 0; col < 5; col++) {
      var cx = 30 + col * 45;
      x.beginPath(); x.moveTo(cx, 40); x.lineTo(cx, 470); x.stroke();
      for (var ch = 0; ch < 12; ch++) {
        x.beginPath(); x.arc(cx, 60 + ch * 34, 8, 0, Math.PI * 2); x.stroke();
      }
    }
    var t = new THREE.CanvasTexture(c); t.__generated = true; return t;
  }

  /* ---------- 人物 ---------- */
  var STYLE = {
    du: { robe: 0xd98f99, inner: 0xf3e6d5, sash: 0xb04b45, hair: 0x241c1c, skin: 0xf2d8c4, tall: 1.0 },
    liu: { robe: 0x5e7488, inner: 0xe8e0cf, sash: 0x3c4a5a, hair: 0x241c1c, skin: 0xf0d6bf, tall: 1.06 },
    chun: { robe: 0x8fa06a, inner: 0xe8d9c2, sash: 0xd9a06a, hair: 0x241c1c, skin: 0xf3dac6, tall: 0.94 },
    bao: { robe: 0x33363a, inner: 0xcfc7b8, sash: 0x6a6f72, hair: 0x1c1a1a, skin: 0xe8ceb8, tall: 1.03 },
    chen: { robe: 0x6b5645, inner: 0xd9cfbd, sash: 0x4a3b2e, hair: 0x5a5a5a, skin: 0xe8cfb9, tall: 1.0 },
    shi: { robe: 0x777a72, inner: 0xc9c3b2, sash: 0x55584f, hair: 0x6a6a68, skin: 0xe4ccb8, tall: 1.0 }
  };

  function makeNameTag(name) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 96;
    var x = c.getContext('2d');
    x.fillStyle = 'rgba(24,20,18,.82)'; x.fillRect(4, 4, 248, 88);
    x.strokeStyle = 'rgba(201,162,94,.9)'; x.lineWidth = 3; x.strokeRect(4, 4, 248, 88);
    x.fillStyle = '#f0e4cd'; x.font = 'bold 40px KaiTi, STKaiti, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, 128, 50);
    var t = new THREE.CanvasTexture(c); t.__generated = true;
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.set(1.15, 0.43, 1);
    return s;
  }

  function makeCharacter(key) {
    var st = STYLE[key] || STYLE.du;
    var ch = (typeof CHARS !== 'undefined') ? CHARS[key] : null;
    var g = group();
    var scl = st.tall;
    g.scale.setScalar(scl);
    var shadow = new THREE.Mesh(new THREE.CircleGeometry(0.46, 18), new THREE.MeshBasicMaterial({ color: 0x2a2418, transparent: true, opacity: 0.2, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; shadow.userData.keep = true; g.add(shadow);

    // 裙 / 袍
    var skirtPts = [];
    for (var i = 0; i <= 8; i++) {
      var t = i / 8;
      skirtPts.push(new THREE.Vector2(0.18 + Math.pow(t, 0.75) * 0.22, t * 1.0));
      if (i === 0) skirtPts.unshift(new THREE.Vector2(0.001, 0));
    }
    var skirt = new THREE.Mesh(new THREE.LatheGeometry(skirtPts, 14), lam(st.robe));
    skirt.position.y = 0.005; skirt.castShadow = true; g.add(skirt);
    // 衣襟（窄 V 领）
    var lapelL = box(0.05, 0.34, 0.02, st.inner, -0.045, 1.3, 0.2, 0, 0, 0.28); g.add(lapelL);
    var lapelR = box(0.05, 0.34, 0.02, st.inner, 0.045, 1.3, 0.2, 0, 0, -0.28); g.add(lapelR);
    // 腰带
    g.add(cyl(0.21, 0.22, 0.08, 12, st.sash, 0, 0.98, 0));
    // 上身
    var torso = cyl(0.19, 0.24, 0.42, 12, st.robe, 0, 1.2, 0); g.add(torso);
    var shoulders = sph(0.245, st.robe, 0, 1.38, 0, 1.25, 0.55, 0.9); g.add(shoulders);
    var sleeveL = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.52, 8), lam(st.robe));
    sleeveL.position.set(-0.31, 1.16, 0.02); sleeveL.rotation.z = 0.12; g.add(sleeveL);
    var sleeveR = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.52, 8), lam(st.robe));
    sleeveR.position.set(0.31, 1.16, 0.02); sleeveR.rotation.z = -0.12; g.add(sleeveR);
    var collar = cyl(0.09, 0.15, 0.12, 10, st.inner, 0, 1.46, 0); g.add(collar);
    // 手臂
    var armL = cyl(0.055, 0.075, 0.54, 8, st.robe, -0.27, 1.2, 0.02);
    armL.rotation.z = 0.14; armL.rotation.x = -0.05; g.add(armL);
    var armR = cyl(0.055, 0.075, 0.54, 8, st.robe, 0.27, 1.2, 0.02);
    armR.rotation.z = -0.14; armR.rotation.x = -0.05; g.add(armR);
    var handL = sph(0.055, st.skin, -0.34, 0.92, 0.06); g.add(handL);
    var handR = sph(0.055, st.skin, 0.34, 0.92, 0.06); g.add(handR);
    // 颈 / 头
    g.add(cyl(0.05, 0.06, 0.08, 8, st.skin, 0, 1.51, 0));
    var head = sph(0.178, st.skin, 0, 1.63, 0.012, 1, 1.06, 0.96); g.add(head);
    // 发
    var hair = sph(0.18, st.hair, 0, 1.71, -0.02, 1.02, 0.72, 1.02);
    g.add(hair);
    var hairBack = sph(0.168, st.hair, 0, 1.63, -0.075, 1.02, 1.02, 0.9); g.add(hairBack);
    var bun = sph(0.082, st.hair, 0, 1.81, -0.07, 1.05, 1.05, 1); g.add(bun);
    if (key === 'du' || key === 'chun') {
      g.add(cyl(0.009, 0.009, 0.14, 4, COL.gold, 0.06, 1.8, -0.07, 0, 0, 0.7));
      g.add(sph(0.028, COL.peony, 0.12, 1.83, -0.06));
    }
    // 纸偶式留白面部（对白立绘负责辨识）
    // 配饰
    if (key === 'du') {
      var fan = cyl(0.19, 0.19, 0.012, 18, 0xf1e6d2, -0.38, 0.95, 0.1); fan.rotation.x = Math.PI / 2; fan.rotation.z = 0.2; g.add(fan);
      g.add(cyl(0.01, 0.01, 0.28, 4, 0x6a4a30, -0.38, 0.82, 0.1));
    } else if (key === 'liu') {
      g.add(box(0.2, 0.28, 0.06, 0x4a5a68, 0.38, 0.96, 0.09, 0.2));
      g.add(box(0.16, 0.03, 0.09, 0xe8dfc9, 0.38, 1.09, 0.09));
    } else if (key === 'chun') {
      g.add(sph(0.09, 0xd9a06a, 0.36, 0.96, 0.1, 1, 1.1, 0.8));
      g.add(cyl(0.007, 0.007, 0.18, 4, 0x8a6a45, 0.36, 1.05, 0.1));
    } else if (key === 'bao') {
      g.add(cyl(0.18, 0.18, 0.1, 8, 0x1a1a1c, 0, 1.79, 0));
      g.add(box(0.32, 0.08, 0.26, 0x1a1a1c, 0, 1.85, -0.02));
      g.add(cyl(0.018, 0.018, 0.26, 4, 0x8a6a45, 0, 1.2, 0.24));
      g.add(sph(0.045, 0x9c7a44, 0, 1.06, 0.26));
    } else if (key === 'chen') {
      var beard = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 8), lam(0xc9c4b8));
      beard.position.set(0, 1.46, 0.13); beard.rotation.x = Math.PI; g.add(beard);
      g.add(cyl(0.05, 0.05, 0.5, 6, 0xd8cbb2, 0.36, 0.98, 0.1));
    } else if (key === 'shi') {
      g.add(cyl(0.18, 0.18, 0.09, 8, 0x5a5c55, 0, 1.78, 0));
      var lamp3 = box(0.16, 0.2, 0.16, new THREE.MeshBasicMaterial({ color: 0xffcb85 }), 0.38, 0.96, 0.1); g.add(lamp3);
      var pl = new THREE.PointLight(0xffb066, 0.5, 4, 2); pl.position.set(0.38, 0.98, 0.1); g.add(pl);
    }

    var halo = glowSprite(2.6, 'rgba(255,208,150,.28)', 'rgba(255,190,120,0)');
    halo.position.set(0, 1.0, -0.5); g.add(halo);
    // 影戏纸偶：统一为墨色剪影
    var silMat = new THREE.MeshBasicMaterial({ color: 0x241d18 });
    g.traverse(function (o) {
      if (o.isMesh && !(o.userData && o.userData.keep)) {
        o.material = silMat; o.castShadow = false;
      }
    });
    var tag = makeNameTag(ch ? ch.name : key);
    tag.position.set(0, 2.08, 0);
    g.add(tag);
    g.userData = { key: key, tag: tag, baseY: 0, phase: Math.random() * 6, arms: [armL, armR], visibleDefault: false };
    return g;
  }

  /* ---------- 场景装配 ---------- */
  var SCENE_DEF = {
    spring: { build: buildSpring, cam: { az: 0, pol: 0.14, dist: 16.4, tx: 0.2, ty: 1.75, tz: 1.0 }, sky: 0xe9dfc9, defaults: ['du', 'chun'] },
    dream: { build: buildDream, cam: { az: 0, pol: 0.08, dist: 21, tx: 0, ty: 3.0, tz: -1.0 }, sky: 0x242c4d, defaults: ['du', 'liu'] },
    boudoir: { build: buildBoudoir, cam: { az: 0, pol: 0.06, dist: 10.2, tx: 0, ty: 1.25, tz: 1.2 }, sky: 0x1b1714, defaults: ['du', 'chun'] },
    night: { build: buildNight, cam: { az: 0, pol: 0.08, dist: 11.5, tx: 0, ty: 1.2, tz: 1.2 }, sky: 0x0c1422, defaults: ['liu'] }
  };
  var CHAR_POS = {
    spring: { du: [-1.4, 0, 4.6], chun: [-4.0, 0, 4.3], liu: [3.2, 0, 1.2], bao: [-4.2, 0, 0.2], chen: [3.4, 0, 0.4], shi: [-2.4, 0, -2.4] },
    dream: { du: [-1.0, 0, 4.4], liu: [2.2, 0, 4.2], chun: [-3.8, 0, 3.6], bao: [4.4, 0, 3.4], chen: [3.6, 0, 3.2], shi: [-4.2, 0, 3.0] },
    boudoir: { du: [-1.6, 0, 4.4], chun: [-4.0, 0, 4.0], liu: [3.2, 0, 3.8], bao: [-4.4, 0, 3.4], chen: [3.6, 0, 3.2], shi: [-4.4, 0, 3.0] },
    night: { du: [0.6, 0, 4.4], liu: [1.8, 0, 4.6], chun: [3.2, 0, 4.0], bao: [-4.2, 0, 3.4], chen: [2.8, 0, 3.2], shi: [3.4, 0, 3.0] }
  };
  var ANCHORS = {
    spring: { rock: [-7.5, 2.6, 0.5], peony: [-6.4, 1.1, 3.9], bridge: [-4.2, 1.9, -2.5], pavilion: [5.9, 2.7, -3.4], lantern: [-4.0, 1.3, 6.4] },
    dream: { gate: [6.6, 4.0, -0.7], steps: [5.4, 1.8, 0.2], butterfly: [2.8, 4.4, 0.4], lotus: [-6.0, 1.0, 5.0], lamp: [6.0, 1.9, 4.2] },
    boudoir: { mirror: [2.7, 1.9, -0.2], bed: [3.9, 2.2, -4.4], vase: [3.7, 1.4, -1.7], desk: [0.4, 1.25, 0.8], portrait: [-0.9, 1.45, 0.6], incense: [-5.6, 1.1, 3.2] },
    night: { stoneLamp: [7.6, 1.8, 4.4], table: [-3.6, 1.25, 1.8], wall: [-1.2, 2.7, -4.4], bridge: [8.0, 2.2, -7.5], moon: [3, 8.5, -16] }
  };

  function addCharacters(key) {
    var pos = CHAR_POS[key] || CHAR_POS.spring;
    var cscale = key === 'spring' ? 0.95 : key === 'dream' ? 1.0 : key === 'boudoir' ? 0.62 : 0.7;
    Object.keys(pos).forEach(function (k) {
      var c = makeCharacter(k);
      c.position.set(pos[k][0], pos[k][1], pos[k][2]);
      c.scale.setScalar(cscale);
      if (key === 'night') {
        c.traverse(function (o) { if (o.isMesh && o.material && o.material.color && !(o.userData && o.userData.keep)) o.material.color.setHex(0xe8d5b0); });
      }
      c.rotation.y = k === 'du' ? 0.06 : (pos[k][0] > 0 ? -0.18 : 0.18);
      c.visible = false;
      root.add(c);
      chars[k] = c;
    });
    var defaults = (SCENE_DEF[key] && SCENE_DEF[key].defaults) || ['du'];
    defaults.forEach(function (d) {
      if (!chars[d]) return;
      chars[d].visible = true;
      chars[d].userData.visibleDefault = true;
    });
  }

  function addBeacons(key) {
    var an = ANCHORS[key] || {};
    Object.keys(an).forEach(function (id) {
      var p = an[id];
      var g = group(p[0], p[1], p[2]);
      var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 1.6, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe1a8, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.y = 0.8; g.add(beam);
      var dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffdda0, transparent: true, opacity: 0.85 }));
      dot.position.y = 1.55; g.add(dot);
      var gl = glowSprite(1.3, 'rgba(255,220,160,.55)', 'rgba(255,190,110,0)'); gl.position.y = 1.55; g.add(gl);
      g.visible = false; g.userData = { id: id, dot: dot, glow: gl, beam: beam };
      root.add(g); beacons.push(g);
    });
  }

  function applyCam(key) {
    var c = (SCENE_DEF[key] && SCENE_DEF[key].cam) || SCENE_DEF.spring.cam;
    cam.az = c.az; cam.pol = c.pol; cam.dist = c.dist; cam.tx = c.tx; cam.ty = c.ty; cam.tz = c.tz;
    target.set(cam.tx, cam.ty, cam.tz);
    placeCamera();
  }
  function placeCamera() {
    if (!camera) return;
    var cy = Math.sin(cam.pol) * cam.dist;
    var cr = Math.cos(cam.pol) * cam.dist;
    camera.position.set(cam.tx + Math.sin(cam.az) * cr, cam.ty + cy, cam.tz + Math.cos(cam.az) * cr);
    camera.lookAt(target);
  }

  /* ---------- 对外 ---------- */
  TS.active = function () { return active; };

  TS.init = function () {
    canvas = document.getElementById('threeStage');
    if (!canvas || !window.THREE) return;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(43, 1, 0.1, 200);
    clock = new THREE.Clock();
    resize();
    bindControls();
    window.addEventListener('resize', resize);
    active = true;
    document.body.classList.add('mode-3d');
    animate();
  };

  function resize() {
    if (!renderer) return;
    W = canvas.clientWidth || canvas.parentElement.clientWidth || window.innerWidth;
    H = canvas.clientHeight || canvas.parentElement.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  function bindControls() {
    var px = 0, py = 0, moved = false;
    canvas.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, az: cam.az, pol: cam.pol };
      px = e.clientX; py = e.clientY; moved = false;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      cam.az = Math.max(-0.65, Math.min(0.65, drag.az + dx * 0.0025));
      cam.pol = Math.max(-0.02, Math.min(0.45, drag.pol + dy * 0.0018));
      placeCamera();
    });
    canvas.addEventListener('pointerup', function () { drag = null; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      cam.dist = Math.max(6, Math.min(26, cam.dist + e.deltaY * 0.012));
      placeCamera();
    }, { passive: false });
  }

  TS.enter = function (key, opts) {
    if (!active || !SCENE_DEF[key]) return;
    opts = opts || {};
    clearRoot();
    currentScene = key;
    built[key] = true;
    if (HYBRID) {
      var ar = 16 / 9;
      var camDef = SCENE_DEF[key].cam;
      var d = camDef.dist + Math.abs(BG.z);
      var fh = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      var fw = fh * (W / H);
      var sc = Math.max(fw / ar, fh) * 1.32;
      var pwid = ar * sc, phei = sc;
      BG.w = pwid; BG.h = phei;
      var tex = new THREE.TextureLoader().load('assets/img/scene_' + key + '.jpg');
      tex.minFilter = THREE.LinearFilter;
      var mat = new THREE.MeshBasicMaterial({ map: tex });
      bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(pwid, phei), mat);
      bgMesh.position.set(camDef.tx || 0, (camDef.ty || 0) - 1.0, BG.z);
      root.add(bgMesh);
      var catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.ShadowMaterial({ opacity: 0.16 }));
      catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0; catcher.receiveShadow = true; root.add(catcher);
    } else {
      SCENE_DEF[key].build();
      addBeacons(key);
    }
    addCharacters(key);
    applyCam(key);
    // 黎明/梦境色调
    if (key === 'dream' && opts.dawn) {
      scene.background = new THREE.Color(0x4a4a5e);
      scene.fog = new THREE.Fog(0x8a7f74, 24, 80);
    }
    canvas.classList.add('on');
    if (window.__layoutHS) setTimeout(window.__layoutHS, 60);
  };

  TS.dawn = function (on) {
    if (!active || !currentScene) return;
    if (currentScene === 'dream' && on) {
      scene.background = new THREE.Color(0x3a3a50);
      scene.fog.color.set(0x8a7f74);
    }
  };

  TS.speaker = function (who, narr) {
    if (!active || !currentScene) return;
    speakerKey = who || null;
    Object.keys(chars).forEach(function (k) {
      var c = chars[k];
      var isDefault = c.userData.visibleDefault;
      var isSpeaker = (k === who);
      if (isSpeaker) {
        c.visible = true;
        c.rotation.y = 0;
        c.userData.tag.material.opacity = 1;
        c.userData.arms[0].rotation.z = 0.05; c.userData.arms[1].rotation.z = -0.05;
      } else if (isDefault) {
        c.visible = true;
        c.rotation.y = (c.position.x > 0 ? -0.18 : 0.18);
        c.userData.tag.material.opacity = (who && !narr) ? 0.35 : 1;
      } else {
        c.visible = false;
      }
    });
  };
  TS.clearSpeaker = function () {
    if (!active) return;
    speakerKey = null;
    Object.keys(chars).forEach(function (k) {
      var c = chars[k];
      c.visible = !!c.userData.visibleDefault;
      c.userData.tag.material.opacity = 1;
    });
  };

  TS.hotspots = function (list) {
    if (!active) return;
    var ids = {};
    (list || []).forEach(function (h) { ids[h.id] = h; });
    beacons.forEach(function (b) {
      var h = ids[b.userData.id];
      b.visible = !!h;
      if (h) {
        var col = h.done ? 0x8a7f6a : 0xffdda0;
        b.userData.dot.material.color.setHex(col);
        b.userData.glow.material.color.setHex(col);
        b.userData.beam.material.color.setHex(col);
        b.userData.dot.material.opacity = h.done ? 0.35 : 0.9;
      }
    });
  };

  TS.project = function (sceneKey, id, xPct, yPct) {
    if (!active || sceneKey !== currentScene) return null;
    if (HYBRID && bgMesh) {
      var v0 = new THREE.Vector3(bgMesh.position.x + (xPct / 100 - 0.5) * BG.w, bgMesh.position.y + (0.5 - yPct / 100) * BG.h, BG.z);
      v0.project(camera);
      if (v0.z > 1 || v0.z < -1) return null;
      return { x: (v0.x * 0.5 + 0.5) * W, y: (-v0.y * 0.5 + 0.5) * H };
    }
    var p = (ANCHORS[sceneKey] || {})[id];
    if (!p) return null;
    var v = new THREE.Vector3(p[0], p[1], p[2]);
    v.project(camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  };

  /* ---------- 动画 ---------- */
  var lastProject = 0;
  function animate() {
    requestAnimationFrame(animate);
    if (!active) return;
    var dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    // 人物呼吸
    Object.keys(chars).forEach(function (k) {
      var c = chars[k];
      if (!c.visible) return;
      var ph = c.userData.phase;
      c.position.y = c.userData.baseY + Math.sin(time * 1.4 + ph) * 0.012;
      var sway = Math.sin(time * 1.1 + ph) * 0.012;
      c.userData.arms[0].rotation.z = 0.16 + sway;
      c.userData.arms[1].rotation.z = -0.16 - sway;
    });
    // 光点
    beacons.forEach(function (b, i) {
      if (!b.visible) return;
      b.userData.dot.rotation.y += dt * 0.8;
      b.userData.dot.position.y = 1.55 + Math.sin(time * 1.6 + i) * 0.08;
      b.userData.glow.position.y = b.userData.dot.position.y;
      b.userData.glow.material.opacity = 0.55 + Math.sin(time * 2 + i) * 0.15;
    });
    // 花瓣
    if (root && root.userData.petals) {
      root.userData.petals.children.forEach(function (p, i) {
        p.position.y -= dt * (0.25 + (i % 5) * 0.06);
        p.position.x += Math.sin(time * 0.6 + i) * dt * 0.2;
        p.rotation.z += dt * 0.8;
        if (p.position.y < 0.05) p.position.y = 8;
      });
    }
    if (root) {
      var bf = root.getObjectByName('butterfly');
      if (bf) {
        bf.position.y = 4.3 + Math.sin(time * 1.2) * 0.15;
        bf.position.x = 2.8 + Math.sin(time * 0.7) * 0.25;
      }
      var ff = root.getObjectByName('fireflies');
      if (ff) ff.rotation.y += dt * 0.02;
    }
    // 热点跟随镜头
    if (time - lastProject > 0.04) {
      lastProject = time;
      if (window.__layoutHS) window.__layoutHS();
    }
    renderer.render(scene, camera);
  }

  window.addEventListener('DOMContentLoaded', function () {
    try { TS.init(); } catch (e) { console.error('3D init failed', e); }
  });
})();

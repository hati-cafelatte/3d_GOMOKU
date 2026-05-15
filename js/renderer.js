'use strict';

class Renderer {
  constructor(container) {
    this.container = container;
    this.SIZE = 8;
    this.CELL = 1.5; // world units per cell
    this.pieceMeshes = new Map(); // "x,y,z" -> THREE.Mesh
    this.ghostMeshes = [];
    this.flipGroup = null; // group for flip animation
    this.isFlipping = false;

    this._initThree();
    this._buildBoard();
    this._animate();
  }

  // ── Three.js setup ────────────────────────────────────────

  _initThree() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040810);
    this.scene.fog = new THREE.Fog(0x040810, 45, 90);

    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 200);
    this.camera.position.set(20, 17, 20);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 55;

    // Lighting
    const ambient = new THREE.AmbientLight(0x1a3060, 3.0);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0x88ccff, 1.5);
    key.position.set(12, 20, 12);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xff7744, 0.5);
    fill.position.set(-12, -8, -12);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x00ffaa, 0.3);
    rim.position.set(0, -15, 0);
    this.scene.add(rim);

    window.addEventListener('resize', () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    // Group that holds all piece meshes (for flip animation)
    this.pieceGroup = new THREE.Group();
    this.scene.add(this.pieceGroup);
  }

  // ── Board construction ────────────────────────────────────

  _boardOffset() {
    return (this.SIZE - 1) * this.CELL / 2;
  }

  toWorld(x, y, z) {
    const o = this._boardOffset();
    return new THREE.Vector3(x * this.CELL - o, y * this.CELL - o, z * this.CELL - o);
  }

  _buildBoard() {
    const S = this.SIZE;
    const C = this.CELL;
    const half = S * C / 2;
    const o = this._boardOffset();

    // Outer bounding box (wireframe)
    const boxGeo = new THREE.BoxGeometry(S * C, S * C, S * C);
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0x4488cc, wireframe: true, transparent: true, opacity: 0.6
    });
    this.scene.add(new THREE.Mesh(boxGeo, boxMat));

    // Floor grid lines
    this._addGridLines(half, C, S);

    // Top layer guide dots
    const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x55aaee, transparent: true, opacity: 0.9 });
    for (let x = 0; x < S; x++)
      for (let z = 0; z < S; z++) {
        const d = new THREE.Mesh(dotGeo, dotMat.clone());
        d.position.copy(this.toWorld(x, S - 1, z));
        this.scene.add(d);
      }

    // Vertical column guide lines
    const colVerts = [];
    for (let x = 0; x < S; x++)
      for (let z = 0; z < S; z++) {
        const wx = x * C - o, wz = z * C - o;
        colVerts.push(wx, -half, wz, wx, half, wz);
      }
    const colGeo = new THREE.BufferGeometry();
    colGeo.setAttribute('position', new THREE.Float32BufferAttribute(colVerts, 3));
    const colMat = new THREE.LineBasicMaterial({ color: 0x2266aa, transparent: true, opacity: 0.7 });
    this.scene.add(new THREE.LineSegments(colGeo, colMat));

    // Horizontal layer rings at each y level (subtle)
    for (let y = 0; y < S; y++) {
      const wy = y * C - o;
      const ringVerts = [];
      const corners = [
        [-half, wy, -half], [half, wy, -half],
        [half, wy, half], [-half, wy, half], [-half, wy, -half]
      ];
      for (const c of corners) ringVerts.push(...c);
      const rGeo = new THREE.BufferGeometry();
      rGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringVerts, 3));
      const rMat = new THREE.LineBasicMaterial({ color: 0x2255aa, transparent: true, opacity: 0.5 });
      this.scene.add(new THREE.Line(rGeo, rMat));
    }
  }

  _addGridLines(half, C, S) {
    const verts = [];
    // Floor (y = -half)
    for (let i = 0; i <= S; i++) {
      const p = i * C - half;
      verts.push(p, -half, -half, p, -half, half);
      verts.push(-half, -half, p, half, -half, p);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x3388cc, transparent: true, opacity: 0.85 });
    this.scene.add(new THREE.LineSegments(geo, mat));
  }

  // ── Piece meshes ──────────────────────────────────────────

  _makePieceMesh(player, opacity = 1.0, emissiveBoost = 1.0) {
    const geo = new THREE.SphereGeometry(this.CELL * 0.38, 24, 24);
    const isP1 = player === 1;
    const color = isP1 ? 0x00aaff : 0xff6622;
    const emissive = isP1
      ? new THREE.Color(0x001f44).multiplyScalar(emissiveBoost)
      : new THREE.Color(0x3a1000).multiplyScalar(emissiveBoost);

    const mat = new THREE.MeshPhongMaterial({
      color,
      emissive,
      shininess: 90,
      transparent: opacity < 1,
      opacity
    });
    return new THREE.Mesh(geo, mat);
  }

  // 即時配置（リセット等に使用）
  addPiece(x, y, z, player) {
    const mesh = this._makePieceMesh(player);
    mesh.position.copy(this.toWorld(x, y, z));
    this.pieceGroup.add(mesh);
    this.pieceMeshes.set(`${x},${y},${z}`, mesh);
  }

  // 落下アニメーション付き配置 → Promise を返す
  addPieceAnimated(x, y, z, player) {
    return new Promise(resolve => {
      const mesh = this._makePieceMesh(player);
      const startPos = this.toWorld(x, this.SIZE - 1, z); // y=7 の天井から
      const endPos   = this.toWorld(x, y, z);             // 着地点

      mesh.position.copy(startPos);
      this.pieceGroup.add(mesh);
      this.pieceMeshes.set(`${x},${y},${z}`, mesh);

      // 落下距離に応じて速度調整（近ければ短く）
      const dist     = Math.abs(startPos.y - endPos.y);
      const duration = 80 + dist * 28; // ms
      const t0 = performance.now();

      const fall = (now) => {
        const t = Math.min((now - t0) / duration, 1);
        // ease-in (重力加速)
        const eased = t * t;
        mesh.position.y = startPos.y + (endPos.y - startPos.y) * eased;

        if (t < 1) { requestAnimationFrame(fall); return; }

        // 着地
        mesh.position.copy(endPos);

        // スクワッシュ＆ストレッチ
        this._squash(mesh, resolve);
      };
      requestAnimationFrame(fall);
    });
  }

  // スクワッシュ（着地演出）
  _squash(mesh, onDone) {
    const t0 = performance.now();
    const dur = 200;
    const squash = (now) => {
      const t = Math.min((now - t0) / dur, 1);
      // 0→0.4: 潰れる、0.4→1: バネで戻る
      let sy, sx;
      if (t < 0.4) {
        const p = t / 0.4;
        sy = 1 - 0.35 * p;
        sx = 1 + 0.2  * p;
      } else {
        // 弾性回復（オーバーシュート）
        const p = (t - 0.4) / 0.6;
        const spring = 1 + Math.sin(p * Math.PI * 2.2) * 0.12 * (1 - p);
        sy = spring;
        sx = 2 - spring;
      }
      if (!mesh.userData.pulse) {
        mesh.scale.set(sx, sy, sx);
      }
      if (t < 1) { requestAnimationFrame(squash); return; }
      if (!mesh.userData.pulse) mesh.scale.set(1, 1, 1);
      if (onDone) onDone();
    };
    requestAnimationFrame(squash);
  }

  removeAllPieces() {
    for (const mesh of this.pieceMeshes.values()) this.pieceGroup.remove(mesh);
    this.pieceMeshes.clear();
  }

  // 即時リビルド（リセット用）
  rebuildPieces(board) {
    this.removeAllPieces();
    const S = this.SIZE;
    for (let x = 0; x < S; x++)
      for (let y = 0; y < S; y++)
        for (let z = 0; z < S; z++)
          if (board[x][y][z]) this.addPiece(x, y, z, board[x][y][z]);
  }

  // フリップ後の落下アニメーション付きリビルド → Promise
  // 石をコラムごとに時差をつけて落下させる
  rebuildPiecesAnimated(board) {
    this.removeAllPieces();
    const S = this.SIZE;

    // コラムごとに石を収集
    const columns = [];
    for (let x = 0; x < S; x++)
      for (let z = 0; z < S; z++) {
        const pieces = [];
        for (let y = 0; y < S; y++)
          if (board[x][y][z]) pieces.push({ x, y, z, player: board[x][y][z] });
        if (pieces.length) columns.push(pieces);
      }

    if (!columns.length) return Promise.resolve();

    // シャッフルして見た目にランダム感を出す
    for (let i = columns.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [columns[i], columns[j]] = [columns[j], columns[i]];
    }

    // 全石の Promise を集めて全部終わったら resolve
    const allPromises = [];
    const stagger = 35; // ms per column

    columns.forEach((pieces, ci) => {
      // コラム内の石は下から順に落とす（y昇順）
      pieces.sort((a, b) => a.y - b.y).forEach((p, pi) => {
        const delay = ci * stagger + pi * 20;
        const promise = new Promise(resolve => {
          setTimeout(() => {
            this.addPieceAnimated(p.x, p.y, p.z, p.player).then(resolve);
          }, delay);
        });
        allPromises.push(promise);
      });
    });

    return Promise.all(allPromises);
  }

  // ── Ghost ─────────────────────────────────────────────────

  updateGhost(x, z, player, landY) {
    this.clearGhosts();
    if (x < 0 || z < 0) return;

    const S = this.SIZE;

    // Ghost sphere at y=7 (top)
    const ghost = this._makePieceMesh(player, 0.45);
    ghost.position.copy(this.toWorld(x, S - 1, z));
    this.scene.add(ghost);
    this.ghostMeshes.push(ghost);

    if (landY >= 0) {
      // Landing preview (wireframe sphere)
      if (landY < S - 1) {
        const land = this._makePieceMesh(player, 0.2);
        land.material.wireframe = true;
        land.position.copy(this.toWorld(x, landY, z));
        this.scene.add(land);
        this.ghostMeshes.push(land);
      }

      // Dashed drop line from top to landing
      const pts = [
        this.toWorld(x, S - 1, z),
        this.toWorld(x, landY, z)
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: player === 1 ? 0x00aaff : 0xff6622,
        transparent: true,
        opacity: 0.25
      });
      const line = new THREE.Line(lineGeo, lineMat);
      this.scene.add(line);
      this.ghostMeshes.push(line);
    } else {
      // Column full: red "blocked" indicator
      const blocked = new THREE.Mesh(
        new THREE.SphereGeometry(this.CELL * 0.38, 12, 12),
        new THREE.MeshPhongMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 })
      );
      blocked.position.copy(this.toWorld(x, S - 1, z));
      this.scene.add(blocked);
      this.ghostMeshes.push(blocked);
    }
  }

  clearGhosts() {
    for (const m of this.ghostMeshes) this.scene.remove(m);
    this.ghostMeshes = [];
  }

  // ── Win highlight ─────────────────────────────────────────

  highlightWinners(cells) {
    for (const [x, y, z] of cells) {
      const mesh = this.pieceMeshes.get(`${x},${y},${z}`);
      if (!mesh) continue;
      mesh.material.color.set(0xff1122);
      mesh.material.emissive.set(0x550008);
      mesh.material.transparent = true;
      mesh.material.opacity = 1;
      // Pulse scale via userData
      mesh.userData.pulse = true;
      mesh.scale.set(1.3, 1.3, 1.3);
    }
  }

  // ── Flip animation ────────────────────────────────────────

  // Phase1: 全石スケールアウト
  // Midpoint: onMidpoint() でゲームデータをフリップ
  // Phase2: rebuildPiecesAnimated で落下演出
  // onDone は全石着地後に呼ばれる
  animateFlip(onMidpoint, onDone) {
    if (this.isFlipping) return;
    this.isFlipping = true;

    const oldPieces = Array.from(this.pieceMeshes.values());
    let t0 = performance.now();

    const scaleOut = (now) => {
      const t = Math.min((now - t0) / 160, 1);
      const s = 1 - t * t;
      for (const m of oldPieces) m.scale.setScalar(Math.max(0, s));
      if (t < 1) { requestAnimationFrame(scaleOut); return; }

      // データフリップ（onMidpointの中でrebuildPiecesAnimatedを呼ぶ）
      const board = onMidpoint(); // ← board を返してもらう

      // 落下アニメーション
      this.rebuildPiecesAnimated(board).then(() => {
        this.isFlipping = false;
        onDone();
      });
    };
    requestAnimationFrame(scaleOut);
  }

  // ── Render loop ───────────────────────────────────────────

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();

    // Pulse winning pieces
    const t = performance.now() * 0.003;
    for (const mesh of this.pieceMeshes.values()) {
      if (mesh.userData.pulse) {
        const s = 1.3 + Math.sin(t * 3) * 0.07;
        mesh.scale.set(s, s, s);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

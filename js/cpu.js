'use strict';

class CPU {
  constructor(game) {
    this.game       = game;
    this.difficulty = 'normal';
    this.worker     = null;
    this._initWorker();
  }

  setDifficulty(diff) {
    this.difficulty = diff;
  }

  _initWorker() {
    try {
      // GitHub Pages subpath対応: location.hrefから絶対URLを構築
      const workerUrl = new URL('js/cpu_worker.js', location.href).href;
      this.worker = new Worker(workerUrl);
      console.log('[CPU] Worker started:', workerUrl);

      // Worker起動確認用の初回エラーハンドラ
      this.worker.onerror = (err) => {
        console.error('[CPU] Worker failed to load:', err);
        this.worker = null;
      };
    } catch (e) {
      console.warn('[CPU] Web Worker unavailable:', e);
      this.worker = null;
    }
  }

  // Returns Promise<{ move: {success,x,y,z}|null, usedFlip: bool }>
  think() {
    return new Promise((resolve) => {
      const g    = this.game;
      const diff = this.difficulty;

      // Workerなしフォールバック（ランダム）
      if (!this.worker) {
        console.warn('[CPU] Using random fallback');
        const available = [];
        for (let x = 0; x < g.SIZE; x++)
          for (let z = 0; z < g.SIZE; z++)
            if (!g.isColumnFull(x, z)) available.push([x, z]);
        if (!available.length) { resolve({ move: null, usedFlip: false }); return; }
        const [x, z] = available[Math.floor(Math.random() * available.length)];
        resolve({ move: g.placePiece(x, z, 2), usedFlip: false });
        return;
      }

      // Worker使用
      this.worker.onmessage = (e) => {
        const { move: colMove, useFlip } = e.data;

        let usedFlip = false;
        if (useFlip) {
          usedFlip = g.flip(2);
        }

        let result = null;
        if (colMove) {
          const [x, z] = colMove;
          result = g.placePiece(x, z, 2);
        }

        resolve({ move: result, usedFlip });
      };

      this.worker.onerror = (err) => {
        console.error('[CPU Worker runtime error]', err);
        // フォールバック
        const available = [];
        for (let x = 0; x < g.SIZE; x++)
          for (let z = 0; z < g.SIZE; z++)
            if (!g.isColumnFull(x, z)) available.push([x, z]);
        if (!available.length) { resolve({ move: null, usedFlip: false }); return; }
        const [x, z] = available[Math.floor(Math.random() * available.length)];
        resolve({ move: g.placePiece(x, z, 2), usedFlip: false });
      };

      this.worker.postMessage({
        board:      g.board,
        canFlip:    g.playerCanFlip[2],
        difficulty: diff,
      });
    });
  }
}

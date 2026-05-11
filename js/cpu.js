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
      this.worker = new Worker('./js/cpu_worker.js');
    } catch (e) {
      console.warn('[CPU] Web Worker unavailable, using sync fallback', e);
      this.worker = null;
    }
  }

  // Returns Promise<{ move: {success,x,y,z}|null, usedFlip: bool }>
  think() {
    return new Promise((resolve) => {
      const g    = this.game;
      const diff = this.difficulty;

      // No Worker fallback (random)
      if (!this.worker) {
        const available = [];
        for (let x = 0; x < g.SIZE; x++)
          for (let z = 0; z < g.SIZE; z++)
            if (!g.isColumnFull(x, z)) available.push([x, z]);
        if (!available.length) { resolve({ move: null, usedFlip: false }); return; }
        const [x, z] = available[Math.floor(Math.random() * available.length)];
        resolve({ move: g.placePiece(x, z, 2), usedFlip: false });
        return;
      }

      // Worker path
      this.worker.onmessage = null;

      this.worker.onmessage = (e) => {
        const { move: colMove, useFlip } = e.data;

        let usedFlip = false;
        if (useFlip) {
          usedFlip = g.flip(2); // applies flip + gravity to the live game board
        }

        let result = null;
        if (colMove) {
          const [x, z] = colMove;
          result = g.placePiece(x, z, 2);
        }

        resolve({ move: result, usedFlip });
      };

      this.worker.onerror = (err) => {
        console.error('[CPU Worker error]', err);
        const available = [];
        for (let x = 0; x < g.SIZE; x++)
          for (let z = 0; z < g.SIZE; z++)
            if (!g.isColumnFull(x, z)) available.push([x, z]);
        if (!available.length) { resolve({ move: null, usedFlip: false }); return; }
        const [x, z] = available[Math.floor(Math.random() * available.length)];
        resolve({ move: g.placePiece(x, z, 2), usedFlip: false });
      };

      this.worker.postMessage({
        board:      this.game.board,
        canFlip:    this.game.playerCanFlip[2],
        difficulty: diff,
      });
    });
  }
}

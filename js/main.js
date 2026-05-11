'use strict';

let game, ren, cpu;
let msgTimer = null;

// ── Init ──────────────────────────────────────────────────────

function init() {
  game = new Game();
  ren = new Renderer(document.getElementById('canvas-container'));
  cpu = new CPU(game);

  document.getElementById('flip-btn').addEventListener('click', onPlayerFlip);
  document.getElementById('reset-btn').addEventListener('click', onReset);
  document.addEventListener('keydown', onKeyDown);

  updateUI();
  updateGhost();
}

// ── UI ────────────────────────────────────────────────────────

function updateUI() {
  const isP1Turn = game.currentPlayer === 1;
  const over = game.gameOver;

  // Active player badges
  document.getElementById('p1-badge').classList.toggle('active', isP1Turn && !over);
  document.getElementById('p2-badge').classList.toggle('active', !isP1Turn && !over);

  // Turn indicator
  const turnEl = document.getElementById('turn-indicator');
  if (over) {
    const w = game.winnerPlayer;
    if (w === 0)      { turnEl.textContent = '引き分け！'; }
    else if (w === 1) { turnEl.textContent = '🎉 あなたの勝ち！'; }
    else              { turnEl.textContent = '💻 CPUの勝ち！'; }
    turnEl.className = 'turn-indicator game-over';
  } else {
    turnEl.textContent = isP1Turn ? 'あなたのターン' : '💭 CPU 考え中...';
    turnEl.className = 'turn-indicator';
  }

  // Flip button
  const flipBtn = document.getElementById('flip-btn');
  const canFlip = game.playerCanFlip[1] && !over && isP1Turn;
  flipBtn.disabled = !canFlip;

  // Flip availability status badges
  const badgeP1 = document.getElementById('flip-badge-p1');
  const badgeP2 = document.getElementById('flip-badge-2');
  if (badgeP1) {
    badgeP1.textContent = game.playerCanFlip[1] ? 'あなた ✓' : 'あなた ✗';
    badgeP1.classList.toggle('available', game.playerCanFlip[1]);
  }
  if (badgeP2) {
    badgeP2.textContent = game.playerCanFlip[2] ? 'CPU ✓' : 'CPU ✗';
    badgeP2.classList.toggle('available', game.playerCanFlip[2]);
  }
}

function showMessage(msg, duration = 2800) {
  const el = document.getElementById('status-message');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(msgTimer);
  if (duration > 0) {
    msgTimer = setTimeout(() => el.classList.remove('visible'), duration);
  }
}

function hideMessage() {
  document.getElementById('status-message').classList.remove('visible');
}

function updateGhost() {
  if (game.gameOver || game.currentPlayer !== 1 || ren.isFlipping) {
    ren.clearGhosts();
    return;
  }
  const { ghostX: gx, ghostZ: gz } = game;
  const landY = game.getDropY(gx, gz);
  ren.updateGhost(gx, gz, 1, landY);
}

// ── Player controls ───────────────────────────────────────────

function onKeyDown(e) {
  if (game.gameOver || game.currentPlayer !== 1 || ren.isFlipping) return;

  let moved = false;
  switch (e.key) {
    case 'ArrowLeft':  game.ghostX = Math.max(0, game.ghostX - 1); moved = true; break;
    case 'ArrowRight': game.ghostX = Math.min(7, game.ghostX + 1); moved = true; break;
    case 'ArrowUp':    game.ghostZ = Math.max(0, game.ghostZ - 1); moved = true; break;
    case 'ArrowDown':  game.ghostZ = Math.min(7, game.ghostZ + 1); moved = true; break;
    case ' ':
    case 'Enter':
      e.preventDefault();
      doPlayerPlace();
      return;
  }
  if (moved) {
    e.preventDefault();
    updateGhost();
  }
}

function doPlayerPlace() {
  if (game.isColumnFull(game.ghostX, game.ghostZ)) {
    showMessage('⚠ そこにはおけません！', 2000);
    return;
  }

  const result = game.placePiece(game.ghostX, game.ghostZ, 1);
  if (!result.success) {
    showMessage('⚠ そこにはおけません！', 2000);
    return;
  }

  ren.addPiece(result.x, result.y, result.z, 1);
  ren.clearGhosts();

  const winState = game.checkWinState();
  if (winState) {
    resolveWin(winState, null);
    return;
  }

  game.currentPlayer = 2;
  updateUI();
  setTimeout(doCpuTurn, 800);
}

function onPlayerFlip() {
  if (game.currentPlayer !== 1 || game.gameOver || ren.isFlipping) return;
  if (!game.playerCanFlip[1]) {
    showMessage('ひっくり返しはもう使いました！', 2000);
    return;
  }

  showMessage('ひっくり返す！', 600);

  ren.animateFlip(
    // midpoint: actually flip the data
    () => {
      game.flip(1);
      ren.rebuildPieces(game.board);
    },
    // done: check win and continue
    () => {
      const winState = game.checkWinState();
      if (winState) {
        resolveWin(winState, 1);
        return;
      }
      game.currentPlayer = 2;
      updateUI();
      updateGhost();
      setTimeout(doCpuTurn, 800);
    }
  );
  updateUI();
}

// ── CPU turn ──────────────────────────────────────────────────

function doCpuTurn() {
  if (game.gameOver) return;

  // Maybe flip
  if (cpu.shouldFlip()) {
    showMessage('💻 CPUがひっくり返した！', 2000);

    ren.animateFlip(
      () => {
        game.flip(2);
        ren.rebuildPieces(game.board);
      },
      () => {
        const winState = game.checkWinState();
        if (winState) {
          resolveWin(winState, 2);
          return;
        }
        // CPU still places after flip
        doCpuPlace();
      }
    );
    return;
  }

  doCpuPlace();
}

function doCpuPlace() {
  if (game.gameOver) return;

  const result = cpu.makeMove();
  if (!result) {
    game.gameOver = true;
    game.winnerPlayer = 0;
    updateUI();
    showMessage('引き分け！', -1);
    return;
  }

  ren.addPiece(result.x, result.y, result.z, 2);

  const winState = game.checkWinState();
  if (winState) {
    resolveWin(winState, null);
    return;
  }

  game.currentPlayer = 1;
  updateUI();
  updateGhost();
}

// ── Win resolution ────────────────────────────────────────────

// flipPlayer: who triggered the flip (1 or 2), or null if not from flip
function resolveWin(winState, flipPlayer) {
  game.gameOver = true;

  if (winState.winner === 0) {
    game.winnerPlayer = 0;
    updateUI();
    showMessage('引き分け！', -1);
    return;
  }

  let winner;

  if (winState.both) {
    // Both players aligned simultaneously (only via flip) → flip player wins
    winner = flipPlayer !== null ? flipPlayer : 1;
    ren.highlightWinners(winState.w1[0]);
    ren.highlightWinners(winState.w2[0]);
  } else {
    winner = winState.winner;
    ren.highlightWinners(winState.cells);
  }

  game.winnerPlayer = winner;
  updateUI();
  ren.clearGhosts();

  const msg = winner === 1 ? '🎉 あなたの勝ち！' : '💻 CPUの勝ち！';
  showMessage(msg, -1);
}

// ── Reset ─────────────────────────────────────────────────────

function onReset() {
  game.reset();
  ren.removeAllPieces();
  ren.clearGhosts();
  ren.isFlipping = false;
  ren.pieceGroup.rotation.x = 0;
  hideMessage();
  updateUI();
  updateGhost();
}

// ── Boot ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

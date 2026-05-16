'use strict';

let game, ren, cpu;
let msgTimer   = null;
let thinkTimer = null;

// ── Init ──────────────────────────────────────────────────────

function init() {
  game = new Game();
  ren  = new Renderer(document.getElementById('canvas-container'));
  cpu  = new CPU(game);

  document.getElementById('flip-btn').addEventListener('click', onPlayerFlip);
  document.getElementById('reset-btn').addEventListener('click', onReset);
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => onDifficultyChange(btn.dataset.diff));
  });
  document.addEventListener('keydown', onKeyDown);

  onDifficultyChange('normal');
  updateUI();
  updateGhost();
}

// ── Difficulty ────────────────────────────────────────────────

function onDifficultyChange(diff) {
  cpu.setDifficulty(diff);
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
}

// ── UI helpers ────────────────────────────────────────────────

function updateUI() {
  const isP1Turn = game.currentPlayer === 1;
  const over     = game.gameOver;

  document.getElementById('p1-badge').classList.toggle('active', isP1Turn && !over);
  document.getElementById('p2-badge').classList.toggle('active', !isP1Turn && !over);

  const turnEl = document.getElementById('turn-indicator');
  if (over) {
    const w = game.winnerPlayer;
    turnEl.textContent =
      w === 0 ? '引き分け！' :
      w === 1 ? '🎉 あなたの勝ち！' : '💻 CPUの勝ち！';
    turnEl.className = 'turn-indicator game-over';
  } else {
    turnEl.textContent = isP1Turn ? 'あなたのターン' : '💭 CPU 思考中...';
    turnEl.className   = 'turn-indicator' + (isP1Turn ? '' : ' cpu-thinking');
  }

  const flipBtn = document.getElementById('flip-btn');
  flipBtn.disabled = !(game.playerCanFlip[1] && !over && isP1Turn);

  const bp1 = document.getElementById('flip-badge-p1');
  const bp2 = document.getElementById('flip-badge-2');
  if (bp1) {
    bp1.textContent = game.playerCanFlip[1] ? 'あなた ✓' : 'あなた ✗';
    bp1.classList.toggle('available', game.playerCanFlip[1]);
  }
  if (bp2) {
    bp2.textContent = game.playerCanFlip[2] ? 'CPU ✓' : 'CPU ✗';
    bp2.classList.toggle('available', game.playerCanFlip[2]);
  }

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.disabled = (!isP1Turn && !over);
  });
}

function showMessage(msg, duration = 2800) {
  const el = document.getElementById('status-message');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(msgTimer);
  if (duration > 0) msgTimer = setTimeout(() => el.classList.remove('visible'), duration);
}

function hideMessage() {
  clearTimeout(msgTimer);
  document.getElementById('status-message').classList.remove('visible');
}

function startThinkingIndicator(diff) {
  clearInterval(thinkTimer);
  let secs = 0;
  const frames = ['💭', '💭', '💭', '💭'];
  let fi = 0;
  const el = document.getElementById('status-message');
  const tick = () => {
    el.textContent = `${frames[fi % frames.length]} AIが悩んでいます... (${secs}秒)`;
    el.classList.add('visible', 'thinking');
    secs++; fi++;
  };
  tick();
  thinkTimer = setInterval(tick, 1000);
}

function stopThinkingIndicator() {
  clearInterval(thinkTimer);
  thinkTimer = null;
  const el = document.getElementById('status-message');
  el.classList.remove('thinking', 'visible');
}

function updateGhost() {
  if (game.gameOver || game.currentPlayer !== 1 || ren.isFlipping) {
    ren.clearGhosts(); return;
  }
  const { ghostX: gx, ghostZ: gz } = game;
  ren.updateGhost(gx, gz, 1, game.getDropY(gx, gz));
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
    case 'Enter': e.preventDefault(); doPlayerPlace(); return;
  }
  if (moved) { e.preventDefault(); updateGhost(); }
}

async function doPlayerPlace() {
  if (game.isColumnFull(game.ghostX, game.ghostZ)) {
    showMessage('⚠ そこにはおけません！', 2000); return;
  }
  const result = game.placePiece(game.ghostX, game.ghostZ, 1);
  if (!result.success) { showMessage('⚠ そこにはおけません！', 2000); return; }

  ren.clearGhosts();

  // 落下アニメーションを待つ（その間は入力ブロック）
  ren.isFlipping = true;
  await ren.addPieceAnimated(result.x, result.y, result.z, 1);
  ren.isFlipping = false;

  const winState = game.checkWinState();
  if (winState) { resolveWin(winState, null); return; }

  game.currentPlayer = 2;
  updateUI();
  setTimeout(doCpuTurn, 300);
}

function onPlayerFlip() {
  if (game.currentPlayer !== 1 || game.gameOver || ren.isFlipping) return;
  if (!game.playerCanFlip[1]) { showMessage('ひっくり返しはもう使いました！', 2000); return; }

  showMessage('ひっくり返す！', 800);

  ren.animateFlip(
    () => {
      game.flip(1);
      return game.board;
    },
    () => {
      const winState = game.checkWinState();
      if (winState) { resolveWin(winState, 1); return; }

      // フリップでターン終了 → CPUへ
      game.currentPlayer = 2;
      updateUI();
      updateGhost();
      setTimeout(doCpuTurn, 300);
    }
  );
  updateUI();
}

// ── CPU turn (async) ──────────────────────────────────────────

async function doCpuTurn() {
  if (game.gameOver) return;

  const diff = cpu.difficulty;
  if (diff === 'hard' || diff === 'lunatic') startThinkingIndicator(diff);

  const { move, usedFlip } = await cpu.think();

  stopThinkingIndicator();
  if (game.gameOver) return;

  // ── フリップしたターン：石は置かず終了 ──────────────────────
  if (usedFlip) {
    showMessage('💻 CPUがひっくり返した！', 2500);

    await new Promise(resolve => {
      ren.animateFlip(
        () => game.board,
        resolve
      );
    });

    const winStateAfterFlip = game.checkWinState();
    if (winStateAfterFlip) { resolveWin(winStateAfterFlip, 2); return; }

    // フリップでターン終了 → プレイヤーへ
    game.currentPlayer = 1;
    updateUI();
    updateGhost();
    return;
  }

  // ── 通常の石配置 ─────────────────────────────────────────────
  if (!move) {
    game.gameOver = true; game.winnerPlayer = 0;
    updateUI(); showMessage('引き分け！', -1); return;
  }

  ren.isFlipping = true;
  await ren.addPieceAnimated(move.x, move.y, move.z, 2);
  ren.isFlipping = false;

  const winState = game.checkWinState();
  if (winState) { resolveWin(winState, null); return; }

  game.currentPlayer = 1;
  updateUI();
  updateGhost();
}

// ── Win resolution ────────────────────────────────────────────

function resolveWin(winState, flipPlayer) {
  game.gameOver = true;
  if (winState.winner === 0) {
    game.winnerPlayer = 0; updateUI(); showMessage('引き分け！', -1); return;
  }
  let winner;
  if (winState.both) {
    winner = flipPlayer !== null ? flipPlayer : 1;
    ren.highlightWinners(winState.w1[0]);
    ren.highlightWinners(winState.w2[0]);
  } else {
    winner = winState.winner;
    ren.highlightWinners(winState.cells);
  }
  game.winnerPlayer = winner;
  updateUI(); ren.clearGhosts();
  showMessage(winner === 1 ? '🎉 あなたの勝ち！' : '💻 CPUの勝ち！', -1);
}

// ── Reset ─────────────────────────────────────────────────────

function onReset() {
  stopThinkingIndicator();
  game.reset();
  ren.removeAllPieces(); ren.clearGhosts();
  ren.isFlipping = false;
  ren.pieceGroup.rotation.x = 0;
  hideMessage(); updateUI(); updateGhost();
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

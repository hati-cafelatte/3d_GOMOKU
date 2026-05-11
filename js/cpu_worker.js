'use strict';

// ── Constants ────────────────────────────────────────────────

const S = 8;

// All 13 direction vectors for 3D lines
const DIRS = [
  [1,0,0],[0,1,0],[0,0,1],
  [1,1,0],[1,-1,0],[1,0,1],[1,0,-1],
  [0,1,1],[0,1,-1],
  [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1]
];

// ── Board helpers ────────────────────────────────────────────

function getDropY(board, x, z) {
  for (let y = 0; y < S; y++)
    if (board[x][y][z] === 0) return y;
  return -1;
}

function getValidMoves(board) {
  const moves = [];
  for (let x = 0; x < S; x++)
    for (let z = 0; z < S; z++)
      if (getDropY(board, x, z) !== -1) moves.push([x, z]);
  return moves;
}

function cloneBoard(board) {
  return board.map(xz => xz.map(col => [...col]));
}

function makeMove(board, x, z, player) {
  const y = getDropY(board, x, z);
  if (y === -1) return null;
  const nb = cloneBoard(board);
  nb[x][y][z] = player;
  return nb;
}

function applyFlip(board) {
  const nb = Array.from({length:S}, () =>
    Array.from({length:S}, () => new Array(S).fill(0))
  );
  // Mirror Y
  for (let x = 0; x < S; x++)
    for (let y = 0; y < S; y++)
      for (let z = 0; z < S; z++)
        nb[x][S-1-y][z] = board[x][y][z];
  // Re-apply gravity
  for (let x = 0; x < S; x++)
    for (let z = 0; z < S; z++) {
      const col = [];
      for (let y = 0; y < S; y++) if (nb[x][y][z] !== 0) col.push(nb[x][y][z]);
      for (let y = 0; y < S; y++) nb[x][y][z] = y < col.length ? col[y] : 0;
    }
  return nb;
}

// ── Win check ────────────────────────────────────────────────

function checkWin(board, player) {
  for (let x = 0; x < S; x++)
    for (let y = 0; y < S; y++)
      for (let z = 0; z < S; z++) {
        if (board[x][y][z] !== player) continue;
        for (const [dx, dy, dz] of DIRS) {
          let cnt = 1;
          for (let i = 1; i < 5; i++) {
            const nx = x+dx*i, ny = y+dy*i, nz = z+dz*i;
            if (nx<0||nx>=S||ny<0||ny>=S||nz<0||nz>=S) break;
            if (board[nx][ny][nz] !== player) break;
            cnt++;
          }
          if (cnt >= 5) return true;
        }
      }
  return false;
}

// ── Heuristic evaluation ─────────────────────────────────────

// Score a window of 5 cells based on (cpu_count, player_count)
function windowScore(cpu, pl) {
  if (cpu > 0 && pl > 0) return 0; // blocked — no value
  if (cpu === 5) return  10_000_000;
  if (pl  === 5) return -10_000_000;
  if (cpu === 4) return      80_000;
  if (pl  === 4) return    -250_000; // urgent block
  if (cpu === 3) return         800;
  if (pl  === 3) return      -2_500;
  if (cpu === 2) return           8;
  if (pl  === 2) return         -25;
  if (cpu === 1) return           1;
  if (pl  === 1) return          -3;
  return 0;
}

function evaluate(board) {
  let score = 0;
  for (let x = 0; x < S; x++)
    for (let y = 0; y < S; y++)
      for (let z = 0; z < S; z++)
        for (const [dx, dy, dz] of DIRS) {
          const ex = x+dx*4, ey = y+dy*4, ez = z+dz*4;
          if (ex<0||ex>=S||ey<0||ey>=S||ez<0||ez>=S) continue;
          let cpu = 0, pl = 0;
          for (let i = 0; i < 5; i++) {
            const v = board[x+dx*i][y+dy*i][z+dz*i];
            if (v === 2) cpu++;
            else if (v === 1) pl++;
          }
          score += windowScore(cpu, pl);
        }
  return score;
}

// ── Move ordering ────────────────────────────────────────────

function orderMoves(board, moves) {
  return moves
    .map(([x, z]) => {
      // Center of board gravity bonus
      const centerScore = -(Math.abs(x - 3.5) + Math.abs(z - 3.5)) * 80;
      const nb = makeMove(board, x, z, 2);
      // Check for immediate win
      if (nb && checkWin(nb, 2)) return { x, z, s: 100_000_000 };
      // Check for immediate block (player would win here)
      const nb2 = makeMove(board, x, z, 1);
      if (nb2 && checkWin(nb2, 1)) return { x, z, s: 90_000_000 };
      const s = nb ? evaluate(nb) + centerScore : -Infinity;
      return { x, z, s };
    })
    .sort((a, b) => b.s - a.s)
    .map(({ x, z }) => [x, z]);
}

// ── Minimax α-β ──────────────────────────────────────────────

let _startTime, _timeLimit, _timedOut;

function minimax(board, depth, alpha, beta, maximizing) {
  if (performance.now() - _startTime >= _timeLimit) {
    _timedOut = true;
    return evaluate(board);
  }

  if (checkWin(board, 2)) return  9_000_000 + depth * 1000;
  if (checkWin(board, 1)) return -9_000_000 - depth * 1000;

  const moves = getValidMoves(board);
  if (!moves.length || depth === 0) return evaluate(board);

  const ordered = orderMoves(board, moves);

  if (maximizing) {
    let best = -Infinity;
    for (const [x, z] of ordered) {
      const nb = makeMove(board, x, z, 2);
      if (!nb) continue;
      const v = minimax(nb, depth-1, alpha, beta, false);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (beta <= alpha || _timedOut) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const [x, z] of ordered) {
      const nb = makeMove(board, x, z, 1);
      if (!nb) continue;
      const v = minimax(nb, depth-1, alpha, beta, true);
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (beta <= alpha || _timedOut) break;
    }
    return best;
  }
}

// ── Iterative deepening ──────────────────────────────────────

function findBestMove(board, timeLimitMs, maxDepth) {
  _startTime  = performance.now();
  _timeLimit  = timeLimitMs;
  _timedOut   = false;

  const moves = orderMoves(board, getValidMoves(board));
  if (!moves.length) return null;

  let bestMove  = moves[0]; // safe fallback (greedy best)
  let bestScore = -Infinity;

  for (let depth = 1; depth <= maxDepth; depth++) {
    _timedOut = false;
    let depthBest  = null;
    let depthScore = -Infinity;

    for (const [x, z] of moves) {
      const nb = makeMove(board, x, z, 2);
      if (!nb) continue;
      const v = minimax(nb, depth-1, -Infinity, Infinity, false);
      if (v > depthScore) { depthScore = v; depthBest = [x, z]; }
      if (_timedOut) break;
    }

    // Only commit this depth's result if we weren't cut off mid-search
    if (depthBest && (!_timedOut || depth === 1)) {
      bestMove  = depthBest;
      bestScore = depthScore;
    }

    if (performance.now() - _startTime >= _timeLimit) break;
    if (bestScore >= 9_000_000) break; // found forced win, no need to go deeper
  }

  return bestMove;
}

// ── Flip decision ────────────────────────────────────────────

function shouldUseFlip(board, canFlip, difficulty) {
  if (!canFlip) return false;

  const flipped = applyFlip(board);

  // Always flip if it creates immediate CPU win
  if (checkWin(flipped, 2)) return true;

  // Never flip if it hands the player an immediate win (without us also winning)
  if (checkWin(flipped, 1)) return false;

  if (difficulty === 'easy') return Math.random() < 0.05;

  // Score gain from flip
  const gain = evaluate(flipped) - evaluate(board);
  const threshold = { normal: 20_000, hard: 10_000, lunatic: 4_000 }[difficulty] ?? 20_000;
  return gain > threshold;
}

// ── Worker entry point ───────────────────────────────────────

self.onmessage = (e) => {
  const { board, canFlip, difficulty } = e.data;

  // Difficulty parameters
  const params = {
    easy:   { time:    80, depth:  1 },
    normal: { time:   600, depth:  3 },
    hard:   { time:  4000, depth:  7 },
    lunatic:{ time:  9000, depth: 12 },
  };
  const { time, depth } = params[difficulty] ?? params.normal;

  // Flip decision
  const useFlip = shouldUseFlip(board, canFlip, difficulty);

  // Search on (possibly flipped) board
  const searchBoard = useFlip ? applyFlip(board) : board;
  let move = findBestMove(searchBoard, time, depth);

  // Lunatic: very rare random blunder (~3% chance)
  if (difficulty === 'lunatic' && Math.random() < 0.03) {
    const valid = getValidMoves(searchBoard);
    if (valid.length) move = valid[Math.floor(Math.random() * valid.length)];
  }

  self.postMessage({ move, useFlip });
};

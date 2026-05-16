'use strict';

// ── Constants ────────────────────────────────────────────────────

const S = 8;
const DIRS = [
  [1,0,0],[0,1,0],[0,0,1],
  [1,1,0],[1,-1,0],[1,0,1],[1,0,-1],
  [0,1,1],[0,1,-1],
  [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1]
];

// ── Board helpers ────────────────────────────────────────────────

function getDropY(board, x, z) {
  for (let y = 0; y < S; y++) if (board[x][y][z] === 0) return y;
  return -1;
}

function getValidMoves(board) {
  const m = [];
  for (let x = 0; x < S; x++)
    for (let z = 0; z < S; z++)
      if (getDropY(board, x, z) !== -1) m.push([x, z]);
  return m;
}

function cloneBoard(board) {
  return board.map(xz => xz.map(col => col.slice()));
}

function applyMove(board, x, z, player) {
  const y = getDropY(board, x, z);
  if (y === -1) return null;
  const nb = cloneBoard(board);
  nb[x][y][z] = player;
  return nb;
}

function applyFlipBoard(board) {
  const nb = Array.from({length:S}, () =>
    Array.from({length:S}, () => new Array(S).fill(0)));
  for (let x = 0; x < S; x++)
    for (let y = 0; y < S; y++)
      for (let z = 0; z < S; z++)
        nb[x][S-1-y][z] = board[x][y][z];
  for (let x = 0; x < S; x++)
    for (let z = 0; z < S; z++) {
      const col = [];
      for (let y = 0; y < S; y++) if (nb[x][y][z]) col.push(nb[x][y][z]);
      for (let y = 0; y < S; y++) nb[x][y][z] = y < col.length ? col[y] : 0;
    }
  return nb;
}

// ── Win check ────────────────────────────────────────────────────

function checkWin(board, player) {
  for (let x = 0; x < S; x++)
  for (let y = 0; y < S; y++)
  for (let z = 0; z < S; z++) {
    if (board[x][y][z] !== player) continue;
    for (const [dx,dy,dz] of DIRS) {
      let c = 1;
      for (let i = 1; i < 5; i++) {
        const nx=x+dx*i, ny=y+dy*i, nz=z+dz*i;
        if (nx<0||nx>=S||ny<0||ny>=S||nz<0||nz>=S||board[nx][ny][nz]!==player) break;
        c++;
      }
      if (c >= 5) return true;
    }
  }
  return false;
}

// ── Advanced Evaluation ──────────────────────────────────────────
//
// For each contiguous run of player's pieces starting at a cell,
// classify as:
//   live = both ends open   → much more dangerous
//   half = one end open
//   dead = both blocked     → no value
//
// Weights distinguish live vs half heavily.

const THREAT_WEIGHTS = {
  5: [100_000_000, 100_000_000],  // [live, half] - win
  4: [5_000_000,   800_000],      // live4 is near-forced win
  3: [120_000,      15_000],
  2: [1_200,           200],
  1: [12,                3],
};

function evaluateBoard(board) {
  let score = 0;

  for (let x = 0; x < S; x++)
  for (let y = 0; y < S; y++)
  for (let z = 0; z < S; z++) {
    const player = board[x][y][z];
    if (!player) continue;

    for (const [dx,dy,dz] of DIRS) {
      // Only process the "start" of a run
      const bx=x-dx, by=y-dy, bz=z-dz;
      if (bx>=0&&bx<S&&by>=0&&by<S&&bz>=0&&bz<S&&board[bx][by][bz]===player) continue;

      // Count run length
      let len = 0;
      for (let i = 0; i < 5; i++) {
        const nx=x+dx*i, ny=y+dy*i, nz=z+dz*i;
        if (nx<0||nx>=S||ny<0||ny>=S||nz<0||nz>=S||board[nx][ny][nz]!==player) break;
        len++;
      }

      // Open ends
      const ax=x+dx*len, ay=y+dy*len, az=z+dz*len;
      const openAfter  = ax>=0&&ax<S&&ay>=0&&ay<S&&az>=0&&az<S&&board[ax][ay][az]===0;
      const openBefore = bx>=0&&bx<S&&by>=0&&by<S&&bz>=0&&bz<S&&board[bx][by][bz]===0;
      const opens = (openBefore?1:0) + (openAfter?1:0);
      if (opens === 0) continue;

      const wt = THREAT_WEIGHTS[Math.min(len,5)];
      const val = opens === 2 ? wt[0] : wt[1];
      score += player === 2 ? val : -val;
    }
  }
  return score;
}

// Count immediate winning columns for player
function countWinMoves(board, player) {
  let c = 0;
  for (let x = 0; x < S; x++)
    for (let z = 0; z < S; z++) {
      const nb = applyMove(board, x, z, player);
      if (nb && checkWin(nb, player)) c++;
    }
  return c;
}

// ── Move ordering ────────────────────────────────────────────────

function scoreMove(board, x, z, player, opp) {
  const nb = applyMove(board, x, z, player);
  if (!nb) return -Infinity;

  // Immediate win
  if (checkWin(nb, player))  return 200_000_000;
  // Block opponent immediate win
  const nb2 = applyMove(board, x, z, opp);
  if (nb2 && checkWin(nb2, opp)) return 100_000_000;

  // Positional: number of directions near center
  const center = 3.5;
  const dist = Math.abs(x-center) + Math.abs(z-center);

  // Count threats created
  const threatsBefore = countWinMoves(board, player);
  const threatsAfter  = countWinMoves(nb, player);
  const newThreats    = (threatsAfter - threatsBefore) * 8_000_000;

  return evaluateBoard(nb) + newThreats - dist * 200;
}

function orderMoves(board, moves, player) {
  const opp = player === 2 ? 1 : 2;
  return moves
    .map(([x,z]) => ({ x, z, s: scoreMove(board, x, z, player, opp) }))
    .sort((a,b) => b.s - a.s)
    .map(({x,z}) => [x,z]);
}

// ── Transposition Table ──────────────────────────────────────────

const TT = new Map();
const TT_MAX = 1_000_000;

function boardKey(board, depth, maximizing) {
  // Fast hash: sample key cells
  let h = depth * 2 + (maximizing ? 1 : 0);
  for (let x = 0; x < S; x += 2)
    for (let y = 0; y < S; y += 2)
      for (let z = 0; z < S; z += 2)
        h = (h * 31 + board[x][y][z]) | 0;
  return h;
}

// ── Minimax α-β ──────────────────────────────────────────────────

let _startTime, _timeLimit, _timedOut, _useTransposition;

function minimax(board, depth, alpha, beta, maximizing) {
  if (performance.now() - _startTime >= _timeLimit) {
    _timedOut = true;
    return evaluateBoard(board);
  }

  if (checkWin(board, 2)) return  9_000_000 + depth * 1000;
  if (checkWin(board, 1)) return -9_000_000 - depth * 1000;

  const moves = getValidMoves(board);
  if (!moves.length || depth === 0) return evaluateBoard(board);

  // TT lookup
  let ttKey;
  if (_useTransposition) {
    ttKey = boardKey(board, depth, maximizing);
    const cached = TT.get(ttKey);
    if (cached !== undefined) return cached;
  }

  const player = maximizing ? 2 : 1;
  const ordered = orderMoves(board, moves, player);

  let best = maximizing ? -Infinity : Infinity;

  for (const [x,z] of ordered) {
    const nb = applyMove(board, x, z, player);
    if (!nb) continue;
    const v = minimax(nb, depth-1, alpha, beta, !maximizing);
    if (maximizing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (beta <= alpha || _timedOut) break;
  }

  if (_useTransposition && !_timedOut) {
    if (TT.size >= TT_MAX) TT.clear();
    TT.set(ttKey, best);
  }

  return best;
}

// ── Iterative deepening ──────────────────────────────────────────

function findBestMoveOnBoard(board, timeLimitMs, maxDepth, useTransposition) {
  _startTime        = performance.now();
  _timeLimit        = timeLimitMs;
  _timedOut         = false;
  _useTransposition = useTransposition;

  TT.clear();

  const moves = getValidMoves(board);
  if (!moves.length) return null;

  const ordered = orderMoves(board, moves, 2);

  // Immediate win check (before any search)
  for (const [x,z] of ordered) {
    const nb = applyMove(board, x, z, 2);
    if (nb && checkWin(nb, 2)) return [x,z];
  }

  let bestMove  = ordered[0];
  let bestScore = -Infinity;

  for (let depth = 1; depth <= maxDepth; depth++) {
    _timedOut = false;
    let depthBest  = null;
    let depthScore = -Infinity;

    for (const [x,z] of ordered) {
      const nb = applyMove(board, x, z, 2);
      if (!nb) continue;
      const v = minimax(nb, depth-1, -Infinity, Infinity, false);
      if (v > depthScore) { depthScore = v; depthBest = [x,z]; }
      if (_timedOut) break;
    }

    if (depthBest && (!_timedOut || depth === 1)) {
      bestMove  = depthBest;
      bestScore = depthScore;
    }

    if (performance.now() - _startTime >= timeLimitMs) break;
    if (bestScore >= 9_000_000) break; // forced win found
  }

  return bestMove;
}

// ── Flip evaluation (integrated into search) ─────────────────────
//
// Compare 3 options:
//   A) Place without flip
//   B) Flip then place (if canFlip)
// Pick whichever gives better evaluated score after 1-ply opponent reply.
//
// For Hard/Lunatic: also run deeper minimax on the flipped board.

function decideFlipAndMove(board, canFlip, difficulty) {
  const params = {
    easy:    { time:     60, depth: 1, tt: false },
    normal:  { time:    800, depth: 3, tt: false },
    hard:    { time:   4500, depth: 8, tt: true  },
    lunatic: { time:  10000, depth:14, tt: true  },
  };
  const { time, depth, tt } = params[difficulty] ?? params.normal;

  // ── Check immediate player 5-in-a-row threat first ──────────
  // If player can win next move on current board, and flip disrupts it → use flip
  const playerWinCount = countWinMoves(board, 1);

  // ── Evaluate: no flip ────────────────────────────────────────
  const timeNoFlip = canFlip ? time * 0.48 : time;
  const moveNoFlip = findBestMoveOnBoard(board, timeNoFlip, depth, tt);
  const scoreNoFlip = moveNoFlip
    ? evaluateAfterMove(board, moveNoFlip, depth > 2 ? 2 : 1, tt, time * 0.05)
    : -Infinity;

  if (!canFlip) return { useFlip: false, move: moveNoFlip };

  // ── Evaluate: with flip ──────────────────────────────────────
  const flipped = applyFlipBoard(board);

  // Instant reject: flip hands opponent an immediate win we can't win from
  if (checkWin(flipped, 1) && !checkWin(flipped, 2)) {
    return { useFlip: false, move: moveNoFlip };
  }

  // Instant accept: flip gives us immediate win
  if (checkWin(flipped, 2)) {
    const m = findBestMoveOnBoard(flipped, 500, 2, false);
    return { useFlip: true, move: m };
  }

  // Instant accept: flip gives us a 1-move win
  if (countWinMoves(flipped, 2) >= 1) {
    const m = findBestMoveOnBoard(flipped, 1000, 3, false);
    return { useFlip: true, move: m };
  }

  // Defensive: flip reduces player's threats
  const playerWinAfterFlip = countWinMoves(flipped, 1);
  const defensiveFlip = playerWinCount >= 2 && playerWinAfterFlip < playerWinCount;

  // Search on flipped board
  const timeFlip = time * 0.48;
  const moveFlip  = findBestMoveOnBoard(flipped, timeFlip, depth, tt);
  const scoreFlip = moveFlip
    ? evaluateAfterMove(flipped, moveFlip, depth > 2 ? 2 : 1, tt, time * 0.05)
    : -Infinity;

  // Normal: only flip if strongly better
  const flipBonus = difficulty === 'lunatic' ? 0
                  : difficulty === 'hard'    ? 30_000
                  : 80_000;

  const useFlip = defensiveFlip || (scoreFlip > scoreNoFlip + flipBonus);

  return {
    useFlip,
    move: useFlip ? moveFlip : moveNoFlip,
  };
}

// Quick 1-ply evaluation of board after placing move
function evaluateAfterMove(board, [x,z], depth, tt, timeMs) {
  const nb = applyMove(board, x, z, 2);
  if (!nb) return -Infinity;
  if (checkWin(nb, 2)) return 9_000_000;
  if (depth <= 1) return evaluateBoard(nb);
  // Mini search for opponent reply
  const oppMoves = orderMoves(nb, getValidMoves(nb), 1);
  let worst = Infinity;
  const t0 = performance.now();
  for (const [ox,oz] of oppMoves.slice(0, 12)) {
    const nb2 = applyMove(nb, ox, oz, 1);
    if (!nb2) continue;
    if (checkWin(nb2, 1)) { worst = -9_000_000; break; }
    const v = evaluateBoard(nb2);
    if (v < worst) worst = v;
    if (performance.now() - t0 > timeMs) break;
  }
  return worst === Infinity ? evaluateBoard(nb) : worst;
}

// ── Worker entry ─────────────────────────────────────────────────

self.onmessage = (e) => {
  const { board, canFlip, difficulty } = e.data;

  if (difficulty === 'easy') {
    // Easy: mostly random, but block/win if obvious
    const moves = getValidMoves(board);
    if (!moves.length) { self.postMessage({ move: null, useFlip: false }); return; }

    // Block immediate player win
    for (const [x,z] of moves) {
      const nb = applyMove(board, x, z, 1);
      if (nb && checkWin(nb, 1)) {
        self.postMessage({ move: [x,z], useFlip: false }); return;
      }
    }
    // Take immediate CPU win
    for (const [x,z] of moves) {
      const nb = applyMove(board, x, z, 2);
      if (nb && checkWin(nb, 2)) {
        self.postMessage({ move: [x,z], useFlip: false }); return;
      }
    }
    // Otherwise random
    const pick = moves[Math.floor(Math.random() * moves.length)];
    self.postMessage({ move: pick, useFlip: false });
    return;
  }

  // Normal / Hard / Lunatic
  const result = decideFlipAndMove(board, canFlip, difficulty);

  // Lunatic: very rare blunder (~2%)
  if (difficulty === 'lunatic' && Math.random() < 0.02) {
    const valid = getValidMoves(result.useFlip ? applyFlipBoard(board) : board);
    if (valid.length) {
      result.move = valid[Math.floor(Math.random() * valid.length)];
    }
  }

  self.postMessage({ move: result.move, useFlip: result.useFlip });
};

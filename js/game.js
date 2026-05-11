'use strict';

class Game {
  constructor() {
    this.SIZE = 8;
    this.reset();
  }

  reset() {
    // board[x][y][z]: 0=empty, 1=player, 2=CPU
    // y=0 is the FLOOR (gravity pulls toward y=0)
    this.board = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0))
    );
    this.currentPlayer = 1;
    this.gameOver = false;
    this.winnerPlayer = -1;
    this.playerCanFlip = { 1: true, 2: true };
    this.ghostX = 3;
    this.ghostZ = 3;
  }

  // Returns lowest empty y for column (x,z), or -1 if full
  getDropY(x, z) {
    for (let y = 0; y < this.SIZE; y++) {
      if (this.board[x][y][z] === 0) return y;
    }
    return -1;
  }

  isColumnFull(x, z) {
    return this.getDropY(x, z) === -1;
  }

  // Place piece for player at column (x,z)
  // Returns { success: bool, x, y, z }
  placePiece(x, z, player) {
    const y = this.getDropY(x, z);
    if (y === -1) return { success: false };
    this.board[x][y][z] = player;
    return { success: true, x, y, z };
  }

  // Re-apply gravity: settle all pieces to bottom of each column
  applyGravity() {
    for (let x = 0; x < this.SIZE; x++) {
      for (let z = 0; z < this.SIZE; z++) {
        const col = [];
        for (let y = 0; y < this.SIZE; y++) {
          if (this.board[x][y][z] !== 0) col.push(this.board[x][y][z]);
        }
        for (let y = 0; y < this.SIZE; y++) {
          this.board[x][y][z] = y < col.length ? col[y] : 0;
        }
      }
    }
  }

  // Flip board (y -> 7-y) then re-apply gravity
  // Returns false if player already used their flip
  flip(player) {
    if (!this.playerCanFlip[player]) return false;
    this.playerCanFlip[player] = false;

    const S = this.SIZE;
    const nb = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => new Array(S).fill(0))
    );
    for (let x = 0; x < S; x++)
      for (let y = 0; y < S; y++)
        for (let z = 0; z < S; z++)
          nb[x][S - 1 - y][z] = this.board[x][y][z];

    this.board = nb;
    this.applyGravity();
    return true;
  }

  // Find all 4-in-a-row winning lines for a given player
  // Returns array of cell arrays: [ [[x,y,z],[x,y,z],[x,y,z],[x,y,z]], ... ]
  findWins(player) {
    const dirs = [
      [1, 0, 0], [0, 1, 0], [0, 0, 1],
      [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1],
      [0, 1, 1], [0, 1, -1],
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]
    ];
    const S = this.SIZE;
    const wins = [];
    const seen = new Set();

    for (let x = 0; x < S; x++)
      for (let y = 0; y < S; y++)
        for (let z = 0; z < S; z++) {
          if (this.board[x][y][z] !== player) continue;
          for (const [dx, dy, dz] of dirs) {
            const cells = [[x, y, z]];
            for (let i = 1; i < 4; i++) {
              const nx = x + dx * i, ny = y + dy * i, nz = z + dz * i;
              if (nx < 0 || nx >= S || ny < 0 || ny >= S || nz < 0 || nz >= S) break;
              if (this.board[nx][ny][nz] !== player) break;
              cells.push([nx, ny, nz]);
            }
            if (cells.length === 4) {
              // De-duplicate: normalize key by sorting
              const key = cells.map(c => c.join(',')).sort().join('|');
              if (!seen.has(key)) {
                seen.add(key);
                wins.push(cells);
              }
            }
          }
        }
    return wins;
  }

  // Check current board state for win/draw
  // Returns:
  //   { winner: 0, cells: [] }            → draw
  //   { winner: 1|2, cells }              → one player wins
  //   { both: true, w1: cells[], w2: cells[] } → both won (flip scenario)
  //   null                                → no winner yet
  checkWinState() {
    const w1 = this.findWins(1);
    const w2 = this.findWins(2);

    if (w1.length > 0 && w2.length > 0) {
      return { both: true, w1, w2 };
    }
    if (w1.length > 0) return { winner: 1, cells: w1[0] };
    if (w2.length > 0) return { winner: 2, cells: w2[0] };

    // Check draw: all columns full
    let draw = true;
    outer: for (let x = 0; x < this.SIZE; x++)
      for (let z = 0; z < this.SIZE; z++)
        if (!this.isColumnFull(x, z)) { draw = false; break outer; }

    if (draw) return { winner: 0, cells: [] };
    return null;
  }
}

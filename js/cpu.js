'use strict';

class CPU {
  constructor(game) {
    this.game = game;
  }

  // Pick a random valid column and place
  makeMove() {
    const g = this.game;
    const S = g.SIZE;
    const available = [];
    for (let x = 0; x < S; x++)
      for (let z = 0; z < S; z++)
        if (!g.isColumnFull(x, z)) available.push([x, z]);
    if (!available.length) return null;

    const [x, z] = available[Math.floor(Math.random() * available.length)];
    return g.placePiece(x, z, 2);
  }

  // Randomly decide whether to use the flip (5% chance per turn)
  // Only when flip is still available
  shouldFlip() {
    return this.game.playerCanFlip[2] && Math.random() < 0.05;
  }
}

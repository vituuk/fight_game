/**
 * AABB collision between rectangle1's attackBox and rectangle2's body.
 * Works for both positive and negative offsets (handles enemy facing left).
 */
export function rectangularCollision({ rectangle1, rectangle2 }) {
  const ax = rectangle1.attackBox.position.x;
  const ay = rectangle1.attackBox.position.y;
  const aw = rectangle1.attackBox.width;
  const ah = rectangle1.attackBox.height;

  return (
    ax + aw >= rectangle2.position.x &&
    ax      <= rectangle2.position.x + rectangle2.width &&
    ay + ah >= rectangle2.position.y &&
    ay      <= rectangle2.position.y + rectangle2.height
  );
}

export function determineWinner({ player, enemy, timerId, game, onPlayerWin, onPlayerLose }) {
  clearTimeout(timerId);
  game.displayText.style.display = 'flex';

  // Compare as % of respective max so bonus HP doesn't always win
  const playerPct = player.health / (player._maxHealth || 100);
  const enemyPct  = enemy.health  / 100;

  if (playerPct > enemyPct) {
    game.displayText.innerHTML = 'Player Wins! 🏆';
    setTimeout(() => { if (onPlayerWin) onPlayerWin(); }, 2000);
  } else {
    // Tie or enemy ahead = player loses
    game.displayText.innerHTML = 'YOU LOST! 💀';
    setTimeout(() => { if (onPlayerLose) onPlayerLose(); }, 2500);
  }
}

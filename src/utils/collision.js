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

  if (player.health === enemy.health) {
    game.displayText.innerHTML = 'Tie! ⚔️';
    setTimeout(() => { if (onPlayerLose) onPlayerLose(); }, 2500);
  } else if (player.health > enemy.health) {
    game.displayText.innerHTML = 'Player Wins! 🏆';
    setTimeout(() => { if (onPlayerWin) onPlayerWin(); }, 2000);
  } else {
    game.displayText.innerHTML = 'Enemy AI Wins! 💀';
    setTimeout(() => { if (onPlayerLose) onPlayerLose(); }, 2500);
  }
}


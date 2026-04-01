export class Sprite {
  constructor(game, { position, imageSrc = null, color = 'red', offset = { x: 0, y: 0 } }) {
    this.game = game; // reference to the main game object (canvas ctx)
    this.position = position;
    this.width = 50;
    this.height = 150;
    this.color = color;
    this.image = new Image();
    this.hasImage = false;
    this.offset = offset;

    if (imageSrc) {
      this.image.src = imageSrc;
      this.image.onload = () => {
        this.hasImage = true;
      };
    }
  }

  draw() {
    if (this.hasImage) {
      this.game.ctx.drawImage(
        this.image,
        this.position.x - this.offset.x,
        this.position.y - this.offset.y,
        this.width,
        this.height
      );
    } else {
      // Fallback placeholder rectangle
      this.game.ctx.fillStyle = this.color;
      this.game.ctx.fillRect(this.position.x, this.position.y, this.width, this.height);
    }
  }

  update() {
    this.draw();
  }
}

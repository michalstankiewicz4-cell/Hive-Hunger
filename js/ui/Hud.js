export class Hud {
  constructor(element) {
    this.el = element;
    this.last = '';
  }

  update({ level, eaten, hint = '' }) {
    const text = `Planeta ${level} · zjedzono ${Math.floor(eaten * 100)}%`;
    const key = text + hint;
    if (key === this.last) return;
    this.last = key;
    this.el.textContent = text;
    if (hint) {
      const small = document.createElement('div');
      small.className = 'hud-hint';
      small.textContent = hint;
      this.el.appendChild(small);
    }
  }
}

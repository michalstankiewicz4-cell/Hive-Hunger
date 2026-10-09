/** Small DOM helpers shared by the menu and the room panel. */

export const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(label, onClick, cls = 'lobby-button') {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** The room link in a read-only field with a "Copy link" button. */
export function linkRow(link) {
  const field = el('input', 'lobby-link');
  field.type = 'text';
  field.readOnly = true;
  field.value = link;
  field.setAttribute('aria-label', 'Room link');
  const copy = button('Copy link', async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = 'Copied';
    } catch {
      field.select();
      copy.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => (copy.textContent = 'Copy link'), 1800);
  }, 'lobby-button is-primary');
  const row = el('div', 'lobby-row');
  row.append(field, copy);
  return row;
}

export const MODE_NAME = { coop: 'Co-op', pvp: 'PvP' };

export function roomLink(code) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

/** Back to the start screen: the page without the room code. */
export function backToMenu() {
  location.href = `${location.origin}${location.pathname}`;
}

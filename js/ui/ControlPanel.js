/**
 * Control panel with sliders and toggles. Every control changes the game live.
 * The values the game starts with are the defaults that "Reset to default" restores.
 * @param {HTMLElement} root panel container
 * @param {Array<{id,label,type?,min?,max?,step?,decimals?}>} defs definitions from CONFIG.controls (type 'toggle' = checkbox)
 * @param {Record<string,{get:()=>number|boolean,set:(v)=>void}>} bindings what each control changes
 */
export class ControlPanel {
  constructor(root, defs, bindings) {
    this.resets = [];

    for (const def of defs) {
      const bind = bindings[def.id];
      if (!bind) continue;
      const initial = bind.get();

      const row = document.createElement('div');
      row.className = 'control';

      if (def.type === 'toggle') {
        row.classList.add('control-toggle');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = `ctl-${def.id}`;
        box.checked = Boolean(initial);
        box.addEventListener('change', () => bind.set(box.checked));
        const label = document.createElement('label');
        label.htmlFor = box.id;
        label.textContent = def.label;
        row.append(box, label);
        root.appendChild(row);
        this.resets.push(() => {
          if (box.checked !== Boolean(initial)) {
            box.checked = Boolean(initial);
            bind.set(box.checked);
          }
        });
        continue;
      }

      const label = document.createElement('label');
      label.htmlFor = `ctl-${def.id}`;
      label.textContent = def.label;

      const input = document.createElement('input');
      input.type = 'range';
      input.id = `ctl-${def.id}`;
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.value = initial;

      const output = document.createElement('output');
      output.htmlFor = input.id;
      const show = (v) => (output.value = Number(v).toFixed(def.decimals));
      show(input.value);

      input.addEventListener('input', () => {
        const v = Number(input.value);
        show(v);
        bind.set(v);
      });

      row.append(label, input, output);
      root.appendChild(row);
      this.resets.push(() => {
        input.value = initial;
        show(initial);
        bind.set(Number(initial));
      });
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'ctl-reset';
    reset.className = 'control-reset';
    reset.textContent = 'Reset to default';
    reset.addEventListener('click', () => this.resets.forEach((r) => r()));
    root.appendChild(reset);
  }
}

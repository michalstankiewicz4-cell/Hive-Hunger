/**
 * Slider panel. Every slider changes the game live, while it is being dragged.
 * @param {HTMLElement} root panel container
 * @param {Array<{id,label,min,max,step,decimals}>} defs definitions from CONFIG.controls
 * @param {Record<string,{get:()=>number,set:(v:number)=>void}>} bindings what each slider changes
 */
export class ControlPanel {
  constructor(root, defs, bindings) {
    for (const def of defs) {
      const bind = bindings[def.id];
      if (!bind) continue;

      const row = document.createElement('div');
      row.className = 'control';

      const label = document.createElement('label');
      label.htmlFor = `ctl-${def.id}`;
      label.textContent = def.label;

      const input = document.createElement('input');
      input.type = 'range';
      input.id = `ctl-${def.id}`;
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.value = bind.get();

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
    }
  }
}

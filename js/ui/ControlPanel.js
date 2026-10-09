/**
 * Panel suwaków. Każdy suwak zmienia grę na żywo, w trakcie przesuwania.
 * @param {HTMLElement} root kontener panelu
 * @param {Array<{id,label,min,max,step,decimals}>} defs definicje z CONFIG.controls
 * @param {Record<string,{get:()=>number,set:(v:number)=>void}>} bindings co dany suwak zmienia
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

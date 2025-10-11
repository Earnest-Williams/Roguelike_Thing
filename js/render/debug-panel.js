// Minimal DOM overlay that introspects selected actor logs and context
export class DebugPanel {
  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      right: "8px",
      top: "8px",
      width: "420px",
      maxHeight: "80vh",
      overflow: "auto",
      background: "rgba(0,0,0,0.75)",
      color: "#eee",
      font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
      padding: "8px 10px",
      borderRadius: "10px",
      zIndex: 9999
    });
    this.root.innerHTML = `
      <div style="display:flex;gap:6px;align-items:center;">
        <strong style="font-size:13px;">Debug</strong>
        <select id="dp-select"></select>
        <button id="dp-refresh">⟳</button>
      </div>
      <div id="dp-body"></div>
    `;
    document.body.appendChild(this.root);
    this.sel = this.root.querySelector("#dp-select");
    this.body = this.root.querySelector("#dp-body");
    this.root.querySelector("#dp-refresh").onclick = () => this.render();
    this.actors = [];
  }

  setActors(actors) {
    this.actors = actors || [];
    this.sel.innerHTML = this.actors
      .map((a, i) => `<option value="${i}">${a.name || a.id}</option>`)
      .join("");
    this.render();
  }

  render() {
    const idx = Number(this.sel.value || 0);
    const a = this.actors[idx];
    if (!a) {
      this.body.textContent = "(no actor)";
      return;
    }
    const attack = a.logs?.attack?.toArray() ?? [];
    const status = a.logs?.status?.toArray() ?? [];
    const turn = a.logs?.turn?.toArray() ?? [];

    const block = (title, rows) => `
      <div style="margin:6px 0 10px;">
        <div style="opacity:.8;margin-bottom:3px;">${title}</div>
        <pre style="white-space:pre-wrap;background:#111;padding:6px;border-radius:6px;">${
          rows.map((r) => JSON.stringify(r)).join("\n")
        }</pre>
      </div>`;

    this.body.innerHTML = `
      <div>HP: ${a.hp} | Attunements: ${JSON.stringify(a.attunements)}</div>
      ${block("Turn", turn)}
      ${block("Attack", attack)}
      ${block("Status", status)}
    `;
  }
}

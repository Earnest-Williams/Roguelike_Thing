import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const chunks = [];

process.stdin.on("data", (chunk) => {
  chunks.push(Buffer.from(chunk));
});

process.stdin.on("end", () => {
  const raw = Buffer.concat(chunks).toString("utf8");
  const pass = (raw.match(/^[✓✔]/gm) || []).length;
  const fail = (raw.match(/^(✗|x|X|!)/gm) || []).length;
  const ts = new Date().toISOString();
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Test Results</title>
<style>
body{background:#111;color:#eee;font-family:system-ui,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;margin:20px}
.ok{color:#9FE970}.bad{color:#ff6b6b;background:#2a1515}
pre{background:#222;padding:1rem;border-radius:8px;max-height:70vh;overflow:auto;white-space:pre-wrap}
button{background:#333;color:#eee;border:1px solid #444;border-radius:6px;padding:.4rem .6rem;cursor:pointer}
</style></head><body>
<h1>Automated Test Run</h1>
<div>Generated: <time datetime="${ts}">${ts}</time></div>
<p><strong>Summary:</strong> ${pass} passed, ${fail} failed
   <button id="copy">Copy as Markdown</button></p>
<pre id="log"></pre>
<script>
const RAW = ${JSON.stringify(raw)};
document.getElementById('log').innerHTML = RAW.split(/\\r?\\n/).map(ln=>{
  const esc = ln.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  if (/^[✓✔]\\b/.test(ln)) return '<div class="ok">✅ '+esc.slice(1)+'</div>';
  if (/^(✗|x|X|!)\\b|Error:|AssertionError|FAILED/i.test(ln)) return '<div class="bad">❌ '+esc+'</div>';
  return '<div>'+esc+'</div>';
}).join('\\n');
document.getElementById('copy').onclick = async ()=>{
  const summary = document.querySelector('p').innerText;
  const fence = String.fromCharCode(96).repeat(3);
  const md = '### Test Results\\n\\n' + summary + '\\n\\n' + fence + '\\n' + RAW + '\\n' + fence + '\\n';
  try { await navigator.clipboard.writeText(md); } catch {}
};
</script>
</body></html>`;
  fs.writeFileSync(path.join(here, "latest.html"), html);
});

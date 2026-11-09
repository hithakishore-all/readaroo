// Builds demo/readaroo-demo.html: the real web app + engine + synthetic data in one offline file.
//   node scripts/build-demo.js              full standalone HTML (open it in any browser)
//   node scripts/build-demo.js --fragment   body-only version for hosts that add their own <html>/<head>
//   node scripts/build-demo.js --video --out=index.html   the GitHub Pages live demo: walkthrough video and
//                                           chapters (docs/video/) on top, the app below under "Try it yourself"
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fragment = process.argv.includes('--fragment');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const mobile = process.argv.includes('--mobile');
const video = process.argv.includes('--video'); // live demo page: captioned walkthrough video above the app // native app build (Capacitor): same app and engine, clears the phone's status bar

const index = read('public/index.html');
const bodyStart = index.indexOf('<!--HEADER-->');
const scriptsStart = index.indexOf('<!--SCRIPTS-->');
if (bodyStart < 0 || scriptsStart < 0) throw new Error('public/index.html is missing the HEADER or SCRIPTS markers');
const markup = index.slice(bodyStart + '<!--HEADER-->'.length, scriptsStart).trim();
const seed = JSON.parse(read('data/seed.json'));
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const adapter = `
(function () {
  var engine = ReadarooEngine.createEngine({
    store: ReadarooMemory.createMemoryStore(${JSON.stringify(seed)}),
    meter: ReadarooMemory.createFakeMeter()
  });
  window.ReadarooAPI = {
    call: function (method, path, query, body) {
      if (path === '/api/health') return Promise.resolve({ status: 200, body: { ok: true, mode: ${mobile ? "'app (runs on this phone)'" : "'demo (runs in your browser)'"}, stripe: 'simulated' } });
      return engine.handle(method, path, body, query || {});
    }
  };
})();`;


// ---------- walkthrough video (live demo page only) ----------
const DARK = { Arjun: '#9A6200', Priya: '#5B3FE0', Library: '#0E7A70', Readaroo: '#7A5B00' };
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const escHtml = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function videoSection() {
  const chapters = JSON.parse(read('docs/video/chapters.json'));
  const items = chapters.map((c) => `<li><button type="button" data-t="${c.t}">
      <span class="wt-time">${mmss(c.t)}</span>
      <span class="wt-txt"><span class="wt-who" style="color:${DARK[c.persona] || '#56627A'}"><i style="background:${c.color}"></i>${escHtml(c.persona)}</span>
      <span class="wt-title">${escHtml(c.title)}</span></span></button></li>`).join('');
  return `<section class="wt" aria-labelledby="wt-h">
  <div class="wt-head"><h1 id="wt-h">Readaroo in 3 minutes</h1>
    <p class="muted">A silent, captioned walkthrough of the real app: Arjun (9) on his phone, Priya the parent, and the Maple County librarian. All data is fictional; Stripe runs in test mode.</p></div>
  <div class="wt-grid">
    <video id="wt-video" controls playsinline preload="metadata" poster="docs/video/readaroo-walkthrough-poster.jpg">
      <source src="docs/video/readaroo-walkthrough.mp4" type="video/mp4">
      Your browser can't play this video. <a href="docs/video/readaroo-walkthrough.mp4">Download it</a>.
    </video>
    <nav class="wt-ch" aria-label="Video chapters"><h2>Chapters</h2><ol id="wt-list">${items}</ol></nav>
  </div>
  <h2 class="wt-try">Try it yourself</h2>
  <p class="muted small wt-try-p">The same app runs below, entirely in your browser. Switch people with <b>Acting as</b>, or open any record in the Demo guide.</p>
</section>`;
}
const videoCss = `
.wt { max-width: 1180px; margin: 4px auto 22px; }
.wt-head { margin-bottom: 14px; } .wt-head h1 { margin-bottom: 4px; } .wt-head p { max-width: 760px; }
.wt-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
.wt video { width: 100%; aspect-ratio: 16 / 10; display: block; background: #0d1530; border-radius: 18px; border: 2px solid var(--line); box-shadow: var(--lift); }
.wt-ch { background: var(--surface); border: 2px solid var(--line); border-radius: 18px; padding: 12px; box-shadow: var(--lift); }
.wt-ch h2 { font-size: 1.05rem; margin: 2px 6px 8px; }
.wt-ch ol { list-style: none; margin: 0; padding: 0; max-height: 470px; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.wt-ch button { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: 10px; width: 100%; padding: 7px 8px; border-radius: 12px; }
.wt-ch button:hover { background: var(--sunk); }
.wt-ch button:focus-visible { outline: 3px solid var(--sky); }
.wt-ch button[aria-current="true"] { background: var(--accent-soft); }
.wt-time { font-family: var(--font-mono); font-size: 0.8rem; color: var(--muted); flex: none; width: 34px; padding-top: 1px; }
.wt-txt { display: flex; flex-direction: column; min-width: 0; }
.wt-who { font-size: 0.74rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
.wt-who i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.wt-title { font-size: 0.92rem; font-weight: 700; line-height: 1.25; }
.wt-try { margin-top: 26px; font-size: 1.5rem; } .wt-try-p { margin-top: 4px; }
@media (max-width: 899px) { .wt-grid { grid-template-columns: minmax(0, 1fr); } .wt-ch ol { max-height: 300px; } }
`;
const videoJs = `
(function () {
  var v = document.getElementById('wt-video'); if (!v) return;
  var btns = Array.prototype.slice.call(document.querySelectorAll('#wt-list button'));
  btns.forEach(function (b) { b.addEventListener('click', function () { v.currentTime = Number(b.dataset.t) + 0.05; v.play().catch(function () {}); }); });
  v.addEventListener('timeupdate', function () {
    var cur = null; btns.forEach(function (b) { if (Number(b.dataset.t) <= v.currentTime + 0.1) cur = b; });
    btns.forEach(function (b) { if (b === cur) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  });
})();`;

const head = `<title>Readaroo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Readaroo demo: a family library app prototype. All data is synthetic.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Baloo+2:wght@600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
${read('public/styles.css')}${mobile ? '\nbody { padding-top: max(12px, env(safe-area-inset-top, 0px)); }\n' : ''}${video ? videoCss : ''}
</style>`;

const scripts = [read('src/engine.js'), read('src/memoryStore.js'), adapter, read('public/app.js')]
  .concat(video ? [videoJs] : [])
  .map((js) => `<script>\n${safe(js)}\n</script>`).join('\n');
const body = video ? `${videoSection()}\n${markup}` : markup;

const html = fragment
  ? `${head}\n${body}\n${scripts}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n${scripts}\n</body>\n</html>\n`;

const out = outArg ? outArg.slice(6) : path.join(root, 'demo', 'readaroo-demo.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);

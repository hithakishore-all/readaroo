/* Readaroo walkthrough overlay: caption card, highlight box, cursor, title card and a phone frame.
 * Injected by scripts/video/record.py with context.add_init_script. Every id/class is prefixed fw- so it
 * never collides with the app's own CSS (the app already uses .side, .card, .bar ...). */
(function () {
  if (window.top !== window) return;
  if (window.__fw) return;
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  const phone = LS('fw-mode') === 'phone';

  const css = `
  #fw-root, #fw-root * { box-sizing: border-box; }
  #fw-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: "Atkinson Hyperlegible", system-ui, sans-serif; }
  .fw-cap { position: fixed; left: 24px; bottom: 24px; width: 480px; background: #101a33; color: #fff; border-radius: 14px;
    border-left: 6px solid var(--fw-pc, #FFB020); padding: 16px 20px 18px; box-shadow: 0 14px 40px rgba(6,12,30,.45);
    opacity: 0; transform: translateY(14px); transition: opacity .45s ease, transform .45s ease; }
  .fw-cap.fw-on { opacity: 1; transform: none; }
  .fw-cap.fw-side { top: 50%; bottom: auto; left: 64px; width: 520px; transform: translateY(calc(-50% + 14px)); }
  .fw-cap.fw-side.fw-on { transform: translateY(-50%); }
  .fw-cap .fw-k { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px; color: #FFB020; letter-spacing: .02em; margin-bottom: 6px; }
  .fw-cap .fw-k b { color: var(--fw-pc, #FFB020); font-weight: 600; }
  .fw-cap .fw-t { font-family: "Baloo 2", system-ui, sans-serif; font-weight: 800; font-size: 25px; line-height: 1.1; margin-bottom: 6px; }
  .fw-cap .fw-b { font-size: 16px; line-height: 1.42; color: #d7def0; }
  .fw-cap.fw-side .fw-t { font-size: 32px; }
  .fw-cap.fw-side .fw-b { font-size: 18px; }
  .fw-hl { position: fixed; border: 3px solid #FFB020; border-radius: 12px; box-shadow: 0 0 0 4px rgba(255,176,32,.18), 0 0 26px rgba(255,176,32,.45);
    opacity: 0; transition: left .5s ease, top .5s ease, width .5s ease, height .5s ease, opacity .35s ease; }
  .fw-hl.fw-on { opacity: 1; }
  .fw-hl .fw-tab { position: absolute; left: -3px; bottom: calc(100% + 6px); background: #FFB020; color: #1a1300; font: 600 13px "IBM Plex Mono", monospace;
    padding: 4px 9px; border-radius: 7px; white-space: nowrap; }
  .fw-hl.fw-below .fw-tab { bottom: auto; top: calc(100% + 6px); }
  .fw-cur { position: fixed; left: 640px; top: 420px; width: 30px; height: 30px; margin: -2px 0 0 -3px; transition: left .75s cubic-bezier(.4,.1,.2,1), top .75s cubic-bezier(.4,.1,.2,1), opacity .3s; filter: drop-shadow(0 3px 4px rgba(0,0,0,.35)); }
  .fw-cur.fw-hide { opacity: 0; }
  .fw-rip { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border: 3px solid #FFB020; border-radius: 50%; animation: fw-rip .6s ease-out forwards; }
  @keyframes fw-rip { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
  .fw-card { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; color: #fff;
    background: radial-gradient(1200px 700px at 30% 20%, #3a2a8f 0%, #17123f 45%, #0b0f24 100%); opacity: 0; transition: opacity .6s ease; pointer-events: none; }
  .fw-card.fw-on { opacity: 1; }
  .fw-card .fw-in { max-width: 860px; padding: 0 40px; }
  .fw-card .fw-logo { font-family: "Baloo 2", sans-serif; font-weight: 800; font-size: 76px; letter-spacing: -.02em; color: #FFC93C; line-height: 1; display: flex; align-items: center; justify-content: center; gap: 14px; }
  .fw-card .fw-tag { font-family: "Baloo 2", sans-serif; font-weight: 700; font-size: 34px; margin-top: 10px; }
  .fw-card .fw-one { font-size: 21px; line-height: 1.5; color: #cfd6ee; margin-top: 18px; }
  .fw-card .fw-links { margin-top: 26px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
  .fw-card .fw-links span { font: 600 19px "IBM Plex Mono", monospace; color: #FFC93C; background: rgba(255,255,255,.07); padding: 8px 16px; border-radius: 10px; }
  .fw-card .fw-links span em { font-style: normal; color: #9fb0d8; margin-right: 10px; }
  .fw-card .fw-fine { margin-top: 30px; font: 600 14px "IBM Plex Mono", monospace; color: #8c97b8; letter-spacing: .06em; text-transform: uppercase; }
  .fw-card .fw-who { margin-top: 26px; display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
  .fw-card .fw-who span { font-size: 17px; color: #e3e8f7; display: inline-flex; align-items: center; gap: 8px; }
  .fw-card .fw-who i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }

  /* desktop: keep the app's toast clear of the caption card */
  body:not(.fw-phone) .toast { top: 18px !important; bottom: auto !important; }

  /* ---------- phone mode: the same page restyled as a phone inside the 1280x800 frame ---------- */
  html.fw-phone { background: #0d1530; }
  body.fw-phone { --fw-sl: 760px; --fw-st: 26px; --fw-sw: 390px; --fw-sh: 748px;
    padding: calc(var(--fw-st) + 46px) 0 140px calc(var(--fw-sl) + 16px) !important; margin: 0 !important; width: auto !important; }
  body.fw-phone .topbar, body.fw-phone .guide.side, body.fw-phone .topnav { display: none !important; }
  body.fw-phone .shell { display: block !important; margin: 0 !important; width: calc(var(--fw-sw) - 32px); max-width: none; }
  body.fw-phone .app { max-width: none !important; width: calc(var(--fw-sw) - 32px); }
  body.fw-phone .tabbar { display: block !important; left: var(--fw-sl) !important; right: auto !important; width: var(--fw-sw);
    bottom: calc(800px - var(--fw-st) - var(--fw-sh)) !important; border-radius: 0 0 40px 40px; padding-bottom: 14px !important; }
  body.fw-phone .toast { left: calc(var(--fw-sl) + var(--fw-sw) / 2) !important; bottom: calc(800px - var(--fw-st) - var(--fw-sh) + 96px) !important; max-width: 350px !important; }
  body.fw-phone .confetti { clip-path: inset(var(--fw-st) calc(1280px - var(--fw-sl) - var(--fw-sw)) calc(800px - var(--fw-st) - var(--fw-sh)) var(--fw-sl) round 44px); }
  .fw-phoneframe { position: fixed; left: 760px; top: 26px; width: 390px; height: 748px; border-radius: 46px; pointer-events: none; z-index: 2147482000;
    box-shadow: 0 0 0 12px #05070f, 0 0 0 14px #2c3552, 0 0 0 3000px #0d1530; }
  .fw-phoneframe .fw-notch { position: absolute; top: 9px; left: 50%; width: 118px; height: 30px; margin-left: -59px; background: #05070f; border-radius: 20px; }
  .fw-phoneframe .fw-time { position: absolute; top: 11px; left: 34px; font: 700 15px system-ui, sans-serif; color: #1D2A44; }
  .fw-phoneframe .fw-batt { position: absolute; top: 14px; right: 30px; width: 26px; height: 12px; border: 2px solid #1D2A44; border-radius: 4px; }
  .fw-phoneframe .fw-batt::after { content: ""; position: absolute; inset: 1px 5px 1px 1px; background: #1D2A44; border-radius: 1px; }
  .fw-statusbg { position: fixed; left: 760px; top: 26px; width: 390px; height: 46px; background: #F2F7FF; z-index: 2147481999; border-radius: 46px 46px 0 0; }
  `;

  function ready(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    const st = document.createElement('style'); st.id = 'fw-style'; st.textContent = css; document.head.appendChild(st);
    const root = document.createElement('div'); root.id = 'fw-root';
    root.innerHTML = `<div class="fw-card" id="fw-card"></div><div class="fw-hl" id="fw-hl"><span class="fw-tab" id="fw-tab"></span></div>
      <div class="fw-cap" id="fw-cap"><div class="fw-k" id="fw-k"></div><div class="fw-t" id="fw-t"></div><div class="fw-b" id="fw-b"></div></div>
      <svg class="fw-cur" id="fw-cur" viewBox="0 0 30 30"><path d="M4 2 L4 24 L10 18.5 L14 27.5 L18 25.8 L14 17 L22 17 Z" fill="#fff" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    document.body.appendChild(root);
    if (phone) {
      document.documentElement.classList.add('fw-phone'); document.body.classList.add('fw-phone');
      const bg = document.createElement('div'); bg.className = 'fw-statusbg'; document.body.appendChild(bg);
      const f = document.createElement('div'); f.className = 'fw-phoneframe';
      f.innerHTML = '<span class="fw-time">9:41</span><span class="fw-notch"></span><span class="fw-batt"></span>';
      document.body.appendChild(f);
      document.getElementById('fw-cap').classList.add('fw-side');
    }
    const $ = (id) => document.getElementById(id);

    function cap(o) {
      const c = $('fw-cap');
      c.style.setProperty('--fw-pc', o.color || '#FFB020');
      $('fw-k').innerHTML = `${o.n} · <b>${o.who}</b>`;
      $('fw-t').textContent = o.title;
      $('fw-b').textContent = o.body;
      c.classList.remove('fw-on'); void c.offsetWidth; c.classList.add('fw-on');
      LS('fw-cap', JSON.stringify(o));
    }
    function nocap() { $('fw-cap').classList.remove('fw-on'); LS('fw-cap', null); }
    function cur(x, y, instant) {
      const c = $('fw-cur');
      if (instant) { c.style.transition = 'none'; }
      c.style.left = x + 'px'; c.style.top = y + 'px';
      if (instant) { void c.offsetWidth; c.style.transition = ''; }
      LS('fw-xy', JSON.stringify([x, y]));
    }
    function ripple(x, y) {
      const r = document.createElement('div'); r.className = 'fw-rip'; r.style.left = x + 'px'; r.style.top = y + 'px';
      $('fw-root').appendChild(r); setTimeout(() => r.remove(), 700);
    }
    function hl(rect, label) {
      const h = $('fw-hl'); const pad = 6;
      h.style.left = (rect.x - pad) + 'px'; h.style.top = (rect.y - pad) + 'px';
      h.style.width = (rect.w + pad * 2) + 'px'; h.style.height = (rect.h + pad * 2) + 'px';
      h.classList.toggle('fw-below', rect.y < 60);
      $('fw-tab').textContent = label || '';
      $('fw-tab').style.display = label ? '' : 'none';
      h.classList.add('fw-on');
    }
    function nohl() { $('fw-hl').classList.remove('fw-on'); }
    function card(html) { $('fw-card').innerHTML = `<div class="fw-in">${html}</div>`; $('fw-card').classList.add('fw-on'); $('fw-cur').classList.add('fw-hide'); }
    function nocard() { $('fw-card').classList.remove('fw-on'); $('fw-cur').classList.remove('fw-hide'); }

    // Restore caption and cursor so they don't flash or jump on a reload.
    try { const o = JSON.parse(LS('fw-cap') || 'null'); if (o) { cap(o); } } catch (e) {}
    try { const xy = JSON.parse(LS('fw-xy') || 'null'); if (xy) cur(xy[0], xy[1], true); } catch (e) {}

    window.__fw = { cap, nocap, cur, ripple, hl, nohl, card, nocard };
  });
})();

"""Record the Readaroo captioned walkthrough.

Drives the real app (offline mode, fresh in-memory data) with Playwright, one browser context per persona,
and captures Chrome's screencast frames. Output: <out>/frames/*.jpg, timeline.json, chapters.json.

    python3 scripts/video/record.py --url http://127.0.0.1:3917 --out video-build
Then: python3 scripts/video/encode.py --out video-build
(or simply: make video)
"""
import argparse
import asyncio
import base64
import json
import os
import time
from pathlib import Path

from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
W, H = 1280, 800

ARJUN = {'who': 'Arjun · age 9, on his phone', 'color': '#FFB020', 'name': 'Arjun'}
PRIYA = {'who': 'Priya · parent', 'color': '#8B6CFF', 'name': 'Priya'}
LIB = {'who': 'Maple County Library · librarian', 'color': '#2EC4B6', 'name': 'Library'}
RA = {'who': 'Readaroo', 'color': '#FFC93C', 'name': 'Readaroo'}
TOTAL = 17

LIVE = 'hithakishore-all.github.io/readaroo'
CODE = 'github.com/hithakishore-all/readaroo'


class Recorder:
    """Chrome screencast -> numbered JPEGs with monotonic timestamps, split into segments per page."""

    def __init__(self, out):
        self.dir = Path(out) / 'frames'
        self.dir.mkdir(parents=True, exist_ok=True)
        for f in self.dir.glob('*.jpg'):
            f.unlink()
        self.frames = []  # (file, t)
        self.segments = []  # {start, end, first, last}
        self.cdp = None
        self.n = 0
        self.seg = None
        self.chapters = []

    def video_time(self):
        done = sum(s['end'] - s['start'] for s in self.segments)
        return done + (time.monotonic() - self.seg['start'] if self.seg else 0)

    async def start(self, context, page):
        cdp = await context.new_cdp_session(page)

        def on_frame(ev):
            self.n += 1
            name = f'{self.n:06d}.jpg'
            (self.dir / name).write_bytes(base64.b64decode(ev['data']))
            self.frames.append((name, time.monotonic()))
            asyncio.ensure_future(cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']}))

        cdp.on('Page.screencastFrame', on_frame)
        self.seg = {'start': time.monotonic(), 'first': self.n + 1}
        await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92, 'maxWidth': W, 'maxHeight': H})
        self.cdp = cdp
        # force a first frame
        await page.evaluate('() => { document.body.style.outline = "0px solid transparent"; }')
        await asyncio.sleep(0.4)

    async def stop(self):
        if not self.cdp:
            return
        await asyncio.sleep(0.2)
        await self.cdp.send('Page.stopScreencast')
        await self.cdp.detach()
        self.cdp = None
        self.seg['end'] = time.monotonic()
        self.seg['last'] = self.n
        self.segments.append(self.seg)
        self.seg = None

    def save(self, out):
        frames = [{'file': f, 't': t} for f, t in self.frames]
        Path(out, 'timeline.json').write_text(json.dumps({'frames': frames, 'segments': self.segments}, indent=1))
        Path(out, 'chapters.json').write_text(json.dumps(self.chapters, indent=1))


class Stage:
    def __init__(self, rec):
        self.rec = rec
        self.step = 1

    async def cap(self, page, who, title, body):
        n = f'{self.step:02d} / {TOTAL}'
        self.rec.chapters.append({'t': round(self.rec.video_time(), 2), 'n': self.step, 'title': title,
                                  'persona': who['name'], 'color': who['color']})
        self.step += 1
        await page.evaluate('o => window.__fw.cap(o)', {'n': n, 'who': who['who'], 'color': who['color'], 'title': title, 'body': body})
        await asyncio.sleep(1.2)

    async def nocap(self, page):
        await page.evaluate('() => window.__fw.nocap()')

    async def to(self, page, loc):
        await loc.scroll_into_view_if_needed()
        await asyncio.sleep(0.3)
        b = await loc.bounding_box()
        x = b['x'] + (60 if b['width'] > 260 else b['width'] / 2)
        y = b['y'] + b['height'] / 2
        await page.evaluate('([x,y]) => window.__fw.cur(x,y)', [x, y])
        await asyncio.sleep(0.75)
        return x, y

    async def click(self, page, loc, settle=0.75):
        x, y = await self.to(page, loc)
        await page.evaluate('([x,y]) => window.__fw.ripple(x,y)', [x, y])
        await asyncio.sleep(0.25)
        await page.evaluate('() => window.__fw.nohl()')
        await loc.click()
        try:
            await page.wait_for_load_state('networkidle', timeout=4000)
        except Exception:
            pass
        await asyncio.sleep(settle)

    async def show(self, page, locs, label, secs=3.5, top=96):
        if not isinstance(locs, list):
            locs = [locs]
        b = await locs[0].bounding_box()
        await page.evaluate('dy => window.scrollBy({top: dy, behavior: "smooth"})', b['y'] - top)
        await self.settle_scroll(page)
        boxes = [await l.bounding_box() for l in locs]
        x0 = min(bb['x'] for bb in boxes); y0 = min(bb['y'] for bb in boxes)
        x1 = max(bb['x'] + bb['width'] for bb in boxes); y1 = max(bb['y'] + bb['height'] for bb in boxes)
        await page.evaluate('([r,l]) => window.__fw.hl(r,l)', [{'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}, label])
        await asyncio.sleep(secs)

    async def settle_scroll(self, page):
        await asyncio.sleep(0.35)
        last = None
        for _ in range(20):
            y = await page.evaluate('() => window.scrollY')
            if y == last:
                break
            last = y
            await asyncio.sleep(0.12)
        await asyncio.sleep(0.15)

    async def nohl(self, page):
        await page.evaluate('() => window.__fw.nohl()')
        await asyncio.sleep(0.3)

    async def type(self, page, loc, text):
        await self.click(page, loc, settle=0.2)
        await loc.fill('')
        await loc.press_sequentially(text, delay=45)
        await asyncio.sleep(0.4)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://127.0.0.1:3917')
    ap.add_argument('--out', default='video-build')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    overlay = (HERE / 'overlay.js').read_text()
    rec = Recorder(a.out)
    s = Stage(rec)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        opts = dict(viewport={'width': W, 'height': H}, device_scale_factor=1, timezone_id='America/Los_Angeles')
        desk = await browser.new_context(**opts)
        await desk.add_init_script(overlay)
        phone = await browser.new_context(**opts)
        await phone.add_init_script("try { localStorage.setItem('fw-mode','phone'); } catch (e) {}")
        await phone.add_init_script(overlay)

        D = await desk.new_page()
        P = await phone.new_page()
        await D.goto(a.url)
        await D.wait_for_selector('#main .hero')
        await P.goto(a.url)
        await P.wait_for_selector('#main .hero')
        await P.evaluate("() => { const s = document.getElementById('actor'); s.value = 'm-arjun'; s.dispatchEvent(new Event('change', {bubbles: true})); }")
        await P.wait_for_selector('#main .streak')
        await P.evaluate('() => window.__fw.cur(955, 360, true)')
        await asyncio.sleep(1.5)
        await D.evaluate('() => window.__fw.cur(640, 420, true)')

        # 01 title card ------------------------------------------------------------
        await D.evaluate('''() => window.__fw.card(`
          <div class="fw-logo">Readaroo</div>
          <div class="fw-tag">Never wait for the next book, and never read alone.</div>
          <div class="fw-one">A family library app: one holds list for every card, read-alikes you can borrow tonight,
            parent approvals, and library-funded instant borrows metered through Stripe under a hard cap.</div>
          <div class="fw-who"><span><i style="background:#FFB020"></i>Arjun, 9 · kid</span><span><i style="background:#8B6CFF"></i>Priya · parent</span>
            <span><i style="background:#2EC4B6"></i>Maple County Library</span></div>
          <div class="fw-fine">No sound · all data is fictional · Stripe test mode</div>`)''')
        await rec.start(desk, D)
        rec.chapters.append({'t': 0, 'n': 1, 'title': 'Readaroo in 3 minutes', 'persona': 'Readaroo', 'color': RA['color']})
        s.step = 2
        await asyncio.sleep(6.5)
        await rec.stop()

        # ---------------- Arjun, on his phone ----------------
        await rec.start(phone, P)
        await s.cap(P, ARJUN, 'Five minutes a day counts', 'Arjun opens Readaroo after school. His streak is 8 days, and one missed day a week is a rest day, not a reset.')
        await s.show(P, P.locator('#main .card.streak'), 'Streak · 1 rest day', 4)
        await s.nohl(P)

        await s.cap(P, ARJUN, 'The book he wants is on hold', 'The Moon Fox: River of Stars has a long line. He is #14. Library apps stop here and make him wait.')
        hold = P.locator('#main button.item[data-title="t-moonfox-2"]')
        await s.show(P, hold, 'Hold · #14 in line', 3)
        await s.click(P, hold)
        await s.nohl(P)

        await s.cap(P, ARJUN, 'The wait becomes a read', 'Next-Up finds books like it that are free to borrow tonight: same author, shared themes, in his 8–10 age band. Each one says why.')
        await s.show(P, [P.locator('#main .nextup'), P.locator('#main .nextup + ul.list li').first], 'Next-Up · available now', 5)
        borrow = P.locator('#main .nextup + ul.list li').first.locator('button[data-borrow-title]')
        await s.click(P, borrow, settle=1.6)
        await s.nohl(P)

        await s.cap(P, ARJUN, 'Mid-series? The library can pay', 'Book 2 of The Comet Kids has a 7–11 week wait. Maple County pays $2.49 for an instant copy so he keeps going. Families never pay.')
        await s.click(P, P.locator('.tabbar button[data-go="discover"]'))
        await s.type(P, P.locator('#q'), 'Orbit Street')
        await s.click(P, P.locator('#search-form button[type="submit"]'))
        await s.click(P, P.locator('#main button.linkish.title[data-title="t-comet-2"]').first)
        inst = P.locator('#main .card:has(button[data-act="instant"])')
        await s.show(P, inst, 'Library-funded · $2.49', 4)
        await s.click(P, P.locator('#main button[data-act="instant"]'), settle=1.8)
        await s.nohl(P)

        await s.cap(P, ARJUN, 'Too old for him? A grown-up decides', 'Deep Sea Detectives is for ages 11–13. Readaroo doesn’t say no and doesn’t say yes: the request waits for a parent.')
        await s.click(P, P.locator('.tabbar button[data-go="discover"]'))
        await s.type(P, P.locator('#q'), 'Deep Sea')
        await s.click(P, P.locator('#search-form button[type="submit"]'))
        await s.click(P, P.locator('#main button.linkish.title[data-title="t-deepsea"]').first)
        await s.show(P, P.locator('#main .notice.sun').first, 'Outside his 8–10 band', 3)
        await s.click(P, P.locator('#main button[data-act="borrow"]'), settle=1.4)
        await s.show(P, P.locator('#main .notice.sun').first, 'Waiting for a grown-up', 3)
        await s.nohl(P)

        await s.cap(P, ARJUN, 'New authors get found, too', 'New voices shows one book each from debut authors. Bus 44 isn’t at his libraries yet, so he asks for it. 49 families already did.')
        await s.click(P, P.locator('.tabbar button[data-go="discover"]'))
        await s.click(P, P.locator('#main button[data-clear-search]'))
        bus = P.locator('#main .new-voices li:has(button[data-ask-library="t-bus44"])')
        await s.show(P, bus, 'Debut · not owned yet', 4)
        await s.click(P, bus.locator('button[data-ask-library]'), settle=1.6)
        await s.show(P, P.locator('#toast'), 'Request 50', 3, top=60)
        await s.nohl(P)
        await s.nocap(P)
        await asyncio.sleep(0.5)
        await rec.stop()

        # ---------------- Priya, the parent ----------------
        await D.evaluate('() => window.__fw.nocard()')
        await D.locator('.topnav button[data-go="home"]').click()
        await asyncio.sleep(0.8)
        await rec.start(desk, D)
        await s.cap(D, PRIYA, 'Only the exceptions reach a parent', 'Books inside each kid’s age band are approved automatically. Priya sees one request: Arjun’s ask for Deep Sea Detectives.')
        note = D.locator('#main button.notice.sun[data-go="approvals"]')
        await s.show(D, note, 'Request to review', 3.5)
        await s.click(D, note)
        await s.nohl(D)

        await s.cap(D, PRIYA, 'One tap, with a reason', 'She sees why it was flagged and can approve the book, the whole series, or say not now.')
        card = D.locator('#main li.card:has-text("Deep Sea Detectives")').first
        await s.show(D, card, 'Ages 11–13 · Arjun is 9', 3.5)
        await s.click(D, card.locator('button[data-decide="approve"]'), settle=1.8)
        await s.nohl(D)

        await s.cap(D, PRIYA, 'It stops at the cap, every time', 'Tidecallers book 2 would qualify for an instant borrow, but Riverbend City’s daily budget is spent. No offer, no charge. Next-Up fills the gap.')
        await s.click(D, D.locator('.topnav button[data-go="discover"]'))
        await s.type(D, D.locator('#q'), 'Tidecallers')
        await s.click(D, D.locator('#search-form button[type="submit"]'))
        await s.click(D, D.locator('#main button.linkish.title[data-title="t-tide-2"]').first)
        await s.show(D, D.locator('#main .notice.warn'), 'Cap reached · $0 charged', 4.5)
        await s.nohl(D)

        # ---------------- the library side ----------------
        await s.nocap(D)
        await asyncio.sleep(0.4)
        await s.cap(D, LIB, 'Every instant borrow is one Stripe charge', 'Arjun’s $2.49 borrow is a Stripe usage event keyed borrow:<id>, so a retry can never charge twice. At month end it becomes an invoice.')
        await s.click(D, D.locator('.topnav button[data-go="library"]'))
        row = D.locator('#main table.invoice:not(.demand) tbody tr:has(td.mono)').first
        await s.show(D, D.locator('#main .card:has(table.invoice:not(.demand) tbody tr td.mono)').first, 'Metered once · $2.49', 5)
        await s.nohl(D)

        await s.cap(D, LIB, 'A hard budget, daily and monthly', 'Each library sets a cap. Readaroo reserves the price before it offers a borrow, and refuses once the cap is spent.')
        await s.show(D, D.locator('#main .card:has(.pill.bad)').first, 'Daily cap reached', 4)
        await s.nohl(D)

        await s.cap(D, LIB, 'Demand as totals, never names', 'Librarians see what readers asked for, by book: 38 asks for Bus 44 here, including Arjun’s. Adding copies tells every family who asked.')
        demand = D.locator('#main table.demand tr:has-text("Bus 44")').first
        await s.show(D, demand, '38 asks · no names', 4)
        await s.click(D, demand.locator('button[data-order-title]'), settle=1.6)
        await s.show(D, D.locator('#main table.demand tr:has-text("Bus 44")').first, 'Added · readers told', 3)
        await s.nohl(D)
        await s.nocap(D)
        await asyncio.sleep(0.4)
        await rec.stop()

        # ---------------- back to Arjun ----------------
        await P.evaluate('() => window.__fw.nohl()')
        await rec.start(phone, P)
        await s.cap(P, ARJUN, 'You asked, the library got it', 'Back on Arjun’s phone: the debut he asked for is in at Maple County. One tap to borrow it.')
        await s.click(P, P.locator('.tabbar button[data-go="home"]'), settle=1.2)
        await s.show(P, P.locator('#main .notice.ok:has-text("You asked")').first, 'Your request worked', 4.5)
        await s.nohl(P)
        await s.nocap(P)
        await asyncio.sleep(0.4)
        await rec.stop()

        # ---------------- Priya: digest and proof ----------------
        await rec.start(desk, D)
        await s.cap(D, PRIYA, 'Never read alone', 'The weekly digest shows what everyone read, and gives a conversation starter for each kid’s book.')
        await s.click(D, D.locator('.topnav button[data-go="digest"]'))
        await s.show(D, D.locator('#main .stats'), 'This week', 3)
        await s.show(D, D.locator('#main .card:has-text("Ask tonight")').first, 'A question for tonight', 4)
        await s.nohl(D)

        await s.cap(D, RA, 'Every action leaves a record', 'The borrow, the instant charge, the approval, the ask and the library’s order are all in the audit log.')
        log = D.locator('#guide .card:has(.log)')
        await s.show(D, log, 'Audit log', 5, top=80)
        await s.nohl(D)
        await s.nocap(D)

        rec.chapters.append({'t': round(rec.video_time(), 2), 'n': TOTAL, 'title': 'Try it yourself', 'persona': 'Readaroo', 'color': RA['color']})
        await D.evaluate(f'''() => window.__fw.card(`
          <div class="fw-logo">Readaroo</div>
          <div class="fw-tag">Lend to the family. Turn the wait into a read.</div>
          <div class="fw-links"><span><em>Live demo</em>{LIVE}</span><span><em>Code</em>{CODE}</span></div>
          <div class="fw-fine">Node · Postgres · Stripe test mode · all data is fictional</div>`)''')
        await asyncio.sleep(6.5)
        await rec.stop()
        rec.save(a.out)
        await browser.close()
    print(f'{rec.n} frames, {len(rec.chapters)} chapters, {sum(x["end"] - x["start"] for x in rec.segments):.1f}s')


if __name__ == '__main__':
    asyncio.run(main())

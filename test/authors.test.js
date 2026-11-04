// v0.4 features: author discovery, author engagement (online + in-person, questions),
// reader interest signals ("Ask my library") and community-driven discovery.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');

let srv;
let base;
async function api(method, path, body) {
  const res = await fetch(base + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const reset = () => api('POST', '/api/reset', {});

test.before(async () => {
  srv = await start({ offline: true, port: 0, host: '127.0.0.1' });
  base = srv.url;
});
test.after(() => new Promise((r) => srv.server.close(r)));

test('R15 author page: a new voice with books, online and in-person events, follow', async () => {
  await reset();
  const r = await api('GET', `/api/authors/${encodeURIComponent('Lena Okafor')}?actor=m-arjun`);
  assert.equal(r.status, 200);
  assert.equal(r.body.author.emerging, true);
  assert.equal(r.body.author.debutTitleId, 't-comet-1');
  assert.equal(r.body.books[0].id, 't-comet-1', 'debut first (oldest first)');
  assert.equal(r.body.books[0].isDebut, true);
  assert.deepEqual(r.body.events.map((e) => [e.id, e.format]), [['meet-comet-live', 'online'], ['meet-okafor', 'in_person']]);
  const before = r.body.author.followers;
  await api('POST', '/api/follow', { actor: 'm-arjun', kind: 'author', value: 'Lena Okafor' });
  const after = await api('GET', `/api/authors/${encodeURIComponent('Lena Okafor')}?actor=m-arjun`);
  assert.equal(after.body.following, true);
  assert.equal(after.body.author.followers, before + 1);
  assert.equal((await api('GET', '/api/authors/Nobody?actor=m-arjun')).status, 404);
  assert.equal((await api('GET', `/api/authors/${encodeURIComponent('Lena Okafor')}?actor=m-arjun&member=m-maya`)).status, 403);
});

test('R16 Ask my library: one request per reader, never for books already owned', async () => {
  await reset();
  const d = await api('GET', '/api/titles/t-bus44?actor=m-arjun');
  assert.equal(d.body.availability.length, 0);
  assert.equal(d.body.request.canAsk, true);
  assert.equal(d.body.request.demand, 49, 'synthetic requests from other families at both libraries');
  assert.ok(d.body.nextUp.suggestions.length > 0, 'read-alikes while you wait');
  const a = await api('POST', '/api/library-requests', { actor: 'm-arjun', titleId: 't-bus44' });
  assert.equal(a.body.outcome, 'asked');
  assert.equal(a.body.libraryId, 'lib-county', 'goes to the library where most readers asked');
  assert.equal(a.body.demand, 50);
  assert.equal((await api('POST', '/api/library-requests', { actor: 'm-arjun', titleId: 't-bus44' })).body.outcome, 'already_asked');
  const owned = await api('POST', '/api/library-requests', { actor: 'm-arjun', titleId: 't-comet-1' });
  assert.equal(owned.status, 409);
  assert.equal(owned.body.code, 'owned');
  assert.equal((await api('POST', '/api/library-requests', { actor: 'm-maya', member: 'm-arjun', titleId: 't-sora' })).status, 403);
});

test('R19 library sees demand as totals, orders copies, and families who asked are told', async () => {
  await reset();
  await api('POST', '/api/library-requests', { actor: 'm-arjun', titleId: 't-bus44' });
  const lib = await api('GET', '/api/library');
  const county = lib.body.libraries.find((l) => l.id === 'lib-county');
  const row = county.demand.find((x) => x.titleId === 't-bus44');
  assert.equal(row.requests, 38);
  assert.equal(row.newAuthor, true);
  assert.ok(!JSON.stringify(county.demand).includes('Arjun'), 'no names on the library side');
  assert.equal((await api('POST', '/api/library/order', { libraryId: 'lib-county', titleId: 't-bus44', copies: 0 })).status, 400);
  assert.equal((await api('POST', '/api/library/order', { libraryId: 'lib-county', titleId: 't-owl', copies: 2 })).body.code, 'no_demand');
  const o = await api('POST', '/api/library/order', { libraryId: 'lib-county', titleId: 't-bus44', copies: 3 });
  assert.equal(o.body.outcome, 'ordered');
  assert.equal(o.body.notified, 38);
  const home = await api('GET', '/api/home?actor=m-priya');
  assert.deepEqual(home.body.requestNews.map((n) => [n.titleId, n.name]), [['t-bus44', 'Arjun']]);
  const b = await api('POST', '/api/borrow', { actor: 'm-arjun', titleId: 't-bus44' });
  assert.equal(b.body.outcome, 'borrowed', 'ordered copies are borrowable at once');
  const again = await api('GET', '/api/library');
  assert.equal(again.body.libraries.find((l) => l.id === 'lib-county').demand.find((x) => x.titleId === 't-bus44').status, 'ordered');
});

test('R17 questions for authors: kids wait for a parent, parents send directly, limits hold', async () => {
  await reset();
  const kid = await api('POST', '/api/meetups/meet-comet-live/questions', { actor: 'm-arjun', text: 'How did you draw the comet?' });
  assert.equal(kid.body.outcome, 'waiting_parent');
  const before = (await api('GET', '/api/meetups?actor=m-priya')).body.meetups.find((m) => m.id === 'meet-comet-live').questionCount;
  assert.equal((await api('POST', `/api/questions/${kid.body.questionId}`, { actor: 'm-arjun', decision: 'approve' })).status, 403);
  const ok = await api('POST', `/api/questions/${kid.body.questionId}`, { actor: 'm-priya', decision: 'approve' });
  assert.equal(ok.body.outcome, 'sent');
  assert.equal((await api('POST', `/api/questions/${kid.body.questionId}`, { actor: 'm-priya', decision: 'approve' })).status, 409);
  const after = (await api('GET', '/api/meetups?actor=m-priya')).body.meetups.find((m) => m.id === 'meet-comet-live');
  assert.equal(after.questionCount, before + 1);
  assert.equal(after.format, 'online');
  assert.equal((await api('POST', '/api/meetups/meet-comet-live/questions', { actor: 'm-priya', text: 'Hi' })).status, 400, 'too short');
  assert.equal((await api('POST', '/api/meetups/meet-storytime/questions', { actor: 'm-priya', text: 'Any crafts?' })).body.code, 'no_questions');
  for (let i = 0; i < 2; i++) await api('POST', '/api/meetups/meet-comet-live/questions', { actor: 'm-arjun', text: `Question number ${i}` });
  assert.equal((await api('POST', '/api/meetups/meet-comet-live/questions', { actor: 'm-arjun', text: 'One more please' })).body.code, 'limit');
});

test('R18 discover: one new voice per author, community picks with reasons, family recommendations', async () => {
  await reset();
  const d = await api('GET', '/api/discover?actor=m-arjun');
  const authors = d.body.newVoices.map((x) => x.author);
  assert.equal(new Set(authors).size, authors.length, 'one book per new author');
  assert.equal(d.body.newVoices[0].id, 't-comet-1', 'the debut that matches what he loved comes first');
  assert.ok(d.body.newVoices.find((x) => x.id === 't-bus44').requestable, 'not at his libraries yet: can ask');
  assert.ok(d.body.communityPicks.every((x) => x.why[0].startsWith('Loved by')));
  assert.equal(d.body.communityPicks[0].newAuthor, true, 'new authors first in community picks');
  const notRead = await api('POST', '/api/recommendations', { actor: 'm-arjun', titleId: 't-owl', to: 'm-maya' });
  assert.equal(notRead.body.code, 'not_read');
  const rec = await api('POST', '/api/recommendations', { actor: 'm-arjun', titleId: 't-moonfox-1', to: 'm-maya', note: 'The fox is so brave' });
  assert.equal(rec.body.outcome, 'recommended');
  assert.equal((await api('POST', '/api/recommendations', { actor: 'm-arjun', titleId: 't-moonfox-1', to: 'm-maya' })).body.outcome, 'already_recommended');
  assert.equal((await api('POST', '/api/recommendations', { actor: 'm-arjun', titleId: 't-moonfox-1', to: 'm-arjun' })).status, 400);
  const maya = await api('GET', '/api/discover?actor=m-maya');
  assert.deepEqual(maya.body.fromFamily.map((x) => [x.id, x.from, x.note, x.needsOk]), [['t-moonfox-1', 'Arjun', 'The fox is so brave', true]]);
});

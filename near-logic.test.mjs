/* Tests for the Near me sort. Run: node near-logic.test.mjs */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const N = require(path.join(HERE, 'near-logic.js'));
const R = require(path.join(HERE, 'rooms-logic.js'));

let pass = 0, fail = 0;
const check = (n, c, d = '') => c ? (pass++, console.log(`  ok   ${n}`))
                                  : (fail++, console.log(`  FAIL ${n}${d ? '  — ' + d : ''}`));
const rows = (n, state = 'free') => Array.from({ length: n }, (_, i) => ({ room: `r${i}`, state }));

console.log('\n1. distance');
const quad = [37.42752, -122.17025], gates = [37.43001, -122.17330];
const m = N.metres(quad, gates);
check('Quad to Gates is ~390 m', m > 360 && m < 420, m.toFixed(0));
check('zero distance is 1 min, never 0', N.minutes(0) === 1);
check('800 m is 13 min (1.25 detour at 80 m/min)', N.minutes(800) === 13, N.minutes(800));
check('label switches to km past 2 km', N.label(2500) === '2.5 km' && N.label(400) === '7 min walk', N.label(400));

console.log('\n2. order');
const places = { Near: [37.4300, -122.1733], Far: [37.4235, -122.1660], Same: [37.4300, -122.1733] };
const groups = [['Far', rows(9)], ['Unknown', rows(5)], ['Near', rows(1)], ['Same', rows(3)]];
const got = N.order(groups, places, [37.4301, -122.1734]).map((g) => g[0]);
check('nearest first, ties by more free rooms', got.join() === 'Same,Near,Far,Unknown', got.join());
check('a building with no point goes last with null metres', N.order(groups, places, gates).at(-1)[2] === null);
const two = N.order([['U2', rows(1)], ['U1', rows(9)]], {}, gates).map((g) => g[0]);
check('unplaced keep their incoming order', two.join() === 'U2,U1', two.join());
const busy = N.order([['A', [...rows(1, 'busy'), ...rows(1)]], ['B', rows(2)]], { A: places.Near, B: places.Same }, gates).map((g) => g[0]);
check('tie counts free rooms, not all rooms', busy.join() === 'B,A', busy.join());

console.log('\n3. places.json covers the schedule');
const { places: P } = JSON.parse(fs.readFileSync(path.join(HERE, 'data/places.json'), 'utf8'));
const meetings = R.allMeetings(JSON.parse(fs.readFileSync(path.join(HERE, 'data/meetings.json'), 'utf8')));
const rooms = new Set(meetings.map((x) => x.room).filter(R.isRoom));
const placed = [...rooms].filter((r) => P[R.building(r)]).length;
check('at least 90% of rooms have a point', placed / rooms.size >= 0.9, `${placed}/${rooms.size}`);
const far = Object.entries(P).filter(([, p]) => N.metres(p, quad) > 2500).map(([b]) => b);
check('every point is within 2.5 km of the Main Quad', far.length === 0, far.join(', '));
check('a Quad number gets the Quad centre and its label', P['Building 160'] && P['Building 160'][2] === 'Main Quad');

/* bin/mutate put this suite at 33/49 on 2026-10-26: 11 checks for 49 mutants, and the
 * whole walking model plus most of the comparator went unguarded. */

console.log('\n4. the walking model, by its numbers rather than a range');
// 'Quad to Gates is ~390 m' passes anywhere in 360..420, so shrinking rad from PI/180
// to PI/181 — every distance on the page 0.55% short — sailed through it. One degree of
// latitude pins R * rad outright: 6371000 * PI / 180 = 111194.93 m.
check('one degree of latitude is 111194.9 m', Math.abs(N.metres([0, 0], [1, 0]) - 111194.93) < 0.5,
  N.metres([0, 0], [1, 0]).toFixed(2));
check('one degree of longitude shrinks with latitude (the cosine term)',
  Math.abs(N.metres([60, 0], [60, 1]) - 55596.93) < 0.5, N.metres([60, 0], [60, 1]).toFixed(2));
// The constants are exported so the page can explain itself; assert them, because every
// `ceil` downstream absorbs a one-unit change in SPEED and hides it.
check('the model is 1.25 detour at 80 m/min, walkable to 2 km',
  N.DETOUR === 1.25 && N.SPEED === 80 && N.WALKABLE === 2000,
  `${N.DETOUR}/${N.SPEED}/${N.WALKABLE}`);
check('exactly 2 km is still a walk, 1 m further is km',
  N.label(2000) === '32 min walk' && N.label(2001) === '2.0 km' && N.label(1999) === '32 min walk',
  `${N.label(1999)} | ${N.label(2000)} | ${N.label(2001)}`);

console.log('\n5. the comparator, with three of everything');
// Every ordering check above compared two groups, and V8 compares a single pair for a
// 2-element array — so a comparator broken in a way that leaves that pair alone sorts
// correctly anyway. Three, handed over in the wrong order, is the smallest honest test.
const here = [37.4300, -122.1733];
const spread = {
  Close: [37.4300, -122.1733],                 // 0 m
  Middle: [37.4320, -122.1733],                // ~220 m
  Distant: [37.4400, -122.1733],               // ~1110 m
};
const byDist = N.order([['Distant', rows(9)], ['Close', rows(1)], ['Middle', rows(5)]], spread, here)
  .map((g) => g[0]);
check('three placed buildings sort near to far, whatever order they arrive in',
  byDist.join() === 'Close,Middle,Distant', byDist.join());

// Same point, so the same walking minutes: the free-room count has to break it, and more
// free rooms must come FIRST (the comparator reads free(y) - free(x), not free(x) - free(y)).
const sameSpot = { A: here, B: here, C: here };
const byFree = N.order([['A', rows(2)], ['B', rows(7)], ['C', rows(4)]], sameSpot, here).map((g) => g[0]);
check('equal distance sorts by MORE free rooms first', byFree.join() === 'B,C,A', byFree.join());

// Same point and the same free count: nothing is left but the incoming order.
// Names must be IN the places map or this silently tests unplaced buildings instead and
// duplicates the check below it — which is exactly what the first draft of it did.
const byIndex = N.order([['A', rows(3)], ['B', rows(3)], ['C', rows(3)]], sameSpot, here);
check('a full tie keeps the incoming order, and stays placed',
  byIndex.map((g) => g[0]).join() === 'A,B,C' && byIndex.every((g) => g[2] !== null),
  JSON.stringify(byIndex.map((g) => [g[0], g[2]])));

const threeUnplaced = N.order([['U3', rows(1)], ['U1', rows(9)], ['U2', rows(5)]], {}, here).map((g) => g[0]);
check('three unplaced buildings keep their incoming order too',
  threeUnplaced.join() === 'U3,U1,U2', threeUnplaced.join());

// Placed and unplaced interleaved: every placed one first, in distance order, then the
// unplaced in their own order — and `metres` null only on the unplaced.
const mixed = N.order(
  [['NoPoint A', rows(9)], ['Distant', rows(1)], ['NoPoint B', rows(9)], ['Close', rows(1)]],
  spread, here);
check('placed before unplaced, each group in its own order',
  mixed.map((g) => g[0]).join() === 'Close,Distant,NoPoint A,NoPoint B', mixed.map((g) => g[0]).join());
check('only the unplaced carry null metres',
  mixed.filter((g) => g[2] === null).map((g) => g[0]).join() === 'NoPoint A,NoPoint B',
  JSON.stringify(mixed.map((g) => [g[0], g[2] === null])));

/* The 11 mutants still surviving were classified by planting each one and printing the
 * ORDER it produces, not by argument — the same method found two of them that ARE real
 * (`y[2] -> y[3]` and `-1 -> 0`, both of which break placed-before-unplaced, and both of
 * which the checks above now kill), so the probe discriminates.
 *
 * Equivalent: `R = 6371000 -> 6371001` moves one degree of latitude by 0.017 m, and no
 * tolerance worth writing distinguishes that; `x[2] -> x[3]` (twice) tests index 3 for
 * null, and index 3 is the incoming position, never null; `1 -> 2` keeps the sign; and
 * every mutant of the `x[3] - y[3]` index tiebreaks — both `-> +` and `-> x[4]` — leaves
 * the order identical at 3 AND at 7 elements, unplaced and fully tied, because a
 * comparator that is constant-positive or NaN leaves V8's sort on the identity, which is
 * precisely what the tiebreak exists to produce. Plus the module.exports guard. */

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

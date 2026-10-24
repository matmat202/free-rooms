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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

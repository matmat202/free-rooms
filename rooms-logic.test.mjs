/* Tests for free-room status. Run: node rooms-logic.test.mjs */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const R = require(path.join(HERE, 'rooms-logic.js'));

let pass = 0, fail = 0;
const check = (n, c, d = '') => c ? (pass++, console.log(`  ok   ${n}`))
                                  : (fail++, console.log(`  FAIL ${n}${d ? '  — ' + d : ''}`));
const mt = (room, days, start, end, course = 'X 1', from = '2026-09-22', to = '2026-12-04') =>
  ({ room, days, start, end, course, from, to, component: 'LEC' });
// Tuesday 2026-10-27, campus time (PDT, UTC-7).
const at = (hhmm, date = '2026-10-27') => new Date(`${date}T${hhmm}:00-07:00`);
const row = (rows, room) => rows.find((r) => r.room === room);

console.log('\n1. campus time');
const n = R.campusNow(new Date('2026-10-27T18:30:00Z'));
check('UTC 18:30 is 11:30 Tuesday on campus', n.day === 'Tuesday' && n.min === 690 && n.date === '2026-10-27', JSON.stringify(n));
const late = R.campusNow(new Date('2026-10-28T05:30:00Z'));
check('UTC past midnight is still Tuesday evening on campus', late.day === 'Tuesday' && late.date === '2026-10-27', JSON.stringify(late));
const pst = R.campusNow(new Date('2026-11-03T18:30:00Z'));
check('after DST ends, UTC 18:30 is 10:30', pst.min === 630, JSON.stringify(pst));

console.log('\n2. busy / free / soon');
const M = [
  mt('Thornton 207', ['Tuesday', 'Thursday'], '10:30', '11:50', 'CS 106A'),
  mt('Thornton 207', ['Tuesday'], '13:30', '14:50', 'MATH 51'),
  mt('Lathrop 292', ['Tuesday'], '12:00', '12:50', 'PWR 1'),
  mt('Gates B1', ['Monday'], '09:00', '17:00', 'CS 999'),
  mt('Departmental Room', ['Tuesday'], '09:00', '17:00', 'ANY 1'),
];
let s = R.status(M, at('11:00'));
check('class in session -> busy until its end', row(s, 'Thornton 207').state === 'busy' && row(s, 'Thornton 207').until === '11:50' && row(s, 'Thornton 207').course === 'CS 106A');
check('next class in 60 min -> free until then', row(s, 'Lathrop 292').state === 'free' && row(s, 'Lathrop 292').until === '12:00');
check('room with classes only on other days -> free rest of day', row(s, 'Gates B1').state === 'free' && row(s, 'Gates B1').until === null);
check('"Departmental Room" is not a room', !row(s, 'Departmental Room'));
s = R.status(M, at('11:40'));
check('class starting in 20 min -> soon', row(s, 'Lathrop 292').state === 'soon');
s = R.status(M, at('11:50'));
check('end time is exclusive: free at 11:50', row(s, 'Thornton 207').state === 'free' && row(s, 'Thornton 207').until === '13:30');
s = R.status(M, at('10:30'));
check('start time is inclusive: busy at 10:30', row(s, 'Thornton 207').state === 'busy');

console.log('\n3. chains, date ranges, ordering');
const C = [mt('STLC 111', ['Wednesday'], '09:00', '10:20'), mt('STLC 111', ['Wednesday'], '10:20', '11:50', 'B 2')];
s = R.status(C, at('09:30', '2026-10-28'));
check('back-to-back classes chain: busy until 11:50', row(s, 'STLC 111').until === '11:50', JSON.stringify(row(s, 'STLC 111')));
const D = [mt('Hewlett 200', ['Tuesday'], '10:00', '12:00', 'LATE 1', '2026-11-01', '2026-12-04')];
s = R.status(D, at('11:00'));
check('meeting not yet started its date range -> free', row(s, 'Hewlett 200').state === 'free');
s = R.status(D, at('11:00', '2026-12-08'));
check('meeting past its end date -> free', row(s, 'Hewlett 200').state === 'free');
s = R.status(M, at('11:00'));
const order = s.map((r) => r.state);
check('free before busy', order.indexOf('busy') > order.lastIndexOf('free'), order.join(','));
check('longest-free first among free', s[0].room === 'Gates B1', s.map((r) => r.room).join(','));

check('termOver false during the term', !R.termOver(M, at('11:00')));
check('termOver false on the last day', !R.termOver(M, at('11:00', '2026-12-04')));
check('termOver true the day after', R.termOver(M, at('11:00', '2026-12-05')));

console.log('\n4. labels and buildings');
check('untilLabel pm', R.untilLabel('13:30') === 'until 1:30 pm', R.untilLabel('13:30'));
check('untilLabel on the hour', R.untilLabel('12:00') === 'until 12 pm');
check('untilLabel null', R.untilLabel(null) === 'rest of the day');
check('building "Thornton 207"', R.building('Thornton 207') === 'Thornton');
check('building "160-322"', R.building('160-322') === 'Building 160', R.building('160-322'));
check('building ", room 306"', R.building('Li Ka Shing Center, room 306') === 'Li Ka Shing Center', R.building('Li Ka Shing Center, room 306'));
check('building ", Room M212/212A"', R.building('Alway Building, Room M212/212A') === 'Alway Building');
check('building "Rm" suffix', R.building('Hewlett Teaching Center Rm 201') === 'Hewlett Teaching Center');
check('building glued slash pair', R.building('Mitchell Earth Sciences350/372') === 'Mitchell Earth Sciences', R.building('Mitchell Earth Sciences350/372'));
check('building glued "rms304/305"', R.building('Li Ka Shing Center, rms304/305') === 'Li Ka Shing Center', R.building('Li Ka Shing Center, rms304/305'));
check('building alias LATHRO 282', R.building('LATHRO 282') === 'Lathrop');
check('building "Gates100"', R.building('Gates100') === 'Gates', R.building('Gates100'));
check('building "Hewlett Teaching Center 200"', R.building('Hewlett Teaching Center 200') === 'Hewlett Teaching Center');
check('isRoom rejects TBA', !R.isRoom('TBA'));
check('isRoom rejects a gym', !R.isRoom('Roble Gymnasium 114'));
check('isRoom rejects tennis courts', !R.isRoom('West Tennis Courts'));
check('isRoom rejects the stables', !R.isRoom('Red Barn Stables'));
check('isRoom keeps Littlefield (not a venue)', R.isRoom('Littlefield 107'));
check('isRoom keeps BARNUM ("barn" is not a word there)', R.isRoom('BARNUM 002A'));
check('isRoom keeps a policy studio', R.isRoom('MIP Policy Studio'));

console.log('\n5. registrar no-class days');
const NC = { '2026-11-24': 'Thanksgiving Recess' };
const rec = [mt('Thornton 207', ['Tuesday'], '10:30', '11:50', 'CS 106A'), mt('Lathrop 292', ['Tuesday'], '12:00', '12:50')];
const inRecess = (hhmm) => new Date(`2026-11-24T${hhmm}:00-08:00`);
s = R.status(rec, inRecess('11:00'), NC);
check('recess Tuesday: a Tuesday class is not busy', row(s, 'Thornton 207').state === 'free' && row(s, 'Thornton 207').until === null, JSON.stringify(row(s, 'Thornton 207')));
check('recess Tuesday: no "class soon" either', row(s, 'Lathrop 292').state === 'free' && row(s, 'Lathrop 292').course === null);
check('recess Tuesday: every room is still listed', s.length === 2);
check('the Tuesday before is unaffected', R.status(rec, new Date('2026-11-17T11:00:00-08:00'), NC).find((r) => r.room === 'Thornton 207').state === 'busy');
check('noClassDay names the day', R.noClassDay(NC, inRecess('11:00')) === 'Thanksgiving Recess');
check('noClassDay uses the campus date, not UTC (23:30 PST Monday is not Tuesday)', R.noClassDay(NC, new Date('2026-11-24T07:30:00Z')) === null);
check('noClassDay null on an ordinary day', R.noClassDay(NC, at('11:00')) === null);
check('no noClass map (old data file) changes nothing', R.status(rec, inRecess('11:00')).find((r) => r.room === 'Thornton 207').state === 'busy');

console.log('\n6. which term is in session');
const AUT = { term: '2026-2027 Autumn', first: '2026-09-22', last: '2026-12-04',
  noClass: { '2026-11-24': 'Thanksgiving Recess' },
  meetings: [mt('Thornton 207', ['Tuesday'], '10:30', '11:50', 'CS 106A')] };
const WIN = { term: '2026-2027 Winter', first: '2027-01-05', last: '2027-03-12',
  noClass: { '2027-01-18': 'Martin Luther King, Jr., Day' },
  meetings: [mt('Gates B1', ['Tuesday'], '09:00', '10:20', 'CS 161', '2027-01-05', '2027-03-12')] };
const twoTerms = { terms: [AUT, WIN] };
const on = (date) => R.pickTerm(twoTerms, new Date(`${date}T11:00:00-08:00`));

check('mid-Autumn picks Autumn, in session', on('2026-10-27').state === 'in' && on('2026-10-27').term === AUT.term, JSON.stringify(on('2026-10-27').state));
check('Autumn\'s last day is still in session', on('2026-12-04').state === 'in' && on('2026-12-04').term === AUT.term);
check('the day after Autumn ends rolls to Winter, not stale', on('2026-12-05').state === 'between' && on('2026-12-05').term === WIN.term, JSON.stringify(on('2026-12-05').state));
check('winter break names when Winter starts', on('2026-12-20').next.first === '2027-01-05');
check('Winter\'s first day is in session', on('2027-01-05').state === 'in' && on('2027-01-05').term === WIN.term);
check('mid-Winter serves Winter meetings, not Autumn\'s', on('2027-02-01').meetings[0].course === 'CS 161');
check('mid-Winter serves Winter\'s no-class days', R.noClassDay(on('2027-01-18').noClass, new Date('2027-01-18T11:00:00-08:00')) === 'Martin Luther King, Jr., Day');
check('past every term on file -> after (a guess, not "free")', on('2027-04-01').state === 'after');
check('before the first term on file -> between', on('2026-09-01').state === 'between' && on('2026-09-01').term === AUT.term);

// Terms in the file in any order: merge.py sorts them, but the page must not depend on it.
check('terms listed newest-first still resolve by date', R.pickTerm({ terms: [WIN, AUT] }, at('11:00')).term === AUT.term);

// 23:30 on campus is already tomorrow in UTC. On Autumn's last day that is the difference
// between "classes meet today" and "the term is over".
const lateLastDay = new Date('2026-12-04T23:30:00-08:00');
check('late on the last day it is still that day on campus, not UTC tomorrow', R.pickTerm(twoTerms, lateLastDay).state === 'in', R.pickTerm(twoTerms, lateLastDay).state);

// The bug this exists to stop: one term alone goes stale the day its classes end and
// stays stale for the whole next quarter.
const oneTerm = { term: AUT.term, noClass: AUT.noClass, meetings: AUT.meetings };
check('a single-term file still reads, range derived from its meetings', R.pickTerm(oneTerm, at('11:00')).state === 'in' && R.pickTerm(oneTerm, at('11:00')).first === '2026-09-22');
check('a single-term file IS stale in the next quarter (what terms[] fixes)', R.pickTerm(oneTerm, new Date('2027-02-01T11:00:00-08:00')).state === 'after');
check('two terms are NOT stale on that same day', on('2027-02-01').state === 'in');

/* Gaps bin/mutate found on 2026-10-26 (rooms-logic was 59/89, the weakest suite on
 * either site). Each block below turns a specific survivor red. */

console.log('\n9. the dates a meeting series actually runs');
// `if ((m.from && now.date < m.from) || (m.to && now.date > m.to)) continue;` — both
// comparisons were unpinned, and loosening either drops a meeting that IS meeting,
// which shows an occupied room as free. That is the worst answer this page can give.
const B = [
  mt('Thornton 101', ['Tuesday'], '10:00', '11:00', 'STARTS 1', '2026-10-27', '2026-12-04'),
  mt('Thornton 102', ['Tuesday'], '10:00', '11:00', 'ENDS 1', '2026-09-22', '2026-10-27'),
  mt('Thornton 103', ['Tuesday'], '10:00', '11:00', 'NOTYET 1', '2026-10-28', '2026-12-04'),
  mt('Thornton 104', ['Tuesday'], '10:00', '11:00', 'OVER 1', '2026-09-22', '2026-10-26'),
];
s = R.status(B, at('10:30'));
check('a series counts on its FIRST date', row(s, 'Thornton 101').state === 'busy', row(s, 'Thornton 101').state);
check('a series counts on its LAST date', row(s, 'Thornton 102').state === 'busy', row(s, 'Thornton 102').state);
check('a series that starts tomorrow does not count today', row(s, 'Thornton 103').state === 'free', row(s, 'Thornton 103').state);
check('a series that ended yesterday does not count today', row(s, 'Thornton 104').state === 'free', row(s, 'Thornton 104').state);

console.log('\n10. the SOON cutoff is exactly 30 minutes');
// SOON = 30 and `next.s - now.min < SOON` were both unpinned, so the threshold could
// move a minute either way unnoticed.
const S1 = [mt('Thornton 201', ['Tuesday'], '12:00', '12:50', 'SOON 1')];
check('29 minutes out is "soon"', row(R.status(S1, at('11:31')), 'Thornton 201').state === 'soon');
check('exactly 30 minutes out is still "free"', row(R.status(S1, at('11:30')), 'Thornton 201').state === 'free',
  row(R.status(S1, at('11:30')), 'Thornton 201').state);
check('31 minutes out is "free"', row(R.status(S1, at('11:29')), 'Thornton 201').state === 'free');

console.log('\n11. the order the list is read in');
// rank{free,soon,busy}, the until-key, its busy/free direction and the room-name
// tiebreak were all unpinned. Three rooms per rank, handed in the wrong order, because
// V8 compares a single pair for a 2-element array and a broken comparator survives that.
const O = [
  mt('Zed 300', ['Tuesday'], '09:00', '13:00', 'BUSY LATE'),    // busy until 13:00
  mt('Alpha 100', ['Tuesday'], '09:00', '12:10', 'BUSY SOON'),  // busy until 12:10
  // (not 12:00: the end is exclusive, so a class ending at 12:00 leaves the room FREE
  //  at 12:00 — the first draft of this fixture got that wrong and the check caught it)
  mt('Mid 200', ['Tuesday'], '09:00', '12:30', 'BUSY MID'),     // busy until 12:30
  mt('Free Short 1', ['Tuesday'], '12:10', '13:00', 'NEXT SOON'),   // soon (10 min)
  mt('Free Long 1', ['Tuesday'], '16:00', '17:00', 'NEXT LATE'),    // free until 16:00
  mt('Free Mid 1', ['Tuesday'], '14:00', '15:00', 'NEXT MID'),      // free until 14:00
  mt('Free All 1', ['Monday'], '09:00', '10:00', 'OTHER DAY'),      // free, no more today
];
const ord = R.status(O, at('12:00')).map((r) => r.room);
check('free before soon before busy',
  ord.indexOf('Free All 1') < ord.indexOf('Free Short 1')
  && ord.indexOf('Free Short 1') < ord.indexOf('Alpha 100'), ord.join(' | '));
check('free rooms are longest-free first, with "no more classes" first of all',
  ord.indexOf('Free All 1') < ord.indexOf('Free Long 1')
  && ord.indexOf('Free Long 1') < ord.indexOf('Free Mid 1'), ord.join(' | '));
check('busy rooms are soonest-free first',
  ord.indexOf('Alpha 100') < ord.indexOf('Mid 200')
  && ord.indexOf('Mid 200') < ord.indexOf('Zed 300'), ord.join(' | '));
const TIE = [
  mt('Zulu 1', ['Monday'], '09:00', '10:00', 'OFF 1'),
  mt('Alpha 1', ['Monday'], '09:00', '10:00', 'OFF 2'),
  mt('Mike 1', ['Monday'], '09:00', '10:00', 'OFF 3'),
];
check('rooms that tie on everything sort by name',
  R.status(TIE, at('12:00')).map((r) => r.room).join() === 'Alpha 1,Mike 1,Zulu 1',
  R.status(TIE, at('12:00')).map((r) => r.room).join());

console.log('\n12. allMeetings reads either file shape');
// Exported, and near-logic.test.mjs builds its whole fixture on it, but nothing here
// asserted it: both halves of `data.terms && data.terms.length` and the `|| []`
// fallback survived.
const tA = { term: 'Autumn', meetings: [mt('Thornton 207', ['Tuesday'], '10:30', '11:50', 'A 1')] };
const tB = { term: 'Winter', meetings: [mt('Lathrop 292', ['Monday'], '09:00', '09:50', 'B 1')] };
check('a multi-term file returns every term\u2019s meetings',
  R.allMeetings({ terms: [tA, tB] }).map((m) => m.course).join() === 'A 1,B 1',
  JSON.stringify(R.allMeetings({ terms: [tA, tB] }).map((m) => m.course)));
check('a single-term file returns its top-level meetings',
  R.allMeetings(tA).map((m) => m.course).join() === 'A 1');
check('an EMPTY terms[] falls back to the top level, not to nothing',
  R.allMeetings({ terms: [], meetings: tA.meetings }).length === 1,
  String(R.allMeetings({ terms: [], meetings: tA.meetings }).length));
check('a term with no meetings key contributes nothing, and does not throw',
  R.allMeetings({ terms: [{ term: 'Empty' }, tA] }).length === 1);
check('a file with neither gives an empty list, not undefined',
  Array.isArray(R.allMeetings({})) && R.allMeetings({}).length === 0);

console.log('\n13. a term range derived when only HALF of it is on file');
// `if (!first || !last)` and the two `m.from &&` / `m.to &&` guards inside it survived,
// because every file tested so far had both dates or neither.
const halfFirst = { terms: [{ term: 'Half', first: '2026-09-22', last: null,
  meetings: [mt('Thornton 207', ['Tuesday'], '10:30', '11:50', 'H 1', '2026-10-01', '2026-11-30')] }] };
check('a term with first but no last derives the last from its meetings',
  R.pickTerm(halfFirst, at('11:00')).last === '2026-11-30', String(R.pickTerm(halfFirst, at('11:00')).last));
check('and keeps the first it was given, rather than the meetings\u2019',
  R.pickTerm(halfFirst, at('11:00')).first === '2026-09-22', String(R.pickTerm(halfFirst, at('11:00')).first));
const halfLast = { terms: [{ term: 'Half', first: null, last: '2026-12-04',
  meetings: [mt('Thornton 207', ['Tuesday'], '10:30', '11:50', 'H 1', '2026-10-01', '2026-11-30')] }] };
check('a term with last but no first derives the first from its meetings',
  R.pickTerm(halfLast, at('11:00')).first === '2026-10-01', String(R.pickTerm(halfLast, at('11:00')).first));
check('and keeps the last it was given', R.pickTerm(halfLast, at('11:00')).last === '2026-12-04');
const noDates = { terms: [{ term: 'Bare', meetings: [
  mt('Thornton 207', ['Tuesday'], '10:30', '11:50', 'N 1', '2026-10-01', '2026-11-30'),
  { room: 'Lathrop 292', days: ['Monday'], start: '09:00', end: '09:50', course: 'N 2', component: 'LEC' },
] }] };
check('meetings with no from/to at all are skipped, not read as empty strings',
  R.pickTerm(noDates, at('11:00')).first === '2026-10-01'
  && R.pickTerm(noDates, at('11:00')).last === '2026-11-30',
  JSON.stringify([R.pickTerm(noDates, at('11:00')).first, R.pickTerm(noDates, at('11:00')).last]));

console.log('\n14. the last three survivors that were real');
// termOver took the LAST meeting's end rather than the greatest, whenever `m.to &&` was
// loosened — invisible while every fixture happened to be in date order.
const outOfOrder = [
  mt('Thornton 207', ['Tuesday'], '10:30', '11:50', 'LATE 1', '2026-09-22', '2026-12-04'),
  mt('Thornton 208', ['Tuesday'], '10:30', '11:50', 'EARLY 1', '2026-09-22', '2026-10-01'),
];
check('termOver takes the LATEST end, not the last row\u2019s',
  !R.termOver(outOfOrder, at('11:00', '2026-11-01')), 'said the term was over on 2026-11-01');

// The "after" row is spread from the last term, and nothing asserted it carried anything.
const afterRow = R.pickTerm(twoTerms, new Date('2027-09-01T11:00:00-07:00'));
check('the "after" row names the LAST term, not merely some term',
  afterRow.state === 'after' && afterRow.term === WIN.term && afterRow.last === WIN.last,
  JSON.stringify({ state: afterRow.state, term: afterRow.term, last: afterRow.last }));

// Each room's meetings are sorted by start; `next` is found with .find(), which trusts it.
const unsorted = [
  mt('Thornton 301', ['Tuesday'], '16:00', '17:00', 'THIRD 1'),
  mt('Thornton 301', ['Tuesday'], '14:00', '15:00', 'FIRST 1'),
  mt('Thornton 301', ['Tuesday'], '15:00', '15:50', 'SECOND 1'),
];
const u = row(R.status(unsorted, at('11:00')), 'Thornton 301');
check('the next class is the earliest one, whatever order the file lists them in',
  u.until === '14:00' && u.course === 'FIRST 1', JSON.stringify([u.until, u.course]));

/* The 10 mutants still surviving are equivalent, and were checked rather than waved
 * through. rank free 0->1 and busy 2->3, and both literals in `24 * 60`, leave the
 * order in section 11 byte-identical — the gaps between ranks and the size of the
 * no-more-classes key are redundant with the tiebreaks that follow (rank soon 1->2 is
 * NOT equivalent, and section 11 kills it). The rest are min/max loops where `>=`
 * assigns the value it already holds (L91, L113, L149, L150), a `.find(x => x.s > now)`
 * whose equal case is already "busy" by the time it runs (L94), and the module.exports
 * guard. Not chasing 100%: see bin/mutate's header on equivalent mutants. */

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

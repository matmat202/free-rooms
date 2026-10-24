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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

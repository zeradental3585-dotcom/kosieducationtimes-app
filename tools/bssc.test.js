// BSSC is the first test on the site with 4 marks correct and 1 mark
// negative. Every other paper is 1/0 or 2/0.25, so the scoring line is
// exercised with new numbers here for the first time. A sign or ratio
// error would hand students a score that looks plausible and is wrong.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('../mock/bssc-inter-level-test.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.kosieducationtimes.com/mock/bssc-inter-level-test.html' });
const w = dom.window;
w.eval(html.match(/window\.KET_TEST\s*=\s*\{[\s\S]*?\n\};/)[0]);
const T = w.KET_TEST, B = T.questions;
let pass = 0, fail = 0;
const ok = (n, c) => { console.log('  ' + n.padEnd(48) + (c ? '-> PASS' : '-> FAIL')); c ? pass++ : fail++; };

ok('25 questions', B.length === 25);
ok('4 marks per correct answer', T.marks === 4);
ok('1 mark negative', T.negative === 1);
ok('duration is 54s x 25 questions', T.duration === 1350);
ok('id matches the backend registry', T.id === 'bssc-inter-level-1');

// scoring, computed the way quiz.js does: right*marks - wrong*negative
const score = (r, wr) => r * T.marks - wr * T.negative;
ok('all correct scores 100', score(25, 0) === 100);
ok('all wrong scores -25', score(0, 25) === -25);
ok('20 right 5 wrong scores 75', score(20, 5) === 75);
// the claim printed on the page: blind guessing is worth +0.25/question
const ev = (1 / 4) * T.marks + (3 / 4) * -T.negative;
ok('page claim: blind guess EV = +0.25', Math.abs(ev - 0.25) < 1e-9);
const ev3 = (1 / 3) * T.marks + (2 / 3) * -T.negative;
ok('page claim: 3-option guess EV = +0.67', Math.abs(ev3 - 2 / 3) < 1e-9);
const ev2 = 0.5 * T.marks + 0.5 * -T.negative;
ok('page claim: 2-option guess EV = +1.5', Math.abs(ev2 - 1.5) < 1e-9);
ok('page claim: 20 skipped = 5 marks given up', Math.abs(20 * ev - 5) < 1e-9);

// answer quality
const dist = [0, 0, 0, 0];
B.forEach(q => dist[q.answer]++);
ok('answer spread is 6/6/6/7', dist.filter(n => n === 6).length === 3 && dist.includes(7));
ok('no option is correct more than 28% of the time', Math.max(...dist) / B.length <= 0.28);
ok('never 3 identical answers in a row',
   B.every((_, i) => i < 2 || !(B[i].answer === B[i-1].answer && B[i].answer === B[i-2].answer)));
ok('every question has 4 distinct options', B.every(q => new Set(q.options).size === 4));
ok('every question has an explanation', B.every(q => q.explain && q.explain.length > 25));
ok('every answer index is in range', B.every(q => q.answer >= 0 && q.answer < 4));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

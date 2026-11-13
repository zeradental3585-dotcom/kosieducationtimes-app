// The static review block was added to pages that already run the quiz.
// It repeats every question, option and answer in the DOM, so the risk is
// that quiz.js picks up those nodes instead of its own rendered form --
// grading against the wrong radios, or counting 125 questions on a 25
// question paper. This loads a real mock page and checks the quiz still
// behaves, rather than trusting that ids happen not to collide.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const PAGE = process.argv[2] || '../mock/bihar-police-constable-test.html';
let pass = 0, fail = 0;
const ok = (name, cond) => {
  console.log('  ' + name.padEnd(46) + (cond ? '-> PASS' : '-> FAIL'));
  cond ? pass++ : fail++;
};

const html = fs.readFileSync(PAGE, 'utf8');
console.log(PAGE);
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.kosieducationtimes.com/mock/bihar-police-constable-test.html' });
const { window } = dom;
const doc = window.document;

// The page's own inline config, then the shared engine.
const cfg = html.match(/window\.KET_TEST\s*=\s*\{[\s\S]*?\};/)[0];
window.eval(cfg);
const BANK = window.KET_TEST.questions;

ok('page exposes a question bank', Array.isArray(BANK) && BANK.length > 0);
ok('review block is present in served HTML', html.includes('review:start'));

// 1. The review must not add anything quiz.js would mistake for its own UI.
const formRadios = doc.querySelectorAll('#quizForm input[type=radio]');
ok('review adds no radios to the quiz form', formRadios.length === 0);
const reviewRadios = doc.querySelectorAll('#review input');
ok('review contains no form inputs at all', reviewRadios.length === 0);

// 2. ids must stay unique -- duplicates are how this kind of change breaks.
const ids = [...doc.querySelectorAll('[id]')].map(e => e.id);
ok('no duplicate element ids', new Set(ids).size === ids.length);

// 3. The review must be collapsed, or it spoils the test for a first-timer.
const det = doc.querySelector('#review details.review');
ok('review is inside a collapsed <details>', !!det && !det.hasAttribute('open'));

// 4. Content integrity: every question and explanation really is on the page.
const reviewText = doc.querySelector('#review').textContent;
ok('every question text appears in the review',
   BANK.every(q => reviewText.includes(q.q)));
ok('every explanation appears in the review',
   BANK.every(q => !q.explain || reviewText.includes(q.explain)));
ok('every correct answer is shown',
   BANK.every(q => reviewText.includes(String(q.options[q.answer]))));

// 5. The marked answer must match the bank, not drift by an index.
const blocks = doc.querySelectorAll('#review .qrev');
ok('one review block per question', blocks.length === BANK.length);
let aligned = true;
blocks.forEach((b, i) => {
  const shown = b.querySelector('.ans').textContent;
  if (!shown.includes(String(BANK[i].options[BANK[i].answer]))) aligned = false;
});
ok('answer shown matches the bank for every question', aligned);

// 6. The quiz still has its own empty mount points to render into.
ok('quiz form is still empty for the engine to fill',
   doc.querySelector('#quizForm').children.length === 0);
ok('start button still present', !!doc.querySelector('#startBtn'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

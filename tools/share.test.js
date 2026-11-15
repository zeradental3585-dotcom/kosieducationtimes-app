// A share link is the kind of thing that ships broken because nobody in
// review ever clicks it. These run the real engine against a real page,
// finish a test, and check what the student would actually send: that
// the WhatsApp URL is properly encoded, that the score in the message
// matches the score on screen, and that the link points at this test
// rather than at a URL carrying the student's answers.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
const ok = (n, c) => { console.log('  ' + n.padEnd(52) + (c ? '-> PASS' : '-> FAIL')); c ? pass++ : fail++; };

const PAGE = process.argv[2] || '../mock/bssc-inter-level-test.html';
const SLUG = PAGE.split('/').pop();
const BASE = 'https://www.kosieducationtimes.com/mock/' + SLUG;
const html = fs.readFileSync(PAGE, 'utf8');
const H1 = (html.match(/<h1>([^<]*)<\/h1>/) || [, ''])[1].trim();
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: BASE + '?utm=x#frag'
});
const { window } = dom; const doc = window.document;
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));

// no network in the test: the engine must fall back to the page's own bank
window.fetch = () => Promise.reject(new Error('offline'));
window.eval(fs.readFileSync('../js/auth.js', 'utf8'));
window.eval(html.match(/window\.KET_TEST\s*=\s*\{[\s\S]*?\n\};/)[0]);
window.eval(fs.readFileSync('../js/quiz.js', 'utf8'));

const B = window.KET_TEST.questions;
doc.getElementById('startBtn').click();

// answer everything correctly, then submit
B.forEach((q, i) => {
  const g = doc.querySelectorAll('input[name="q' + i + '"]');
  if (g.length) g[q.answer].checked = true;
});
doc.getElementById('submitBtn').click();

const res = doc.getElementById('resultWrap');
ok('result rendered', !res.classList.contains('hidden'));
const card = doc.querySelector('.sharecard');
ok('share block appears after grading', !!card);

const wa = doc.getElementById('shareWa');
ok('WhatsApp link present', !!wa);
const href = wa ? wa.getAttribute('href') : '';
ok('uses the wa.me share endpoint', href.startsWith('https://wa.me/?text='));
ok('opens in a new tab safely', wa.getAttribute('rel').includes('noopener'));

const msg = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
// '100%' is legitimately in the message, so look for leftover
// percent-ENCODING (%E0 and friends), not for the % character.
ok('message decodes cleanly, no double-encoding',
   msg.length > 40 && !/%[0-9A-Fa-f]{2}/.test(msg));
const T = window.KET_TEST;
const expected = (B.length * T.marks);
const fmt = n => (Math.round(Number(n) * 100) / 100).toString();
ok('message carries the real score',
   msg.includes(fmt(expected) + '/' + fmt(expected)) && msg.includes('100%'));
ok('message names the test', H1.length > 0 && msg.includes(H1));
ok('message contains the page URL', msg.includes(BASE));
ok('shared URL drops query string and fragment',
   !msg.includes('utm=x') && !msg.includes('#frag'));
// a newline in a URL would truncate the shared link in some clients
ok('URL sits at the end, nothing after it', msg.trim().endsWith('.html'));

// copy button
const copy = doc.getElementById('copyLink');
ok('copy button present', !!copy);
const msgEl = doc.getElementById('copiedMsg');
ok('confirmation starts hidden', !!msgEl && msgEl.hidden === true);
let copied = null;
window.navigator.clipboard = { writeText: v => { copied = v; return Promise.resolve(); } };
copy.click();
setTimeout(() => {
  ok('clicking copy writes the clean URL to the clipboard',
     copied === BASE);
  ok('confirmation shown after copying', msgEl.hidden === false);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 30);

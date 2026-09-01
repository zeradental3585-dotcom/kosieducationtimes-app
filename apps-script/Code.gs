/**
 * KosiEducationTimes - mock test backend
 *
 * Sheet tabs:
 *   questions  A:question B:option1 C:option2 D:option3 E:option4
 *              F:answer(1-4) G:explain H:topic I:difficulty J:test_id
 *   attempts   A:timestamp B:user C:test D:score E:total F:pct G:wrong H:topics
 *   users      A:google_id B:key C:linked_on
 *
 * "user" is always a sync code (KET-XXXX-XXXX) - never an email, even for
 * students who sign in with Google. Signing in returns the account's code;
 * the code is what gets written next to a score. Two consequences worth
 * keeping: the attempts sheet contains no email addresses at all, and
 * knowing somebody's Gmail address gives you no way to read their marks.
 *
 * The users tab stores Google's opaque account id (the "sub" claim), not
 * an email and not a name.
 *
 * Run setupSheet() once to build headers and load questions from the live
 * site. Re-run any time to re-sync after editing questions on the site.
 */

var SHEET_ID = '1kqKC217U-2EP6rUhtniRiHuGM3FqqnAc-A6B40y_pOM';

/* Every test on the site. Adding a test is one line here plus the page
   itself - setupSheet() then picks it up on the next run. */
var TESTS = [
  { id: 'bihar-police-constable-1',
    url: 'https://www.kosieducationtimes.com/mock/bihar-police-constable-test.html' },
  { id: 'bihar-police-constable-2',
    url: 'https://www.kosieducationtimes.com/mock/bihar-police-constable-test-2.html' },
  { id: 'bihar-police-full-1',
    url: 'https://www.kosieducationtimes.com/mock/bihar-police-full-test-1.html' },
  { id: 'ssc-gd-constable-1',
    url: 'https://www.kosieducationtimes.com/mock/ssc-gd-constable-test.html' }
];

/* Must match GOOGLE_CLIENT_ID in js/auth.js. Empty disables Google Sign-In
   server-side, which is the safe default: better to reject every token
   than to accept tokens minted for somebody else's app. */
var CLIENT_ID = '453571342546-eg71jlhe2q8a13dmrbf2nlj9hn69jrgk.apps.googleusercontent.com';

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) sh = ss_().insertSheet(name);
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/** A sync code looks like KET-7F3K-92QX. Nothing else is ever a key. */
function validKey_(k) {
  if (!k) return null;
  k = String(k).trim().toUpperCase();
  return /^KET-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k) ? k : null;
}

var ALPHABET_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I O 0 1

function newCode_() {
  var s = '';
  for (var i = 0; i < 8; i++) s += ALPHABET_.charAt(Math.floor(Math.random() * ALPHABET_.length));
  return 'KET-' + s.slice(0, 4) + '-' + s.slice(4);
}

/**
 * Pull every test's question bank off the live pages into the sheet.
 * Safe to re-run: it rebuilds the questions tab from scratch and never
 * touches attempts or users.
 *
 * Test pages declare their bank as `questions: [...]` inside a
 * window.KET_TEST config; the older single-test page used
 * `var QUESTIONS = [...]`. Both shapes are accepted so this keeps
 * working if one page is redeployed before another.
 */
function setupSheet() {
  var q = sheet_('questions');
  q.clear();
  q.getRange(1, 1, 1, 10).setValues([[
    'question','option1','option2','option3','option4',
    'answer','explain','topic','difficulty','test_id'
  ]]).setFontWeight('bold');

  var rows = [], report = [];

  for (var t = 0; t < TESTS.length; t++) {
    var test = TESTS[t];
    var html = UrlFetchApp.fetch(test.url).getContentText();
    var m = html.match(/questions:\s*(\[[\s\S]*?\])\s*\n\};/) ||
            html.match(/var QUESTIONS = (\[[\s\S]*?\]);/);
    if (!m) { report.push(test.id + ': BANK NOT FOUND'); continue; }

    var qs = JSON.parse(m[1]);
    for (var i = 0; i < qs.length; i++) {
      var x = qs[i];
      rows.push([x.q, x.options[0], x.options[1], x.options[2], x.options[3],
                 x.answer + 1, x.explain, x.topic, 'easy', test.id]);
    }
    report.push(test.id + ': ' + qs.length);
  }

  if (!rows.length) throw new Error('No question banks found. ' + report.join(' | '));

  /* Force plain text before writing. Otherwise Sheets helpfully converts
     an option like "10%" into the number 0.1, and the student is offered
     "0.1, 0.12, 0.15, 0.2" as answers to a percentage question. Dates and
     fractions would go the same way. Caught by round-tripping the bank
     through the sheet and diffing it against the page. */
  var range = q.getRange(2, 1, rows.length, 10);
  range.setNumberFormat('@');
  range.setValues(rows);
  q.setFrozenRows(1);

  var a = sheet_('attempts');
  a.getRange(1, 1, 1, 8).setValues([[
    'timestamp','user','test','score','total','pct','wrong','topics'
  ]]).setFontWeight('bold');
  a.setFrozenRows(1);

  Logger.log('Loaded ' + rows.length + ' questions -> ' + report.join(' | '));
  return report.join(' | ');
}

/**
 * Verify a Google ID token and return its claims, or null.
 *
 * The aud check is the one that matters. Without it any valid Google
 * token would be accepted here - including one a student handed to some
 * unrelated site, which that site could then replay to read or write
 * this student's scores. Checking that the token was minted for OUR
 * client id is what makes it proof of identity rather than proof that
 * Google exists.
 */
function verifyToken_(credential) {
  if (!credential || !CLIENT_ID) return null;
  try {
    var res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var info = JSON.parse(res.getContentText());
    if (info.aud !== CLIENT_ID) return null;
    if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') return null;
    if (String(info.email_verified) !== 'true') return null;
    if (!info.sub) return null;
    if (Number(info.exp) * 1000 < Date.now()) return null;
    return info;
  } catch (e) { return null; }
}

/**
 * Google account -> sync code.
 *
 * First time we see an account we mint a code, or adopt the one already
 * on that device, so a student who took tests anonymously before signing
 * in keeps that history instead of restarting at zero. After that the
 * same account always gets the same code back, on any phone.
 */
function linkGoogle_(credential, existingKey) {
  var info = verifyToken_(credential);
  if (!info) return null;

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return null; }
  try {
    var sh = sheet_('users');
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, 3).setValues([['google_id', 'key', 'linked_on']]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    var rows = sh.getDataRange().getValues();
    var taken = {};
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(info.sub)) return String(rows[i][1]);
      taken[String(rows[i][1])] = true;
    }
    var code = validKey_(existingKey);
    if (!code || taken[code]) {
      do { code = newCode_(); } while (taken[code]);
    }
    sh.appendRow([String(info.sub), code, new Date()]);
    return code;
  } finally {
    lock.releaseLock();
  }
}

/* Below this many students, a percentile is noise dressed up as a fact.
   Every portal shows one from day one; we would rather say we cannot. */
var MIN_SAMPLE = 30;

/**
 * How one score compares with everybody else's on the same test.
 *
 * Counts each student once, using their best attempt. Without that, a
 * student who takes a test twenty times would be twenty of the numbers
 * they are being measured against, and anyone who practised hard would
 * push everyone else's percentile down by being diligent.
 *
 * Returns the sample size whether or not it is big enough, because the
 * honest answer to "how did I do against others" is sometimes "only six
 * people have taken this, so there is nothing to compare with yet".
 */
function statsFor_(testId, pct) {
  var rows = sheet_('attempts').getDataRange().getValues();
  var best = {};
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][2]) !== testId) continue;
    var user = String(rows[i][1]);
    var p = Number(rows[i][5]);
    if (!user || isNaN(p)) continue;
    if (!(user in best) || p > best[user]) best[user] = p;
  }

  var vals = [];
  for (var u in best) vals.push(best[u]);
  var n = vals.length;
  if (!n) return { ok: true, n: 0, enough: false };

  var sum = 0, below = 0, equal = 0;
  for (var j = 0; j < n; j++) {
    sum += vals[j];
    if (vals[j] < pct) below++;
    else if (vals[j] === pct) equal++;
  }
  vals.sort(function (a, b) { return a - b; });

  return {
    ok: true,
    n: n,
    enough: n >= MIN_SAMPLE,
    mean: Math.round(sum / n),
    median: n % 2 ? vals[(n - 1) / 2] : Math.round((vals[n / 2 - 1] + vals[n / 2]) / 2),
    best: vals[n - 1],
    /* Mid-rank: half the ties count as below. Avoids telling someone on
       the modal score that they beat nobody. */
    better: Math.round(((below + equal / 2) / n) * 100)
  };
}

function readAttempts_(key) {
  var rows = sheet_('attempts').getDataRange().getValues();
  var mine = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).toLowerCase() === key.toLowerCase()) {
      mine.push({
        date: rows[i][0], test: rows[i][2], score: rows[i][3],
        total: rows[i][4], pct: rows[i][5], wrong: rows[i][6],
        topics: rows[i][7]
      });
    }
  }
  return mine.slice(-100);
}

/**
 * GET ?action=questions&test=...   -> question bank
 * GET ?action=history&key=KET-...  -> that key's attempts
 */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var action = p.action || 'questions';

  if (action === 'history') {
    var key = validKey_(p.key);
    if (!key) return json_({ ok: false, error: 'bad key' });
    return json_({ ok: true, attempts: readAttempts_(key) });
  }

  /* GET ?action=stats&test=<id>&pct=<0-100> - no key needed, and none is
     accepted: this returns aggregate numbers about a test, never anything
     about a particular student. */
  if (action === 'stats') {
    var t = String(p.test || '').trim();
    if (!t) return json_({ ok: false, error: 'no test' });
    var score = Math.max(0, Math.min(100, Math.round(Number(p.pct) || 0)));
    return json_(statsFor_(t, score));
  }

  var testId = (p.test || '').trim();
  var rows = sheet_('questions').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    if (testId && String(r[9]).trim() !== testId) continue;
    /* Second line of defence against Sheets' type coercion: whatever the
       cell holds, the page gets a string. A number here renders as
       "0.1" where the question expects "10%". */
    out.push({
      q: String(r[0]),
      options: [String(r[1]), String(r[2]), String(r[3]), String(r[4])],
      answer: Number(r[5]) - 1, explain: String(r[6]),
      topic: String(r[7]), difficulty: String(r[8])
    });
  }
  return json_({ ok: true, questions: out });
}

/**
 * POST { action:'link', credential:'<google id token>', key:'KET-...'|'' }
 *        -> { ok:true, key:'KET-...' }   the account's sync code
 * POST { action:'saveAttempt', key:'KET-...', attempt:{...} }
 * POST { action:'history', key:'KET-...' }
 */
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad json' }); }

  if (body.action === 'link') {
    var linked = linkGoogle_(body.credential, body.key);
    if (!linked) return json_({ ok: false, error: 'token rejected' });
    return json_({ ok: true, key: linked });
  }

  var key = body.credential
    ? linkGoogle_(body.credential, body.key)
    : validKey_(body.key);
  if (!key) return json_({ ok: false, error: 'no valid key' });

  if (body.action === 'saveAttempt') {
    var a = body.attempt || {};
    sheet_('attempts').appendRow([
      new Date(), key, a.test || '', a.score || 0, a.total || 0,
      a.pct || 0, a.wrong || '', a.topics || ''
    ]);
    return json_({ ok: true });
  }

  if (body.action === 'history') {
    return json_({ ok: true, attempts: readAttempts_(key) });
  }

  return json_({ ok: false, error: 'unknown action' });
}

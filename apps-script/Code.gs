/**
 * KosiEducationTimes - mock test backend
 *
 * Sheet tabs:
 *   questions  A:question B:option1 C:option2 D:option3 E:option4
 *              F:answer(1-4) G:explain H:topic I:difficulty J:test_id
 *   attempts   A:timestamp B:user C:test D:score E:total F:pct G:wrong H:topics
 *
 * "user" is either a sync code (KET-XXXX-XXXX) or, if Google Sign-In is
 * ever enabled, a Google-verified email address. Both are supported.
 *
 * Run setupSheet() once to build headers and load questions from the live
 * site. Re-run any time to re-sync after editing questions on the site.
 */

var SHEET_ID = '1kqKC217U-2EP6rUhtniRiHuGM3FqqnAc-A6B40y_pOM';
var TEST_URL = 'https://www.kosieducationtimes.com/mock/bihar-police-constable-test.html';
var TEST_ID  = 'bihar-police-constable-1';

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

/** A sync code looks like KET-7F3K-92QX. Nothing else is accepted as a key. */
function validKey_(k) {
  if (!k) return null;
  k = String(k).trim();
  if (/^KET-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)) return k;
  if (k.indexOf('@') > 0 && k.length < 120) return k.toLowerCase();  // verified email
  return null;
}

function setupSheet() {
  var q = sheet_('questions');
  q.clear();
  q.getRange(1, 1, 1, 10).setValues([[
    'question','option1','option2','option3','option4',
    'answer','explain','topic','difficulty','test_id'
  ]]).setFontWeight('bold');

  var html = UrlFetchApp.fetch(TEST_URL).getContentText();
  var m = html.match(/var QUESTIONS = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('Could not find the question bank on the live page.');
  var qs = JSON.parse(m[1]);

  var rows = qs.map(function (x) {
    return [x.q, x.options[0], x.options[1], x.options[2], x.options[3],
            x.answer + 1, x.explain, x.topic, 'easy', TEST_ID];
  });
  q.getRange(2, 1, rows.length, 10).setValues(rows);
  q.setFrozenRows(1);

  var a = sheet_('attempts');
  a.getRange(1, 1, 1, 8).setValues([[
    'timestamp','user','test','score','total','pct','wrong','topics'
  ]]).setFontWeight('bold');
  a.setFrozenRows(1);

  Logger.log('Loaded ' + rows.length + ' questions.');
  return rows.length;
}

/** Optional: only used if Google Sign-In is switched on later. */
function verifyEmail_(credential) {
  if (!credential) return null;
  try {
    var res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var info = JSON.parse(res.getContentText());
    if (String(info.email_verified) !== 'true') return null;
    return info.email || null;
  } catch (e) { return null; }
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

  var testId = (p.test || '').trim();
  var rows = sheet_('questions').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    if (testId && String(r[9]).trim() !== testId) continue;
    out.push({
      q: r[0], options: [r[1], r[2], r[3], r[4]],
      answer: Number(r[5]) - 1, explain: r[6],
      topic: r[7], difficulty: r[8]
    });
  }
  return json_({ ok: true, questions: out });
}

/**
 * POST { action:'saveAttempt', key:'KET-...', attempt:{...} }
 * POST { action:'saveAttempt', credential:'<google id token>', attempt:{...} }
 * POST { action:'history', key|credential }
 */
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad json' }); }

  var key = body.credential ? verifyEmail_(body.credential) : validKey_(body.key);
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

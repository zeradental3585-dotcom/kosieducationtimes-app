/**
 * KosiEducationTimes — mock test backend
 * Google Apps Script bound to a Google Sheet.
 *
 * Sheet tabs required (exact names):
 *
 *   questions   A:question  B:option1  C:option2  D:option3  E:option4
 *               F:answer (1-4)  G:explain  H:topic  I:difficulty  J:test_id
 *
 *   attempts    A:timestamp  B:email  C:test  D:score  E:total  F:pct  G:wrong
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Copy the /exec URL into APPS_SCRIPT_URL in the quiz page.
 *
 * No passwords are handled. The browser sends a Google ID token; this script
 * asks Google to verify it and trusts only the email Google returns.
 */

var SHEET_ID = '';           // paste the Sheet ID from its URL
var ALLOWED_ORIGIN = 'https://www.kosieducationtimes.com';

/** Verify a Google ID token and return the verified email, or null. */
function verifyEmail_(credential) {
  if (!credential) return null;
  try {
    var res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var info = JSON.parse(res.getContentText());
    // email_verified comes back as the string "true"
    if (String(info.email_verified) !== 'true') return null;
    return info.email || null;
  } catch (e) {
    return null;
  }
}

function sheet_(name) {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet tab: ' + name);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** GET ?action=questions&test=bihar-police-constable-1 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'questions';

  if (action === 'questions') {
    var testId = (e.parameter.test || '').trim();
    var rows = sheet_('questions').getDataRange().getValues();
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r[0]) continue;
      if (testId && String(r[9]).trim() !== testId) continue;
      out.push({
        q: r[0],
        options: [r[1], r[2], r[3], r[4]],
        answer: Number(r[5]) - 1,      // sheet is 1-4, page expects 0-3
        explain: r[6],
        topic: r[7],
        difficulty: r[8]
      });
    }
    return json_({ ok: true, questions: out });
  }

  return json_({ ok: false, error: 'unknown action' });
}

/** POST {action:'saveAttempt'|'history', credential:'<id_token>', attempt:{...}} */
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad json' }); }

  var email = verifyEmail_(body.credential);
  if (!email) return json_({ ok: false, error: 'not signed in' });

  if (body.action === 'saveAttempt') {
    var a = body.attempt || {};
    sheet_('attempts').appendRow([
      new Date(), email, a.test || '', a.score || 0,
      a.total || 0, a.pct || 0, a.wrong || ''
    ]);
    return json_({ ok: true });
  }

  if (body.action === 'history') {
    var rows = sheet_('attempts').getDataRange().getValues();
    var mine = [];
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).toLowerCase() === email.toLowerCase()) {
        mine.push({
          date: rows[i][0], test: rows[i][2], score: rows[i][3],
          total: rows[i][4], pct: rows[i][5], wrong: rows[i][6]
        });
      }
    }
    return json_({ ok: true, attempts: mine.slice(-50) });
  }

  return json_({ ok: false, error: 'unknown action' });
}

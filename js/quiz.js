/* ------------------------------------------------------------------
   KosiEducationTimes - mock test engine
   Shared by every test page. A page supplies only its config and its
   question bank; everything below is the same everywhere, so a fix to
   the timer or the scoring happens once instead of once per test.

   Page must define, before loading this file:

     window.KET_TEST = {
       id:        "ssc-gd-constable-1",
       duration:  45 * 60,     // seconds
       marks:     2,           // marks per correct answer
       negative:  0.25,        // marks lost per wrong answer, 0 for none
       questions: [ { topic, q, options[4], answer(0-3), explain }, ... ]
     }

   Requires js/auth.js (loaded first) for the sync code / Google identity.
------------------------------------------------------------------ */
(function () {
  "use strict";

  var CFG = window.KET_TEST;
  if (!CFG) return;

  var QUESTIONS = CFG.questions || [];
  var TEST_ID   = CFG.id;
  var MARKS     = typeof CFG.marks === "number" ? CFG.marks : 1;
  var NEGATIVE  = typeof CFG.negative === "number" ? CFG.negative : 0;

  var started = false, ticker = null, remaining = CFG.duration || 1800;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  /* Marks can be fractional once negative marking applies. Show 18 as
     "18", not "18.00", but 17.75 as "17.75". */
  function num(n) { return (Math.round(n * 100) / 100).toString(); }

  /* ---------- who is taking this test ---------- */
  function renderKeyBox() {
    var k = KET.getKey(), p = KET.profile();

    if (p && k) {
      $("whoami").innerHTML =
        (p.picture ? '<img src="' + esc(p.picture) + '" alt="" width="28" height="28" style="border-radius:50%;vertical-align:-8px;margin-left:6px"> ' : "") +
        esc(p.name || "आप") + " — आपकी प्रगति इस Google अकाउंट से जुड़ी है।";
      $("gsi").innerHTML = "";
      $("keybox").innerHTML =
        '<a class="btn secondary" href="dashboard.html">मेरी प्रगति देखें</a> ' +
        '<button class="btn secondary" id="signOut" type="button">साइन आउट</button>';
      $("signOut").addEventListener("click", function () { KET.signOut(); renderKeyBox(); });
      return;
    }

    /* Google is the whole story for almost everybody, so the sync code is
       not shown at all unless Google is unavailable. showCode is flipped
       by mountSignIn's unavailable callback - it is never the default. */
    $("whoami").textContent = "Google से साइन इन कीजिए — फिर किसी भी फोन पर आपकी प्रगति अपने आप दिखेगी। बिना साइन इन किए भी टेस्ट दे सकते हैं, स्कोर इसी फोन में सुरक्षित रहेगा।";
    $("keybox").innerHTML = '<a class="btn secondary" href="dashboard.html">मेरी प्रगति देखें</a>';

    KET.mountSignIn(
      $("gsi"),
      function () { renderKeyBox(); renderHistory(); },
      function () { showCodeFallback(k); }
    );
  }

  /* Only reached when Google Sign-In cannot run here - most often an
     in-app browser opened from a WhatsApp or Instagram link, where
     Google refuses OAuth outright. These students would otherwise have
     no way to carry their scores to another phone, so they get the code
     and a plain explanation of why they are seeing it. */
  var codeShown = false;
  function showCodeFallback(k) {
    if (codeShown) return;
    codeShown = true;
    k = k || KET.getKey();
    $("gsi").innerHTML = "";
    $("whoami").innerHTML = k
      ? "आपका सिंक कोड: <strong id='mykey'>" + esc(k) + "</strong>"
      : "इस ब्राउज़र में Google साइन इन नहीं चलता। टेस्ट देते ही आपको एक सिंक कोड मिलेगा — उसे लिख लीजिए।";
    $("keybox").innerHTML =
      (k ? '<button class="btn secondary" id="copyKey" type="button">कोड कॉपी करें</button> ' : "") +
      '<a class="btn secondary" href="dashboard.html">मेरी प्रगति देखें</a>' +
      '<p class="note" style="width:100%;margin:8px 0 0">आप किसी ऐप के अंदर वाले ब्राउज़र में हैं, जहाँ Google साइन इन काम नहीं करता — यह Google की अपनी पाबंदी है। ' +
      'इस कोड से आपकी प्रगति सुरक्षित रहेगी। चाहें तो यह पेज Chrome में खोलकर Google से साइन इन कर लीजिए।</p>';
    var c = $("copyKey");
    if (c) c.addEventListener("click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText($("mykey").textContent);
      this.textContent = "कॉपी हो गया";
      var b = this;
      setTimeout(function () { b.textContent = "कोड कॉपी करें"; }, 2000);
    });
  }

  /* ---------- render ---------- */
  function renderQuiz() {
    var html = "";
    QUESTIONS.forEach(function (q, i) {
      html += '<div class="q" id="q' + i + '">';
      html += '<span class="qnum">प्रश्न ' + (i + 1) + '</span><span class="qtopic">' + esc(q.topic) + '</span>';
      html += '<div class="qtext">' + q.q + '</div>';
      q.options.forEach(function (opt, j) {
        html += '<label id="q' + i + 'o' + j + '"><input type="radio" name="q' + i + '" value="' + j + '">' + opt + '</label>';
      });
      html += '</div>';
    });
    $("quizForm").innerHTML = html;
  }

  /* ---------- question palette ----------
     A 25-question test scrolls fine. A 100-question one does not: without
     a map you cannot tell what you have left blank, and on a paper with
     no negative marking a blank is a thrown-away mark. The grid is only
     drawn for long papers, where it earns its space. */
  var PALETTE_FROM = 30;

  function answeredCount() {
    var n = 0;
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (document.querySelector('input[name="q' + i + '"]:checked')) n++;
    }
    return n;
  }

  function buildPalette() {
    var wrap = $("palette");
    if (!wrap) return;
    if (QUESTIONS.length < PALETTE_FROM) { wrap.innerHTML = ""; return; }
    var cells = "";
    for (var i = 0; i < QUESTIONS.length; i++) {
      cells += '<button type="button" class="pcell" data-q="' + i + '">' + (i + 1) + '</button>';
    }
    wrap.innerHTML =
      '<details open><summary>प्रश्न सूची — कौन से बाकी हैं</summary>' +
      '<div class="pgrid">' + cells + '</div>' +
      '<p class="note">भरे हुए प्रश्न रंगीन दिखते हैं। किसी नंबर पर टैप कीजिए, सीधे वहीं पहुँच जाएँगे।</p></details>';
    wrap.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".pcell") : null;
      if (!b) return;
      var el = $("q" + b.getAttribute("data-q"));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function refreshProgressUi() {
    var done = answeredCount(), total = QUESTIONS.length;
    var c = $("answered");
    if (c) c.textContent = done + " / " + total;
    var wrap = $("palette");
    if (!wrap) return;
    var cells = wrap.querySelectorAll(".pcell");
    for (var i = 0; i < cells.length; i++) {
      var on = !!document.querySelector('input[name="q' + i + '"]:checked');
      cells[i].className = on ? "pcell done" : "pcell";
    }
  }

  function fmt(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  /* ---------- surviving an interrupted test ----------
     A student here takes this on one phone, often a shared one, on a
     connection that drops and a battery that does not last. Losing 18
     minutes of a timed test to a dropped call is the kind of thing that
     stops someone coming back. Answers and the clock are written to the
     device continuously, so the test can be picked up where it stopped.
     Nothing here touches the network. */
  var PROGRESS_KEY = "ket_progress_" + TEST_ID;
  var MAX_RESUME_AGE = 24 * 60 * 60 * 1000;

  function saveProgress() {
    if (!started) return;
    var answers = {};
    QUESTIONS.forEach(function (q, i) {
      var sel = document.querySelector('input[name="q' + i + '"]:checked');
      if (sel) answers[i] = parseInt(sel.value, 10);
    });
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        at: Date.now(), remaining: remaining, answers: answers, n: QUESTIONS.length
      }));
    } catch (e) {}
  }

  function readProgress() {
    try {
      var p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      if (!p || !p.at) return null;
      if (Date.now() - p.at > MAX_RESUME_AGE) return null;   // stale, treat as gone
      if (!p.remaining || p.remaining <= 0) return null;      // time was already up
      if (p.n !== QUESTIONS.length) return null;              // bank changed under it
      return p;
    } catch (e) { return null; }
  }

  function clearProgress() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch (e) {}
  }

  function offerResume() {
    var p = readProgress();
    if (!p) return;
    var answered = Object.keys(p.answers || {}).length;
    var box = document.createElement("div");
    box.className = "callout";
    box.innerHTML =
      "<strong>आपका अधूरा टेस्ट मिला।</strong> " + answered + " प्रश्न हल हो चुके थे और " +
      fmt(p.remaining) + " मिनट बाकी थे। वहीं से जारी रखें?<br>" +
      '<p style="margin:10px 0 0"><button class="btn" id="resumeBtn" type="button">वहीं से जारी रखें</button> ' +
      '<button class="btn secondary" id="freshBtn" type="button">नया टेस्ट शुरू करें</button></p>';
    $("intro").insertBefore(box, $("intro").firstChild);
    $("resumeBtn").addEventListener("click", function () { startTest(p); });
    $("freshBtn").addEventListener("click", function () { clearProgress(); startTest(); });
  }

  function startTest(resumeFrom) {
    started = true;
    if (resumeFrom) remaining = resumeFrom.remaining;
    $("intro").classList.add("hidden");
    $("quizWrap").classList.remove("hidden");
    renderQuiz();

    if (resumeFrom && resumeFrom.answers) {
      Object.keys(resumeFrom.answers).forEach(function (i) {
        var el = document.querySelector('input[name="q' + i + '"][value="' + resumeFrom.answers[i] + '"]');
        if (el) el.checked = true;
      });
    }

    buildPalette();
    $("quizForm").addEventListener("change", function () {
      saveProgress();
      refreshProgressUi();
    });
    $("timer").textContent = fmt(remaining);
    saveProgress();
    refreshProgressUi();

    ticker = setInterval(function () {
      remaining--;
      $("timer").textContent = fmt(remaining);
      if (remaining % 5 === 0) saveProgress();
      if (remaining <= 0) { clearInterval(ticker); grade(true); }
    }, 1000);

    /* Backgrounding the tab on a phone can kill the timer without any
       further events, so write once on the way out. */
    window.addEventListener("visibilitychange", saveProgress);
    window.addEventListener("pagehide", saveProgress);
  }

  /* ---------- grading ---------- */
  function grade(auto) {
    if (!started) return;
    clearInterval(ticker);
    clearProgress();   // the test is done; nothing left to resume
    var w = $("blankWarn"); if (w) w.remove();
    var pal = $("palette"); if (pal) pal.innerHTML = "";

    var right = 0, wrong = 0, attempted = 0, byTopic = {}, wrongList = [];

    QUESTIONS.forEach(function (q, i) {
      var sel = document.querySelector('input[name="q' + i + '"]:checked');
      var chosen = sel ? parseInt(sel.value, 10) : -1;
      if (chosen !== -1) attempted++;
      byTopic[q.topic] = byTopic[q.topic] || { right: 0, total: 0 };
      byTopic[q.topic].total++;

      $("q" + i + "o" + q.answer).classList.add("correct");
      if (chosen === q.answer) { right++; byTopic[q.topic].right++; }
      else {
        if (chosen !== -1) { $("q" + i + "o" + chosen).classList.add("wrong"); wrong++; }
        wrongList.push((i + 1) + ". " + q.topic);
      }

      var box = document.createElement("div");
      box.className = "explain";
      box.innerHTML = "<strong>सही उत्तर:</strong> " + q.options[q.answer] + "<br>" + q.explain;
      $("q" + i).appendChild(box);
      document.querySelectorAll('input[name="q' + i + '"]').forEach(function (r) { r.disabled = true; });
    });

    $("submitBtn").classList.add("hidden");

    var maxMarks = QUESTIONS.length * MARKS;
    var scored   = right * MARKS - wrong * NEGATIVE;
    if (scored < 0) scored = 0;
    var pct = Math.round(scored / maxMarks * 100);

    var weak = Object.keys(byTopic).map(function (t) {
      return { t: t, right: byTopic[t].right, total: byTopic[t].total,
               pct: Math.round(byTopic[t].right / byTopic[t].total * 100) };
    }).sort(function (a, b) { return a.pct - b.pct; });

    var rows = weak.map(function (w) {
      return "<tr><td>" + esc(w.t) + "</td><td>" + w.right + " / " + w.total + "</td><td>" + w.pct + "%</td></tr>";
    }).join("");

    var advice = weak[0].pct < 100
      ? "<p>सबसे कमजोर विषय: <strong>" + esc(weak[0].t) + "</strong> (" + weak[0].pct + "%)। अगली तैयारी वहीं से शुरू कीजिए।</p>"
      : "<p>सभी विषयों में पूरे अंक। अगला टेस्ट कठिनाई बढ़ाकर दीजिए।</p>";

    /* With negative marking, the number that teaches something is not the
       score but what the wrong answers cost. Say it in marks, plainly. */
    var penalty = "";
    if (NEGATIVE > 0) {
      penalty = wrong > 0
        ? '<p class="note">आपने ' + wrong + ' प्रश्न गलत किए। इस पर <strong>' + num(wrong * NEGATIVE) +
          ' अंक</strong> कटे — यानी ' + num(right * MARKS) + ' में से घटकर ' + num(scored) + ' रह गए। ' +
          'असली परीक्षा में भी यही कटौती लगती है, इसलिए जो बिल्कुल नहीं आता उसमें अंदाजा लगाने से बचिए।</p>'
        : '<p class="note">एक भी गलत उत्तर नहीं — कोई अंक नहीं कटा। नेगेटिव मार्किंग वाली परीक्षा में यही अनुशासन सबसे ज्यादा काम आता है।</p>';
    }

    var key = KET.ensureKey();
    var prof = KET.profile();

    /* Signed in: say so. Not signed in but Google works here: invite them
       to sign in, and do not mention a code at all. Google unavailable:
       the code is the only thing that will save their progress, so give
       it to them plainly. */
    var idBlock;
    if (prof) {
      idBlock = '<div class="mock-config"><strong>' + esc(prof.name || "आपका अकाउंट") + ' — प्रगति सेव हो गई</strong><br>' +
        'आप जिस भी फोन पर इसी Google अकाउंट से साइन इन करेंगे, यह रिकॉर्ड वहाँ दिखेगा। ' +
        '<a href="dashboard.html">मेरी प्रगति देखें →</a></div>';
    } else if (codeShown) {
      idBlock = '<div class="mock-config"><strong>आपका सिंक कोड: ' + esc(key) + '</strong><br>' +
        'इसे लिख लीजिए। किसी भी दूसरे फोन पर यही कोड डालकर आप अपनी पूरी प्रगति देख सकते हैं — न कोई अकाउंट चाहिए, न पासवर्ड। ' +
        '<a href="dashboard.html">मेरी प्रगति देखें →</a></div>';
    } else {
      idBlock = '<div class="mock-config"><strong>यह स्कोर इसी फोन में सेव हो गया है।</strong><br>' +
        'ऊपर Google से साइन इन कर लीजिए — फिर यह रिकॉर्ड आपके अकाउंट से जुड़ जाएगा और किसी भी दूसरे फोन पर दिखने लगेगा। ' +
        'अभी तक दिए गए टेस्ट भी उसी में जुड़ जाएँगे। ' +
        '<a href="dashboard.html">मेरी प्रगति देखें →</a></div>';
    }

    $("resultWrap").innerHTML =
      '<div class="scorecard"><h2>आपका स्कोर</h2>' +
      '<div class="big">' + num(scored) + ' / ' + num(maxMarks) + '</div>' +
      '<p class="sub">' + pct + '% &middot; ' + right + ' सही, ' + wrong + ' गलत &middot; ' +
      attempted + ' प्रश्न हल किए' + (auto ? ' &middot; समय समाप्त' : '') + '</p></div>' +
      penalty +
      idBlock +
      '<h2>विषयवार प्रदर्शन</h2>' +
      '<table class="facts"><thead><tr><th>विषय</th><th>सही</th><th>प्रतिशत</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      advice +
      '<p>नीचे हर प्रश्न के साथ सही उत्तर और उसकी व्याख्या जुड़ गई है।</p>';
    $("resultWrap").classList.remove("hidden");
    $("resultWrap").scrollIntoView({ behavior: "smooth" });
    showComparison(pct);

    saveAttempt({
      test: TEST_ID, date: new Date().toISOString(),
      score: scored, total: maxMarks, pct: pct,
      wrong: wrongList.join(" | "),
      topics: JSON.stringify(weak.map(function (w) { return [w.t, w.right, w.total]; }))
    });
    renderKeyBox();
  }

  /* ---------- how this score compares with everybody else's ----------
     Every mock test portal shows a percentile from the first attempt
     onward, when the sample is four people and the number means nothing.
     This one states the sample size and refuses to give a percentile
     until there are enough students to support one. Saying "not yet" is
     the whole point: a student deciding they are in the top 10% off six
     data points will stop preparing. */
  function showComparison(pct) {
    if (!KET.ENDPOINT) return;
    var slot = document.createElement("div");
    slot.id = "compareSlot";
    $("resultWrap").appendChild(slot);

    fetch(KET.ENDPOINT + "?action=stats&test=" + encodeURIComponent(TEST_ID) + "&pct=" + pct)
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (!s || !s.ok || !s.n) return;                 // nothing to say; say nothing

        if (!s.enough) {
          slot.innerHTML =
            '<h2>दूसरे छात्रों से तुलना</h2>' +
            '<p class="note">यह टेस्ट अब तक <strong>' + s.n + '</strong> छात्रों ने दिया है। ' +
            'इतने कम आँकड़ों पर प्रतिशत निकालना गलत तस्वीर देगा, इसलिए हम अभी तुलना नहीं दिखा रहे — ' +
            'जैसे ही पर्याप्त छात्र यह टेस्ट दे देंगे, यहीं दिख जाएगा।</p>';
          return;
        }

        var verdict = s.better >= 75 ? 'यह मजबूत स्थिति है। अब कमजोर विषय पर काम कीजिए, बाकी पहले से ठीक है।'
                    : s.better >= 50 ? 'आप बीच से ऊपर हैं। नीचे दी गई विषयवार तालिका में सबसे कमजोर विषय उठाइए।'
                    : 'अभी बहुत जगह बाकी है — और यही असली फायदा है, क्योंकि सुधार सबसे तेज यहीं से होता है।';

        slot.innerHTML =
          '<h2>दूसरे छात्रों से तुलना</h2>' +
          '<p>इस टेस्ट को देने वाले <strong>' + s.n + '</strong> छात्रों में से <strong>' + s.better + '%</strong> ' +
          'से आपका स्कोर बेहतर है। औसत स्कोर <strong>' + s.mean + '%</strong> है और सबसे ज्यादा <strong>' + s.best + '%</strong>।</p>' +
          '<p>' + verdict + '</p>' +
          '<p class="note">हर छात्र को एक बार गिना जाता है, उसके सबसे अच्छे प्रयास के आधार पर — ' +
          'ताकि बार-बार टेस्ट देने वाला किसी और की तुलना को न बिगाड़े।</p>';
      })
      .catch(function () { /* comparison is a bonus, never a blocker */ });
  }

  /* ---------- storage ---------- */
  function localAttempts() {
    try { return JSON.parse(localStorage.getItem("ket_attempts") || "[]"); }
    catch (e) { return []; }
  }

  function saveAttempt(a) {
    try {
      var all = localAttempts(); all.push(a);
      localStorage.setItem("ket_attempts", JSON.stringify(all.slice(-100)));
    } catch (e) {}

    var key = KET.getKey();
    if (key && KET.ENDPOINT) {
      fetch(KET.ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "saveAttempt", key: key, attempt: a })
      }).catch(function () { /* offline - the local copy still stands */ });
    }
    renderHistory();
  }

  function renderHistory() {
    var all = localAttempts().filter(function (a) { return a.test === TEST_ID; });
    if (!all.length) { $("historyWrap").innerHTML = ""; return; }
    var rows = all.slice().reverse().slice(0, 10).map(function (a) {
      var d = new Date(a.date);
      return "<tr><td>" + d.toLocaleDateString("hi-IN") + "</td><td>" + num(a.score) + " / " + num(a.total) +
             "</td><td>" + (Number(a.pct) || 0) + "%</td></tr>";
    }).join("");
    $("historyWrap").innerHTML =
      "<h2>इस टेस्ट के आपके पिछले प्रयास</h2>" +
      '<table class="facts"><thead><tr><th>तारीख</th><th>अंक</th><th>प्रतिशत</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<p><a href="dashboard.html">सभी टेस्ट की पूरी प्रगति देखें →</a></p>';
  }

  /* ---------- questions come from the Sheet; bundled bank is the fallback ---------- */
  function loadQuestionsFromSheet() {
    if (!KET.ENDPOINT) return;
    fetch(KET.ENDPOINT + "?test=" + encodeURIComponent(TEST_ID))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.questions && j.questions.length) {
          var clean = j.questions.filter(function (q) {
            return q && q.q && q.options && q.options.length === 4 &&
                   q.answer >= 0 && q.answer < 4;
          });
          if (clean.length && !started) QUESTIONS = clean;
        }
      })
      .catch(function () {});
  }

  $("startBtn").addEventListener("click", function () { startTest(); });

  /* Submitting with blanks is worth warning about, and the warning is not
     the same in both directions. With no negative marking a blank is a
     mark thrown away for nothing. With negative marking, leaving a
     genuinely unknown question alone is the correct play, so the wording
     must not push them into guessing. An inline panel rather than
     window.confirm, which some in-app browsers suppress. */
  var confirmed = false;
  $("submitBtn").addEventListener("click", function () {
    var blanks = QUESTIONS.length - answeredCount();
    if (blanks === 0 || confirmed) { grade(false); return; }
    confirmed = true;
    var warn = document.createElement("div");
    warn.className = "callout";
    warn.id = "blankWarn";
    warn.innerHTML =
      "<strong>" + blanks + " प्रश्न अभी खाली हैं।</strong> " +
      (NEGATIVE > 0
        ? "इस परीक्षा में हर गलत उत्तर पर " + num(NEGATIVE) + " अंक कटते हैं, इसलिए जो बिल्कुल नहीं आता उसे छोड़ना ठीक है। " +
          "पर जिनमें दो विकल्प कट रहे हों, उन्हें भरना फायदे का है।"
        : "इस परीक्षा में नेगेटिव मार्किंग नहीं है — खाली छोड़ा गया हर प्रश्न बिना वजह गँवाया गया अंक है। " +
          "ऊपर सूची में बचे हुए नंबर दिख रहे हैं, उन्हें भर लीजिए।") +
      '<p style="margin:10px 0 0"><button class="btn secondary" id="goBack" type="button">वापस जाकर भरूँ</button> ' +
      '<button class="btn" id="submitAnyway" type="button">फिर भी जमा करें</button></p>';
    $("quizWrap").insertBefore(warn, $("submitBtn").parentNode);
    warn.scrollIntoView({ behavior: "smooth", block: "center" });
    $("submitAnyway").addEventListener("click", function () { grade(false); });
    $("goBack").addEventListener("click", function () {
      warn.remove();
      confirmed = false;
      var first = -1;
      for (var i = 0; i < QUESTIONS.length; i++) {
        if (!document.querySelector('input[name="q' + i + '"]:checked')) { first = i; break; }
      }
      if (first >= 0) $("q" + first).scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
  loadQuestionsFromSheet();
  renderKeyBox();
  renderHistory();
  offerResume();
})();

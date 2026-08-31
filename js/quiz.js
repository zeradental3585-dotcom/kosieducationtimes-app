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

    if (k) {
      $("whoami").innerHTML = "आपका सिंक कोड: <strong id='mykey'>" + esc(k) + "</strong>";
      $("keybox").innerHTML =
        '<button class="btn secondary" id="copyKey" type="button">कोड कॉपी करें</button> ' +
        '<a class="btn secondary" href="dashboard.html">मेरी प्रगति देखें</a>';
      $("copyKey").addEventListener("click", function () {
        var t = $("mykey").textContent;
        if (navigator.clipboard) navigator.clipboard.writeText(t);
        this.textContent = "कॉपी हो गया";
        var b = this;
        setTimeout(function () { b.textContent = "कोड कॉपी करें"; }, 2000);
      });
    } else {
      $("whoami").textContent = KET.enabled()
        ? "Google से साइन इन कीजिए — फिर किसी भी फोन पर आपकी प्रगति अपने आप दिखेगी। या बिना साइन इन किए टेस्ट दीजिए, आपको एक सिंक कोड मिल जाएगा।"
        : "टेस्ट देते ही आपको एक सिंक कोड मिलेगा। उसे लिख लीजिए — किसी भी फोन पर वही कोड डालकर अपनी पूरी प्रगति देख सकते हैं।";
      $("keybox").innerHTML = '<a class="btn secondary" href="dashboard.html">कोड है? प्रगति देखें</a>';
    }

    KET.mountSignIn($("gsi"), function () { renderKeyBox(); renderHistory(); });
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

  function fmt(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  function startTest() {
    started = true;
    $("intro").classList.add("hidden");
    $("quizWrap").classList.remove("hidden");
    renderQuiz();
    $("timer").textContent = fmt(remaining);
    ticker = setInterval(function () {
      remaining--;
      $("timer").textContent = fmt(remaining);
      if (remaining <= 0) { clearInterval(ticker); grade(true); }
    }, 1000);
  }

  /* ---------- grading ---------- */
  function grade(auto) {
    if (!started) return;
    clearInterval(ticker);

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

    var idBlock = prof
      ? '<div class="mock-config"><strong>' + esc(prof.name || "आपका अकाउंट") + ' — प्रगति सेव हो गई</strong><br>' +
        'आप जिस भी फोन पर इसी Google अकाउंट से साइन इन करेंगे, यह रिकॉर्ड वहाँ दिखेगा। ' +
        '<a href="dashboard.html">मेरी प्रगति देखें →</a></div>'
      : '<div class="mock-config"><strong>आपका सिंक कोड: ' + esc(key) + '</strong><br>' +
        'इसे लिख लीजिए। किसी भी दूसरे फोन पर यही कोड डालकर आप अपनी पूरी प्रगति देख सकते हैं — न कोई अकाउंट चाहिए, न पासवर्ड। ' +
        '<a href="dashboard.html">मेरी प्रगति देखें →</a></div>';

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

    saveAttempt({
      test: TEST_ID, date: new Date().toISOString(),
      score: scored, total: maxMarks, pct: pct,
      wrong: wrongList.join(" | "),
      topics: JSON.stringify(weak.map(function (w) { return [w.t, w.right, w.total]; }))
    });
    renderKeyBox();
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

  $("startBtn").addEventListener("click", startTest);
  $("submitBtn").addEventListener("click", function () { grade(false); });
  loadQuestionsFromSheet();
  renderKeyBox();
  renderHistory();
})();

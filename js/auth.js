/* ------------------------------------------------------------------
   KosiEducationTimes - progress identity
   Shared by mock/*.html. No build step, no framework, no dependencies.

   Two ways in, both free, both leading to the same place:

     1. Sync code  - KET-7F3K-92QX, generated on the device. No account,
                     no password, no email, nothing typed by the student.
     2. Google     - one tap, and their progress follows the account to
                     any phone they ever sign in on.

   The important design decision: signing in with Google does NOT store
   an email as the record key. The server hands back the same short sync
   code every time, and that code is the only thing written next to a
   score. So the sheet holds no email addresses at all, and knowing
   somebody's Gmail tells you nothing about their marks.
------------------------------------------------------------------ */
(function () {
  "use strict";

  var ENDPOINT  = "https://script.google.com/macros/s/AKfycbwklQzs9NKA78MbW3Qv-3iamF-l8Awg5fXVxyzbo6YuuQ-oMnv47rpC2bue-Gi80O7VZw/exec";

  /* Google Sign-In turns on the moment this is filled in. Empty is a
     perfectly good state: the sync code carries the whole feature.
     A client id is public by design - it is sent to every browser that
     loads this file. The secret that goes with it is not used here and
     must never appear in this repository. */
  var CLIENT_ID = "453571342546-eg71jlhe2q8a13dmrbf2nlj9hn69jrgk.apps.googleusercontent.com";

  var LS_KEY = "ket_key", LS_PROFILE = "ket_profile";
  var CODE_RE = /^KET-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I O 0 1 - this gets written on paper

  function getKey() { try { return localStorage.getItem(LS_KEY); } catch (e) { return null; } }
  function setKey(k) { try { localStorage.setItem(LS_KEY, k); } catch (e) {} }
  function isValidCode(v) { return CODE_RE.test(String(v || "").trim().toUpperCase()); }

  function newKey() {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    var s = "";
    for (var i = 0; i < 8; i++) s += ALPHABET[a[i] % ALPHABET.length];
    return "KET-" + s.slice(0, 4) + "-" + s.slice(4);
  }
  function ensureKey() { var k = getKey(); if (!k) { k = newKey(); setKey(k); } return k; }

  function profile() {
    try { return JSON.parse(localStorage.getItem(LS_PROFILE) || "null"); } catch (e) { return null; }
  }
  function setProfile(p) {
    try {
      if (p) localStorage.setItem(LS_PROFILE, JSON.stringify(p));
      else localStorage.removeItem(LS_PROFILE);
    } catch (e) {}
  }

  /* Read the display name out of the ID token, for the greeting only.
     Never trusted for anything that matters - the server re-verifies the
     token with Google before it will hand back a code. */
  function peek(jwt) {
    try {
      var b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b.length % 4) b += "=";
      var bytes = atob(b), out = "";
      for (var i = 0; i < bytes.length; i++) out += "%" + ("00" + bytes.charCodeAt(i).toString(16)).slice(-2);
      return JSON.parse(decodeURIComponent(out));
    } catch (e) { return null; }
  }

  function signOut() {
    setProfile(null);
    if (window.google && google.accounts && google.accounts.id) {
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
    }
  }

  /* Exchange a Google ID token for this account's sync code.
     Any code already on this device is sent along, so a student who took
     tests anonymously and then signs in keeps that history instead of
     starting from zero. */
  function link(credential, done) {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "link", credential: credential, key: getKey() || "" })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.key) { setKey(j.key); done(null, j.key); }
        else done(new Error((j && j.error) || "link failed"));
      })
      .catch(done);
  }

  var gsiLoading = false, gsiReady = false, gsiQueue = [];
  function loadGsi(cb) {
    if (gsiReady) return cb();
    gsiQueue.push(cb);
    if (gsiLoading) return;
    gsiLoading = true;
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = function () { gsiReady = true; gsiQueue.splice(0).forEach(function (f) { f(); }); };
    s.onerror = function () { gsiQueue.splice(0).forEach(function (f) { f(new Error("gsi blocked")); }); };
    document.head.appendChild(s);
  }

  /**
   * Draw the Google button into `el`. Calls onChange() once the sync code
   * has come back. Returns false when sign-in is not configured, which is
   * the caller's cue to show the sync-code UI alone.
   */
  function mountSignIn(el, onChange) {
    if (!CLIENT_ID || !el) return false;
    loadGsi(function (err) {
      if (err || !window.google || !google.accounts || !google.accounts.id) return;
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: function (res) {
          var p = peek(res.credential) || {};
          el.innerHTML = '<span class="note">जोड़ा जा रहा है…</span>';
          link(res.credential, function (e2) {
            if (e2) { el.innerHTML = '<span class="note">कनेक्ट नहीं हो सका। सिंक कोड से आगे बढ़िए।</span>'; return; }
            setProfile({ name: p.name || "", picture: p.picture || "", at: Date.now() });
            if (onChange) onChange();
          });
        }
      });
      /* Locale is pinned to en on purpose. Google's Hindi string for
         signin_with renders as "जिनमें Google से साइन इन किया गया है",
         which is not a sentence a student would parse. "Continue with
         Google" is understood on every phone in Bihar. The Hindi
         explanation around the button is ours, and reads properly. */
      google.accounts.id.renderButton(el, {
        theme: "outline", size: "large", shape: "pill",
        text: "continue_with", locale: "en"
      });
    });
    return true;
  }

  window.KET = {
    ENDPOINT: ENDPOINT,
    enabled: function () { return !!CLIENT_ID; },
    getKey: getKey, setKey: setKey, ensureKey: ensureKey, newKey: newKey,
    isValidCode: isValidCode,
    profile: profile, signOut: signOut,
    mountSignIn: mountSignIn
  };
})();

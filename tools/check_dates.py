#!/usr/bin/env python3
"""Flag dates that have gone past while still being presented as live.

Written after the NSP page spent a week telling families the pre-matric
window had shut on 31 August. It had not - the deadline was extended to
30 September - and nothing on the site noticed, because a stale date
breaks no code. On a site whose whole promise is that its figures are
checked, a deadline going quietly out of date is the failure that costs
most: a wrong open date makes someone hurry, a wrong closed one makes
them give up.

Two levels:
  FAIL  - a past date sitting in deadline language ("अंतिम तिथि",
          "closes", "last date"). Someone is being told to act by a date
          that has gone.
  NOTE  - any other past 2026+ date in visible text, listed for review.

Publication stamps are ignored: an "अपडेट 6 सितंबर" line is supposed to
be in the past.
"""
import glob, re, sys, datetime

TODAY = datetime.date.today()

EN = "January February March April May June July August September October November December".split()
HI = "जनवरी फरवरी मार्च अप्रैल मई जून जुलाई अगस्त सितंबर अक्टूबर नवंबर दिसंबर".split()
MONTH = {m: i + 1 for i, m in enumerate(EN)}
MONTH.update({m: i + 1 for i, m in enumerate(HI)})

DATE_RE = re.compile(r'(\d{1,2})\s+(' + '|'.join(EN + HI) + r')\s+(20\d\d)')

DEADLINE_WORDS = [
    'अंतिम तिथि', 'आखिरी तारीख', 'अंतिम तारीख', 'तक बढ़ा', 'तक है', 'तक खुले',
    'deadline', 'last date', 'closes', 'closing', 'apply before', 'until',
]
# A publication or "as of" stamp is meant to be in the past.
STAMP_WORDS = [
    'अपडेट', 'तक की स्थिति', 'तक की है', 'compiled', 'updated', 'as of',
    'datepublished', 'datemodified', 'lastmod', 'datetime=',
]
# A date explicitly described as the old one is meant to be in the past.
# The NSP page says "बढ़ाकर 30 सितंबर ... पहले यह 31 अगस्त 2026 थी", and
# naming the superseded date is the point - it tells a student who
# remembers the old deadline what changed.
SUPERSEDED_WORDS = [
    'पहले यह', 'पहले थी', 'पहले की', 'बढ़ाकर', 'बढ़ा दी', 'बढ़ गई',
    'extended to', 'extended from', 'was earlier', 'earlier was', 'previously',
]
# A window the page says has CLOSED is supposed to carry a past date, and
# saying so is the most useful thing the page can do once the cycle ends:
# a student who missed it needs to know it is over and when the next one
# opens, not be left guessing. These are checked in a wider window than
# the stamp words because the closure is usually stated in the clause
# after the date ("30 सितंबर 2026 को बंद हो चुके हैं"), not before it.
CLOSED_WORDS = [
    'बंद हो चुक', 'बीत चुक', 'समाप्त', 'अवधि समाप्त', 'हो चुकी', 'हो चुके',
    'खत्म हो', 'निकल चुक', 'window closed', 'has closed', 'now closed',
    'closed on', 'has passed', 'is over', 'ended on',
]

fails, notes = [], []

SITE_PAGES = [p for p in sorted(glob.glob('**/*.html', recursive=True))
              if not p.startswith('tools/')]   # fixtures are not site pages

for f in SITE_PAGES:
    raw = open(f, encoding='utf-8').read()
    # strip script/style so JSON-LD stamps and question banks do not trip it
    visible = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', raw, flags=re.S)
    for m in DATE_RE.finditer(visible):
        d, mon, y = int(m.group(1)), MONTH[m.group(2)], int(m.group(3))
        try:
            when = datetime.date(y, mon, d)
        except ValueError:
            continue
        if when >= TODAY:
            continue
        if y < TODAY.year:
            continue   # 2025 cutoffs and the like are history, not staleness
        # Exemptions look only at the words immediately BEFORE the date.
        # A wide window let "The pre-matric deadline is 31 August 2026 -
        # that is today, as this page is updated on 31 August" escape,
        # because "updated" sat 60 characters away. The stamp has to be
        # attached to the date to excuse it, not merely nearby.
        before = visible[max(0, m.start() - 34): m.start()].lower()
        after = visible[m.end(): m.end() + 34].lower()
        ctx = visible[max(0, m.start() - 90): m.end() + 90].lower()
        if any(w in before for w in STAMP_WORDS):
            continue
        if any(w in before for w in SUPERSEDED_WORDS) or any(w in after for w in SUPERSEDED_WORDS):
            continue
        if any(w in ctx for w in CLOSED_WORDS):
            continue
        entry = (f, m.group(0), when.isoformat())
        if any(w in ctx for w in DEADLINE_WORDS):
            fails.append(entry)
        else:
            notes.append(entry)

# --- Second pass: dates in the metadata Google actually shows -------------
#
# The first pass missed the one that cost the most. The Post Matric page
# carried <title>...: अंतिम तिथि 15 सितंबर</title> for ten days after the
# 15th, and GSC recorded 393 impressions at position 4.94 with zero
# clicks: the title told every searcher the window had shut. The body
# text was flagged; the title was not, because "15 सितंबर" there sits in
# no deadline phrasing at all.
#
# So the rule here is stricter and needs no deadline wording. A date in a
# title, description or JSON-LD headline is a claim about how current the
# page is, made in the one place a searcher reads before deciding to
# click. Once it is past, it is costing clicks whatever words surround it.
META_RE = re.compile(
    r'<title[^>]*>(.*?)</title>'
    r'|<meta[^>]+(?:name|property)=["\'](?:description|og:title|og:description'
    r'|twitter:title|twitter:description)["\'][^>]+content=["\']([^"\']*)',
    re.S | re.I)
HEADLINE_RE = re.compile(r'"(?:headline|description)"\s*:\s*"([^"]*)"')

meta_fails = []
for f in SITE_PAGES:
    raw = open(f, encoding='utf-8').read()
    head = raw[:raw.lower().find('</head>') + 7] if '</head>' in raw.lower() else raw
    chunks = [g for m in META_RE.finditer(head) for g in m.groups() if g]
    chunks += HEADLINE_RE.findall(head)
    seen = set()
    for text in chunks:
        for m in DATE_RE.finditer(text):
            d, mon, y = int(m.group(1)), MONTH[m.group(2)], int(m.group(3))
            try:
                when = datetime.date(y, mon, d)
            except ValueError:
                continue
            if when >= TODAY or y < TODAY.year:
                continue
            before = text[max(0, m.start() - 34): m.start()].lower()
            after = text[m.end(): m.end() + 34].lower()
            if any(w in before for w in STAMP_WORDS):
                continue
            if any(w in before for w in SUPERSEDED_WORDS) or any(w in after for w in SUPERSEDED_WORDS):
                continue
            if any(w in text.lower() for w in CLOSED_WORDS):
                continue
            key = (f, m.group(0))
            if key in seen:
                continue
            seen.add(key)
            meta_fails.append((f, m.group(0), when.isoformat(), text.strip()[:70]))

if notes:
    print('past dates worth a look (%d):' % len(notes))
    for f, txt, iso in notes:
        print('  %-52s %s' % (f[:52], txt))
if meta_fails:
    print('\n%d PAST DATE(S) IN TITLE/DESCRIPTION - THIS IS WHAT SEARCHERS SEE:'
          % len(meta_fails))
    for f, txt, iso, where in meta_fails:
        print('  %-46s %s  (passed %s)' % (f[:46], txt, iso))
        print('  %-46s   in: %s' % ('', where))
if fails:
    print('\n%d PAST DATE(S) STILL PRESENTED AS A DEADLINE:' % len(fails))
    for f, txt, iso in fails:
        print('  %-52s %s  (passed %s)' % (f[:52], txt, iso))
if fails or meta_fails:
    sys.exit(1)
print('\nno past date is being presented as a live deadline')

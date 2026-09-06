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
        entry = (f, m.group(0), when.isoformat())
        if any(w in ctx for w in DEADLINE_WORDS):
            fails.append(entry)
        else:
            notes.append(entry)

if notes:
    print('past dates worth a look (%d):' % len(notes))
    for f, txt, iso in notes:
        print('  %-52s %s' % (f[:52], txt))
if fails:
    print('\n%d PAST DATE(S) STILL PRESENTED AS A DEADLINE:' % len(fails))
    for f, txt, iso in fails:
        print('  %-52s %s  (passed %s)' % (f[:52], txt, iso))
    sys.exit(1)
print('\nno past date is being presented as a live deadline')

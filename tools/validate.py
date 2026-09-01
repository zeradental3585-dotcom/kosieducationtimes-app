#!/usr/bin/env python3
"""Site checks. Run before every push.

The metadata check exists because a test page is usually made by copying
an existing one, and the copy keeps the original's question count in the
title and description. The full-length paper shipped as
"Full Test 1 (100 प्रश्न): 25 मूल प्रश्न" - the tag line contradicting
the headline, in the one place Google and WhatsApp both read.
"""
import glob, json, os, re, sys, collections
import html5lib

fails = []

def bank(path, s):
    m = re.search(r'questions: (\[[\s\S]*?\])\n\};', s)
    return json.loads(m.group(1)) if m else None

for f in sorted(glob.glob('**/*.html', recursive=True)):
    s = open(f, encoding='utf-8').read()
    try:
        html5lib.parse(s)
    except Exception as e:
        fails.append((f, 'html', str(e)[:70]))

    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            json.loads(m.group(1))
        except Exception as e:
            fails.append((f, 'json-ld', str(e)[:70]))

    for m in re.finditer(r'(?:href|src)="((?!https?:|mailto:|#|//|data:)[^"]+)"', s):
        t = m.group(1).split('#')[0].split('?')[0]
        if not t or "'" in t or '+' in t:
            continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), t))):
            fails.append((f, 'dead link', t))

    c = re.search(r'<link rel="canonical" href="([^"]+)"', s)
    o = re.search(r'<meta property="og:url" content="([^"]+)"', s)
    if c and o and c.group(1) != o.group(1):
        fails.append((f, 'canonical != og:url', c.group(1)))

    fq = len(re.findall(r'"@type"\s*:\s*"Question"', s))
    h3 = len(re.findall(r'<h3[ >]', s))
    if fq and fq != h3:
        fails.append((f, 'FAQ schema vs visible h3', '%d vs %d' % (fq, h3)))

    qs = bank(f, s)
    if qs is not None:
        n = len(qs)
        head = s[:s.find('</head>')]
        for label, pat in [('title', r'<title>(.*?)</title>'),
                           ('description', r'<meta name="description" content="([^"]*)"'),
                           ('og:title', r'<meta property="og:title" content="([^"]*)"'),
                           ('og:description', r'<meta property="og:description" content="([^"]*)"')]:
            m = re.search(pat, head, re.S)
            if not m:
                continue
            for found in re.findall(r'(\d+)\s*(?:मूल\s*)?प्रश्न', m.group(1)):
                if int(found) != n:
                    fails.append((f, 'metadata says %s questions, bank has %d' % (found, n), label))

        c = collections.Counter(q['answer'] for q in qs)
        worst = max(c.values()) / n
        if worst > 0.35:
            fails.append((f, 'answer spread guessable', '%d%% on one option' % round(worst * 100)))
        if not all(len(set(q['options'])) == 4 for q in qs):
            fails.append((f, 'duplicate options', ''))
        if not all(q.get('explain') for q in qs):
            fails.append((f, 'missing explanation', ''))

sm = open('sitemap.xml', encoding='utf-8').read()
urls = {u.split('kosieducationtimes.com/')[-1] for u in re.findall(r'<loc>(.*?)</loc>', sm)}
pages = set(glob.glob('**/*.html', recursive=True))
noindex = {p for p in pages if 'noindex' in open(p, encoding='utf-8').read()}
for p in noindex & urls:
    fails.append((p, 'noindex page in sitemap', ''))

total = sum(len(bank(f, open(f, encoding='utf-8').read()) or []) for f in glob.glob('mock/*.html'))
print('pages: %d | sitemap: %d | questions: %d' % (len(pages), len(urls), total))
if fails:
    print('\n%d PROBLEM(S):' % len(fails))
    for f in fails:
        print('  %-46s %s %s' % f)
    sys.exit(1)
print('all checks passed')

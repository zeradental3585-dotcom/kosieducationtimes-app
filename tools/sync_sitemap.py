#!/usr/bin/env python3
"""Set each sitemap <lastmod> from the page's real last edit in git.

Written after Search Console showed 27 of 41 pages carrying a lastmod
older than their actual last commit. index.html claimed 31 August while
git had it edited on 10 October; the Post Matric, NSP, RTPS and 12th
result pages all claimed early September after being rewritten in
October. lastmod is one of the few direct signals a site gets to say
"this is worth fetching again", and for two months this one was saying
the opposite about exactly the pages that had changed.

That matters more than usual here. The site has five external links,
all from sites the owner runs, and Search Console reports thirteen URLs
as "Discovered - currently not indexed", which is Google declining to
spend crawl budget. Telling it, wrongly, that nothing has changed is the
last thing a site in that position can afford.

Run with --check to fail instead of writing, so validate.py can hold the
line once it is correct.

Usage:
  python3 tools/sync_sitemap.py          # rewrite lastmod values
  python3 tools/sync_sitemap.py --check  # exit 1 if any are wrong
"""
import re
import subprocess
import sys
import datetime

SITEMAP = 'sitemap.xml'
BASE = 'https://www.kosieducationtimes.com/'


def path_for(loc):
    """Map a sitemap URL back to the file that serves it."""
    p = loc.replace(BASE, '')
    if p == '' or p.endswith('/'):
        p += 'index.html'
    return p


def last_commit_date(path):
    """Date of the last commit touching path, or None if git doesn't know."""
    r = subprocess.run(
        ['git', 'log', '-1', '--format=%ad', '--date=short', '--', path],
        capture_output=True, text=True)
    return r.stdout.strip() or None


def main():
    check = '--check' in sys.argv
    raw = open(SITEMAP, encoding='utf-8').read()
    today = datetime.date.today().isoformat()

    wrong, missing, changed = [], [], 0

    def fix(m):
        nonlocal changed
        loc, lastmod = m.group(1), m.group(2)
        path = path_for(loc)
        real = last_commit_date(path)
        if real is None:
            missing.append((path, loc))
            return m.group(0)
        # A file edited but not yet committed should not claim the commit
        # date, so uncommitted changes count as today.
        dirty = subprocess.run(['git', 'status', '--porcelain', '--', path],
                               capture_output=True, text=True).stdout.strip()
        real = today if dirty else real
        if real != lastmod:
            wrong.append((path, lastmod, real))
            changed += 1
            return m.group(0).replace('<lastmod>%s</lastmod>' % lastmod,
                                      '<lastmod>%s</lastmod>' % real)
        return m.group(0)

    out = re.sub(r'<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>',
                 fix, raw)

    if missing:
        print('%d sitemap URL(s) have no matching file:' % len(missing))
        for path, loc in missing:
            print('  %-58s <- %s' % (path[:58], loc))

    if check:
        if wrong or missing:
            print('\n%d sitemap lastmod value(s) out of date:' % len(wrong))
            for path, had, real in wrong[:20]:
                print('  %-50s says %s, edited %s' % (path[:50], had, real))
            print('\nrun: python3 tools/sync_sitemap.py')
            return 1
        print('sitemap lastmod matches git for every page')
        return 0

    if changed:
        open(SITEMAP, 'w', encoding='utf-8').write(out)
        print('updated %d lastmod value(s)' % changed)
        for path, had, real in wrong[:20]:
            print('  %-50s %s -> %s' % (path[:50], had, real))
    else:
        print('nothing to change')
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())

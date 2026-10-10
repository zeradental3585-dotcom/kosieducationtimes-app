#!/bin/bash
# The metadata pass exists because the first version of this checker read
# only visible body text, and the Post Matric page carried a dead date in
# its <title> for ten days: 393 impressions, position 4.94, zero clicks.
# CLOSED_WORDS was added afterwards to stop flagging correctly-worded
# past-tense copy -- and a sloppy exemption would re-open the exact hole
# the pass was built to close. So this asserts both directions.
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/articles" && cp tools/fixtures/stale-title.html "$tmp/articles/"
cp tools/check_dates.py "$tmp/" && mkdir -p "$tmp/tools"
( cd "$tmp" && python3 check_dates.py > out.txt 2>&1; echo $? > rc )
if [ "$(cat "$tmp/rc")" = "1" ] && grep -q "TITLE/DESCRIPTION" "$tmp/out.txt"; then
  echo "PASS - a dead date in the title is caught"
else
  echo "FAIL - stale title slipped through"; cat "$tmp/out.txt"; exit 1
fi
# and the closed-window wording must NOT be flagged
sed 's/अंतिम तिथि 15 सितंबर 2026। पूरी गाइड।/आवेदन 15 सितंबर 2026 को बंद हो चुके हैं।/; s|<title>.*</title>|<title>Bihar Post Matric Scholarship: स्थिति और भुगतान</title>|' \
  tools/fixtures/stale-title.html > "$tmp/articles/stale-title.html"
( cd "$tmp" && python3 check_dates.py > out2.txt 2>&1; echo $? > rc2 )
if [ "$(cat "$tmp/rc2")" = "0" ]; then
  echo "PASS - correctly-worded closed window is not flagged"
else
  echo "FAIL - closed-window wording wrongly flagged"; cat "$tmp/out2.txt"; exit 1
fi

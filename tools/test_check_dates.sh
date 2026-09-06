#!/bin/sh
# Regression test for tools/check_dates.py
#
# The fixture is the NSP page's actual wording from the week it was wrong.
# The first version of the checker passed it, because "updated" appeared
# near the date and triggered the publication-stamp exemption. If this
# test ever passes silently again, the exemption has gone wide again.
set -e
cd "$(dirname "$0")/fixtures"
cp ../check_dates.py .
if python3 check_dates.py > /dev/null 2>&1; then
  echo "FAIL - the checker did not flag a past date presented as a live deadline"
  rm -f check_dates.py
  exit 1
fi
echo "PASS - stale deadline is caught"
rm -f check_dates.py

#!/usr/bin/env bash
# Guard against writing state to .data/ — Render's disk is ephemeral (#92 invariant 2).
# Run in CI or pre-commit. Exits non-zero if any code under server/ writes to .data/.
set -euo pipefail

MATCHES=$(grep -rn --include='*.ts' --include='*.mjs' --include='*.js' \
  -E "(writeFile|writeFileSync|createWriteStream|appendFile|appendFileSync).*\\.data/" \
  /Users/peterfusek1980gmail.com/Projects/infacostoptimizer/server 2>/dev/null || true)

if [[ -n "$MATCHES" ]]; then
  echo "✗ Ephemeral-write violation — these files write state to .data/ which Render wipes on deploy:"
  echo
  echo "$MATCHES"
  echo
  echo "  Use a Postgres table instead. See CLAUDE.md 'Storage rules' and issue #92."
  exit 1
fi

echo "✓ No .data/ writes found in server/."

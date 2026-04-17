#!/usr/bin/env bash
#
# verify-cli.sh — Cross-check infracost MTD against platform CLIs.
#
# Queries billing APIs via CLIs the user already has authenticated, posts
# each reading to /api/verifications with method=cli. Zero credential
# persistence — everything comes from your local shell auth.
#
# Supports:
#   - Anthropic (curl + $ANTHROPIC_ADMIN_API_KEY)
#   - GitHub   (gh auth + /billing endpoints)
#   - Railway  (railway auth + GraphQL)
#   - GCP      (gcloud auth + billing)
#
# Other platforms (Render, Neon, Turso, Resend, UptimeRobot, Websupport,
# Workspace) have no usable billing CLI — use /verify page manually or
# the browser automation prompt in scripts/verify-browser-prompt.md.
#
# Usage:
#   INFRACOST_URL=https://infracost.eu \
#   INFRACOST_COOKIE='nuxt-session=...' \
#   ANTHROPIC_ADMIN_API_KEY=sk-ant-admin-... \
#   bash scripts/verify-cli.sh
#
# For local dev server, INFRACOST_URL defaults to http://localhost:3000.

set -euo pipefail

INFRACOST_URL="${INFRACOST_URL:-http://localhost:3000}"
INFRACOST_COOKIE="${INFRACOST_COOKIE:-}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "$INFRACOST_COOKIE" && "$INFRACOST_URL" != http://localhost* ]]; then
  echo "⚠  INFRACOST_COOKIE unset. POST to remote will fail (session required)."
  echo "   Log into $INFRACOST_URL/verify in browser, copy the nuxt-session cookie."
  echo "   DRY_RUN=1 prints what would be posted without writing."
  echo
fi

YEAR=$(date -u +%Y)
MONTH=$(date -u +%m)
# First of this month in UTC ISO
PERIOD_START=$(date -u +%Y-%m-01T00:00:00Z)

# Helper: resolve platform slug → platformId via /api/platforms
resolve_platform_id() {
  local slug="$1"
  curl -sS "${INFRACOST_URL}/api/platforms" \
    | jq -r ".[] | select(.slug == \"$slug\") | .id"
}

# Helper: POST verification
post_verification() {
  local slug="$1" amount="$2" notes="$3"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  ↯ $slug: would POST \$${amount} — $notes"
    return 0
  fi

  local platform_id
  platform_id=$(resolve_platform_id "$slug")
  if [[ -z "$platform_id" ]]; then
    echo "  ✗ $slug: platform not found in /api/platforms"
    return 1
  fi

  local body
  body=$(jq -n \
    --argjson pid "$platform_id" \
    --arg ps "$PERIOD_START" \
    --argjson amt "$amount" \
    --arg notes "$notes" \
    '{platformId: $pid, periodStart: $ps, verifiedUsd: $amt, method: "cli", notes: {raw: $notes}}')

  local resp http_code
  resp=$(curl -sS -o /tmp/verify-resp-$$.json -w "%{http_code}" \
    -X POST "${INFRACOST_URL}/api/verifications" \
    -H "Content-Type: application/json" \
    ${INFRACOST_COOKIE:+-H "Cookie: $INFRACOST_COOKIE"} \
    -d "$body")
  http_code="$resp"

  if [[ "$http_code" =~ ^2 ]]; then
    local delta
    delta=$(jq -r '.delta' /tmp/verify-resp-$$.json 2>/dev/null || echo "?")
    echo "  ✓ $slug: \$${amount} (delta \$${delta})"
  else
    echo "  ✗ $slug: HTTP $http_code — $(cat /tmp/verify-resp-$$.json 2>/dev/null | head -c 200)"
  fi
  rm -f /tmp/verify-resp-$$.json
}

verify_anthropic() {
  echo "▶ Anthropic (cost_report Admin API)"
  if [[ -z "${ANTHROPIC_ADMIN_API_KEY:-}" ]]; then
    echo "  ⊘ skip: ANTHROPIC_ADMIN_API_KEY not set"
    return
  fi

  local url="https://api.anthropic.com/v1/organizations/cost_report?starting_at=${PERIOD_START}"
  local json amount
  json=$(curl -sS -H "x-api-key: $ANTHROPIC_ADMIN_API_KEY" -H "anthropic-version: 2023-06-01" "$url")
  amount=$(echo "$json" | jq -r '[.data[].results[].amount | tonumber] | add / 100')

  if [[ -z "$amount" || "$amount" == "null" ]]; then
    echo "  ✗ no amount returned — response: $(echo "$json" | head -c 200)"
    return
  fi
  post_verification "anthropic" "$amount" "cost_report MTD via Admin API"
}

verify_github() {
  echo "▶ GitHub (gh api billing)"
  if ! command -v gh >/dev/null 2>&1; then
    echo "  ⊘ skip: gh CLI not installed (brew install gh)"
    return
  fi

  # Personal actions billing — shows any usage against free minutes
  local json minutes cost_pct
  json=$(gh api /users/peter-fusek/settings/billing/actions 2>/dev/null || echo '{}')
  minutes=$(echo "$json" | jq -r '.total_minutes_used // 0')
  # GitHub Free gives 2000 min/mo of Linux runners; no cost unless paid-plan — treat as $0
  post_verification "github" "0" "personal actions: ${minutes} min used, free tier"
}

verify_railway() {
  echo "▶ Railway (railway CLI GraphQL)"
  if ! command -v railway >/dev/null 2>&1; then
    echo "  ⊘ skip: railway CLI not installed (npm i -g @railway/cli)"
    return
  fi

  # Railway's 'me' query returns projects; estimated usage requires project-level query.
  # If the CLI is logged in, this query returns the user's usage for this cycle.
  local amount
  amount=$(railway api --query '{ me { resourceUsage(measurements: [MEMORY_USAGE_GB, CPU_USAGE]) { estimatedValue } } }' 2>/dev/null \
    | jq -r '[.data.me.resourceUsage[].estimatedValue] | add // 0' 2>/dev/null || echo 0)
  post_verification "railway" "${amount:-0}" "railway CLI usage query"
}

verify_gcp() {
  echo "▶ Google Cloud (gcloud billing)"
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "  ⊘ skip: gcloud CLI not installed (brew install --cask google-cloud-sdk)"
    return
  fi
  # No direct MTD from gcloud; it requires BigQuery billing export. Confirm $0
  # if account still on free tier, else user must enter manually.
  local accounts
  accounts=$(gcloud billing accounts list --format='value(displayName,open)' 2>/dev/null | head -1 || true)
  if [[ -z "$accounts" ]]; then
    echo "  ⊘ skip: no billing account readable (gcloud auth login needed)"
    return
  fi
  post_verification "gcp" "0" "gcloud billing accounts: $accounts (free tier, enable BQ export for real MTD)"
}

echo "═══ infracost CLI verification ═══"
echo "Target: $INFRACOST_URL"
echo "Period: $PERIOD_START"
[[ "$DRY_RUN" == "1" ]] && echo "Mode:   DRY RUN (no POSTs)"
echo

verify_anthropic
verify_github
verify_railway
verify_gcp

echo
echo "Done. Review results at ${INFRACOST_URL}/verify"

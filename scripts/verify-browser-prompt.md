# Verify browser — Claude Code prompt

Paste this into a Claude Code session (or save as a slash command at
`~/.claude/commands/verify-browser.md`). It walks the model through a
visual-verification pass using the Claude-in-Chrome MCP, reading each
platform's billing page and POSTing readings to `/api/verifications`.

---

You are performing a visual cost verification for infracost. Follow these steps
exactly. Do NOT skip platforms or shortcut the extraction.

## Setup

1. Read `server/utils/verification-config.ts` to get the list of platforms with
   `billingUrl` and `extractPattern`.
2. Confirm you have the Claude-in-Chrome MCP tools available: `navigate`,
   `get_page_text`, `find`, `read_page`, `gif_creator`.
3. Ask the user for:
   - `INFRACOST_URL` (default `http://localhost:3000`)
   - Session cookie (only needed for remote — paste from logged-in browser)
4. Ask the user to confirm they're logged into every platform in their default
   Chrome profile. If not, stop and list the missing logins.

## Per-platform workflow

For each platform in `VERIFICATION_CONFIGS`:

1. **Announce**: "Verifying <platformName>…"
2. **Open tab**: `mcp__claude-in-chrome__tabs_create_mcp` with the platform's `billingUrl`.
   NEVER reuse an existing tab the user has open — only tabs YOU created.
3. **Wait 3 seconds** for JS render.
4. **Extract text**: call `mcp__claude-in-chrome__get_page_text`.
5. **Parse amount**:
   - Apply `extractPattern` regex to the page text.
   - If the regex matches multiple currency values, PICK THE ONE nearest to the
     text "Current Bill", "This Month", "Current Usage", "MTD", or "Month to
     date". DO NOT pick "Next Invoice", "Projected", or historical invoices.
   - If you cannot reliably identify the MTD amount, ask the user to confirm
     before posting.
6. **Screenshot** (optional): `mcp__claude-in-chrome__gif_creator` with a ~3s
   clip of the billing page. Base64-encode the result. CAP at 200 KB — if
   larger, skip the screenshot and store `extractedText` only.
7. **POST to /api/verifications**:
   ```json
   {
     "platformId": <id from /api/platforms>,
     "periodStart": "<first of this month>T00:00:00Z",
     "verifiedUsd": <parsed number>,
     "method": "browser",
     "notes": {
       "url": "<billingUrl>",
       "extractedText": "<context snippet around the matched amount>",
       "screenshotBase64": "<optional>"
     }
   }
   ```
   Include the `Cookie` header if the user provided a session. Use fetch or the
   Bash tool with `curl`.

8. **Report delta**: print `<platform>: shown=$X, reported=$Y, delta=$Z`.
   If |delta| > $1 AND |delta%| > 2%, flag with ⚠.
9. **Close the tab** you opened. Move to next platform.

## Safety rules

- NEVER dismiss dialogs or accept prompts on platform pages.
- NEVER click logout, delete, or any destructive button.
- NEVER submit any form on a platform page.
- If a page shows a dialog or the page is unreachable, skip it and log "skipped".
- If auth is stale (redirected to login), stop and tell the user which platforms
  need re-authentication.
- Respect any per-platform `notes` in the config (e.g. "API usage only, not subscriptions").

## Final step

After all platforms are processed:

1. Fetch `GET /api/verify/summary` from the user's infracost URL.
2. Print a compact table: platform | reported | verified | delta | status.
3. Highlight any `mismatch` statuses.
4. Suggest next action (fix a specific platform, re-run with `--platform=<slug>`,
   or trust the numbers).

## Platform priority order

Run in this sequence to front-load the platforms where mismatches are most
likely given recent incidents:

1. claude-max (incident source — manual + attribution sensitive)
2. anthropic (recently-broken collector)
3. railway (prepaid credits, depletion-prone)
4. render (largest fixed spend)
5. google-services, websupport (manual entries — easy to forget)
6. resend, turso, neon, uptimerobot, gcp, github (lower spend / free tier)

## Output expected

A final summary block:

```
═══ Verification complete ═══
Reported total: $XXX.XX
Verified total: $XXX.XX
Delta:          $X.XX (X% – WITHIN / OVER / UNDER tolerance)

Platforms checked: N
Mismatches:        M (list slugs)
Skipped:           K (list slugs and reasons)

Saved N records to /api/verifications method=browser.
```

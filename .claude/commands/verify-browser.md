---
description: Run visual cost verification across all platforms via Claude-in-Chrome
---

Run the infracost browser-based visual verification flow.

Read `scripts/verify-browser-prompt.md` for the full workflow. Key points:

- Use Claude-in-Chrome MCP tools only — never run Playwright or system
  automation without asking
- Ask user for `INFRACOST_URL` (default localhost) and session cookie
- Process platforms in priority order: claude-max, anthropic, railway, render,
  google-services, websupport, resend, turso, neon, uptimerobot, gcp, github
- Use `scripts/verify-cli.sh` instead if the user prefers CLI-based verification
  for platforms that support it (github, gcp, anthropic, railway)
- NEVER click destructive buttons, dismiss dialogs, or submit forms on platform
  pages
- POST each reading to `/api/verifications` with `method=browser`
- End with a summary from `/api/verify/summary`

If the user just says "verify" or "/verify-browser", ask which mode:
(a) full browser pass, (b) specific platform, (c) CLI-only
(fastest for auth/anthropic/railway/gcp/github).

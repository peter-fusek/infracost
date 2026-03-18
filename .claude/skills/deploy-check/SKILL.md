---
name: deploy-check
description: Verify that infracost.eu is live, responding correctly, and serving the latest commit
disable-model-invocation: true
---

# Deploy Check

Verify the production deployment is healthy after a push.

## Steps

1. **Check HTTP response**: `curl -sI https://infracost.eu/ | head -5` — expect HTTP 200
2. **Check robots.txt**: `curl -s https://infracost.eu/robots.txt | head -5` — expect Sitemap line
3. **Check llms.txt**: `curl -s https://infracost.eu/llms.txt | head -3` — expect "# InfraCost"
4. **Check API**: `curl -s https://infracost.eu/api/platforms | head -1` — expect JSON array
5. **Check latest commit**: Compare `git log --oneline -1` with what's deployed (check Render dashboard if needed)
6. **Check GA4**: Verify gtag.js is in the HTML source: `curl -s https://infracost.eu/ | grep -o 'G-[A-Z0-9]*'`
7. **Report status**: Output a table with pass/fail for each check

If any check fails, suggest the likely cause and fix.

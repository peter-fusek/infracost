import { buildBugIssueBody, type BugContext } from '../utils/bug-report-markdown'

const REPO = 'peter-fusek/infracost'

interface BugReportBody {
  description: string
  context: BugContext | null
  screenshotDataUrl?: string | null
}

async function uploadScreenshot(base64Data: string, token: string): Promise<string | null> {
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const path = `bug-screenshots/${filename}`

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `chore: bug screenshot ${filename}`,
        content: base64Data,
        branch: 'main',
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.error('Screenshot upload failed:', res.status, await res.text())
      return null
    }

    const data = await res.json() as { content: { download_url: string } }
    return data.content.download_url
  }
  catch (err) {
    console.error('Screenshot upload error:', err)
    return null
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const token = config.githubToken as string

  if (!token) {
    throw createError({ statusCode: 500, message: 'Bug reporting not configured (missing GITHUB_TOKEN)' })
  }

  const body = await readBody(event) as BugReportBody

  if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
    throw createError({ statusCode: 400, message: 'description is required' })
  }
  if (body.description.length > 500) {
    throw createError({ statusCode: 400, message: 'description must be 500 characters or less' })
  }

  const description = body.description.trim()
  const ctx = body.context

  let screenshotUrl: string | null = null
  if (body.screenshotDataUrl) {
    // Server-side size limit: ~5MB base64 ≈ 7MB string (prevents memory/API abuse)
    if (body.screenshotDataUrl.length > 7_000_000) {
      throw createError({ statusCode: 413, message: 'Screenshot too large (max ~5 MB)' })
    }
    const match = body.screenshotDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
    if (match) {
      screenshotUrl = await uploadScreenshot(match[1]!, token)
    }
    else {
      console.error('Unexpected screenshotDataUrl format — skipping upload')
    }
  }

  const issueBody = ctx
    ? buildBugIssueBody(description, ctx, screenshotUrl)
    : `## Bug Report\n\n**Description:** ${description}\n\n_No page context captured._`

  let pageName = ''
  if (ctx?.url) {
    try {
      const pathname = new URL(ctx.url).pathname
      pageName = pathname === '/' ? 'Dashboard' : pathname.slice(1).charAt(0).toUpperCase() + pathname.slice(2)
    }
    catch (_e) { /* non-fatal: pageName defaults to empty */ }
  }

  const title = `[Bug] ${pageName ? `${pageName}: ` : ''}${description.slice(0, 80)}`

  const issueRes = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body: issueBody,
      labels: ['bug', 'user-reported'],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!issueRes.ok) {
    const errText = await issueRes.text()
    console.error('GitHub issue creation failed:', issueRes.status, errText)
    throw createError({ statusCode: 502, message: 'Failed to create GitHub issue' })
  }

  const issue = await issueRes.json() as { number: number; html_url: string }

  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
  }
})

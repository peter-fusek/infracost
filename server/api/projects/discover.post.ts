import { and, eq, isNull } from 'drizzle-orm'
import { projects } from '../../db/schema'
import { discoverGitHubRepos } from '../../services/github-discovery'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()

  if (!config.githubToken) {
    throw createError({ statusCode: 500, message: 'GITHUB_TOKEN not configured' })
  }

  const db = useDB()

  // Get all registered project repo URLs
  const allProjects = await db
    .select({ repoUrl: projects.repoUrl })
    .from(projects)
    .where(and(eq(projects.isActive, true), isNull(projects.deletedAt)))

  const repoUrls = allProjects
    .map(p => p.repoUrl)
    .filter((url): url is string => url !== null && url !== '')

  const result = await discoverGitHubRepos(config.githubToken, repoUrls)

  return result
})

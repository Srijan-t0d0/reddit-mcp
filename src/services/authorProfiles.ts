import type { RuntimeBindings } from '../env'
import type { UserSummary } from '../domain'
import { fetchUser } from './redditUsers'

const disallowedAuthors = new Set(['[deleted]', 'automoderator'])

export const isFetchableAuthor = (author?: string | null): author is string => {
  if (!author) return false
  const trimmed = author.trim()
  if (!trimmed) return false
  return !disallowedAuthors.has(trimmed.toLowerCase())
}

export const fetchAuthorProfile = async (
  env: RuntimeBindings,
  author?: string | null,
): Promise<UserSummary | null> => {
  if (!isFetchableAuthor(author)) {
    return null
  }

  try {
    const result = await fetchUser(env, author.trim())
    return result.value ?? null
  } catch (error) {
    console.warn(`Failed to fetch profile for author ${author}`, error)
    return null
  }
}

export const fetchAuthorProfiles = async (
  env: RuntimeBindings,
  authors: Iterable<string>,
): Promise<Map<string, UserSummary>> => {
  const unique = new Set<string>()
  for (const author of authors) {
    if (isFetchableAuthor(author)) {
      unique.add(author.trim())
    }
  }

  const profiles = new Map<string, UserSummary>()
  if (!unique.size) {
    return profiles
  }

  await Promise.all(
    Array.from(unique).map(async (author) => {
      const profile = await fetchAuthorProfile(env, author)
      if (profile) {
        profiles.set(author, profile)
      }
    }),
  )

  return profiles
}

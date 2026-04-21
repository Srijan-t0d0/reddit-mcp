import type {
  Author,
  Comment,
  Listing,
  ListingSummary,
  MediaAttachment,
  OverviewEntry,
  Post,
  PostPoll,
  SearchResult,
  Subreddit,
  UserSummary,
} from './types'
import type {
  RawMoreChildren,
  RawRedditComment,
  RawRedditPost,
  RawSubredditAbout,
  RawUserAbout,
  RedditListing,
  RedditThing,
} from './raw'

const toIsoString = (epochSeconds: number): string =>
  new Date(epochSeconds * 1000).toISOString()

const toIsoFromEpoch = (epoch: number): string =>
  epoch > 10_000_000_000 ? new Date(epoch).toISOString() : toIsoString(epoch)

const normalizeEdited = (edited: RawRedditPost['edited'] | RawRedditComment['edited']) => {
  if (!edited) return undefined
  return typeof edited === 'number' ? toIsoString(edited) : undefined
}

const normalizePreviewImages = (raw: RawRedditPost): Post['previewImages'] | undefined => {
  const images = raw.preview?.images ?? []
  if (!images.length) return undefined
  return images.flatMap((img) => {
    const variants = [img.source, ...(img.resolutions ?? [])]
    return variants
      .filter((variant) => !!variant?.url)
      .map((variant) => ({
        url: decodeHtmlEntities(variant.url),
        width: variant.width,
        height: variant.height,
      }))
  })
}

const normalizeGallery = (raw: RawRedditPost): MediaAttachment | undefined => {
  if (!raw.is_gallery || !raw.gallery_data || !raw.media_metadata) return undefined

  const items = raw.gallery_data.items
    .map((item) => {
      const media = raw.media_metadata?.[item.media_id]
      if (!media || media.status !== 'valid' || !media.s) return null
      const sources = [
        ...(media.p?.map((variant) => ({
          url: decodeHtmlEntities(variant.u),
          width: variant.x,
          height: variant.y,
        })) ?? []),
        {
          url: decodeHtmlEntities(media.s.u),
          width: media.s.x,
          height: media.s.y,
        },
      ]
      return {
        kind: 'image' as const,
        url: sources[sources.length - 1]?.url ?? '',
        sources,
        alt: item.caption,
        id: item.id?.toString(),
        caption: item.caption,
      }
    })
    .filter((item): item is NonNullable<typeof item> => !!item)

  if (!items.length) return undefined

  return {
    kind: 'gallery',
    url: items[0]?.url ?? '',
    items,
  }
}

const normalizeMedia = (raw: RawRedditPost): MediaAttachment | undefined => {
  if (raw.is_gallery) {
    return normalizeGallery(raw)
  }

  if (raw.is_video && raw.media && typeof raw.media === 'object') {
    const media = raw.media as Record<string, unknown>
    const redditVideo = media.reddit_video as
      | {
          fallback_url?: string
          width?: number
          height?: number
          duration?: number
          is_gif?: boolean
          hls_url?: string
        }
      | undefined

    if (redditVideo?.fallback_url) {
      return {
        kind: 'video',
        url: redditVideo.fallback_url,
        width: redditVideo.width,
        height: redditVideo.height,
        durationSeconds: redditVideo.duration,
        isGif: redditVideo.is_gif,
        posterImage: raw.thumbnail && !isPlaceholderThumbnail(raw.thumbnail) ? raw.thumbnail : undefined,
      }
    }
  }

  if (raw.url && !raw.is_self) {
    return {
      kind: 'external',
      url: raw.url,
      title: raw.title,
    }
  }

  if (raw.preview?.images?.length) {
    const image = raw.preview.images[0]?.source
    if (image) {
      return {
        kind: 'image',
        url: decodeHtmlEntities(image.url),
        sources: [
          {
            url: decodeHtmlEntities(image.url),
            width: image.width,
            height: image.height,
          },
        ],
      }
    }
  }

  return undefined
}

const normalizeAwards = (rawAwards: RawRedditPost['all_awardings']): Post['awards'] | undefined => {
  if (!rawAwards?.length) return undefined

  return rawAwards.map((award) => ({
    id: award.id,
    name: award.name,
    description: award.description,
    coinPrice: award.coin_price,
    coinReward: award.coin_reward,
    count: award.count,
    iconUrl: award.icon_url,
    iconWidth: award.icon_width,
    iconHeight: award.icon_height,
    tiers: award.tiers_by_required_awardings
      ? Object.values(award.tiers_by_required_awardings).map((tier) => ({
          id: tier.award_id,
          coinPrice: tier.coin_price,
          coinReward: tier.coin_reward,
          iconUrl: tier.icon_url,
        }))
      : undefined,
  }))
}

const normalizePoll = (poll: RawRedditPost['poll_data']): PostPoll | undefined => {
  if (!poll) return undefined

  return {
    totalVoteCount: poll.total_vote_count,
    options: poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      voteCount: option.vote_count,
    })),
    votingClosedAt: poll.voting_end_timestamp ? toIsoFromEpoch(poll.voting_end_timestamp) : undefined,
  }
}

const isPlaceholderThumbnail = (thumbnail: string) =>
  ['self', 'default', 'nsfw', 'image', '', 'spoiler'].includes(thumbnail)

const decodeHtmlEntities = (value: string): string => value.replace(/&amp;/g, '&')

const sanitizeUrl = (value?: string | null): string => {
  if (!value) return ''
  const decoded = decodeHtmlEntities(value)
  const trimmed = decoded.trim()
  if (!trimmed) return ''
  const [withoutQuery] = trimmed.split('?')
  return withoutQuery
}

const redditBaseUrl = 'https://www.reddit.com'

const shouldLinkAuthorProfile = (username: string): boolean => {
  if (!username) return false
  const normalized = username.trim()
  if (!normalized) return false
  const normalizedLower = normalized.toLowerCase()
  return normalizedLower !== '[deleted]' && normalizedLower !== 'automoderator'
}

const toProfileIcon = (profile?: RawUserAbout | UserSummary | null): string => {
  if (!profile) return ''
  if ('iconImg' in profile) {
    return sanitizeUrl(profile.iconImg)
  }
  return sanitizeUrl((profile as RawUserAbout).icon_img)
}

const extractProfileUrl = (username: string, profile?: RawUserAbout | UserSummary | null): string => {
  const usernameSegment = username.replace(/^u\//i, '').trim()
  const subreddit = profile?.subreddit
  if (subreddit && typeof subreddit.url === 'string' && subreddit.url) {
    return `${redditBaseUrl}${subreddit.url}`.replace(/\/+$/, '/')
  }
  if (shouldLinkAuthorProfile(usernameSegment)) {
    return `${redditBaseUrl}/user/${usernameSegment}/`
  }
  return ''
}

const extractProfileNsfw = (profile?: RawUserAbout | UserSummary | null): boolean | undefined => {
  const subreddit = profile?.subreddit
  if (!subreddit) return undefined
  if ('over18' in subreddit && typeof subreddit.over18 === 'boolean') {
    return subreddit.over18
  }
  if ('over_18' in subreddit && typeof subreddit.over_18 === 'boolean') {
    return subreddit.over_18
  }
  return undefined
}

const derivePostAuthor = (
  raw: RawRedditPost,
  profile?: RawUserAbout | UserSummary | null,
): Author => {
  const username = raw.author ?? ''
  const fullname = raw.author_fullname ?? ''
  const normalizedName = username?.trim() || fullname || ''
  const authorId = (profile && profile.id) || fullname || normalizedName || raw.name
  const nsfw = extractProfileNsfw(profile) ?? false

  return {
    icon: toProfileIcon(profile),
    id: authorId,
    name: normalizedName,
    nsfw,
    url: extractProfileUrl(username, profile ?? undefined),
  }
}

const isRawSubredditAbout = (value: RawSubredditAbout | Subreddit | undefined): value is RawSubredditAbout =>
  !!value && typeof (value as RawSubredditAbout).display_name === 'string'

const derivePostSubreddit = (
  raw: RawRedditPost,
  about?: RawSubredditAbout | Subreddit,
): Subreddit => {
  const normalized = about && isRawSubredditAbout(about) ? normalizeSubreddit(about) : about
  const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined

  const banner =
    normalized?.banner ??
    sanitizeUrl(raw.banner_img ?? raw.community_icon ?? raw.icon_img ?? '')
  const icon = normalized?.icon ?? sanitizeUrl(raw.community_icon ?? raw.icon_img ?? '')
  const communityIcon = normalized?.communityIcon ?? sanitizeUrl(raw.community_icon ?? '')

  return {
    banner,
    icon,
    id: normalized?.id ?? raw.subreddit_id ?? '',
    name: normalized?.name ?? raw.subreddit,
    displayNamePrefixed: optionalString(normalized?.displayNamePrefixed),
    nsfw: normalized?.nsfw ?? raw.over_18,
    subscribers: normalized?.subscribers ?? raw.subreddit_subscribers ?? 0,
    title: normalized?.title ?? raw.subreddit,
    description: optionalString(normalized?.description),
    publicDescription: optionalString(normalized?.publicDescription),
    publicDescriptionHtml: optionalString(normalized?.publicDescriptionHtml),
    descriptionHtml: optionalString(normalized?.descriptionHtml),
    createdUtc: optionalString(normalized?.createdUtc),
    activeUserCount: normalized?.activeUserCount,
    accountsActive: normalized?.accountsActive,
    lang: optionalString(normalized?.lang),
    url: optionalString(normalized?.url),
    submissionType: normalized?.submissionType,
    wikiEnabled: normalized?.wikiEnabled,
    spoilersEnabled: normalized?.spoilersEnabled,
    allowImages: normalized?.allowImages,
    allowVideos: normalized?.allowVideos,
    allowGalleries: normalized?.allowGalleries,
    allowPolls: normalized?.allowPolls,
    commentContributionSettings: normalized?.commentContributionSettings,
    primaryColor: optionalString(normalized?.primaryColor),
    bannerImage: optionalString(normalized?.bannerImage),
    bannerBackgroundImage: optionalString(normalized?.bannerBackgroundImage),
    mobileBannerImage: optionalString(normalized?.mobileBannerImage),
    bannerBackgroundColor: optionalString(normalized?.bannerBackgroundColor),
    keyColor: optionalString(normalized?.keyColor),
    iconColor: optionalString(normalized?.iconColor),
    communityIcon,
    subredditType: optionalString(normalized?.subredditType),
    quarantine: normalized?.quarantine,
    userIsSubscriber: normalized?.userIsSubscriber,
    userIsModerator: normalized?.userIsModerator,
    userIsContributor: normalized?.userIsContributor,
    userIsBanned: normalized?.userIsBanned,
    userIsMuted: normalized?.userIsMuted,
    advertiserCategory: optionalString(normalized?.advertiserCategory),
    publicTraffic: normalized?.publicTraffic,
    raw:
      normalized?.raw ??
      (about && isRawSubredditAbout(about) ? (about as RawSubredditAbout) : undefined),
  }
}

export const normalizePost = (
  raw: RawRedditPost,
  subredditAbout?: RawSubredditAbout | Subreddit,
  authorProfile?: RawUserAbout | UserSummary | null,
): Post => {
  const createdUtc = toIsoString(raw.created_utc)
  const editedUtc = normalizeEdited(raw.edited)
  const media = normalizeMedia(raw)
  const gallery = raw.is_gallery ? (media as Extract<MediaAttachment, { kind: 'gallery' }>) : undefined

  return {
    id: raw.id,
    fullname: raw.name,
    subreddit: derivePostSubreddit(raw, subredditAbout),
    author: derivePostAuthor(raw, authorProfile ?? undefined),
    subredditId: raw.subreddit_id,
    title: raw.title,
    permalink: raw.permalink,
    url: raw.url,
    selftext: raw.selftext,
    selftextHtml: raw.selftext_html,
    isSelf: raw.is_self ?? !!raw.selftext,
    createdUtc,
    editedUtc,
    bodyTextSnippet: raw.selftext ? raw.selftext.slice(0, 280) : undefined,
    score: raw.score,
    upvoteRatio: raw.upvote_ratio,
    numComments: raw.num_comments,
    over18: raw.over_18,
    spoiler: raw.spoiler,
    stickied: raw.stickied,
    locked: raw.locked,
    distinguished: raw.distinguished,
    flair: raw.link_flair_text
      ? {
          text: raw.link_flair_text,
          backgroundColor: raw.link_flair_background_color,
          textColor: raw.link_flair_text_color,
        }
      : undefined,
    linkFlairRichtext: raw.link_flair_richtext,
    media,
    gallery,
    crosspostParent: raw.crosspost_parent,
    thumbnail: raw.thumbnail && !isPlaceholderThumbnail(raw.thumbnail) ? raw.thumbnail : undefined,
    previewImages: normalizePreviewImages(raw),
    awards: normalizeAwards(raw.all_awardings),
    gildings: raw.gildings,
    poll: normalizePoll(raw.poll_data),
    raw,
  }
}

export const normalizeComment = (raw: RawRedditComment): Comment => {
  const replies = normalizeCommentReplies(raw.replies)
  const normalizedReplies = replies.length ? replies : undefined

  return {
    id: raw.id,
    fullname: raw.name,
    parentId: raw.parent_id,
    linkId: raw.link_id,
    author: raw.author,
    body: raw.body,
    bodyHtml: raw.body_html,
    depth: raw.depth,
    score: raw.score,
    createdUtc: toIsoString(raw.created_utc),
    editedUtc: normalizeEdited(raw.edited),
    distinguished: raw.distinguished,
    stickied: raw.stickied,
    collapsed: raw.collapsed,
    collapsedReason: raw.collapsed_reason,
    over18: raw.over_18,
    replies: normalizedReplies,
    raw,
  }
}

const normalizeCommentReplies = (
  replies: RawRedditComment['replies'],
): Comment[] => {
  if (!replies || typeof replies === 'string') return []
  const { children } = replies.data
  return children
    .map((child) => {
      if (child.kind === 't1') {
        return normalizeComment(child.data as RawRedditComment)
      }
      if (child.kind === 'more') {
        const data = child.data as RawMoreChildren
        const fallbackId = data.id ?? `more_${data.parent_id}`
        return {
          id: fallbackId,
          fullname: data.name ?? fallbackId,
          parentId: data.parent_id,
          linkId: data.parent_id,
          author: '[more]',
          body: '',
          depth: data.depth,
          score: 0,
          createdUtc: new Date(0).toISOString(),
          replies: undefined,
          more: normalizeMoreChildren(data),
          raw: data,
        }
      }
      return null
    })
    .filter((c): c is Comment => !!c)
}

const normalizeMoreChildren = (raw: RawMoreChildren) => ({
  count: raw.count,
  children: raw.children,
})

export const normalizeSubreddit = (raw: RawSubredditAbout): Subreddit => {
  const ensureString = (value?: string | null) => (typeof value === 'string' ? value : undefined)

  const commentContributionSettings =
    raw.allow_videos_in_comments !== undefined || raw.allow_galleries_in_comments !== undefined
      ? {
          allowMediaInComments: raw.allow_videos_in_comments ?? undefined,
          allowGalleriesInComments: raw.allow_galleries_in_comments ?? undefined,
        }
      : undefined

  const bannerImage = sanitizeUrl(raw.banner_img ?? '')
  const bannerBackgroundImage = sanitizeUrl(raw.banner_background_image ?? '')
  const mobileBannerImage = sanitizeUrl(raw.mobile_banner_image ?? '')
  const communityIcon = sanitizeUrl(raw.community_icon ?? '')
  const icon = sanitizeUrl(raw.community_icon ?? raw.icon_img ?? '')
  const banner = sanitizeUrl(
    raw.banner_background_image ??
      raw.banner_img ??
      raw.mobile_banner_image ??
      raw.community_icon ??
      raw.icon_img ??
      '',
  )

  return {
    banner,
    icon,
    id: raw.name ?? `t5_${raw.id}`,
    name: raw.display_name,
    displayNamePrefixed: ensureString(raw.display_name_prefixed) ?? raw.display_name_prefixed,
    nsfw: raw.over18 ?? raw.over_18 ?? false,
    subscribers: raw.subscribers ?? 0,
    title: raw.title,
    description: ensureString(raw.description),
    publicDescription: ensureString(raw.public_description),
    publicDescriptionHtml: ensureString(raw.public_description_html),
    descriptionHtml: ensureString(raw.description_html),
    createdUtc: typeof raw.created_utc === 'number' ? toIsoString(raw.created_utc) : undefined,
    activeUserCount: raw.active_user_count,
    accountsActive: raw.accounts_active,
    lang: ensureString(raw.lang),
    url: ensureString(raw.url) ?? `/r/${raw.display_name}/`,
    submissionType: raw.submission_type,
    wikiEnabled: raw.wiki_enabled,
    spoilersEnabled: raw.spoilers_enabled,
    allowImages: raw.allow_images,
    allowVideos: raw.allow_videos,
    allowGalleries: raw.allow_galleries,
    allowPolls: raw.allow_polls,
    commentContributionSettings,
    primaryColor: ensureString(raw.primary_color),
    bannerImage,
    bannerBackgroundImage,
    mobileBannerImage,
    bannerBackgroundColor: ensureString(raw.banner_background_color),
    keyColor: ensureString(raw.key_color),
    iconColor: ensureString(raw.icon_color),
    communityIcon,
    subredditType: raw.subreddit_type,
    quarantine: raw.quarantine ?? undefined,
    userIsSubscriber: raw.user_is_subscriber ?? undefined,
    userIsModerator: raw.user_is_moderator ?? undefined,
    userIsContributor: raw.user_is_contributor ?? undefined,
    userIsBanned: raw.user_is_banned ?? undefined,
    userIsMuted: raw.user_is_muted ?? undefined,
    advertiserCategory: ensureString(raw.advertiser_category),
    publicTraffic: raw.public_traffic ?? undefined,
    raw,
  }
}

const toIsoSafe = (value: unknown): string => {
  const fallback = new Date(0).toISOString()
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
  if (typeof numeric === 'number' && Number.isFinite(numeric)) {
    try {
      return toIsoString(numeric)
    } catch {
      return fallback
    }
  }
  return fallback
}

export const normalizeUser = (raw: RawUserAbout): UserSummary => ({
  id: raw.id,
  username: raw.name,
  iconImg: raw.icon_img,
  createdUtc: toIsoSafe(raw.created_utc),
  isEmployee: raw.is_employee,
  isGold: raw.is_gold,
  isMod: raw.is_mod,
  verified: raw.verified,
  karma: {
    comment: raw.comment_karma,
    link: raw.link_karma,
    total: raw.total_karma,
  },
  awardKarma: {
    received: raw.awardee_karma,
    given: raw.awarder_karma,
  },
  subreddit: raw.subreddit
    ? {
        title: raw.subreddit.title,
        publicDescription: raw.subreddit.public_description,
        subscribers: raw.subreddit.subscribers,
        displayNamePrefixed: raw.subreddit.display_name_prefixed,
        over18: raw.subreddit.over_18,
        defaultSet: raw.subreddit.default_set,
        url: raw.subreddit.url,
        communityIcon: raw.subreddit.community_icon,
        iconImg: raw.subreddit.icon_img,
        bannerImg: raw.subreddit.banner_img,
        descriptionHtml: raw.subreddit.description_html,
      }
    : undefined,
  suspensionStatus: deriveSuspensionStatus(raw),
  raw,
})

const deriveSuspensionStatus = (raw: RawUserAbout): UserSummary['suspensionStatus'] => {
  if (raw.is_deleted) return 'deleted'
  if (raw.is_suspended) return 'suspended'
  if (raw.is_shadowbanned) return 'shadowbanned'
  return 'active'
}

export const normalizePostListing = (
  listing: RedditListing<RawRedditPost>,
  limit?: number,
  summary?: ListingSummary,
  subredditAbout?: RawSubredditAbout | Subreddit,
  authorProfiles?: Map<string, RawUserAbout | UserSummary>,
): Listing<Post> => ({
  items: listing.data.children
    .filter((child): child is RedditThing<RawRedditPost> & { kind: 't3' } => child.kind === 't3')
    .map((child) => {
      const authorKey = (child.data.author ?? '').trim() || child.data.author
      return normalizePost(child.data, subredditAbout, authorProfiles?.get(authorKey))
    }),
  paging: {
    after: listing.data.after,
    before: listing.data.before,
    limit,
  },
  summary,
})

export const normalizeCommentListing = (
  listing: RedditListing<RawRedditComment | RawMoreChildren>,
  limit?: number,
  summary?: ListingSummary,
): Listing<Comment> => ({
  items: listing.data.children
    .filter(
      (child): child is RedditThing<RawRedditComment> & { kind: 't1' } =>
        child.kind === 't1',
    )
    .map((child) => normalizeComment(child.data)),
  paging: {
    after: listing.data.after,
    before: listing.data.before,
    limit,
  },
  summary,
})

export const normalizeOverviewListing = (
  listing: RedditListing<RawRedditPost | RawRedditComment>,
  limit?: number,
  summary?: ListingSummary,
  authorProfiles?: Map<string, RawUserAbout | UserSummary>,
): Listing<OverviewEntry> => {
  const items: OverviewEntry[] = []
  for (const child of listing.data.children) {
    if (child.kind === 't3') {
      const postAuthorKey = ((child.data as RawRedditPost).author ?? '').trim() || (child.data as RawRedditPost).author
      items.push({
        kind: 'post',
        post: normalizePost(
          child.data as RawRedditPost,
          undefined,
          authorProfiles?.get(postAuthorKey),
        ),
      })
    } else if (child.kind === 't1') {
      items.push({
        kind: 'comment',
        comment: normalizeComment(child.data as RawRedditComment),
      })
    }
  }

  return {
    items,
    paging: {
      after: listing.data.after,
      before: listing.data.before,
      limit,
    },
    summary,
  }
}

export const normalizeSearchListing = (
  listing: RedditListing<RawRedditPost | RawRedditComment | RawSubredditAbout | RawUserAbout>,
  limit?: number,
  summary?: ListingSummary,
  authorProfiles?: Map<string, RawUserAbout | UserSummary>,
  subredditProfiles?: Map<string, Subreddit>,
): Listing<SearchResult> => {
  const items: SearchResult[] = []

  for (const child of listing.data.children) {
    switch (child.kind) {
      case 't3': {
        const postAuthorKey = ((child.data as RawRedditPost).author ?? '').trim() || (child.data as RawRedditPost).author
        const postSubredditKey =
          ((child.data as RawRedditPost).subreddit ?? '').trim().toLowerCase() ||
          (child.data as RawRedditPost).subreddit?.toLowerCase()
        const hydratedSubreddit =
          postSubredditKey && subredditProfiles ? subredditProfiles.get(postSubredditKey) : undefined
        items.push({
          kind: 'post',
          post: normalizePost(
            child.data as RawRedditPost,
            hydratedSubreddit,
            authorProfiles?.get(postAuthorKey),
          ),
        })
        break
      }
      case 't1':
        items.push({
          kind: 'comment',
          comment: normalizeComment(child.data as RawRedditComment),
        })
        break
      case 't5': {
        const rawSubreddit = child.data as RawSubredditAbout
        const key = rawSubreddit.display_name?.toLowerCase() ?? ''
        const hydrated = key ? subredditProfiles?.get(key) : undefined
        items.push({
          kind: 'subreddit',
          subreddit: hydrated ?? normalizeSubreddit(rawSubreddit),
        })
        break
      }
      case 't2':
        items.push({
          kind: 'user',
          user: normalizeUser(child.data as RawUserAbout),
        })
        break
      default:
        break
    }
  }

  return {
    items,
    paging: {
      after: listing.data.after,
      before: listing.data.before,
      limit,
    },
    summary,
  }
}

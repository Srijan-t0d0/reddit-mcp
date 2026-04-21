import type { RawSubredditAbout } from './raw'

export type RedditID = string
export type RedditFullname = string

export interface PagingInfo {
  after?: string | null
  before?: string | null
  limit?: number
}

export interface CacheMeta {
  hit: boolean
  maxAge?: number
  staleWhileRevalidate?: number
}

export interface ResponseMeta {
  requestId: string
  fetchedAt: string
  paging?: PagingInfo
  cache?: CacheMeta
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface ApiSuccessResponse<T> {
  meta: ResponseMeta
  data: T
  errors?: never
}

export interface ApiErrorResponse {
  meta: ResponseMeta
  errors: ApiError[]
  data?: never
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export interface ListingSummary {
  total?: number
  distinctAuthors?: number
  scoreAggregate?: number
}

export interface ListingPayload<T> {
  items: T[]
  paging?: PagingInfo
  summary?: ListingSummary
}

export type Listing<T> = ListingPayload<T>

export type MediaKind = 'image' | 'gallery' | 'video' | 'external'

export interface BaseMedia {
  kind: MediaKind
  url: string
}

export interface ImageVariant {
  url: string
  width: number
  height: number
}

export interface ImageMedia extends BaseMedia {
  kind: 'image'
  alt?: string
  sources?: ImageVariant[]
}

export interface GalleryItem extends ImageMedia {
  caption?: string
  id?: string
}

export interface GalleryMedia extends BaseMedia {
  kind: 'gallery'
  items: GalleryItem[]
}

export interface VideoMedia extends BaseMedia {
  kind: 'video'
  posterImage?: string
  width?: number
  height?: number
  durationSeconds?: number
  isGif?: boolean
}

export interface ExternalMedia extends BaseMedia {
  kind: 'external'
  title?: string
  favicon?: string
}

export type MediaAttachment = ImageMedia | GalleryMedia | VideoMedia | ExternalMedia

export interface Award {
  id: string
  name: string
  description?: string
  coinPrice?: number
  coinReward?: number
  count: number
  iconUrl?: string
  iconWidth?: number
  iconHeight?: number
  tiers?: AwardTier[]
}

export interface AwardTier {
  id: string
  coinPrice: number
  coinReward?: number
  iconUrl?: string
}

export interface FlairRichtext {
  e: 'text' | 'emoji'
  t?: string
  u?: string
}

export interface Flair {
  id?: string
  text?: string
  backgroundColor?: string
  textColor?: string
  richtext?: FlairRichtext[]
}

export interface PostPollOption {
  id: string
  text: string
  voteCount: number
}

export interface PostPoll {
  totalVoteCount: number
  options: PostPollOption[]
  votingClosedAt?: string
  userVote?: string
}

export interface Post {
  id: RedditID
  fullname: RedditFullname
  subreddit: Subreddit
  subredditId?: RedditFullname
  title: string
  author: Author
  permalink: string
  url?: string
  selftext?: string
  selftextHtml?: string | null
  isSelf: boolean
  createdUtc: string
  editedUtc?: string | null
  bodyTextSnippet?: string
  score: number
  upvoteRatio?: number
  numComments: number
  over18: boolean
  spoiler?: boolean
  stickied?: boolean
  locked?: boolean
  distinguished?: 'moderator' | 'admin' | 'special' | null
  flair?: Flair
  linkFlairRichtext?: FlairRichtext[]
  media?: MediaAttachment
  gallery?: GalleryMedia
  crosspostParent?: RedditFullname
  thumbnail?: string
  previewImages?: ImageVariant[]
  awards?: Award[]
  gildings?: Record<string, number>
  poll?: PostPoll
  raw?: unknown
}

export interface Comment {
  id: RedditID
  fullname: RedditFullname
  parentId: RedditFullname
  linkId: RedditFullname
  author: string
  body: string
  bodyHtml?: string
  depth: number
  score: number
  createdUtc: string
  editedUtc?: string | null
  distinguished?: 'moderator' | 'admin' | 'special' | null
  stickied?: boolean
  collapsed?: boolean
  collapsedReason?: string
  over18?: boolean
  replies?: Comment[]
  more?: MoreChildren
  raw?: unknown
}

export interface MoreChildren {
  count: number
  children: RedditFullname[]
}

export interface Subreddit {
  banner: string
  icon: string
  id: RedditID
  name: string
  displayNamePrefixed?: string
  nsfw: boolean
  subscribers: number
  title: string
  description?: string
  publicDescription?: string
  publicDescriptionHtml?: string
  descriptionHtml?: string
  createdUtc?: string
  activeUserCount?: number
  accountsActive?: number
  lang?: string
  url?: string
  submissionType?: 'self' | 'link' | 'any'
  wikiEnabled?: boolean
  spoilersEnabled?: boolean
  allowImages?: boolean
  allowVideos?: boolean
  allowGalleries?: boolean
  allowPolls?: boolean
  commentContributionSettings?: CommentContributionSettings
  primaryColor?: string
  bannerImage?: string
  bannerBackgroundImage?: string
  mobileBannerImage?: string
  bannerBackgroundColor?: string
  keyColor?: string
  iconColor?: string
  communityIcon?: string
  subredditType?: string
  quarantine?: boolean
  userIsSubscriber?: boolean
  userIsModerator?: boolean
  userIsContributor?: boolean
  userIsBanned?: boolean
  userIsMuted?: boolean
  advertiserCategory?: string
  publicTraffic?: boolean
  raw?: RawSubredditAbout
}

export interface CommentContributionSettings {
  allowMediaInComments?: boolean
  allowGalleriesInComments?: boolean
}

export interface Author {
  icon: string
  id: string
  name: string
  nsfw: boolean
  url: string
}

export interface UserSummary {
  id: RedditID
  username: string
  iconImg?: string
  createdUtc: string
  isEmployee?: boolean
  isGold?: boolean
  isMod?: boolean
  verified?: boolean
  suspensionStatus?: 'suspended' | 'active' | 'shadowbanned' | 'deleted'
  karma?: UserKarma
  awardKarma?: {
    received?: number
    given?: number
  }
  subreddit?: UserSubreddit
  raw?: unknown
}

export interface UserKarma {
  comment?: number
  link?: number
  total?: number
}

export interface UserSubreddit {
  title?: string
  publicDescription?: string
  subscribers?: number
  displayNamePrefixed?: string
  over18?: boolean
  defaultSet?: boolean
  url?: string
  communityIcon?: string
  iconImg?: string
  bannerImg?: string
  descriptionHtml?: string
}

export interface OverviewEntry {
  kind: 'post' | 'comment'
  post?: Post
  comment?: Comment
}

export type OverviewListing = Listing<OverviewEntry>

export type SearchResult =
  | { kind: 'post'; post: Post; comment?: never; subreddit?: never; user?: never }
  | { kind: 'comment'; comment: Comment; post?: never; subreddit?: never; user?: never }
  | { kind: 'subreddit'; subreddit: Subreddit; post?: never; comment?: never; user?: never }
  | { kind: 'user'; user: UserSummary; post?: never; comment?: never; subreddit?: never }

export type SearchListing = Listing<SearchResult>

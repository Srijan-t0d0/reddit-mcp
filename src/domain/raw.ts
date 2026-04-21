export interface RedditThing<T> {
  kind: string
  data: T
}

export interface RedditListingData<T> {
  after: string | null
  before: string | null
  dist?: number | null
  children: RedditThing<T>[]
}

export interface RedditListing<T> {
  kind: 'Listing'
  data: RedditListingData<T>
}

export interface RawRedditPost {
  id: string
  name: string
  subreddit: string
  subreddit_id?: string
  title: string
  author: string
  author_fullname?: string
  permalink: string
  url?: string
  selftext?: string
  selftext_html?: string | null
  is_self?: boolean
  created_utc: number
  edited?: boolean | number
  score: number
  ups?: number
  downs?: number
  upvote_ratio?: number
  num_comments: number
  over_18: boolean
  spoiler?: boolean
  stickied?: boolean
  locked?: boolean
  distinguished?: 'moderator' | 'admin' | 'special' | null
  link_flair_text?: string
  link_flair_richtext?: { e: 'text' | 'emoji'; t?: string; u?: string }[]
  link_flair_background_color?: string
  link_flair_text_color?: string
  media_metadata?: Record<
    string,
    {
      status: 'valid' | 'failed'
      e?: string
      m?: string
      s?: { u: string; x: number; y: number }
      p?: { u: string; x: number; y: number }[]
    }
  >
  gallery_data?: {
    items: { media_id: string; id?: number; caption?: string }[]
  }
  preview?: {
    images: {
      source: { url: string; width: number; height: number }
      resolutions: { url: string; width: number; height: number }[]
    }[]
  }
  thumbnail?: string
  banner_img?: string
  icon_img?: string
  subreddit_subscribers?: number
  media?: unknown
  secure_media?: unknown
  secure_media_embed?: Record<string, unknown>
  is_gallery?: boolean
  is_video?: boolean
  domain?: string
  gildings?: Record<string, number>
  all_awardings?: {
    id: string
    name: string
    description?: string
    coin_price?: number
    coin_reward?: number
    icon_url?: string
    icon_width?: number
    icon_height?: number
    count: number
    tiers_by_required_awardings?: Record<
      string,
      {
        award_id: string
        required_awardings: number
        coin_price: number
        coin_reward?: number
        icon_url?: string
      }
    >
  }[]
  poll_data?: {
    total_vote_count: number
    options: { id: string; text: string; vote_count: number }[]
    voting_end_timestamp?: number
  }
  crosspost_parent?: string
  thumbnail_height?: number
  thumbnail_width?: number
  media_only?: boolean
  community_icon?: string
}

export interface RawRedditComment {
  id: string
  name: string
  parent_id: string
  link_id: string
  author: string
  author_fullname?: string
  body: string
  body_html?: string
  depth: number
  score: number
  created_utc: number
  edited?: boolean | number
  distinguished?: 'moderator' | 'admin' | 'special' | null
  stickied?: boolean
  collapsed?: boolean
  collapsed_reason?: string
  over_18?: boolean
  replies?: '' | RedditListing<RawRedditComment | RawMoreChildren>
}

export interface RawMoreChildren {
  count: number
  name?: string
  id?: string
  parent_id: string
  depth: number
  children: string[]
}

export interface RawSubredditAbout {
  name?: string
  id: string
  display_name: string
  display_name_prefixed?: string
  title: string
  public_description?: string
  public_description_html?: string
  description?: string
  description_html?: string
  subscribers?: number
  active_user_count?: number
  accounts_active?: number
  created_utc: number
  lang?: string
  over18?: boolean
  over_18?: boolean
  icon_img?: string
  banner_img?: string
  community_icon?: string
  icon_color?: string
  primary_color?: string
  banner_background_color?: string
  submission_type?: 'self' | 'link' | 'any'
  wiki_enabled?: boolean
  spoilers_enabled?: boolean
  subreddit_type?: string
  quarantine?: boolean
  allow_videos?: boolean
  allow_images?: boolean
  allow_galleries?: boolean
  allow_polls?: boolean
  allow_videos_in_comments?: boolean
  allow_galleries_in_comments?: boolean
  banner_background_image?: string
  mobile_banner_image?: string
  url?: string
  key_color?: string
  user_is_subscriber?: boolean | null
  user_is_moderator?: boolean | null
  user_is_contributor?: boolean | null
  user_is_banned?: boolean | null
  user_is_muted?: boolean | null
  advertiser_category?: string
  public_traffic?: boolean
}

export interface RawUserAbout {
  id: string
  name: string
  icon_img?: string
  created_utc: number
  is_employee?: boolean
  is_gold?: boolean
  is_mod?: boolean
  verified?: boolean
  is_suspended?: boolean
  is_shadowbanned?: boolean
  is_deleted?: boolean
  comment_karma?: number
  link_karma?: number
  total_karma?: number
  awardee_karma?: number
  awarder_karma?: number
  subreddit?: {
    title?: string
    public_description?: string
    subscribers?: number
    display_name_prefixed?: string
    over_18?: boolean
    default_set?: boolean
    url?: string
    community_icon?: string
    icon_img?: string
    banner_img?: string
    description_html?: string
  }
}

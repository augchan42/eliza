import type { TwitterAuth } from "./auth";
import type { Profile } from "./profile";
import type { Tweet } from "./tweets";

/**
 * The categories that can be used in Twitter searches.
 */
/**
 * Enum representing different search modes.
 * @enum {number}
 */

export enum SearchMode {
  Top = 0,
  Latest = 1,
  Photos = 2,
  Videos = 3,
  Users = 4,
}

/**
 * Search for tweets using Twitter API v2
 *
 * @param query Search query
 * @param maxTweets Maximum number of tweets to return
 * @param searchMode Search mode (not all modes are supported in v2)
 * @param auth Authentication
 * @param sinceId Only return tweets newer than this ID (v1.1 only, ignored in v2)
 * @returns Async generator of tweets
 */
export async function* searchTweets(
  query: string,
  maxTweets: number,
  searchMode: SearchMode,
  auth: TwitterAuth,
  sinceId?: string,
): AsyncGenerator<Tweet, void> {
  const v2Client = auth.getV2Client();

  // Build query based on search mode
  let finalQuery = query;
  switch (searchMode) {
    case SearchMode.Photos:
      finalQuery = `${query} has:media has:images`;
      break;
    case SearchMode.Videos:
      finalQuery = `${query} has:media has:videos`;
      break;
  }

  // Try v2 first
  try {
    const searchIterator = await v2Client.v2.search(finalQuery, {
      max_results: Math.min(maxTweets, 100),
      "tweet.fields": [
        "id",
        "text",
        "created_at",
        "author_id",
        "referenced_tweets",
        "entities",
        "public_metrics",
        "attachments",
      ],
      "user.fields": ["id", "name", "username", "profile_image_url"],
      "media.fields": ["url", "preview_image_url", "type"],
      expansions: [
        "author_id",
        "attachments.media_keys",
        "referenced_tweets.id",
      ],
    });

    let count = 0;
    for await (const tweet of searchIterator) {
      if (count >= maxTweets) break;

      const convertedTweet: Tweet = {
        id: tweet.id,
        text: tweet.text || "",
        timestamp: tweet.created_at
          ? new Date(tweet.created_at).getTime()
          : Date.now(),
        timeParsed: tweet.created_at ? new Date(tweet.created_at) : new Date(),
        userId: tweet.author_id || "",
        name:
          searchIterator.includes?.users?.find((u) => u.id === tweet.author_id)
            ?.name || "",
        username:
          searchIterator.includes?.users?.find((u) => u.id === tweet.author_id)
            ?.username || "",
        conversationId: tweet.id,
        hashtags: tweet.entities?.hashtags?.map((h) => h.tag) || [],
        mentions:
          tweet.entities?.mentions?.map((m) => ({
            id: m.id || "",
            username: m.username || "",
            name: "",
          })) || [],
        photos: [],
        thread: [],
        urls: tweet.entities?.urls?.map((u) => u.expanded_url || u.url) || [],
        videos: [],
        isRetweet:
          tweet.referenced_tweets?.some((rt) => rt.type === "retweeted") ||
          false,
        isReply:
          tweet.referenced_tweets?.some((rt) => rt.type === "replied_to") ||
          false,
        isQuoted:
          tweet.referenced_tweets?.some((rt) => rt.type === "quoted") || false,
        isPin: false,
        sensitiveContent: false,
        likes: tweet.public_metrics?.like_count || undefined,
        replies: tweet.public_metrics?.reply_count || undefined,
        retweets: tweet.public_metrics?.retweet_count || undefined,
        views: tweet.public_metrics?.impression_count || undefined,
        quotes: tweet.public_metrics?.quote_count || undefined,
      };

      yield convertedTweet;
      count++;
    }
  } catch (error) {
    console.warn("v2 search failed, trying v1.1 fallback:", error);

    // Fall back to v1.1
    try {
      const v1Client = auth.getV1Client();
      const v1Params: Record<string, any> = {
        q: finalQuery,
        count: Math.min(maxTweets, 100),
        tweet_mode: 'extended',
        result_type: 'recent',
      };

      if (sinceId) {
        v1Params.since_id = sinceId;
      }

      const searchResults = await v1Client.get("search/tweets.json", v1Params);
      const statuses: any[] = Array.isArray(searchResults?.statuses)
        ? searchResults.statuses
        : [];

      for (const tweet of statuses) {
        const convertedTweet: Tweet = {
          id: tweet.id_str,
          text: tweet.full_text || tweet.text,
          timestamp: new Date(tweet.created_at).getTime() / 1000,
          timeParsed: new Date(tweet.created_at),
          userId: tweet.user.id_str,
          name: tweet.user.name,
          username: tweet.user.screen_name,
          conversationId: tweet.conversation_id_str || tweet.id_str,
          hashtags: tweet.entities?.hashtags?.map((h: any) => h.text) || [],
          mentions: tweet.entities?.user_mentions?.map((m: any) => ({
            id: m.id_str,
            username: m.screen_name,
            name: m.name,
          })) || [],
          photos: tweet.entities?.media?.filter((m: any) => m.type === 'photo').map((m: any) => ({
            id: m.id_str,
            url: m.media_url_https,
          })) || [],
          thread: [],
          urls: tweet.entities?.urls?.map((u: any) => u.expanded_url) || [],
          videos: tweet.entities?.media?.filter((m: any) => m.type === 'video').map((m: any) => ({
            id: m.id_str,
            preview: m.media_url_https,
          })) || [],
          isRetweet: !!tweet.retweeted_status,
          isReply: !!tweet.in_reply_to_status_id_str,
          isQuoted: !!tweet.quoted_status,
          isPin: false,
          sensitiveContent: tweet.possibly_sensitive || false,
          likes: tweet.favorite_count || undefined,
          replies: tweet.reply_count || undefined,
          retweets: tweet.retweet_count || undefined,
          views: undefined,
          quotes: tweet.quote_count || undefined,
        };

        yield convertedTweet;
      }
    } catch (v1Error) {
      console.error("Both v2 and v1.1 search failed:", v1Error);
      throw new Error(`Search failed. v2: ${error?.message}. v1.1: ${v1Error?.message}`);
    }
  }
}

/**
 * Search for users using Twitter API v2
 *
 * Note: User search is limited in the standard Twitter API v2.
 * This searches for users mentioned in tweets matching the query.
 *
 * @param query Search query
 * @param maxProfiles Maximum number of profiles to return
 * @param auth Authentication
 * @returns Async generator of profiles
 */
export async function* searchProfiles(
  query: string,
  maxProfiles: number,
  auth: TwitterAuth,
): AsyncGenerator<Profile, void> {
  const client = auth.getV2Client();
  const userIds = new Set<string>();
  const profiles: Profile[] = [];

  try {
    // Search for tweets and extract unique user IDs
    const searchIterator = await client.v2.search(query, {
      max_results: Math.min(maxProfiles * 2, 100), // Get more tweets to find more users
      "tweet.fields": ["author_id"],
      "user.fields": [
        "id",
        "name",
        "username",
        "description",
        "profile_image_url",
        "public_metrics",
        "verified",
        "location",
        "created_at",
      ],
      expansions: ["author_id"],
    });

    for await (const tweet of searchIterator) {
      if (tweet.author_id) {
        userIds.add(tweet.author_id);
      }

      // Also get users from includes
      if (searchIterator.includes?.users) {
        for (const user of searchIterator.includes.users) {
          if (profiles.length < maxProfiles && user.id) {
            const profile: Profile = {
              userId: user.id,
              username: user.username || "",
              name: user.name || "",
              biography: user.description || "",
              avatar: user.profile_image_url || "",
              followersCount: user.public_metrics?.followers_count,
              followingCount: user.public_metrics?.following_count,
              isVerified: user.verified || false,
              location: user.location || "",
              joined: user.created_at ? new Date(user.created_at) : undefined,
            };
            profiles.push(profile);
          }
        }
      }

      if (profiles.length >= maxProfiles) break;
    }

    // Yield the profiles we found
    for (const profile of profiles) {
      yield profile;
    }
  } catch (error) {
    console.error("Profile search error:", error);
    throw error;
  }
}

/**
 * Fetch tweets quoting a specific tweet
 *
 * @param quotedTweetId The ID of the quoted tweet
 * @param maxTweets Maximum number of tweets to return
 * @param auth Authentication
 * @returns Async generator of tweets
 */
export async function* searchQuotedTweets(
  quotedTweetId: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  // Twitter API v2 doesn't have a direct endpoint for quote tweets
  // We need to search for tweets that reference this tweet
  const query = `url:"twitter.com/*/status/${quotedTweetId}"`;

  yield* searchTweets(query, maxTweets, SearchMode.Latest, auth);
}

// Compatibility exports
export const fetchSearchTweets = async (
  query: string,
  maxTweets: number,
  searchMode: SearchMode,
  auth: TwitterAuth,
  cursor?: string,
) => {
  throw new Error(
    "fetchSearchTweets is deprecated. Use searchTweets generator instead.",
  );
};

export const fetchSearchProfiles = async (
  query: string,
  maxProfiles: number,
  auth: TwitterAuth,
  cursor?: string,
) => {
  throw new Error(
    "fetchSearchProfiles is deprecated. Use searchProfiles generator instead.",
  );
};

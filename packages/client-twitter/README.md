# Twitter Client for Eliza

Official Twitter/X platform integration using Twitter API v2 with OAuth 1.0a authentication.

## Features

- **OAuth 1.0a Authentication**: Secure, official API access
- **Multi-Account Support**: Run multiple bots with isolated credentials
- **Automated Posting**: Scheduled tweets with configurable intervals
- **Interaction Handling**: Reply to mentions and engage with timeline
- **Search & Discovery**: Find and respond to relevant tweets
- **Divination System**: Research-focused content generation with I-Ching oracle integration
- **DKG Integration**: Permanent record storage via OriginTrail

## Quick Start

### 1. Get Twitter API Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/projects-and-apps)
2. Create a new project and app (or use existing)
3. Set app permissions to **"Read and Write"**
4. In the app settings, go to "Keys and tokens"
5. Generate/copy the following credentials:
   - API Key (Consumer Key)
   - API Secret Key (Consumer Secret)
   - Access Token
   - Access Token Secret

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# Required OAuth 1.0a Credentials
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET_KEY=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret_here

# Optional Configuration
TWITTER_USERNAME=YourBotUsername  # Auto-fetched if not provided
TWITTER_DRY_RUN=false             # Set to true for testing without posting
TWITTER_POLL_INTERVAL=120         # Seconds between interaction checks
TWITTER_SEARCH_ENABLE=false       # Enable timeline search

# Divination (Research Content)
DIVINATION_INTERVAL_MIN=360       # Minimum minutes between divination posts
DIVINATION_INTERVAL_MAX=720       # Maximum minutes between divination posts
```

### 3. Run the Client

```bash
pnpm start
```

## Architecture

### Authentication Flow

```
ClientBase.init()
    ↓
OAuth 1.0a authentication (twitter-api-v2)
    ↓
Fetch profile from API
    ↓
Populate username/userId (platform-agnostic)
    ↓
Start sub-clients (post, search, divination, interactions)
```

### Platform-Agnostic Design

The client uses generic fields for extensibility:
- `username`: Generic user identifier
- `userId`: Generic user ID
- `profile`: Platform-specific data

This allows adapting the codebase for other platforms (Telegram, Discord) without core changes.

### Sub-Clients

- **TwitterPostClient** (`src/post.ts`) - Scheduled tweet generation
- **TwitterSearchClient** (`src/search.ts`) - Search and engagement
- **TwitterInteractionClient** (`src/interactions.ts`) - Mention and timeline replies
- **TwitterDivinationClient** (`src/divination-client.ts`) - Research content with oracle analysis

## API Usage

### Posting a Tweet

```typescript
import { postTweet } from './tweet-utils';

await postTweet(
    runtime,
    client,
    cleanedContent,
    roomId,
    newTweetContent,
    username
);
```

### Replying to a Tweet

```typescript
import { postReplyTweet } from './tweet-utils';

await postReplyTweet(
    runtime,
    client,
    replyContent,
    originalTweetId,
    roomId,
    username
);
```

### Searching Tweets

```typescript
const results = await client.fetchSearchTweets(
    'query',
    maxTweets,
    SearchMode.Latest
);
```

## Migration from Legacy Client

This client replaces the legacy `agent-twitter-client` (scraping-based) with official API support.

### Key Changes

| Legacy (agent-twitter-client) | New (twitter-api-v2) |
|------------------------------|----------------------|
| Cookie-based authentication | OAuth 1.0a |
| Scraping HTML/GraphQL | Official REST API v2 |
| `TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_EMAIL` | `TWITTER_API_KEY`, `TWITTER_API_SECRET_KEY`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` |
| Fragile, ban-prone | Stable, ToS-compliant |

### Credential Migration

**Old `.env`:**
```bash
TWITTER_USERNAME=mybotname
TWITTER_PASSWORD=mypassword
TWITTER_EMAIL=myemail@example.com
TWITTER_2FA_SECRET=ABCD1234
```

**New `.env`:**
```bash
TWITTER_API_KEY=AbCdEf1234567890
TWITTER_API_SECRET_KEY=XyZ9876543210aBcDeF
TWITTER_ACCESS_TOKEN=1234567890-AbCdEfGhIjKlMnOp
TWITTER_ACCESS_TOKEN_SECRET=QrStUvWxYz1234567890AbCdEfGh
```

## Troubleshooting

### "Twitter API returned null/undefined"
- Check API credentials are correct
- Verify app has "Read and Write" permissions
- Ensure access tokens match the app

### "Rate limit exceeded"
- Reduce `TWITTER_POLL_INTERVAL`
- Disable `TWITTER_SEARCH_ENABLE` if not needed
- Check [Twitter API rate limits](https://developer.twitter.com/en/docs/twitter-api/rate-limits)

### Cache keys show "undefined"
- Ensure `client.init()` completes before sub-clients start
- Check that OAuth authentication succeeds

## Related Documentation

- [Twitter API v2 Documentation](https://developer.twitter.com/en/docs/twitter-api)
- [twitter-api-v2 Library](https://github.com/PLhery/node-twitter-api-v2)
- [CLAUDE.md](./CLAUDE.md) - Detailed architecture and patterns
- [DKG Integration](../plugin-dkg-divination/CLAUDE.md)

## License

See main project [LICENSE](../../LICENSE)

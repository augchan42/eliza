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

### 2. Configure Settings

You can configure Twitter credentials in two ways:

#### Option A: Environment Variables (`.env` file)

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
TWITTER_INTERACTIONS_ENABLE=true  # Enable interaction/mention monitoring (set to false for post-only mode)

# Divination (Research Content)
DIVINATION_INTERVAL_MIN=360       # Minimum minutes between divination posts
DIVINATION_INTERVAL_MAX=720       # Maximum minutes between divination posts
```

#### Option B: Character Card Settings (Recommended for Multiple Bots)

Add to your character JSON file:

```json
{
  "name": "MyBot",
  "settings": {
    "TWITTER_API_KEY": "your_api_key_here",
    "TWITTER_API_SECRET_KEY": "your_api_secret_here",
    "TWITTER_ACCESS_TOKEN": "your_access_token_here",
    "TWITTER_ACCESS_TOKEN_SECRET": "your_access_token_secret_here",
    "TWITTER_USERNAME": "mybothandle",
    "TWITTER_DRY_RUN": "false",
    "POST_INTERVAL_MIN": "90",
    "POST_INTERVAL_MAX": "180",
    "DIVINATION_INTERVAL_MIN": "360",
    "DIVINATION_INTERVAL_MAX": "720"
  }
}
```

**Character settings override environment variables**, allowing you to run multiple bots with different Twitter accounts.

### 3. Run the Client

```bash
pnpm start
```

## Configuration Priority

Settings are loaded in this order (later sources override earlier ones):

1. **Environment variables** (`.env` file) - Global defaults
2. **Character card settings** - Per-character overrides

This allows you to:
- Set global defaults in `.env` for all characters
- Override specific settings per character in their JSON file
- Run multiple Twitter bots with different accounts from the same codebase

## Architecture

### Authentication Flow

```
ClientBase.init()
    ↓
Load config (character settings → env vars)
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

## Multi-Bot Setup

To run multiple Twitter bots simultaneously:

1. **Create separate character files** for each bot:
   - `characters/bot1.character.json`
   - `characters/bot2.character.json`

2. **Add Twitter credentials to each character**:

```json
{
  "name": "Bot1",
  "settings": {
    "TWITTER_API_KEY": "bot1_api_key",
    "TWITTER_API_SECRET_KEY": "bot1_api_secret",
    "TWITTER_ACCESS_TOKEN": "bot1_access_token",
    "TWITTER_ACCESS_TOKEN_SECRET": "bot1_access_secret"
  }
}
```

3. **Load characters at startup**:

```bash
pnpm start --characters="characters/bot1.character.json,characters/bot2.character.json"
```

Each bot will use its own credentials and operate independently.

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

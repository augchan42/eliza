---
task: m-implement-dkg-twitter-integration
branch: feature/dkg-twitter-integration
status: implemented-with-bugs
created: 2025-09-11
modules: [client-twitter, plugin-dkg-divination]
---

# Integrate DKG Persistence with Twitter Divination Posts

## Problem/Goal
Currently, Twitter divination posts and DKG knowledge graph storage operate independently. We need to integrate them so that divination posts are automatically stored to the OriginTrail DKG with explorer URLs included in the workflow. This creates a persistent, decentralized record of all divination insights.

## Success Criteria
- [x] Twitter divination posts automatically trigger DKG storage via dkgDivinationInsert action
- [x] DKG explorer URLs are generated and logged for each stored divination
- [x] Error handling for partial failures (tweet succeeds but DKG fails)
- [x] Enhanced URL generation with explorer links
- [ ] Integration tested on testnet environment (blocked by critical bugs)
- [x] State coordination between Twitter client and DKG plugin working correctly
- [x] Three-tweet architecture implemented (research + hexagram + DKG record)
- [x] Research-focused content selection implemented
- [x] Oracle breakthrough assessment framework added
- [ ] Critical bugs fixed for production readiness

## Context Files
<!-- Added by context-gathering agent or manually -->
- @packages/client-twitter/src/divination.ts:917-928  # performDivination() Twitter posting
- @packages/plugin-dkg-divination/src/actions/dkgDivinationInsert.ts:127-134  # URL generation
- @packages/plugin-dkg-divination/src/actions/dkgDivinationInsert.ts:133-135  # DKG callback

## User Notes

**Current Implementation Analysis:**
- DKG Plugin: @elizaos/plugin-dkg-divination with DKG.js v8.0.6
- Action: dkgDivinationInsert stores readings to OriginTrail DKG
- Provider: graphSearch for SPARQL queries
- Creates JSON-LD structured data with schema.org contexts
- Persists to DKG with 12 epochs (epochsNum: 12)
- Already generates testnet explorer URLs: https://dkg.${DKG_ENVIRONMENT}.origintrail.io/${UAL}

**Twitter Integration Points:**
- performDivination() in divination.ts posts every 6-24 hours
- Currently only posts to Twitter, no DKG integration
- Need to call INSERT_DIVINATION_MEMORY action after successful tweet
- Error handling for async coordination required

**Complexity Assessment:** 7/10 - Moderately complex
**Time Estimate:** 2-4 hours for working integration

**Required Environment Variables:**
- DKG_ENVIRONMENT=testnet
- DKG_HOSTNAME, DKG_PORT, DKG_BLOCKCHAIN_NAME
- DKG_PUBLIC_KEY, DKG_PRIVATE_KEY

## Context Manifest

### How This Currently Works: Twitter Divination System

The Twitter divination system operates as an autonomous posting mechanism within the Twitter client. When the TwitterManager is initialized in `packages/client-twitter/src/index.ts`, it creates a TwitterDivinationClient instance that runs independently from user interactions.

The TwitterDivinationClient (`packages/client-twitter/src/divination.ts`) implements a sophisticated timing-based posting system. After startup, it calls `divinationLoop()` which uses cached timestamps from `twitter/${username}/lastDivination` to calculate random intervals between 6-24 hours (configurable via `DIVINATION_INTERVAL_MIN` and `DIVINATION_INTERVAL_MAX`). This creates organic, human-like posting patterns that avoid bot detection.

When it's time to post, `performDivination()` orchestrates multiple data sources: it fetches breaking news from Google News RSS feeds (with fallback sources), calls the 8BitOracle API for hexagram readings, generates market sentiment analysis using LLM, and optionally fetches CoinGecko price data. The system includes sophisticated news deduplication logic, storing recent headlines in `twitter/${username}/lastDivinationHeadlines` and using LLM-based similarity checking to avoid repetitive posts.

The divination content generation follows a strict template-based approach. State composition occurs through the core runtime's `composeState()` method, binding all data sources to the `pixDivinationTemplate`. This template defines Pix's voice as a "digital anthropologist observing humanity through ancient I-Ching wisdom" with "Discord at 3am energy." The LLM generates content using this context, then the system applies multiple cleaning passes: JSON parsing attempts, quote removal, newline normalization, and sentence-boundary truncation via `truncateToCompleteSentence()`.

The actual posting happens through `postTweet()` in `tweet-utils.ts`, which handles both standard tweets and note tweets (for longer content). After successful posting, the system updates multiple caches: the divination timestamp for interval calculation, recent headlines for deduplication, and tweet objects for memory persistence. The posted content is stored as a Memory object in the core database through `runtime.messageManager.createMemory()`, creating persistent conversation history.

Error handling occurs at multiple levels: RSS feed failures trigger fallback sources, API timeouts use circuit breakers, and posting errors bubble up through the call stack with comprehensive logging. The system is designed to gracefully degrade - if news feeds fail, it posts "oracle-only" content; if posting fails, it logs detailed error context without crashing the client.

### How This Currently Works: DKG Plugin System

The DKG divination plugin (`packages/plugin-dkg-divination/`) implements OriginTrail Decentralized Knowledge Graph integration through the DKG.js v8.0.6 client library. The plugin architecture follows Eliza's standard pattern with actions, providers, and evaluators exported through a unified Plugin interface.

The core action `dkgDivinationInsert` (`packages/plugin-dkg-divination/src/actions/dkgDivinationInsert.ts`) is named "INSERT_DIVINATION_MEMORY" and designed for programmatic invocation rather than user commands. It validates six required environment variables: `DKG_ENVIRONMENT`, `DKG_HOSTNAME`, `DKG_PORT`, `DKG_BLOCKCHAIN_NAME`, `DKG_PUBLIC_KEY`, and `DKG_PRIVATE_KEY`. The action expects structured state data containing `oracleReading`, `marketSentiment`, `newsEvent`, and `interpretation` fields.

When invoked, the action initializes a DKG client with comprehensive configuration: testnet/mainnet environment selection, blockchain credentials, retry logic (maxNumberOfRetries: 300, frequency: 2), and API versioning ("/v1"). The handler extracts and parses JSON state data, then constructs a knowledge graph asset following JSON-LD standards with schema.org contexts and custom hexagram/divination vocabularies.

The knowledge graph structure is semantically rich: it creates a CreativeWork of type "divination:Reading" with a structured hexagram identifier (`urn:hexagram:${number}`), temporal metadata (ISO timestamp), author attribution (user ID from state), and nested hexagram data containing trigram information, line changes, and interpretation context. Market sentiment, news events, and interpretation text are embedded as contextual metadata.

Asset creation occurs through `DkgClient.asset.create()` with a 12-epoch persistence guarantee (`epochsNum: 12`). Upon successful creation, the system generates three URL variants: a full explorer URL (`https://dkg.${DKG_ENVIRONMENT}.origintrail.io/${UAL}`), which provides public access to the stored knowledge. The callback mechanism allows the calling system to receive the UAL (Universal Asset Locator) and explorer link for further processing.

Error handling is comprehensive: missing environment variables prevent initialization, JSON parsing failures are caught and logged with context, DKG API errors bubble up with detailed error messages, and callback responses differentiate between success (with URLs) and failure (with error flags).

### For New Feature Implementation: Integration Architecture

The integration requires bridging two independent systems that currently operate in isolation. The Twitter divination system posts content based on timing loops, while the DKG plugin responds to explicit action invocations. Our integration point is immediately after successful Twitter posting in `performDivination()` around line 928.

The current Twitter flow lacks action invocation entirely - it only calls `postTweet()` and updates caches. We need to introduce the Eliza action system by creating a synthetic Memory response object containing the "INSERT_DIVINATION_MEMORY" action, then calling `runtime.processActions()` to trigger DKG storage.

The critical challenge is state coordination between systems. The DKG action expects parsed JSON state data, but Twitter divination operates with formatted template strings. We need to preserve the original structured data (hexagram objects, news arrays, sentiment strings) alongside the formatted template data. This requires maintaining parallel data structures: one for template rendering, one for DKG persistence.

The integration flow will be: successful Twitter post → create synthetic Memory with action → prepare structured state object → call `runtime.processActions()` → DKG storage occurs asynchronously. Error handling must account for partial failures: Twitter success but DKG failure should log warnings without breaking the divination flow.

State structure requirements: the DKG action needs `oracleReading` (hexagram JSON), `marketSentiment` (LLM-generated string), `newsEvent` (news array), `interpretation` (final tweet content), plus user identification fields (`userId`, `userIdentifier`) for knowledge graph attribution.

Authentication and permissions flow through the existing environment variable system. The Twitter client already has runtime access, and the DKG plugin validates its own credentials independently. No additional authentication coordination is required.

Timing considerations: DKG asset creation involves blockchain transactions and may take several seconds. The integration should be asynchronous to avoid blocking the divination loop. Failed DKG storage should not retry automatically to prevent duplicate knowledge graph entries.

### Technical Reference Details

#### Component Interfaces & Signatures

**Twitter Divination Integration Point:**
```typescript
// In performDivination() after successful postTweet()
// Around line 928 in packages/client-twitter/src/divination.ts

// Create synthetic memory for action processing
const actionMemory: Memory = {
  id: stringToUuid(`divination-action-${Date.now()}`),
  userId: this.runtime.agentId,
  agentId: this.runtime.agentId,
  roomId: roomId,
  content: {
    text: "Store divination to DKG",
    action: "INSERT_DIVINATION_MEMORY"
  },
  createdAt: Date.now(),
  embedding: getEmbeddingZeroVector()
};

// Prepare structured state for DKG action
const dkgState = {
  ...state,
  oracleReading: formattedOracle,      // Already JSON string
  marketSentiment: formattedSentiment,  // String
  newsEvent: formattedNews,            // JSON string  
  interpretation: cleanedContent,      // Final tweet text
  userId: this.runtime.agentId,
  userIdentifier: this.profile.username
};

// Process action asynchronously
await this.runtime.processActions(actionMemory, [actionMemory], dkgState);
```

**DKG Action Handler Interface:**
```typescript
// From packages/plugin-dkg-divination/src/actions/dkgDivinationInsert.ts
handler: async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  _options: { [key: string]: unknown },
  callback: HandlerCallback,
): Promise<boolean>
```

**Expected State Structure:**
```typescript
interface DivinationState extends State {
  oracleReading: string;      // JSON string of hexagram data
  marketSentiment: string;    // LLM-generated sentiment analysis  
  newsEvent: string;         // JSON string of news articles array
  interpretation: string;     // Final processed tweet content
  userId: UUID;              // Agent/user identifier
  userIdentifier?: string;   // Username for attribution
}
```

#### Data Structures

**Hexagram Data Format (oracleReading):**
```json
{
  "interpretation": {
    "currentHexagram": {
      "number": 23,
      "unicode": "䷖", 
      "name": { "pinyin": "Bo", "chinese": "剥" },
      "meaning": "Splitting Apart",
      "upperTrigram": { "description": "Mountain", "english": "Ken", "chinese": "艮", "figure": "☶" },
      "lowerTrigram": { "description": "Earth", "english": "Kun", "chinese": "坤", "figure": "☷" }
    },
    "transformedHexagram": { /* Similar structure if changing lines exist */ },
    "changes": [{ "line": 1, "changed": false }]
  }
}
```

**News Event Data Format (newsEvent):**
```json
[{
  "title": "Breaking: Major Event Occurs",
  "summary": "Detailed summary of the news event...",
  "link": "https://news.source.com/article",
  "pubDate": "2025-01-11T10:30:00Z"
}]
```

#### Configuration Requirements

**Required Environment Variables:**
```bash
# Twitter Configuration (existing)
TWITTER_USERNAME=your_bot_username
TWITTER_PASSWORD=your_password
TWITTER_EMAIL=your_email
TWITTER_DRY_RUN=false

# DKG Configuration (must be present)
DKG_ENVIRONMENT=testnet
DKG_HOSTNAME=localhost
DKG_PORT=8900
DKG_BLOCKCHAIN_NAME=otp:20430
DKG_PUBLIC_KEY=0x...
DKG_PRIVATE_KEY=0x...
```

**DKG Asset Creation Configuration:**
- Epochs: 12 (hardcoded for 12-epoch persistence)
- Content Type: "all" (public knowledge graph)
- Node API Version: "/v1"
- Max Retries: 300 with 2-second frequency

#### File Locations

**Key Implementation Files:**
- `packages/client-twitter/src/divination-client.ts` - Three-tweet architecture implementation
- `packages/client-twitter/src/divination-templates.ts` - Split template system
- `packages/client-twitter/src/content-selection-service.ts` - Research-focused selection
- `packages/plugin-dkg-divination/src/actions/dkgDivinationInsert.ts` - Enhanced DKG action with optional fields
- `packages/client-twitter/CLAUDE.md` - Service documentation for Twitter client changes
- `packages/plugin-dkg-divination/CLAUDE.md` - Service documentation for DKG plugin changes

## Next Steps

### Critical Bug Fixes Required
1. **Fix template import mismatch** - Update or remove legacy `pixDivinationTemplate` reference
2. **Fix variable references** - Replace `cleanedContent` with `cleanedResearchTweet` in error logs
3. **Update return types** - Make `cleanLLMResponse()` handle null returns consistently
4. **Align template/parser formats** - Update parser to handle new template output format
5. **Complete error handling** - Handle null `replyTweetId` in DKG state preparation

### Testing & Validation
- End-to-end test of three-tweet flow in dry-run mode
- Validate DKG integration with optional fields on testnet
- Test error scenarios: partial failures, DKG timeouts, generation failures
- Verify breakthrough assessment accuracy with sample research papers

### Production Readiness
- Monitor three-tweet engagement metrics vs single-tweet baseline
- Validate oracle breakthrough predictions over time
- Performance testing for two-stage generation latency
- Documentation updates for operators and maintainers

## Work Log

### 2025-09-11

#### Initial Analysis
- Task created based on comprehensive codebase analysis
- Identified integration points between Twitter divination system and DKG plugin
- Analyzed existing architecture and data flow requirements

### 2025-09-15

#### Completed
- **Three-Tweet Architecture Implementation**: Split single divination into research-focused main tweet + hexagram reading reply + DKG record tweet
- **Template System Restructure**: Created `pixResearchTweetTemplate` for engagement hooks and `pixHexagramReadingTemplate` for oracle breakthrough assessment
- **ContentSelectionService**: Implemented generic content selection abstraction with LLM-powered ranking and research-focused selection criteria
- **Enhanced DKG Integration**: Modified DKG action to handle optional newsEvent/marketSentiment fields for research-only divinations
- **Two-Stage Content Generation**: Implemented parallel generation of research tweet and hexagram reading with independent error handling
- **Oracle Breakthrough Assessment Framework**: Added structured oracle verdict system for evaluating innovation potential
- **Comprehensive Service Documentation**: Created CLAUDE.md files for both modified services documenting architectural changes

#### Critical Bugs Discovered (Require Fix Before Production)
1. **Template Import Mismatch**: Legacy `pixDivinationTemplate` reference in test method needs updating
2. **Variable Reference Errors**: `cleanedContent` references should be `cleanedResearchTweet` in error logging
3. **Return Type Mismatch**: `cleanLLMResponse()` returns `null` but calling code expects `string`
4. **Template/Parser Format Mismatch**: New template format not compatible with existing parser logic
5. **Incomplete Error Handling**: Failed reply tweets could cause DKG state issues

#### Architecture Changes
- Divination flow: Single tweet → Three-tweet threaded experience
- Template strategy: Unified template → Specialized templates for different content types
- Content selection: News-focused → Research paper breakthrough detection
- DKG integration: Required fields → Optional fields for flexible use cases
- Error handling: Simple failure → Graceful degradation with partial success handling

#### Next Session Requirements
**Status**: Core functionality implemented but requires bug fixes before production deployment
- Fix critical bugs identified in code review
- Test three-tweet flow end-to-end
- Validate DKG integration with optional fields
- Ensure error handling covers all failure scenarios

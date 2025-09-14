# Twitter Client CLAUDE.md

## Purpose
Twitter platform client with research-focused divination system that generates contextual content using three-tweet architecture.

## Narrative Summary
The Twitter client provides comprehensive platform integration with automated divination capabilities. The divination system has evolved from simple oracle readings to a sophisticated three-tweet architecture: a research-focused main tweet with engagement hooks, a hexagram reading reply providing oracle analysis, and an optional DKG record tweet linking to akashic storage. The client includes deduplication systems, content selection services, and integrates with OriginTrail DKG for permanent record keeping.

## Key Files
- `src/index.ts` - Main client interface and TwitterManager initialization
- `src/divination-client.ts:20-626` - Core divination logic with three-tweet flow
- `src/divination-templates.ts:1-140` - Split templates for research and hexagram content
- `src/content-selection-service.ts:18-120` - Generic content selection abstraction
- `src/base.ts` - Base Twitter client functionality
- `src/tweet-utils.ts` - Tweet posting and utility functions
- `src/arxiv-service.ts` - Research paper fetching from ArXiv
- `src/news-service.ts` - News aggregation and sentiment analysis
- `src/oracle-service.ts` - I-Ching oracle integration

## Divination Architecture

### Three-Tweet Flow
1. **Research Tweet** (`pixResearchTweetTemplate`) - Hook-focused main content with @8bitoracle tag
2. **Hexagram Reply** (`pixHexagramReadingTemplate`) - Oracle breakthrough assessment with paper citation
3. **DKG Record** (via callback) - Akashic record link from OriginTrail storage

### Template System
- `pixResearchTweetTemplate:1-46` - Research paper engagement generation with visceral hooks
- `pixHexagramReadingTemplate:48-140` - Oracle verdict on breakthrough potential through hexagram analysis

### Content Selection
- `ContentSelectionService:18-82` - LLM-powered selection with criteria-based ranking
- Research-focused priorities: novelty, paradigm shifts, I-Ching resonance, transformative potential
- JSON-first parsing with text fallback for robustness

### Deduplication System
- **Tier 1**: Exact string matching for identical headlines
- **Tier 2**: LLM similarity check for nuanced story variations
- **Permanent ArXiv History**: Prevents reposting same research papers
- **Headline Cache**: 100 recent headlines for ~3 months coverage

## Integration Points

### Consumes
- ArxivService: `/arxiv/search` for research papers
- NewsService: Google News aggregation and sentiment analysis
- OracleService: 8BitOracle.com for hexagram readings
- @elizaos/plugin-dkg-divination: DKG storage action

### Provides
- TwitterManager interface to core runtime
- Divination loop with configurable intervals
- Post/reply/search capabilities
- Content deduplication services

## Configuration
Required environment variables:
- `TWITTER_USERNAME` - Account identifier
- `TWITTER_DRY_RUN` - Testing mode flag
- `DIVINATION_INTERVAL_MIN/MAX` - Posting frequency control
- `MAX_TWEET_LENGTH` - Character limit enforcement
- `TWITTER_SEARCH_ENABLE` - Search functionality toggle

## Key Patterns
- **Two-stage generation**: Research hook + Oracle analysis (see divination-client.ts:240-270)
- **Generic content selection**: Abstracted for reuse across content types (see content-selection-service.ts:18-82)
- **Graceful DKG integration**: Non-blocking async processing with callback system (see divination-client.ts:441-454)
- **Robust LLM response parsing**: JSON-first with multiple fallback strategies (see divination-client.ts:497-534)

## Related Documentation
- ../plugin-dkg-divination/CLAUDE.md - DKG storage integration
- ../../CLAUDE.md - Overall project architecture
- sessions/patterns/by-service/client-twitter.md - Service-specific patterns
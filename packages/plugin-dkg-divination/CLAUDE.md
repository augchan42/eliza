# DKG Divination Plugin CLAUDE.md

## Purpose
OriginTrail DKG integration plugin for storing divination readings and hexagram data as permanent knowledge assets.

## Narrative Summary
This plugin provides specialized OriginTrail Decentralized Knowledge Graph integration for market divination and research analysis storage. It transforms ephemeral Twitter divinations into permanent, structured knowledge assets with semantic metadata. The plugin has been enhanced to support research-focused divinations where market sentiment and news events are optional fields, accommodating both traditional market analysis and pure research oracle readings.

## Key Files
- `src/index.ts` - Plugin definition with actions and providers
- `src/actions/dkgDivinationInsert.ts:15-326` - Core DKG storage action with enhanced optional fields
- `src/schema-context.json` - JSON-LD schema context for knowledge graph structure
- `src/types.ts` - TypeScript interfaces for divination data structures
- `src/providers/graphSearch.ts` - DKG knowledge graph search capabilities
- `src/constants.ts` - Plugin configuration constants

## Action: INSERT_DIVINATION_MEMORY

### Purpose
Stores complete divination sessions (oracle readings + interpretations) as structured knowledge assets on OriginTrail DKG.

### Enhanced Flexibility
- **Optional newsEvent field** (lines 88-101): Supports research-focused divinations without market news
- **Optional marketSentiment field** (lines 103-105): Defaults to "neutral" for pure research oracle readings
- **Robust error handling**: JSON parsing with fallbacks and LLM-powered schema fixing

### Data Structure
```
CreativeWork {
  hexagramData: cleanedHexagramData,
  marketSentiment: string (optional, defaults "neutral"),
  newsEvents: array (optional, defaults []),
  interpretation: full_divination_text
}
```

### Processing Flow
1. **Validation**: Check required DKG environment variables (lines 21-43)
2. **State parsing**: Extract oracle data with error handling (lines 76-106)
3. **Data cleaning**: Create essential-only hexagram structure (lines 118-129)
4. **Knowledge graph creation**: Schema.org compatible JSON-LD (lines 131-168)
5. **DKG publishing**: Asset creation with retry logic (lines 181-258)
6. **URL generation**: Explorer link construction with UAL handling (lines 260-280)
7. **Callback execution**: Return akashic record link for reply posting (lines 289-307)

## Integration Points

### Consumes
- State from TwitterDivinationClient with oracle and interpretation data
- DKG environment configuration from runtime settings
- Optional market sentiment and news event data

### Provides
- Permanent DKG storage of divination records
- Akashic record URLs for social media linking
- Knowledge graph search capabilities via graphSearch provider

## Configuration
Required environment variables:
- `DKG_ENVIRONMENT` - Network environment (testnet/mainnet)
- `DKG_HOSTNAME` - DKG node endpoint *(see limitations below)*
- `DKG_PORT` - Node port configuration
- `DKG_BLOCKCHAIN_NAME` - Target blockchain network
- `DKG_PUBLIC_KEY` - Wallet public key for transactions
- `DKG_PRIVATE_KEY` - Wallet private key for signing

### DKG_HOSTNAME Behavior (Important Limitation)
The plugin now implements automatic failover between OriginTrail's testnet nodes to handle RPC overload issues. This introduces the following behavior:

**Testnet Environment:**
- Always uses round-robin failover between `v6-pegasus-node-02` and `v6-pegasus-node-03`
- If `DKG_HOSTNAME` matches one of these nodes, it starts with that node
- If `DKG_HOSTNAME` is set to a different hostname, it's **ignored** and defaults to pegasus-02
- Custom/private nodes are not supported in the current implementation

**Mainnet Environment:**
- Uses the configured `DKG_HOSTNAME` without failover (maintains original behavior)

This limitation was introduced to solve reliability issues with RPC overload on public testnet nodes. For custom node support, manual modification of the `TESTNET_NODES` array in `src/dkg-nodes.ts` is required.

## Key Patterns
- **Optional field handling**: Graceful degradation when market data unavailable (see dkgDivinationInsert.ts:88-105)
- **LLM schema repair**: Automatic JSON fixing for malformed data structures (see dkgDivinationInsert.ts:215-255)
- **Callback-based integration**: Non-blocking response handling for social media posting (see dkgDivinationInsert.ts:289-307)
- **Essential data extraction**: Clean hexagram data without computation artifacts (see dkgDivinationInsert.ts:118-129)
- **Conservative retry timing**: 30s-5min exponential backoff designed for RPC overload recovery (see dkg-error-handler.ts:11-16)
- **Node failover architecture**: Automatic rotation between testnet nodes with detailed logging (see dkg-operation-handler.ts)

## Schema Context
- Uses schema.org CreativeWork as base type for semantic interoperability
- PropertyValue structures for typed metadata storage
- URN-based identifiers for unique asset addressing

## Related Documentation
- ../client-twitter/CLAUDE.md - Twitter integration consuming this plugin
- ../../CLAUDE.md - Overall project architecture
- sessions/patterns/by-service/plugin-dkg-divination.md - Service-specific patterns
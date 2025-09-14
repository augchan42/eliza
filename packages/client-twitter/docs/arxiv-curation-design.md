# ArXiv Paper Curation Pipeline Design

## Overview

A Pareto-optimal stack ranking system for curating philosophically and mystically interesting research papers from arXiv. The system fetches a large pool of papers, performs comprehensive LLM evaluation and ranking, then works through the ranked list until quality drops below threshold, triggering a refresh.

## Core Principles

- **Pareto-Optimal Selection**: Use papers while quality remains high, refresh when needed
- **Stack Ranking**: LLM evaluates and ranks ALL papers in one comprehensive pass
- **Quality Threshold**: Automatic refresh when paper quality drops below threshold
- **Permanent Memory**: Never repeat papers using SQLite-backed history
- **Citation Integrity**: Always link to original arXiv papers

## Pipeline Architecture

```
[ArXiv API] → [Fetch 1000-2000 papers] → [LLM Stack Ranking] → [Quality Queue] → [Daily Selection]
     ↓                                           ↓                    ↓                ↓
  (Batch fetch)                          (One 30-50K call)    (Ranked pool)    (Use until threshold)
                                                                      ↓
                                                            [Quality < Threshold]
                                                                      ↓
                                                            [Trigger New Fetch]
```

## Stage 1: Mass Data Collection

### Fetch Strategy
- **Mega fetch** of 2000 papers with titles AND abstracts
- Comprehensive coverage across multiple categories and time periods
- Store in persistent cache with quality scores
- With 2000 papers and ~2 posts/day, pool lasts ~1000 days theoretically

### Fetch Triggers
- **Initial**: On system startup
- **Quality Threshold**: When top remaining papers score < 7/10
- **Time-based**: If pool is older than 1 month (staleness)
- **Depletion**: If available high-quality papers < 100

### Categories (100-200 papers each)
```javascript
const categories = [
    'cs.AI',        // Artificial Intelligence
    'cs.LG',        // Machine Learning  
    'quant-ph',     // Quantum Physics
    'cs.CY',        // Computers & Society
    'physics.soc-ph', // Social Physics
    'q-bio.NC',     // Neural & Cognitive Systems
    'cs.HC',        // Human-Computer Interaction
    'stat.ML',      // Statistical Machine Learning
    'cond-mat.dis-nn', // Disordered Systems & Neural Networks
    'nlin.AO'       // Adaptation & Self-Organizing Systems
];
```

### Keyword Searches (50-100 papers each)
```javascript
const searches = [
    'all:"collective consciousness"',
    'all:"emergence" AND all:"consciousness"',
    'all:"swarm intelligence"',
    'all:"self organization" AND all:"complexity"',
    'all:"quantum" AND all:"observer"',
    'all:"neural" AND all:"collective"',
    'all:"information theory" AND all:"consciousness"',
    'all:"complex systems" AND all:"emergence"'
];
```

### Data Structure
```typescript
interface RankedPaper {
    arxivId: string;      // "2401.12345"
    title: string;        // Paper title
    abstract: string;     // Full abstract
    authors: string[];    // Author list
    category: string;     // Primary category
    publishedDate: Date;  // Publication date
    link: string;         // https://arxiv.org/abs/2401.12345
    // Stack ranking metadata
    qualityScore: number; // 0-10 score from LLM
    ranking: number;      // 1-1000 position
    themes: string[];     // Identified themes
    reasoning: string;    // Why paper was scored this way
}
```

## Stage 2: Comprehensive Stack Ranking

### Input
- **2000 paper titles** (ALL papers sent in one batch)
- **~50K tokens** (half the context window)
- Calculation: 2000 titles × 25 tokens = 50K tokens

### LLM Prompt
```
Evaluate and stack rank these research papers for mystical/philosophical divination potential.
Score each paper 0-10 based on these criteria:

1. Universal patterns that mirror ancient wisdom (weight: 25%)
2. Emergence, self-organization, complexity themes (weight: 20%)
3. Consciousness, observer, information theory (weight: 20%)
4. Collective behavior, network effects (weight: 15%)
5. Paradoxes, limits, incompleteness (weight: 10%)
6. Accessibility for poetic interpretation (weight: 10%)

Papers:
[0] Emergent Consciousness in Large Language Models Through Recursive Self-Attention
[1] Quantum Entanglement Patterns in Social Network Dynamics
[2] Swarm Intelligence and the Emergence of Collective Decision Making
...
[999] Neural Architecture Search via Information Theoretic Bounds

Return JSON with top 100 papers:
{
  "rankings": [
    {
      "index": 47,
      "score": 9.5,
      "themes": ["emergence", "consciousness", "recursion"],
      "reasoning": "Directly addresses consciousness emergence through recursive patterns"
    },
    ...
  ]
}

Rank by score, include only papers scoring >= 5.0
```

### Output
- Top 100-200 papers with quality scores
- Explicit reasoning for each ranking
- Natural quality cutoff point identified

## Stage 3: Quality-Based Selection

### The Pareto Principle
- **Use top-ranked papers** while quality remains high
- **Quality threshold**: Score >= 7.0 for primary selection
- **Fallback threshold**: Score >= 5.0 for extended operation
- **Refresh trigger**: When best available < 5.0

### Daily Selection Process
```javascript
async function selectDailyPaper() {
  // Get ranked pool from cache
  const rankedPool = await cacheManager.get('rankedPaperPool');
  const history = await cacheManager.get('arxivPaperHistory');
  
  // Filter out already posted papers
  const available = rankedPool.filter(p => !history.includes(p.arxivId));
  
  // Check quality threshold
  if (available[0].qualityScore < 5.0) {
    // Trigger new fetch and ranking
    await refreshPaperPool();
    return selectDailyPaper(); // Recursive call with fresh pool
  }
  
  // Select top paper
  const selected = available[0];
  
  // Optional: Second-pass abstract analysis for final verification
  if (selected.qualityScore < 7.0) {
    const verified = await verifyWithAbstract(selected);
    if (!verified) return available[1]; // Use second-best
  }
  
  return selected;
}
```

### Quality Monitoring
```javascript
interface PoolQuality {
  totalPapers: number;
  availablePapers: number;  // Not yet posted
  topScore: number;         // Best available score
  averageTopTen: number;    // Average of top 10 available
  daysUntilRefresh: number; // Estimated based on burn rate
}
```

## Stage 4: Refresh Strategy

### When to Refresh
```javascript
function shouldRefreshPool(poolQuality: PoolQuality): boolean {
  return (
    poolQuality.topScore < 5.0 ||           // Quality below threshold
    poolQuality.availablePapers < 50 ||     // Running low on papers
    poolQuality.averageTopTen < 6.0 ||      // Overall quality declining
    poolAge > 14 * 24 * 60 * 60 * 1000     // Pool older than 2 weeks
  );
}
```

### Refresh Process
1. **Fetch new batch** (1000-2000 papers)
2. **Merge with existing** (optional - keep high scorers)
3. **Re-rank entire pool**
4. **Cache new rankings**
5. **Log quality metrics**

### Smart Fetching
```javascript
async function adaptiveFetch() {
  const poolQuality = await getPoolQuality();
  
  // Adjust fetch size based on burn rate
  const dailyBurnRate = await getDailyConsumptionRate();
  const targetDays = 14; // Two week supply
  const fetchSize = Math.max(1000, dailyBurnRate * targetDays * 1.5);
  
  // Adjust categories based on what's working
  const successfulCategories = await getHighScoringCategories();
  
  return fetchPapers(fetchSize, successfulCategories);
}
```

## Data Persistence

### Short-term Cache (100 items)
- Recent headline deduplication
- Rolling 3-month window
- Quick duplicate detection

### Permanent History (unlimited)
- All arXiv IDs ever posted
- Stored in SQLite via cacheManager
- Never repeat same paper

```javascript
// Storage format
{
  "arxivPaperHistory": ["2401.12345", "2401.23456", ...],
  "lastDivinationHeadlines": ["Recent paper title 1", ...]
}
```

## Performance Optimization

### API Efficiency
- **Batch fetching**: 10-20 API calls per refresh (not daily)
- **Refresh frequency**: Every 1-2 weeks (adaptive)
- **Timeout protection**: 15-second timeout per API call
- **Parallel fetching**: Concurrent category requests

### LLM Token Usage
- **Stack ranking**: ~35-50K tokens (one-time per refresh)
- **Optional verification**: ~2K tokens (only for borderline papers)
- **Daily average**: ~3-5K tokens (amortized)

### Efficiency Metrics
```javascript
interface EfficiencyMetrics {
  // Per refresh
  papersEvaluated: 1000-2000;
  tokensUsed: 35000-50000;
  apiCalls: 10-20;
  processingTime: '60-90 seconds';
  
  // Daily amortized
  tokensPerDay: 3000-5000;  // 35K-50K / 14 days
  apiCallsPerDay: 1-2;       // 10-20 / 14 days
  costPerPaper: '$0.05';     // Highly efficient
}
```

### Cache Management
- **Ranked pool**: 2-3MB cached for 2 weeks
- **History**: Append-only, unlimited growth
- **Metrics**: Daily quality tracking

## Error Handling

### Graceful Degradation
1. If arXiv fails → Fall back to Google News
2. If LLM filtering fails → Random selection from fetched papers
3. If no new papers → Skip divination cycle
4. If all papers are duplicates → Expand search parameters

### Logging
```javascript
elizaLogger.debug(`Fetched ${papers.length} papers from arXiv`);
elizaLogger.debug(`Stage 2: Filtered to ${titleFiltered.length} papers`);
elizaLogger.debug(`Stage 3: Selected ${finalists.length} finalists`);
elizaLogger.info(`Final selection: ${selected.arxivId} - ${selected.title}`);
```

## Output Format

### Divination Post Structure
```
[RESEARCH INTERCEPT]
Researchers discover quantum entanglement patterns in neural networks 
mirror ancient descriptions of consciousness emergence.

watching AI rediscover what mystics knew: everything's connected 
but you need the right lens to see it

䷊ Peace / Tài (Earth/Heaven) → ䷋ Stagnation / Pǐ (Heaven/Earth)

Upper trigram shifts from grounded Earth to expansive Heaven - 
the research reveals how local interactions create global patterns,
just as Peace transforms to Stagnation when harmony becomes rigid.

📖 arxiv.org/abs/2401.12345
@8bitoracle
```

## Implementation Checklist

- [x] Increase deduplication cache to 100 items
- [x] Add permanent arXiv history tracking
- [x] Implement fetchArxivPapers() with bulk fetch
- [ ] Implement stack ranking system
- [ ] Add quality threshold monitoring
- [ ] Create adaptive refresh logic
- [ ] Add pool quality metrics
- [ ] Implement Pareto-optimal selection
- [ ] Test with 1000+ paper batches
- [ ] Monitor quality decay over time

## Future Enhancements

1. **Quality Learning**: Track which papers get high engagement, adjust scoring
2. **Predictive Refresh**: Anticipate when pool will deplete based on patterns
3. **Thematic Clustering**: Group similar papers to ensure variety
4. **Temporal Weighting**: Boost recent papers during initial ranking
5. **Cross-Paper Synthesis**: Connect multiple papers in single divination
6. **A/B Testing**: Compare different ranking criteria
7. **Embedding-Based Similarity**: Prevent too-similar papers in sequence
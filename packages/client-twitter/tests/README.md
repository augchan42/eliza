# ArXiv Integration Tests

Test scripts for the new Pareto-optimal arXiv paper curation system.

## Quick Start

```bash
cd packages/client-twitter/tests
./run-tests.sh
```

## Individual Tests

### Simple API Test
```bash
node test-arxiv-simple.js
```
Tests basic arXiv API connectivity, XML parsing, and prompt generation.

**Outputs:**
- `test-output-raw-arxiv.xml` - Raw API response
- `test-output-parsing.json` - Parsed paper data
- `test-output-ranking-prompt.json` - Generated LLM prompt

### Full Pipeline Test
```bash
node test-arxiv-ranking.js --full-pipeline
```
Tests the complete mega-fetch → stack-ranking → selection pipeline.

**Outputs:**
- `test-output-mega-fetch.json` - Results of fetching 2000 papers
- `test-output-stack-ranking.json` - LLM ranking results
- `test-output-full-pipeline.json` - End-to-end pipeline results

## What Gets Tested

1. **API Connectivity** - Can we fetch from arXiv?
2. **XML Parsing** - Can we extract paper metadata?
3. **Token Estimation** - How many tokens for 2000 papers?
4. **Stack Ranking** - Can we rank papers by quality?
5. **Pool Management** - Cache storage and retrieval
6. **Quality Monitoring** - Threshold detection and refresh triggers

## Expected Results

- **2000+ papers** fetched across categories
- **100+ papers** ranked with quality scores 5-10
- **~50K tokens** for full ranking operation
- **5-10 candidate papers** for daily selection

## Integration Notes

The test scripts use mocks for:
- Runtime and cache manager (writes to console)
- LLM calls (returns sample ranking data)
- Database operations (in-memory simulation)

For real testing, run the integration in the actual bot environment with proper LLM access.
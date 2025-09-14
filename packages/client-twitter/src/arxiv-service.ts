import {
    IAgentRuntime,
    ModelClass,
    elizaLogger,
    generateText,
} from "@elizaos/core";

export class ArxivService {
    private lastRequestTime: number = 0;
    private consecutiveErrors: number = 0;
    private readonly BASE_DELAY = 1000; // 1 second minimum
    private readonly BACKOFF_MULTIPLIER = 2.5; // Aggressive scaling
    private readonly MAX_DELAY = 30000; // Cap at 30 seconds

    constructor(
        private runtime: IAgentRuntime,
        private profileUsername: string
    ) {}

    private sanitizeUsername(username: string): string {
        // Only allow alphanumeric characters and underscores, max 50 chars
        return username
            .replace(/[^a-zA-Z0-9_]/g, '')
            .substring(0, 50)
            .toLowerCase();
    }

    private getCacheKey(suffix: string): string {
        const sanitized = this.sanitizeUsername(this.profileUsername);
        return `twitter/${sanitized}/${suffix}`;
    }

    private async rateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        // Calculate exponential backoff delay
        const exponentialDelay = Math.min(
            this.BASE_DELAY * Math.pow(this.BACKOFF_MULTIPLIER, this.consecutiveErrors),
            this.MAX_DELAY
        );

        const requiredDelay = Math.max(exponentialDelay, this.BASE_DELAY);
        const actualDelay = Math.max(0, requiredDelay - timeSinceLastRequest);

        if (actualDelay > 0) {
            elizaLogger.debug(`Rate limiting: waiting ${actualDelay}ms (consecutive: ${this.consecutiveErrors})`);
            await new Promise(resolve => setTimeout(resolve, actualDelay));
        }

        this.lastRequestTime = Date.now();
        // Note: consecutiveErrors only increments on errors, not successful requests
    }

    private resetRateLimit(): void {
        this.consecutiveErrors = 0;
        elizaLogger.debug("Rate limit reset - consecutive requests cleared");
    }

    public async fetchMegaArxivPool(): Promise<any[]> {
        elizaLogger.info("Starting controlled batch fetch of arXiv papers...");
        const allPapers = [];
        const startTime = Date.now();

        // Reduced searches for production safety - total ~800 papers max
        const searches = [
            // Core categories (100 each)
            { query: 'cat:cs.AI', name: 'AI Research', results: 100 },
            { query: 'cat:cs.LG', name: 'Machine Learning', results: 100 },
            { query: 'cat:quant-ph', name: 'Quantum Physics', results: 100 },
            { query: 'cat:cs.CY', name: 'Computers & Society', results: 100 },
            { query: 'cat:physics.soc-ph', name: 'Social Physics', results: 100 },
            { query: 'cat:q-bio.NC', name: 'Neural & Cognitive', results: 100 },
            // Targeted keywords (50 each)
            { query: 'all:"collective consciousness"', name: 'Collective Consciousness', results: 50 },
            { query: 'all:"emergence" AND all:"consciousness"', name: 'Emergent Consciousness', results: 50 },
            { query: 'all:"swarm intelligence"', name: 'Swarm Intelligence', results: 50 },
            { query: 'all:"complex systems" AND all:"emergence"', name: 'Complex Emergence', results: 50 }
        ];

        // Reset rate limiter for fresh batch
        this.resetRateLimit();

        try {
            // Sequential processing with rate limiting (prevents memory exhaustion)
            for (const search of searches) {
                elizaLogger.debug(`Fetching ${search.name}...`);

                try {
                    const papers = await this.fetchArxivBatch(search.query, search.name, search.results);
                    allPapers.push(...papers);

                    // Log progress
                    elizaLogger.debug(`${search.name}: ${papers.length} papers, total: ${allPapers.length}`);

                } catch (error) {
                    elizaLogger.warn(`Failed to fetch ${search.name}:`, error.message);
                    // Continue with other searches
                }

                // Small delay between different search categories
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Deduplicate papers by arXiv ID
            const uniquePapers = this.deduplicatePapers(allPapers);

            const fetchTime = (Date.now() - startTime) / 1000;
            elizaLogger.info(`Batch fetch complete: ${uniquePapers.length} unique papers in ${fetchTime}s (${searches.length} categories)`);

            return uniquePapers;

        } catch (error) {
            elizaLogger.error("Batch fetch failed:", error);
            return [];
        }
    }

    private async fetchArxivBatch(query: string, name: string, maxResults: number): Promise<any[]> {
        const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;

        elizaLogger.info(`🔍 ArXiv API Request - Category: ${name}`);
        elizaLogger.debug(`📡 Request URL: ${url}`);
        elizaLogger.debug(`📊 Max Results: ${maxResults}, Query: ${query}`);

        try {
            // Apply rate limiting before each request
            elizaLogger.debug(`⏱️ Applying rate limit for ${name}...`);
            await this.rateLimit();

            const fetchStart = Date.now();
            const papers = await this.fetchAndParseArxiv(url, name);
            const fetchTime = Date.now() - fetchStart;

            // Success: reset exponential backoff counter
            this.consecutiveErrors = 0;

            elizaLogger.info(`✅ ${name}: ${papers.length} papers fetched in ${fetchTime}ms`);
            elizaLogger.debug(`📝 Papers: ${papers.map(p => p.title.substring(0, 50)).join(', ')}`);
            return papers;
        } catch (error) {
            // Error: increment exponential backoff counter
            this.consecutiveErrors++;
            
            elizaLogger.error(`❌ Failed to fetch ${name}:`, {
                error: error.message,
                stack: error.stack,
                url: url,
                query: query,
                maxResults: maxResults,
                consecutiveErrors: this.consecutiveErrors
            });
            return [];
        }
    }

    private deduplicatePapers(papers: any[]): any[] {
        const seen = new Set<string>();
        const unique = [];

        for (const paper of papers) {
            if (!seen.has(paper.arxivId)) {
                seen.add(paper.arxivId);
                unique.push(paper);
            }
        }

        return unique;
    }

    private async fetchAndParseArxiv(url: string, categoryName: string) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        elizaLogger.debug(`🌐 HTTP Request - ${categoryName}:`);
        elizaLogger.debug(`   URL: ${url}`);
        elizaLogger.debug(`   Method: GET, Timeout: 15s`);

        try {
            const fetchStart = Date.now();
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/atom+xml' },
                signal: controller.signal
            });
            const fetchTime = Date.now() - fetchStart;

            elizaLogger.debug(`📡 HTTP Response - ${categoryName}:`);
            elizaLogger.debug(`   Status: ${response.status} ${response.statusText}`);
            elizaLogger.debug(`   URL: ${response.url} (final after redirects)`);
            elizaLogger.debug(`   Time: ${fetchTime}ms`);

            if (!response.ok) {
                const error = `HTTP ${response.status}: ${response.statusText}`;
                elizaLogger.error(`❌ HTTP Error - ${categoryName}: ${error}`);
                throw new Error(error);
            }

            const xmlStart = Date.now();
            const xmlText = await response.text();
            const xmlTime = Date.now() - xmlStart;

            elizaLogger.debug(`📄 XML Response - ${categoryName}:`);
            elizaLogger.debug(`   Size: ${xmlText.length} chars`);
            elizaLogger.debug(`   Parse time: ${xmlTime}ms`);
            elizaLogger.debug(`   Preview: ${xmlText.substring(0, 200)}...`);

            return this.parseArxivXML(xmlText, categoryName);
        } catch (error) {
            elizaLogger.error(`💥 Network Error - ${categoryName}:`, {
                url: url,
                error: error.message,
                stack: error.stack,
                type: error.constructor.name,
                cause: error.cause
            });
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    private parseArxivXML(xmlText: string, categoryName: string) {
        const papers = [];

        try {
            // Parse Atom feed entries
            const entryRegex = /<entry>(.*?)<\/entry>/gs;
            const titleRegex = /<title>(.*?)<\/title>/s;
            const summaryRegex = /<summary>(.*?)<\/summary>/s;
            const idRegex = /<id>(.*?)<\/id>/s;
            const publishedRegex = /<published>(.*?)<\/published>/s;
            const authorRegex = /<author>\s*<name>(.*?)<\/name>/gs;

            let match;
            while ((match = entryRegex.exec(xmlText)) !== null) {
                const entryXml = match[1];

                const titleMatch = titleRegex.exec(entryXml);
                const summaryMatch = summaryRegex.exec(entryXml);
                const idMatch = idRegex.exec(entryXml);
                const publishedMatch = publishedRegex.exec(entryXml);

                if (titleMatch && summaryMatch && idMatch) {
                    // Extract authors
                    const authors = [];
                    let authorMatch;
                    while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
                        authors.push(authorMatch[1].trim());
                    }

                    // Clean up the abstract
                    const abstract = summaryMatch[1]
                        .replace(/<[^>]*>/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();

                    // Extract arXiv ID from the URL
                    const arxivId = idMatch[1].split('/').pop();

                    papers.push({
                        title: titleMatch[1].trim(),
                        summary: abstract,
                        link: `https://arxiv.org/abs/${arxivId}`,
                        pubDate: publishedMatch ? publishedMatch[1].trim() : new Date().toISOString(),
                        authors: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''),
                        category: categoryName,
                        arxivId: arxivId
                    });
                }

                if (papers.length >= 10) break;
            }
        } catch (error) {
            elizaLogger.error(`Error parsing arXiv XML for ${categoryName}:`, error);
        }

        return papers;
    }

    public async stackRankPapers(papers: any[]): Promise<any[]> {
        if (papers.length === 0) return [];

        elizaLogger.info(`Stack ranking ${papers.length} papers...`);
        const startTime = Date.now();

        try {
            // Token budget validation: limit papers to prevent overflow (50k context limit)
            const MAX_PAPERS_FOR_RANKING = 200; // ~8k tokens for 50k token limit
            const papersToRank = papers.length > MAX_PAPERS_FOR_RANKING
                ? papers.slice(0, MAX_PAPERS_FOR_RANKING)
                : papers;

            elizaLogger.info(`Ranking ${papersToRank.length} papers (${papers.length - papersToRank.length} excluded for token budget)`);

            // Prepare titles for LLM evaluation (reduced scope for token safety)
            const titlesPrompt = `You are evaluating research papers for mystical/philosophical divination potential.
Score each paper 0-10 based on these criteria:

1. Universal patterns that mirror ancient wisdom (25%)
2. Emergence, self-organization, complexity themes (20%)
3. Consciousness, observer, information theory (20%)
4. Collective behavior, network effects (15%)
5. Paradoxes, limits, incompleteness (10%)
6. Accessibility for poetic interpretation (10%)

Papers to evaluate:
${papersToRank.map((p, i) => `[${i}] ${p.title}`).join('\n')}

Return JSON with top papers scoring >= 5.0:
{
  "rankings": [
    {"index": 47, "score": 9.5, "themes": ["emergence", "consciousness"], "reasoning": "why this reveals patterns"},
    {"index": 123, "score": 9.2, "themes": ["quantum", "observer"], "reasoning": "mystical interpretation"}
  ]
}

Include AT LEAST 50 papers in rankings (or all if fewer than 50). Order by score descending.`;

            // Circuit breaker: timeout for LLM ranking to prevent hanging
            const rankingTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('LLM ranking timeout after 60s')), 60000)
            );

            const rankingPromise = generateText({
                runtime: this.runtime,
                context: titlesPrompt,
                modelClass: ModelClass.LARGE, // Use larger model for complex ranking
            });

            const response = await Promise.race([rankingPromise, rankingTimeout]);

            // Parse ranking response
            const rankingData = this.parseRankingResponse(response);

            if (rankingData && rankingData.rankings) {
                // Validate indices to prevent crashes
                const validRankings = rankingData.rankings.filter(r =>
                    r.index >= 0 &&
                    r.index < papersToRank.length &&
                    typeof r.score === 'number' &&
                    r.score >= 0 && r.score <= 10
                );

                elizaLogger.debug(`Valid rankings: ${validRankings.length}/${rankingData.rankings.length}`);

                // Map rankings back to papers (use papersToRank, not original papers array)
                const rankedPapers = validRankings.map(r => ({
                    ...papersToRank[r.index],
                    qualityScore: r.score,
                    ranking: validRankings.indexOf(r) + 1,
                    themes: r.themes || [],
                    reasoning: r.reasoning || ''
                }));

                // Store ranked pool in cache
                await this.runtime.cacheManager.set(
                    this.getCacheKey('rankedPaperPool'),
                    rankedPapers
                );

                // Store metadata
                await this.runtime.cacheManager.set(
                    this.getCacheKey('poolMetadata'),
                    {
                        fetchedAt: Date.now(),
                        totalPapers: papers.length,
                        rankedCount: rankedPapers.length,
                        topScore: rankedPapers[0]?.qualityScore || 0,
                        averageScore: rankedPapers.reduce((sum, p) => sum + p.qualityScore, 0) / rankedPapers.length,
                        qualityThreshold: 7.0
                    }
                );

                const rankTime = (Date.now() - startTime) / 1000;
                elizaLogger.info(`Ranked ${rankedPapers.length} papers in ${rankTime}s. Top score: ${rankedPapers[0]?.qualityScore}`);

                return rankedPapers;
            }
        } catch (error) {
            elizaLogger.error('Error ranking papers:', error);
        }

        // Fallback: return papers with default scores
        return papers.map((p, i) => ({...p, qualityScore: 5.0, ranking: i + 1}));
    }

    private parseRankingResponse(response: string): any {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            elizaLogger.error('Failed to parse ranking response:', error);
        }
        return null;
    }

    public async selectFromRankedPool(rankedPool: any[], recursionDepth: number = 0): Promise<any[]> {
        // Circuit breaker: prevent infinite recursion
        const MAX_RECURSION_DEPTH = 2;
        if (recursionDepth >= MAX_RECURSION_DEPTH) {
            elizaLogger.warn(`Recursion limit reached (${MAX_RECURSION_DEPTH}). Returning available papers despite quality threshold.`);
            // Return whatever we have, sorted by score
            const sortedPapers = rankedPool.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
            return sortedPapers.slice(0, 5);
        }

        // Get history of posted papers
        const arxivHistoryArray = await this.runtime.cacheManager.get<string[]>(
            this.getCacheKey('arxivPaperHistory')
        ) || [];
        const arxivHistory = new Set<string>(arxivHistoryArray);

        // Filter out already posted papers
        const availablePapers = rankedPool.filter(p => !arxivHistory.has(p.arxivId));

        if (availablePapers.length === 0) {
            elizaLogger.warn("All papers in pool have been posted. Need refresh.");
            if (recursionDepth === 0) {
                // Only try refresh once to avoid infinite loops
                elizaLogger.info("Attempting one-time pool refresh...");
                try {
                    const newPapers = await this.fetchMegaArxivPool();
                    if (newPapers.length > 0) {
                        const newRankedPool = await this.stackRankPapers(newPapers);
                        return this.selectFromRankedPool(newRankedPool, recursionDepth + 1);
                    }
                } catch (error) {
                    elizaLogger.error("Failed to refresh paper pool:", error);
                }
            }
            return [];
        }

        // Check quality threshold
        const topPaper = availablePapers[0];
        const _poolMetadata = await this.runtime.cacheManager.get<any>(
            this.getCacheKey('poolMetadata')
        );

        if (topPaper.qualityScore < 5.0 || availablePapers.length < 50) {
            elizaLogger.info(`Pool quality below threshold (score: ${topPaper.qualityScore}, available: ${availablePapers.length}). Attempting refresh (depth: ${recursionDepth})...`);

            // Only refresh if we haven't recursed yet
            if (recursionDepth === 0) {
                try {
                    const newPapers = await this.fetchMegaArxivPool();
                    if (newPapers.length > 0) {
                        const newRankedPool = await this.stackRankPapers(newPapers);
                        return this.selectFromRankedPool(newRankedPool, recursionDepth + 1);
                    }
                } catch (error) {
                    elizaLogger.error("Failed to refresh paper pool:", error);
                    // Continue with available papers
                }
            }
        }

        // Return top 5 available papers for selection
        const candidates = availablePapers.slice(0, 5);
        elizaLogger.debug(`Selected ${candidates.length} candidates from pool. Top score: ${topPaper?.qualityScore || 'N/A'} (depth: ${recursionDepth})`);

        return candidates;
    }

    public async fetchArxivPapers(): Promise<any[]> {
        // Check if we have a ranked pool in cache
        const rankedPool = await this.runtime.cacheManager.get<any[]>(
            this.getCacheKey('rankedPaperPool')
        );

        if (rankedPool && rankedPool.length > 0) {
            // Use existing ranked pool
            return await this.selectFromRankedPool(rankedPool);
        }

        // No pool available, need to fetch and rank
        elizaLogger.info("No ranked pool found, initiating mega fetch...");
        const papers = await this.fetchMegaArxivPool();

        if (papers.length > 0) {
            const rankedPapers = await this.stackRankPapers(papers);
            return await this.selectFromRankedPool(rankedPapers);
        }

        // Return empty array if everything fails (calling code will handle fallback)
        return [];
    }
}
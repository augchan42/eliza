/**
 * Content Type Abstraction Layer
 *
 * This module provides a content-agnostic interface for the divination system,
 * allowing easy switching between different content types (research papers, news, podcasts, etc.)
 * without requiring changes to the core divination logic.
 */

import { IAgentRuntime } from "@elizaos/core";

/**
 * Generic content item interface that all content types must implement
 */
export interface ContentItem {
    /** Unique identifier for the content */
    id: string;

    /** Title or headline of the content */
    title: string;

    /** Summary or abstract of the content */
    summary: string;

    /** URL to the original content */
    link: string;

    /** Publication or creation date */
    pubDate: string;

    /** Authors, creators, or source */
    authors?: string;

    /** Category or type classification */
    category?: string;

    /** Any additional metadata specific to the content type */
    metadata?: Record<string, any>;
}

/**
 * Validates that a ContentItem has all required fields populated
 * Throws descriptive errors for missing/empty required fields to prevent DKG crashes
 */
export function validateContentItem(item: ContentItem, contentType?: string): void {
    const typeLabel = contentType || 'content item';
    const errors: string[] = [];

    // Check required string fields are not empty/whitespace-only
    if (!item.id || item.id.trim() === '') {
        errors.push(`${typeLabel} missing required field: id`);
    }

    if (!item.title || item.title.trim() === '') {
        errors.push(`${typeLabel} missing required field: title`);
    }

    if (!item.summary || item.summary.trim() === '') {
        errors.push(`${typeLabel} missing required field: summary`);
    }

    if (!item.link || item.link.trim() === '') {
        errors.push(`${typeLabel} missing required field: link`);
    }

    if (!item.pubDate || item.pubDate.trim() === '') {
        errors.push(`${typeLabel} missing required field: pubDate`);
    }

    // Validate link format (basic URL check)
    if (item.link && !item.link.startsWith('http')) {
        errors.push(`${typeLabel} has invalid link format: ${item.link}`);
    }

    // Validate pubDate format (basic ISO date check)
    if (item.pubDate && isNaN(new Date(item.pubDate).getTime())) {
        errors.push(`${typeLabel} has invalid pubDate format: ${item.pubDate}`);
    }

    if (errors.length > 0) {
        throw new Error(`ContentItem validation failed: ${errors.join(', ')}`);
    }
}

/**
 * Configuration for content type-specific behavior
 */
export interface ContentTypeConfig {
    /** Name of the content type (e.g., "research", "news", "podcast") */
    typeName: string;

    /** Plural form of the type name */
    typeNamePlural: string;

    /** Cache key prefix for deduplication */
    cacheKeyPrefix: string;

    /** Cache key for permanent history (if applicable) */
    historyKeyPrefix?: string;

    /** How to refer to items in logs (e.g., "paper", "article", "episode") */
    itemName: string;

    /** Plural form of item name */
    itemNamePlural: string;

    /** Message when no content is available */
    noContentMessage: string;

    /** Message when all content is duplicate */
    allDuplicatesMessage: string;

    /** LLM prompt template for similarity check */
    similarityPromptTemplate: (title: string, recentTitles: string[]) => string;
}

/**
 * Research paper adapter - adapts ArXiv papers to ContentItem
 */
export class ResearchPaperAdapter implements ContentItem {
    id: string;
    title: string;
    summary: string;
    link: string;
    pubDate: string;
    authors?: string;
    category?: string;
    metadata?: Record<string, any>;

    constructor(paper: any) {
        this.id = paper.arxivId || paper.id || '';
        this.title = paper.title || '';
        this.summary = paper.summary || '';
        this.link = paper.link || '';
        this.pubDate = paper.pubDate || new Date().toISOString();
        this.authors = paper.authors;
        this.category = paper.category || 'AI Research';
        this.metadata = {
            arxivId: paper.arxivId,
            qualityScore: paper.qualityScore,
            ranking: paper.ranking
        };

        // Validate the constructed ContentItem to prevent DKG crashes
        validateContentItem(this, 'research paper');
    }
}

/**
 * News article adapter - adapts news to ContentItem
 */
export class NewsArticleAdapter implements ContentItem {
    id: string;
    title: string;
    summary: string;
    link: string;
    pubDate: string;
    authors?: string;
    category?: string;
    metadata?: Record<string, any>;

    constructor(article: any) {
        this.id = article.id || article.link || '';
        this.title = article.title || '';
        this.summary = article.summary || article.description || '';
        this.link = article.link || '';
        this.pubDate = article.pubDate || new Date().toISOString();
        this.authors = article.source;
        this.category = article.category || 'News';
        this.metadata = {
            source: article.source,
            sentiment: article.sentiment
        };

        // Validate the constructed ContentItem to prevent DKG crashes
        validateContentItem(this, 'news article');
    }
}

/**
 * Content type configurations
 */
export const CONTENT_TYPE_CONFIGS: Record<string, ContentTypeConfig> = {
    research: {
        typeName: 'research',
        typeNamePlural: 'research papers',
        cacheKeyPrefix: 'lastDivinationPapers',
        historyKeyPrefix: 'arxivPaperHistory',
        itemName: 'paper',
        itemNamePlural: 'papers',
        noContentMessage: 'No research papers available',
        allDuplicatesMessage: 'All papers are duplicates of recent research',
        similarityPromptTemplate: (title, recentTitles) =>
            `Is "${title}" covering the same research as any of these recent papers?

Recent papers:
${recentTitles.map((h, i) => `${i+1}. ${h}`).join('\n')}

Respond ONLY with "YES" if covering the exact same research/findings, "NO" if different research.`
    },

    news: {
        typeName: 'news',
        typeNamePlural: 'news articles',
        cacheKeyPrefix: 'lastDivinationHeadlines',
        itemName: 'article',
        itemNamePlural: 'articles',
        noContentMessage: 'News unavailable',
        allDuplicatesMessage: 'All articles are duplicates of recent headlines',
        similarityPromptTemplate: (title, recentTitles) =>
            `Is "${title}" covering the same story as any of these recent headlines?

Recent headlines:
${recentTitles.map((h, i) => `${i+1}. ${h}`).join('\n')}

Respond ONLY with "YES" if covering the exact same story/event, "NO" if different stories.`
    },

    podcast: {
        typeName: 'podcast',
        typeNamePlural: 'podcast episodes',
        cacheKeyPrefix: 'lastDivinationEpisodes',
        itemName: 'episode',
        itemNamePlural: 'episodes',
        noContentMessage: 'No podcast episodes available',
        allDuplicatesMessage: 'All episodes have been covered recently',
        similarityPromptTemplate: (title, recentTitles) =>
            `Is "${title}" covering the same topic as any of these recent episodes?

Recent episodes:
${recentTitles.map((h, i) => `${i+1}. ${h}`).join('\n')}

Respond ONLY with "YES" if covering the exact same topic/discussion, "NO" if different.`
    }
};

/**
 * Content manager that handles content-type agnostic operations
 */
export class ContentManager {
    private config: ContentTypeConfig;
    private runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime, contentType: keyof typeof CONTENT_TYPE_CONFIGS = 'research') {
        this.runtime = runtime;
        this.config = CONTENT_TYPE_CONFIGS[contentType];
        if (!this.config) {
            throw new Error(`Unknown content type: ${contentType}`);
        }
    }

    /**
     * Get the current content type configuration
     */
    getConfig(): ContentTypeConfig {
        return this.config;
    }

    /**
     * Change the content type at runtime
     */
    setContentType(contentType: keyof typeof CONTENT_TYPE_CONFIGS) {
        this.config = CONTENT_TYPE_CONFIGS[contentType];
        if (!this.config) {
            throw new Error(`Unknown content type: ${contentType}`);
        }
    }

    /**
     * Get cache key for recent content titles
     */
    getRecentContentCacheKey(username: string): string {
        return `twitter/${username}/${this.config.cacheKeyPrefix}`;
    }

    /**
     * Get cache key for permanent history (if applicable)
     */
    getHistoryCacheKey(username: string): string | null {
        if (!this.config.historyKeyPrefix) {
            return null;
        }
        return `twitter/${username}/${this.config.historyKeyPrefix}`;
    }

    /**
     * Format log message for duplicate detection
     */
    formatDuplicateLog(item: ContentItem, matchType: 'exact' | 'similarity'): string {
        const prefix = matchType === 'exact' ? 'EXACT MATCH' : 'LLM SIMILARITY';
        return `${prefix} duplicate filtered: "${item.title}"`;
    }

    /**
     * Format log message for deduplication results
     */
    formatDeduplicationLog(uniqueCount: number, totalCount: number): string {
        return `Deduplication results: ${uniqueCount} unique ${this.config.itemNamePlural} from ${totalCount} candidates`;
    }

    /**
     * Get similarity check prompt for LLM
     */
    getSimilarityPrompt(title: string, recentTitles: string[]): string {
        return this.config.similarityPromptTemplate(title, recentTitles);
    }

    /**
     * Adapt raw content to ContentItem interface
     */
    adaptContent(rawContent: any, contentType?: string): ContentItem {
        const type = contentType || this.config.typeName;

        // Use appropriate adapter based on content type
        switch (type) {
            case 'research':
                return new ResearchPaperAdapter(rawContent);
            case 'news':
                return new NewsArticleAdapter(rawContent);
            default: {
                // Generic adapter for unknown types
                const item: ContentItem = {
                    id: rawContent.id || rawContent.link || '',
                    title: rawContent.title || '',
                    summary: rawContent.summary || rawContent.description || '',
                    link: rawContent.link || '',
                    pubDate: rawContent.pubDate || new Date().toISOString(),
                    authors: rawContent.authors || rawContent.source,
                    category: rawContent.category,
                    metadata: rawContent
                };

                // Validate the generic adapter result to prevent DKG crashes
                validateContentItem(item, type);
                return item;
            }
        }
    }

    /**
     * Adapt array of raw content to ContentItem array
     */
    adaptContentArray(rawContentArray: any[]): ContentItem[] {
        return rawContentArray.map(item => this.adaptContent(item));
    }
}
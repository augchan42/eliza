import {
    IAgentRuntime,
    ModelClass,
    elizaLogger,
    generateText,
    parseJSONObjectFromText,
} from "@elizaos/core";

export class NewsService {
    constructor(private runtime: IAgentRuntime) {}

    public async fetchGoogleNews() {
        // Try multiple RSS sources in order of preference
        const sources = [
            { url: 'https://news.google.com/rss?hl=en&gl=US&ceid=US:en', name: 'Google News' },
            { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC News' },
            { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR News' }
        ];
        
        try {
            let xmlText = null;
            
            for (const source of sources) {
                try {
                    xmlText = await this.tryFetchRSS(source.url, source.name);
                    elizaLogger.debug(`Successfully fetched from ${source.name}`);
                    break;
                } catch (error) {
                    elizaLogger.warn(`Failed to fetch from ${source.name}:`, error.message);
                    continue;
                }
            }
            
            if (!xmlText) {
                return [{ 
                    title: "All news feeds down", 
                    summary: "Multiple intelligence networks compromised. Oracle-only operation.",
                }];
            }
            elizaLogger.debug("RSS response length:", xmlText.length);
            elizaLogger.debug("RSS response preview:", xmlText.substring(0, 500));
            
            const allArticles = this.parseGoogleNewsRSS(xmlText);
            elizaLogger.debug("Parsed articles count:", allArticles.length);
            
            if (allArticles.length === 0) {
                elizaLogger.warn("No articles parsed from RSS. Raw XML length:", xmlText.length);
                return [{ 
                    title: "Signal interference detected", 
                    summary: "News streams temporarily corrupted. Relying on cached intelligence.",
                }];
            }
            
            // Step 2: LLM filters for relevant articles
            const relevantArticles = await this.filterRelevantNews(allArticles);
            
            // Step 3: LLM picks most engaging article
            const selectedArticle = await this.selectMostEngaging(relevantArticles);
            
            return [selectedArticle];
            
        } catch (error) {
            elizaLogger.error("Error in multi-stage news processing:", error);
            return [{ 
                title: "Intelligence networks down", 
                summary: "All external feeds compromised. Operating on oracle guidance only.",
            }];
        }
    }

    private async tryFetchRSS(url: string, source: string) {
        elizaLogger.debug(`Trying RSS source: ${source}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Eliza AI Agent/1.0; +https://github.com/elizaos/eliza)',
                'Accept': 'application/rss+xml, application/xml, text/xml'
            }
        });
        
        if (!response.ok) {
            throw new Error(`${source} failed: ${response.status} ${response.statusText}`);
        }
        
        return response.text();
    }
    
    private async filterRelevantNews(articles: any[]): Promise<any[]> {
        const articlesText = articles.slice(0, 20).map((article, index) => 
            `${index + 1}. ${article.title} - ${article.summary.substring(0, 100)}...`
        ).join('\n');
        
        const filterPrompt = `Analyze these current news headlines and identify the most NEWSWORTHY articles that would capture attention and generate engagement. Prioritize in this order:

1. MAJOR BREAKING NEWS: Political events, conflicts, assassinations, natural disasters, major economic events
2. VIRAL/TRENDING TOPICS: Celebrity news, internet phenomena, cultural moments people are discussing
3. TECH/AI/CONSCIOUSNESS: AI breakthroughs, quantum computing, blockchain tech advances, consciousness research

The goal is to find stories that people are actively talking about and sharing, regardless of topic. Major breaking news always takes priority over niche tech topics.

Current news headlines:
${articlesText}

Return the numbers of the most newsworthy/attention-grabbing articles (e.g., "1, 3, 7") - prioritize what's actually breaking or trending:`;

        try {
            const response = await generateText({
                runtime: this.runtime,
                context: filterPrompt,
                modelClass: ModelClass.SMALL,
            });
            
            elizaLogger.debug("LLM filter response:", response);
            
            const numbers = response.match(/\d+/g);
            if (!numbers) {
                // Fallback to first 3 articles if LLM doesn't find anything
                elizaLogger.debug("No newsworthy articles found by LLM, using fallback");
                return articles.slice(0, 3);
            }
            
            const relevantArticles = numbers
                .map(num => parseInt(num) - 1)
                .filter(index => index >= 0 && index < articles.length)
                .map(index => articles[index]);
            
            elizaLogger.debug(`LLM selected ${relevantArticles.length} newsworthy articles`);
            return relevantArticles.length > 0 ? relevantArticles : articles.slice(0, 3);
            
        } catch (error) {
            elizaLogger.error("Error in LLM filtering:", error);
            return articles.slice(0, 5);
        }
    }
    
    private async selectMostEngaging(articles: any[]): Promise<any> {
        if (articles.length === 0) {
            return { 
                title: "No articles available", 
                summary: "Feed parsing failed. Operating on cached data.",
                pubDate: new Date().toISOString()
            };
        }
        if (articles.length === 1) return articles[0];
        
        const articlesText = articles.map((article, index) => 
            `${index + 1}. ${article.title}\n   Summary: ${article.summary.substring(0, 150)}...\n   Date: ${article.pubDate}`
        ).join('\n\n');
        
        const selectionPrompt = `From these newsworthy articles, select the ONE most engaging for Pix - a digital anthropologist who interprets major events through I-Ching wisdom with Discord 3am energy.

Consider:
- NEWSWORTHINESS: Is this what people are actually talking about right now?
- BREAKING NEWS VALUE: Major events always beat niche topics
- HUMAN BEHAVIOR PATTERNS: Can this be interpreted through I-Ching/behavioral analysis?
- VIRAL POTENTIAL: Will this generate engagement and discussion?
- TEACHING OPPORTUNITY: Can we use this to educate people about pattern recognition?

Priority: Major breaking news > Viral trending topics > Tech/AI developments

Articles:
${articlesText}

Respond with JSON in this exact format:
{
  "selectedArticle": 2,
  "reasoning": "Brief explanation of why this article was selected"
}`;

        try {
            const response = await generateText({
                runtime: this.runtime,
                context: selectionPrompt,
                modelClass: ModelClass.SMALL,
            });
            
            elizaLogger.debug("LLM selection response:", response);
            
            // Try to parse structured JSON response
            try {
                const jsonResponse = parseJSONObjectFromText(response);
                if (jsonResponse && jsonResponse.selectedArticle && typeof jsonResponse.selectedArticle === 'number') {
                    const index = jsonResponse.selectedArticle - 1;
                    if (index >= 0 && index < articles.length) {
                        elizaLogger.debug(`LLM selected article (JSON format ${jsonResponse.selectedArticle}): ${articles[index].title}`);
                        elizaLogger.debug(`Selection reasoning: ${jsonResponse.reasoning}`);
                        return articles[index];
                    }
                }
            } catch (jsonError) {
                elizaLogger.debug("Failed to parse JSON response, falling back to text parsing. Error:", jsonError);
            }
            
            // Fallback: Look for the first standalone number at the beginning of response
            const firstLineMatch = response.trim().match(/^(\d+)/);
            if (firstLineMatch) {
                const selectedNumber = firstLineMatch[1];
                const index = parseInt(selectedNumber) - 1;
                if (index >= 0 && index < articles.length) {
                    elizaLogger.debug(`LLM selected article (fallback first line number ${selectedNumber}): ${articles[index].title}`);
                    return articles[index];
                }
            }
            
            // Final fallback: try to find any number
            const allNumbers = response.match(/\d+/g);
            if (allNumbers) {
                const firstNumber = allNumbers[0];
                const index = parseInt(firstNumber) - 1;
                if (index >= 0 && index < articles.length) {
                    elizaLogger.debug(`LLM selected article (fallback any number ${firstNumber}): ${articles[index].title}`);
                    return articles[index];
                }
            }
            
            // Ultimate fallback to first article
            elizaLogger.debug("Using ultimate fallback selection (first article)");
            return articles[0];
            
        } catch (error) {
            elizaLogger.error("Error in LLM selection:", error);
            return articles[0];
        }
    }
    
    private parseGoogleNewsRSS(xmlText: string) {
        const articles = [];
        
        try {
            const itemRegex = /<item>(.*?)<\/item>/gs;
            
            // Different patterns for different RSS formats
            const titlePatterns = [
                /<title><!\[CDATA\[(.*?)\]\]><\/title>/s,  // CDATA format
                /<title>(.*?)<\/title>/s                    // Simple format
            ];
            
            const descriptionPatterns = [
                /<description><!\[CDATA\[(.*?)\]\]><\/description>/s,  // CDATA format
                /<description>(.*?)<\/description>/s                    // Simple format
            ];
            
            const linkRegex = /<link>(.*?)<\/link>/s;
            const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/s;
            
            elizaLogger.debug("Starting RSS parsing, looking for <item> tags");
            const itemMatches = xmlText.match(itemRegex);
            elizaLogger.debug("Found item matches:", itemMatches ? itemMatches.length : 0);
            
            let match;
            while ((match = itemRegex.exec(xmlText)) !== null) {
                const itemXml = match[1];
                
                // Try different title patterns
                let titleMatch = null;
                for (const pattern of titlePatterns) {
                    titleMatch = pattern.exec(itemXml);
                    if (titleMatch) break;
                }
                
                // Try different description patterns
                let descriptionMatch = null;
                for (const pattern of descriptionPatterns) {
                    descriptionMatch = pattern.exec(itemXml);
                    if (descriptionMatch) break;
                }
                
                const linkMatch = linkRegex.exec(itemXml);
                const dateMatch = pubDateRegex.exec(itemXml);
                
                if (titleMatch && titleMatch[1]) {
                    const title = titleMatch[1].trim();
                    const description = descriptionMatch ? descriptionMatch[1].trim() : "";
                    const link = linkMatch ? linkMatch[1].trim() : "";
                    const pubDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString();
                    
                    // Validate required fields
                    if (!title) continue;
                    
                    // Clean up description
                    const summary = description
                        .replace(/<[^>]*>/g, "")
                        .replace(/^.*?- /, "")
                        .substring(0, 300)
                        .trim();
                    
                    articles.push({
                        title: title.replace(/ - .*$/, ""),
                        summary: summary || title,
                        link,
                        pubDate
                    });
                }
                
                if (articles.length >= 25) break; // Get enough for LLM to choose from
            }
            
        } catch (error) {
            elizaLogger.error("Error parsing Google News RSS:", error);
        }
        
        return articles;
    }
}
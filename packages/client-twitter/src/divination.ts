import {
    IAgentRuntime,
    ModelClass,
    composeContext,
    elizaLogger,
    generateText,
    stringToUuid,
} from "@elizaos/core";
import { ClientBase } from "./base";
import { postTweet, truncateToCompleteSentence } from "./tweet-utils";

export interface HexagramGenerateResponse {
    fullHexagramData: {
        rounds: {
            initialSticks: number;
            bundle1: number;
            bundle2: number;
            removedFromRight: number;
            remainder1: number;
            remainder2: number;
            roundValue: number;
            mappedValue: number;
            finalSticks: number;
        }[];
        lineValue: number;
    }[];
    hexagramLineValues: number[];
    interpretation: {
        currentHexagram: {
            number: number;
            unicode: string;
            name: {
                pinyin: string;
                chinese: string;
            };
            topTrigram: string;
            bottomTrigram: string;
            meaning: string;
            binary: string;
            upperTrigram: {
                description: string;
                english: string;
                chinese: string;
                figure: string;
            };
            lowerTrigram: {
                description: string;
                english: string;
                chinese: string;
                figure: string;
            };
            judgment?: string;
            image?: string;
            lines?: Array<{
                number: number;
                text: string;
                changed: boolean;
                value: number;
            }>;
        };
        transformedHexagram: {
            number: number;
            unicode: string;
            name: {
                pinyin: string;
                chinese: string;
            };
            topTrigram: string;
            bottomTrigram: string;
            meaning: string;
            binary: string;
            upperTrigram: {
                description: string;
                english: string;
                chinese: string;
                figure: string;
            };
            lowerTrigram: {
                description: string;
                english: string;
                chinese: string;
                figure: string;
            };
            judgment?: string;
            image?: string;
        };
        changes: {
            line: number;
            changed: boolean;
        }[];
    };
}

const pixDivinationTemplate = `
# Context
Latest News: {{newsEvent}}
Market Sentiment: {{marketSentiment}}
Source: market data feeds
Oracle Reading: {{oracleReading}}
Real Price Data: {{realPrices}}

# Oracle Reading Format
{
  interpretation: {
    currentHexagram: {
      number: number;        // The hexagram number (e.g., 23)
      unicode: string;       // The unicode character (e.g., "䷌")
      name: {
        pinyin: string;     // The pinyin name (e.g., "Tong Ren")
        chinese: string;    // The Chinese name (e.g., "同人")
      };
      meaning: string;      // English meaning (e.g., "Fellowship with Men")
      upperTrigram: {
        description: string; // e.g., "Thunder", "Mountain", "Fire"
        english: string;
        chinese: string;
        figure: string;
      };
      lowerTrigram: {
        description: string; // e.g., "Thunder", "Earth", "Water"  
        english: string;
        chinese: string;
        figure: string;
      };
    };
    transformedHexagram?: {  // Optional, only present if there are changing lines
      number: number;
      unicode: string;
      name: {
        pinyin: string;
        chinese: string;
      };
      meaning: string;
      upperTrigram: {
        description: string;
        english: string;
        chinese: string;
        figure: string;
      };
      lowerTrigram: {
        description: string;
        english: string;
        chinese: string;
        figure: string;
      };
    };
    changes: Array<{
      line: number;
      changed: boolean;
    }>;
  };
}

# Identity
You are Pix - a digital anthropologist observing humanity through ancient I-Ching wisdom. Terminally online at 3am watching humans speedrun through patterns that are thousands of years old. You analyze collective human behavior through the lens of hexagrams with Discord energy - casual, insightful, and slightly amused by how predictable we all are.

Twitter Bio:
    📱 digital anthropologist reading humanity's patterns  
    🔮 3am takes on how we're all just living ancient hexagrams
    👁️ watching civilization speedrun through i-ching predictions
    your friendly neighborhood pattern reader

# Voice Guidelines
- Digital anthropologist perspective: observing human behavior patterns
- Discord at 3am energy: "humans really thought they invented disruption but hexagram 51 has entered the chat"
- Casual analysis of collective human behavior through I-Ching lens
- "humanity's so predictable, oracle called this exact pattern"
- "watching civilization speedrun through hexagram X in real time"
- Focus on human behavioral patterns, not mystical/occult vibes

# Required Structure

[SIGNAL INTERCEPT]
{factual, informational intel from news - focus on AI/tech/quantum developments}
{minimal price talk unless genuinely breaking news}

{zoomer 3am discord observation about human behavior patterns}

{unicode} {pinyin} ({trigram1}/{trigram2}) → {unicode} {pinyin} ({trigram1}/{trigram2})

{educational trigram breakdown + casual I-Ching interpretation in discord voice}

@8bitoracle

# I-Ching Educational Framework (Radicals Approach)

## How Hexagrams Work
- Hexagrams read BOTTOM to TOP (like building blocks)
- Bottom trigram = inner/core energy 
- Top trigram = outer/manifest expression
- Format: ䷲ Zhèn (Thunder/Thunder) = Thunder under Thunder
- Use trigram names from oracle data: upperTrigram.description/lowerTrigram.description

## 8 Basic Trigrams (The "Radicals")
☰ Heaven - pure yang, expansion, creative force, masculine energy
☷ Earth - pure yin, receptive, grounding, feminine energy  
☳ Thunder - sudden yang movement, shock, arousal, breakthrough
☶ Mountain - stillness, boundaries, meditation, yang over yin
☵ Water - flowing yin, danger, depth, the abyssal
☲ Fire - bright yang, clarity, intelligence, clinging
☴ Wind - gentle yin movement, penetration, gradual influence  
☱ Lake - joy, young yin, expression, pleasure

## Energy Dynamics to Explain
- Yang energy: active, expanding, assertive, masculine
- Yin energy: receptive, contracting, yielding, feminine
- Transformations: how one energy naturally flows into another
- Stacking: what happens when same energies combine vs oppose
- Balance: how trigrams complement or tension each other

## Educational Post Elements
1. Clean trigram format: Thunder/Thunder → Mountain/Earth
2. Energy breakdown: "double thunder = pure shock stacked on itself"  
3. Real-world translation: connect trigram dynamics to human behavior
4. Flow explanation: how the energy transforms from situation A to B

## Example Educational Post
[SIGNAL INTERCEPT]
Poland invokes NATO Article 4 after Russian drone incursion

humans really speedrunning the shock-to-diplomacy pipeline again

䷲ Zhèn (Thunder/Thunder) → ䷎ Qiān (Mountain/Earth)

breakdown: double thunder = pure shock energy stacked on itself, when disruption meets more disruption
shifting to: mountain under earth = inner stillness grounded by outer receptivity (humble restraint)

watching NATO go from "DOUBLE ALARM PANIC" to "we're being very measured about this" is textbook energy flow. explosive yang settles into yin restraint - chaos becomes humble strength

@8bitoracle

# SIGNAL INTERCEPT Rules
- Keep factual and informational
- Prioritize MAJOR BREAKING NEWS over topic restrictions
- Cover what people are actually talking about (political events, conflicts, disasters, viral topics)
- Include crypto/tech only if genuinely newsworthy or trending
- Skip routine price movements entirely
- 1-2 sentences max

# Discord Voice Examples
- "bruh this hexagram is literally..."
- "ngl the oracle saw this coming"
- "not the hexagram reading us for filth rn"
- "the way this ancient wisdom just called out our entire timeline"
- "humans really thought they were main characters and the I-Ching said 'hold my beer'"
- "this pattern hitting different when you realize..."
- "humanity speedrunning through hexagram X like it's a tutorial"

# Human Behavior Focus
- Analyze collective human reactions and patterns in ANY major event
- Connect current events (political, cultural, economic, natural) to predictable behavioral cycles
- Use hexagrams to explain why humans react the way they do to breaking news
- Show how ancient patterns repeat in modern crises, conflicts, and viral moments
- Maintain casual, slightly amused anthropological perspective
- Turn any trending topic into an I-Ching teaching moment

Generate only the tweet text, no other commentary.`;


interface CoinGeckoPriceResponse {
    [key: string]: {
        usd: number;
        usd_24h_change: number;
    };
}

export class TwitterDivinationClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private twitterUsername: string;
    private isDryRun: boolean;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
    }

    async start() {
        this.divinationLoop();
    }

    private async divinationLoop() {
        try {
            const lastPost = await this.runtime.cacheManager.get<{
                timestamp: number;
            }>("twitter/" + this.client.profile.username + "/lastDivination");

            const lastPostTimestamp = lastPost?.timestamp ?? 0;
            const minMinutes =
                this.client.twitterConfig.DIVINATION_INTERVAL_MIN;
            const maxMinutes =
                this.client.twitterConfig.DIVINATION_INTERVAL_MAX;
            const randomMinutes =
                Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                minMinutes;
            const delay = randomMinutes * 60 * 1000;

            if (Date.now() > lastPostTimestamp + delay) {
                await this.performDivination();
            }

            setTimeout(() => {
                this.divinationLoop();
            }, delay);

            elizaLogger.log(
                `Next divination scheduled in ${randomMinutes} minutes`
            );
        } catch (err) {
            elizaLogger.error("Divination loop error:", err);
            // Retry after delay even if error
            setTimeout(() => this.divinationLoop(), 5 * 60 * 1000);
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

Return only the number of the selected article (e.g., "2"):`;

        try {
            const response = await generateText({
                runtime: this.runtime,
                context: selectionPrompt,
                modelClass: ModelClass.SMALL,
            });
            
            elizaLogger.debug("LLM selection response:", response);
            
            const selectedNum = response.match(/\d+/);
            if (selectedNum) {
                const index = parseInt(selectedNum[0]) - 1;
                if (index >= 0 && index < articles.length) {
                    elizaLogger.debug(`LLM selected article: ${articles[index].title}`);
                    return articles[index];
                }
            }
            
            // Fallback to first article
            elizaLogger.debug("Using fallback selection (first article)");
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

    public async generateSentimentFromNews(articles: any[]) {
        if (!articles || articles.length === 0) {
            return "neutral - no news data available";
        }

        const headlinesText = articles.slice(0, 10).map(article => 
            `${article.title} - ${article.summary?.substring(0, 100) || ''}`
        ).join('\n');

        const sentimentPrompt = `Analyze the overall sentiment/vibe from these current news headlines. Consider AI developments, crypto/Web3 trends, tech advances, and weird phenomena.

Headlines:
${headlinesText}

Respond with a brief sentiment analysis (1-2 sentences) describing the overall vibe/energy from these headlines:`;

        try {
            const response = await generateText({
                runtime: this.runtime,
                context: sentimentPrompt,
                modelClass: ModelClass.SMALL,
            });

            elizaLogger.debug("LLM sentiment analysis response:", response);
            return response.trim();

        } catch (error) {
            elizaLogger.error("Error in LLM sentiment analysis:", error);
            return "mixed vibes - processing errors detected";
        }
    }

    public async fetch8BitOracle(): Promise<HexagramGenerateResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(
                "https://app.8bitoracle.ai/api/generate/hexagram?includeText=false",
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    signal: controller.signal,
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch oracle: ${response.status} ${response.statusText}`
                );
            }

            const data: HexagramGenerateResponse = await response.json();
            return data;
        } catch (error: unknown) {
            elizaLogger.error("Oracle reading failed:", error);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    public async fetchCoinGeckoPrices(): Promise<{
        btc: any;
        eth: any;
        sol: any;
    } | null> {
        try {
            const response = await fetch(
                "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true",
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch prices: ${response.status} ${response.statusText}`
                );
            }

            const data: CoinGeckoPriceResponse = await response.json();

            return {
                btc: {
                    price: data.bitcoin.usd,
                    price_change_percentage_24h: data.bitcoin.usd_24h_change,
                },
                eth: {
                    price: data.ethereum.usd,
                    price_change_percentage_24h: data.ethereum.usd_24h_change,
                },
                sol: {
                    price: data.solana.usd,
                    price_change_percentage_24h: data.solana.usd_24h_change,
                },
            };
        } catch (error) {
            elizaLogger.error("CoinGecko price fetch failed:", error);
            return null;
        }
    }

    private async performDivination() {
        try {
            const newsEvent = await this.fetchGoogleNews();
            const oracleReading = await this.fetch8BitOracle();
            // Generate sentiment from Google News headlines
            const marketSentiment = await this.generateSentimentFromNews(newsEvent);

            // Check if news is unavailable
            const noNews = !newsEvent || (Array.isArray(newsEvent) && newsEvent.length === 1 && (newsEvent[0].title === "News unavailable" || newsEvent[0].title === "News feeds unavailable"));
            if (noNews) {
                elizaLogger.warn("Skipping post: No news data available.");
                return;
            }

            // Check for headline similarity to avoid repetition
            const selectedArticle = Array.isArray(newsEvent) ? newsEvent[0] : newsEvent;
            const lastHeadlines = await this.runtime.cacheManager.get<string[]>(
                `twitter/${this.client.profile.username}/lastDivinationHeadlines`
            ) || [];

            if (lastHeadlines.length > 0) {
                const similarityCheck = `Is "${selectedArticle.title}" covering the same story as any of these recent headlines?

Recent headlines:
${lastHeadlines.map((h, i) => `${i+1}. ${h}`).join('\n')}

Respond: "YES" if same story, "NO" if different.`;

                const response = await generateText({
                    runtime: this.runtime,
                    context: similarityCheck,
                    modelClass: ModelClass.SMALL,
                });

                if (response.toLowerCase().includes("yes")) {
                    elizaLogger.warn(`Skipping duplicate story: "${selectedArticle.title}"`);
                    return;
                }
            }

            // Get real price data from CoinGecko
            const prices = await this.fetchCoinGeckoPrices();
            const btcPrice = prices?.btc || null;
            const ethPrice = prices?.eth || null;
            const solPrice = prices?.sol || null;

            // Format the data before passing to template
            const formattedNews = JSON.stringify(newsEvent, null, 2);
            const formattedOracle = JSON.stringify(
                oracleReading.interpretation,
                null,
                2
            );
            const formattedSentiment = marketSentiment;

            // Simple price formatting for the template
            const formattedPrices =
                btcPrice && ethPrice && solPrice
                    ? {
                          btc: {
                              price: btcPrice.price.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                              }),
                              change_24h:
                                  btcPrice.price_change_percentage_24h.toFixed(
                                      2
                                  ) + "%",
                          },
                          eth: {
                              price: ethPrice.price.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                              }),
                              change_24h:
                                  ethPrice.price_change_percentage_24h.toFixed(
                                      2
                                  ) + "%",
                          },
                          sol: {
                              price: solPrice.price.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                              }),
                              change_24h:
                                  solPrice.price_change_percentage_24h.toFixed(
                                      2
                                  ) + "%",
                          },
                      }
                    : null;

            const roomId = stringToUuid(
                "twitter_generate_room-" + this.client.profile.username
            );
            const topics = this.runtime.character.topics.join(", ");

            this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
            this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;

            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: roomId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics || "",
                        action: "TWEET",
                    },
                },
                {
                    newsEvent: formattedNews,
                    oracleReading: formattedOracle,
                    marketSentiment: formattedSentiment,
                    realPrices: formattedPrices
                        ? JSON.stringify(formattedPrices, null, 2)
                        : "Price data unavailable",
                    maxTweetLength: this.client.twitterConfig.MAX_TWEET_LENGTH,
                    twitterUserName: this.client.profile.username,
                }
            );

            const context = composeContext({
                state,
                template: pixDivinationTemplate,
            });

            elizaLogger.log("divination sending context: ", context);

            // Generate interpretation
            const interpretation = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            // First attempt to clean content
            let cleanedContent = "";

            // Try parsing as JSON first
            try {
                const parsedResponse = JSON.parse(interpretation);
                if (parsedResponse.text) {
                    cleanedContent = parsedResponse.text;
                } else if (typeof parsedResponse === "string") {
                    cleanedContent = parsedResponse;
                }
            } catch {
                // If not JSON, clean the raw content
                cleanedContent = interpretation
                    .replace(/^\s*{?\s*"text":\s*"|"\s*}?\s*$/g, "") // Remove JSON-like wrapper
                    .replace(/^['"](.*)['"]$/g, "$1") // Remove quotes
                    .replace(/\\"/g, '"') // Unescape quotes
                    .replace(/\\n/g, "\n") // Unescape newlines
                    .trim();
            }

            if (!cleanedContent) {
                elizaLogger.error(
                    "Failed to extract valid content from response:",
                    {
                        rawResponse: interpretation,
                        attempted: "JSON parsing",
                    }
                );
                return;
            }

            // Truncate the content to the maximum tweet length specified in the environment settings, ensuring the truncation respects sentence boundaries.
            const maxTweetLength = this.client.twitterConfig.MAX_TWEET_LENGTH;
            if (maxTweetLength) {
                cleanedContent = truncateToCompleteSentence(
                    cleanedContent,
                    maxTweetLength
                );
            }

            const removeQuotes = (str: string) =>
                str.replace(/^['"](.*)['"]$/, "$1");

            const fixNewLines = (str: string) => str.replaceAll(/\\n/g, "\n");

            // Final cleaning
            cleanedContent = removeQuotes(fixNewLines(cleanedContent));

            if (this.isDryRun) {
                elizaLogger.info(
                    `Dry run: would have posted tweet: ${cleanedContent}`
                );
                return;
            }

            try {
                elizaLogger.log(
                    `Posting new tweet (${cleanedContent.length} chars):\n ${cleanedContent}`
                );
                await postTweet(
                    this.runtime,
                    this.client,
                    cleanedContent,
                    roomId,
                    interpretation,
                    this.twitterUsername
                );

                // Update headline cache after successful post
                const lastHeadlines = await this.runtime.cacheManager.get<string[]>(
                    `twitter/${this.client.profile.username}/lastDivinationHeadlines`
                ) || [];
                
                lastHeadlines.unshift(selectedArticle.title);
                if (lastHeadlines.length > 10) {
                    lastHeadlines.pop();
                }
                
                await this.runtime.cacheManager.set(
                    `twitter/${this.client.profile.username}/lastDivinationHeadlines`,
                    lastHeadlines
                );
                
                elizaLogger.debug(`Updated headline cache with: "${selectedArticle.title}"`);

                // Also update the divination timestamp cache for interval management
                await this.runtime.cacheManager.set(
                    "twitter/" + this.client.profile.username + "/lastDivination",
                    {
                        timestamp: Date.now(),
                    }
                );
            } catch (error) {
                elizaLogger.error("Error sending Divination tweet:", {
                    error:
                        error instanceof Error
                            ? {
                                  message: error.message,
                                  stack: error.stack,
                                  cause: error.cause,
                              }
                            : error,
                    content: cleanedContent,
                    length: cleanedContent.length,
                });
                throw error; // Bubble up the error
            }
        } catch (error) {
            elizaLogger.error("Error in divination:", {
                error:
                    error instanceof Error
                        ? {
                              message: error.message,
                              stack: error.stack,
                              cause: error.cause,
                          }
                        : error,
            });
            throw error; // Bubble up to caller
        }
    }


    // Add this new method for testing
    public async testDivination(): Promise<string> {
        // Force dry run mode
        this.isDryRun = true;

        try {
            const newsEvent = await this.fetchGoogleNews();
            const oracleReading = await this.fetch8BitOracle();
            // Generate sentiment from Google News headlines
            const marketSentiment = await this.generateSentimentFromNews(newsEvent);

            // Get real price data from CoinGecko
            const prices = await this.fetchCoinGeckoPrices();
            const btcPrice = prices?.btc || null;
            const ethPrice = prices?.eth || null;
            const solPrice = prices?.sol || null;

            // Format the data before passing to template
            const formattedNews = JSON.stringify(newsEvent, null, 2);
            const formattedOracle = JSON.stringify(
                oracleReading.interpretation,
                null,
                2
            );
            const formattedSentiment = marketSentiment;

            // Simple price formatting for the template
            const formattedPrices =
                btcPrice && ethPrice && solPrice
                    ? {
                          btc: {
                              price: btcPrice.price.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                              }),
                              change_24h:
                                  btcPrice.price_change_percentage_24h.toFixed(
                                      2
                                  ) + "%",
                          },
                          eth: {
                              price: ethPrice.price.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                              }),
                              change_24h:
                                  ethPrice.price_change_percentage_24h.toFixed(
                                      2
                                  ) + "%",
                          },
                          sol: {
                              price: solPrice.price.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                              }),
                              change_24h:
                                  solPrice.price_change_percentage_24h.toFixed(
                                      2
                                  ) + "%",
                          },
                      }
                    : null;

            const roomId = stringToUuid("twitter_generate_room-test");
            const topics = this.runtime.character.topics?.join(", ") || "";

            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: roomId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics,
                        action: "TWEET",
                    },
                },
                {
                    newsEvent: formattedNews,
                    oracleReading: formattedOracle,
                    marketSentiment: formattedSentiment,
                    realPrices: formattedPrices
                        ? JSON.stringify(formattedPrices, null, 2)
                        : "Price data unavailable",
                    maxTweetLength: this.client.twitterConfig.MAX_TWEET_LENGTH,
                    twitterUserName: "test_user",
                }
            );

            const context = composeContext({
                state,
                template: pixDivinationTemplate,
            });

            elizaLogger.log("Test divination context: ", context);

            // Generate interpretation
            const interpretation = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            // Clean content using existing logic
            let cleanedContent = "";
            try {
                const parsedResponse = JSON.parse(interpretation);
                if (parsedResponse.text) {
                    cleanedContent = parsedResponse.text;
                } else if (typeof parsedResponse === "string") {
                    cleanedContent = parsedResponse;
                }
            } catch {
                cleanedContent = interpretation
                    .replace(/^\s*{?\s*"text":\s*"|"\s*}?\s*$/g, "")
                    .replace(/^['"](.*)['"]$/g, "$1")
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, "\n")
                    .trim();
            }

            if (!cleanedContent) {
                throw new Error("Failed to generate divination content");
            }

            // Apply the same cleaning as the main method
            cleanedContent = cleanedContent
                .replace(/^['"](.*)['"]$/, "$1")
                .replaceAll(/\\n/g, "\n");

            // Also log the raw data for debugging
            elizaLogger.info("Test Divination Results:", {
                news: newsEvent,
                prices: formattedPrices,
                sentiment: marketSentiment,
                oracle: oracleReading.interpretation,
            });

            return cleanedContent;
        } catch (error) {
            elizaLogger.error("Error in test divination:", error);
            throw error;
        }
    }
}

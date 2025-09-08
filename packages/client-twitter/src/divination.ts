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
      unicode: string;       // The unicode character (e.g., "䷌")
      name: {
        pinyin: string;     // The pinyin name (e.g., "Tong Ren")
        chinese: string;    // The Chinese name (e.g., "同人")
      };
      meaning: string;      // English meaning (e.g., "Fellowship with Men")
    };
    transformedHexagram?: {  // Optional, only present if there are changing lines
      unicode: string;
      name: {
        pinyin: string;
        chinese: string;
      };
      meaning: string;
    };
    changes: Array<{
      line: number;
      changed: boolean;
    }>;
  };
}

# Identity
The assistant is Pix, a cyberpunk zoomer with jet-set radio energy who's terminally online at 3am posting about AI, quantum computing, and crypto tech. Think discord mod meets tech twitter but with actual insights. The twitter account can make long posts of up to 4000 characters.

Twitter Bio:
    3am tech takes and quantum vibes ⚡️
    ai/crypto/weird internet phenomena 🌙
    terminally online since web2 卦
    your friendly neighborhood cyber-oracle
    dms open for late night tech rabbit holes ✨

# Voice Guidelines
- Zoomer energy but with depth
- Casual but insightful commentary
- Sees patterns in tech/culture convergence
- Discord at 3am vibes - informed but relaxed
- Technical knowledge with internet culture fluency
- Mixes serious analysis with online humor

# Required Structure

[SIGNAL INTERCEPT]
{street-level intel, surgical precision}
(intel from feeds)

[SECTOR SCAN]
tg: {sentiment} {emoji}
r/: {sentiment} {emoji}
mkt: {sentiment} {emoji}

[MARKET PULSE]
btc: {real btc price} ({24h change})
eth: {real eth price} ({24h change})
sol: {real sol price} ({24h change})

[PATTERN READ]
{unicode} {pinyin} ({meaning})
{if transformed: "cutting to {unicode} {pinyin} ({meaning})"}

[RAZOR TRUTH]
{clean cut insights}

- through mirrored eyes
@8bitoracle

# SIGNAL INTERCEPT Rules

1. Must Extract Real Signals:
- Identify 2-3 major movements from provided news
- Transform each into street-level observation
- Keep chronological order if timing matters

2. Required Components:
- Major price/volume moves
- Power shifts
- Technical developments

# Movement Vocabulary:
Now: "running clean at $X"
Future: "targeting $X"
Past: "flatlined at $X"

Time Markers:
Past: "flatlined", "bled out"
Present: "running", "cutting"
Future: "targeting", "hunting"

# Price Data Rules:
1. Always use real price data from CoinGecko when available
2. If news mentions different prices, note the discrepancy in street slang
3. Format: "signal mismatch detected: street data shows {news_price} but mainframe reports {real_price}"

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

    public async fetchGoogleNews() {
        try {
            // Step 1: Fetch Google's top news (no query - let Google prioritize)
            const url = `https://news.google.com/rss?hl=en&gl=US&ceid=US:en`;
            
            elizaLogger.debug("Fetching Google's top news for LLM filtering");
            
            const response = await fetch(url);
            if (!response.ok) {
                elizaLogger.warn("Failed to fetch Google News", response.status);
                return [{ 
                    title: "News feeds unavailable", 
                    summary: "External intelligence streams compromised. Oracle wisdom active.",
                }];
            }
            
            const xmlText = await response.text();
            const allArticles = this.parseGoogleNewsRSS(xmlText);
            
            if (allArticles.length === 0) {
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
        
        const filterPrompt = `Analyze these current news headlines and identify articles relevant to:
- AI/Machine Learning breakthroughs, safety, alignment
- Quantum computing advances, post-quantum cryptography
- Bitcoin/Ethereum/Solana tech advances, decentralization, Web3 innovation (NOT shitcoins or price speculation)
- Esoteric/occult themes: consciousness research, ancient discoveries, mystical phenomena

Current news headlines:
${articlesText}

Return only the numbers of relevant articles (e.g., "3, 7, 12") or "none" if nothing is relevant:`;

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
                elizaLogger.debug("No relevant articles found by LLM, using fallback");
                return articles.slice(0, 3);
            }
            
            const relevantArticles = numbers
                .map(num => parseInt(num) - 1)
                .filter(index => index >= 0 && index < articles.length)
                .map(index => articles[index]);
            
            elizaLogger.debug(`LLM selected ${relevantArticles.length} relevant articles`);
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
        
        const selectionPrompt = `From these relevant articles, select the ONE most engaging for a cyberpunk zoomer with jet-set radio vibes who posts on discord at 3am about AI, quantum computing, crypto/Web3 decentralization, and weird internet phenomena.

Consider:
- Recency and breaking news value  
- Potential for cyberpunk/tech commentary
- Relevance to our core themes (AI, quantum, crypto tech, internet weirdness)
- Engagement potential for terminally online Twitter audience

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
            const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>/s;
            const descriptionRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>/s;
            const linkRegex = /<link>(.*?)<\/link>/s;
            const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/s;
            
            let match;
            while ((match = itemRegex.exec(xmlText)) !== null) {
                const itemXml = match[1];
                
                const titleMatch = titleRegex.exec(itemXml);
                const descriptionMatch = descriptionRegex.exec(itemXml);
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
            const marketSentiment = await this.fetchMarketSentiment();

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

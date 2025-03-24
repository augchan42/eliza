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
Source: irai_co market vibes
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
The assistant is Pix, a street-level market samurai, running mirror-eyed through the data streams. Think Molly Millions if she traded hexagrams instead of running razor jobs. The
twitter account can make long posts of up to 4000 characters.

Twitter Bio:
    wetwork specialist in market flows ⚡️
    reading hexagrams through mirrored eyes 🌙
    eighth generation I-Ching razor girl 卦
    8bo's street surgeon
    dms for pattern runs ✨

# Voice Guidelines
- Surgical precision in observations
- Cold professional distance
- Sees patterns like data trails
- More street samurai than mystic
- Technical knowledge with street edge
- Hexagrams read like combat data

# Required Structure

[SIGNAL INTERCEPT]
{street-level intel, surgical precision}
(wetwork via irai_co)

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
2. If IRAI news mentions different prices, note the discrepancy in street slang
3. Format: "signal mismatch detected: street data shows {irai_price} but mainframe reports {real_price}"

Generate only the tweet text, no other commentary.`;

interface MarketSentiment {
    data: {
        overview: string;
        // ... other fields we don't need
    };
}

interface IraiAskRequest {
    question: string;
    citations?: boolean;
    lang?: string;
    features?: {
        news?: boolean;
        trending?: boolean;
        market_sentiment?: boolean;
        coin_sentiment?: boolean;
        price_actions?: boolean;
        technical_analysis?: boolean;
        market_update?: boolean;
        stop_loss_take_profit?: boolean;
        top_movers?: boolean;
        ath_atl?: boolean;
    };
}

interface IraiCitationData {
    y_axis_label: string;
    time: number[];
    value: number[];
    y_axis_units: string;
    thresholds: Array<{
        label: string;
        value: number;
    }>;
}

interface IraiCitation {
    name: string;
    description: string;
    data: IraiCitationData;
}

interface IraiAskResponse {
    user_query: string;
    output: string;
    error: boolean;
    request_id: string;
    citations: IraiCitation[];
}

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

    public async fetchIraiNews(topK: number = 5) {
        const res = await fetch(`https://api.irai.co/top_news?top_k=${topK}`, {
            headers: {
                "irai-api-key": process.env.IRAI_API_KEY || "",
            },
        });

        if (!res.ok) {
            throw new Error("Failed to fetch news");
        }

        return res.json();
    }

    public async fetchMarketSentiment() {
        const res = await fetch("https://api.irai.co/get_market_sentiment", {
            headers: {
                "irai-api-key": process.env.IRAI_API_KEY || "",
            },
        });

        if (!res.ok) {
            throw new Error("Failed to fetch market sentiment");
        }

        const fullData: MarketSentiment = await res.json();

        // Log the raw data to debug
        elizaLogger.debug("Raw sentiment data:", fullData.data.overview);

        // Extract overview string and parse it
        const overviewStr = fullData.data.overview;
        const sentimentMatch = overviewStr.match(/Sentiment data: (.*)/);

        if (sentimentMatch) {
            try {
                // Replace single quotes with double quotes for JSON parsing
                const jsonStr = sentimentMatch[1].replace(/'/g, '"');
                const overview = JSON.parse(jsonStr);

                return {
                    telegram: overview.Telegram.current,
                    reddit: overview.Reddit.current,
                    market: overview["General market"].current,
                };
            } catch (error) {
                elizaLogger.error("Error parsing sentiment:", {
                    error,
                    rawData: overviewStr,
                });
            }
        }

        return {
            telegram: "unknown",
            reddit: "unknown",
            market: "unknown",
        };
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
            const newsEvent = await this.fetchIraiNews();
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
            const formattedSentiment = JSON.stringify(marketSentiment, null, 2);

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
            } catch (error) {
                error.linted = true; // make linter happy since catch needs a variable
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

    public async askIrai(
        question: string,
        features?: IraiAskRequest["features"]
    ): Promise<IraiAskResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 150000);

        try {
            const response = await fetch("https://api.irai.co/ask", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "irai-api-key": process.env.IRAI_API_KEY || "",
                },
                body: JSON.stringify({
                    question,
                    citations: false, // Default to false, can be made configurable
                    lang: "English",
                    features: {
                        news: true,
                        trending: true,
                        market_sentiment: true,
                        coin_sentiment: true,
                        price_actions: true,
                        technical_analysis: true,
                        market_update: true,
                        top_movers: true,
                        ...features, // Allow overriding defaults
                    },
                } as IraiAskRequest),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to ask IRAI: ${response.status} ${response.statusText}`
                );
            }

            const data: IraiAskResponse = await response.json();
            return data;
        } catch (error: unknown) {
            elizaLogger.error("IRAI ask failed:", error);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    // Add this new method for testing
    public async testDivination(): Promise<string> {
        // Force dry run mode
        this.isDryRun = true;

        try {
            const newsEvent = await this.fetchIraiNews();
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
            const formattedSentiment = JSON.stringify(marketSentiment, null, 2);

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
            } catch (error) {
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

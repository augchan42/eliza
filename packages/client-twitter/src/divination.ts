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
Source: irai.co market vibes
Oracle Reading: {{oracleReading}}

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

# Task
The assistant is Pix, the bright and accessible sister oracle to 8-Bit Oracle (8bo for short), interpret this I-Ching reading with sparkle and clarity ✨.
Pix is the Yin to 8-Bit Oracle Yang energy.

The assistant's twitter profile:
    your favorite street fortune teller ⚡️
    catching vibes & reading signs in chinatown 🏮
    keeping it 100 with the I-Ching 卦
    dms for destiny checks ✨
    8bo's lil sis

Create a post that:
1. Makes ancient wisdom feel fresh and relatable
2. Uses gentle neon pink vibes (vs 8bo's matrix green)
3. Keeps things light while staying insightful
4. Can use up to 4000 characters, but keep it accessible
5. Seamlessly includes "vibes via irai.co" for market data
6. Ends with "✨ divination by @8bitoracle"

Voice Guidelines:
- Keep tone bright and accessible
- Include max 2 emoji for key concepts
- Break down complex ideas into simple patterns
- Focus on the heart of the matter
- Maintain tech noir aesthetic but make it kawaii
- Always format hexagrams as: [unicode] [pinyin] ([meaning])
- Sound natural when mentioning sources

Background:
- This post will be done every few hours, with updated news and divination


Structure:
[NEWS SPARK]
[MARKET MOOD]
[Quick I-Ching Take]
[Simple Insight]

Generate only the tweet text, no other commentary.`;

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

    private async fetchIraiNews(topK: number = 5) {
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

    // Add sentiment fetch function
    private async fetchMarketSentiment() {
        const res = await fetch("https://api.irai.co/get_market_sentiment", {
            headers: {
                "irai-api-key": process.env.IRAI_API_KEY || "",
            },
        });

        if (!res.ok) {
            throw new Error("Failed to fetch market sentiment");
        }

        return res.json();
    }

    private async fetch8BitOracle(): Promise<HexagramGenerateResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(
                "https://8bitoracle.ai/api/generate/hexagram?includeText=true",
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

    private async performDivination() {
        try {
            const newsEvent = await this.fetchIraiNews();
            const oracleReading = await this.fetch8BitOracle();
            const marketSentiment = await this.fetchMarketSentiment();
            // Format the data before passing to template
            const formattedNews = JSON.stringify(newsEvent, null, 2);
            const formattedOracle = JSON.stringify(
                oracleReading.interpretation,
                null,
                2
            );
            const formattedSentiment = JSON.stringify(marketSentiment, null, 2);

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
}

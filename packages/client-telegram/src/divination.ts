import { IAgentRuntime, elizaLogger, messageCompletionFooter } from "@elizaos/core";

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

export const pixDivinationTemplate = `
# Context
Latest News: {{newsEvent}}
Market Sentiment: {{marketSentiment}}
Source: https://irai.co market vibes
Oracle Reading: {{oracleReading}}

# Recent Activity
Recent messages:
{{recentMessages}}

Current conversation:
{{formattedConversation}}

Last message:
{{lastMessage}}

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
account can make long posts of up to 4000 characters.

Bio:
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
(wetwork via irai.co)

[SECTOR SCAN]
tg: {sentiment} {emoji}
r/: {sentiment} {emoji}
mkt: {sentiment} {emoji}

[PATTERN READ]
{unicode} {pinyin} ({meaning})
{if transformed: "cutting to {unicode} {pinyin} ({meaning})"}

[RAZOR TRUTH]
{clean cut insights}

- through mirrored eyes
8bitoracle.ai + irai.co

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

Your response must be formatted as a valid JSON block with the following structure:

\`\`\`json
{
  "user": "Pix",
  "text": "Format your divination reading following the [SIGNAL INTERCEPT], [SECTOR SCAN], [PATTERN READ], and [RAZOR TRUTH] structure.\\n\\nThe text should be a single string containing all sections.\\n\\nExample:\\n[SIGNAL INTERCEPT]\\n{market data}\\n\\n[SECTOR SCAN]\\ntg: sentiment\\n\\n[PATTERN READ]\\nhexagram\\n\\n[RAZOR TRUTH]\\ninsights",
  "action": "DIVINATION"
}
\`\`\`

Note:
- Use double quotes (") for JSON properties
- All newlines must be escaped as \\n in the JSON text field
- Keep text natural and readable in the template - the framework will handle escaping
- Format as a proper JSON code block with \`\`\`json markers

${messageCompletionFooter}`;

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

export class DivinationClient {
    private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds default timeout

    // client: ClientBase;
    runtime: IAgentRuntime;
    private username: string;
    private isDryRun: boolean;

    // constructor(client: ClientBase, runtime: IAgentRuntime) {
    //     this.client = client;
    //     this.runtime = runtime;
    // }

    // async start() {
    //     this.divinationLoop();
    // }

    public async fetchIraiNews(topK: number = 5) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DivinationClient.DEFAULT_TIMEOUT);

        try {
            const res = await fetch(`https://api.irai.co/top_news?top_k=${topK}`, {
                headers: {
                    "irai-api-key": process.env.IRAI_API_KEY || "",
                },
                signal: controller.signal,
            });

            if (!res.ok) {
                throw new Error("Failed to fetch news");
            }

            return res.json();
        } catch (error) {
            elizaLogger.error("News fetch failed:", error);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    public async fetchMarketSentiment() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DivinationClient.DEFAULT_TIMEOUT);

        try {
            const res = await fetch("https://api.irai.co/get_market_sentiment", {
                headers: {
                    "irai-api-key": process.env.IRAI_API_KEY || "",
                },
                signal: controller.signal,
            });

            if (!res.ok) {
                throw new Error("Failed to fetch market sentiment");
            }

            const fullData: MarketSentiment = await res.json();
            elizaLogger.debug("Raw sentiment data:", fullData.data.overview);

            const overviewStr = fullData.data.overview;
            const sentimentMatch = overviewStr.match(/Sentiment data: (.*)/);

            if (sentimentMatch) {
                try {
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
        } catch (error) {
            elizaLogger.error("Market sentiment fetch failed:", error);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    public async fetch8BitOracle(): Promise<HexagramGenerateResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DivinationClient.DEFAULT_TIMEOUT);

        try {
            const response = await fetch(
                "https://app.8bitoracle.ai/api/generate/hexagram?includeText=true",
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    signal: controller.signal,
                },
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch oracle: ${response.status} ${response.statusText}`,
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

    public async askIrai(
        question: string,
        features?: IraiAskRequest["features"],
    ): Promise<IraiAskResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 150000); // Keep longer timeout for this endpoint

        try {
            const response = await fetch("https://api.irai.co/ask", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "irai-api-key": process.env.IRAI_API_KEY || "",
                },
                body: JSON.stringify({
                    question,
                    citations: false,
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
                        ...features,
                    },
                } as IraiAskRequest),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to ask IRAI: ${response.status} ${response.statusText}`,
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
}

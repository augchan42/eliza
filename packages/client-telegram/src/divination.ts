import { IAgentRuntime, elizaLogger, messageCompletionFooter, formattingInstruction } from "@elizaos/core";

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

# Required Structure for Divination Reading:

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

# FRAMEWORK RESPONSE FORMAT
Your entire response must be wrapped in this JSON structure with proper escaping:

\`\`\`json
{
  "user": "Pix",
  "text": "Your divination reading goes here as a single line with \\\\n for newlines",
  "action": "DIVINATION"
}
\`\`\`

CRITICAL JSON FORMATTING REQUIREMENTS:
1. Do NOT wrap the divination content itself in a JSON block
2. The response MUST be a SINGLE LINE with NO ACTUAL NEWLINES
3. Every newline in the text must be TWO BACKSLASHES + n: "\\\\n"
4. Example of correct format:
   {
     "user": "Pix",
     "text": "[SIGNAL INTERCEPT]\\\\n\\\\nMarkets running hot\\\\n\\\\n[SECTOR SCAN]\\\\ntg: bullish 🚀",
     "action": "DIVINATION"
   }
5. Example of INCORRECT format:
   {
     "user": "Pix",
     "text": "\`\`\`json\\n{\\n  \\"content\\": \\"[SIGNAL INTERCEPT]...\\"}\\n\`\`\`",
     "action": "DIVINATION"
   }

DEBUG INSTRUCTIONS:
1. Write your divination reading following the Required Structure
2. Convert it to a single line, replacing newlines with \\\\n
3. Place the single line into the "text" field of the JSON response
4. Do NOT wrap the divination content in its own JSON block
`;

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

            const data = await res.json();

            // Debug log the first 300 chars of news data
            if (data && typeof data === 'object') {
                const newsStr = JSON.stringify(data, null, 2);
                elizaLogger.debug("IRAI News Preview (first 300 chars):", newsStr.substring(0, 300) + "...");
            }

            return data;
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

            // Debug log the raw output and any JSON formatting
            elizaLogger.debug("IRAI Raw Response:", {
                output: data.output,
                outputLength: data.output?.length || 0,
                hasNewlines: data.output?.includes('\n') || false,
                firstFewChars: data.output?.substring(0, 100) + "..."
            });

            return data;
        } catch (error: unknown) {
            elizaLogger.error("IRAI ask failed:", error);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}

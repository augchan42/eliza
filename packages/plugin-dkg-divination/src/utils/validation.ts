import { z } from "zod";

// Hexagram computation round structure
const HexagramRound = z.object({
    initialSticks: z.number().int(),
    bundle1: z.number().int(),
    bundle2: z.number().int(),
    removedFromRight: z.number().int(),
    remainder1: z.number().int(),
    remainder2: z.number().int(),
    roundValue: z.number().int(),
    mappedValue: z.number().int(),
    finalSticks: z.number().int(),
});

// Trigram structure
const Trigram = z.object({
    description: z.string(),
    english: z.string(),
    chinese: z.string(),
    figure: z.string(),
});

// Line structure
const HexagramLine = z.object({
    number: z.number().int().min(1).max(6),
    text: z.string(),
    changed: z.boolean(),
    value: z
        .number()
        .int()
        .refine((val) => [6, 7, 8, 9].includes(val)),
});

// Base hexagram structure (shared between current and transformed)
const BaseHexagram = z.object({
    number: z.number().int().min(1).max(64),
    unicode: z.string(),
    name: z.object({
        pinyin: z.string(),
        chinese: z.string(),
    }),
    topTrigram: z.string(),
    bottomTrigram: z.string(),
    meaning: z.string(),
    binary: z.string().regex(/^[01]{6}$/),
    upperTrigram: Trigram,
    lowerTrigram: Trigram,
    judgment: z.string(),
    image: z.string(),
});

// Current hexagram includes lines
const CurrentHexagram = BaseHexagram.extend({
    lines: z.array(HexagramLine).length(6),
});

// Complete hexagram data structure
const HexagramData = z.object({
    fullHexagramData: z
        .array(
            z.object({
                rounds: z.array(HexagramRound).length(3),
                lineValue: z
                    .number()
                    .int()
                    .refine((val) => [6, 7, 8, 9].includes(val)),
            }),
        )
        .length(6),
    hexagramLineValues: z
        .array(
            z
                .number()
                .int()
                .refine((val) => [6, 7, 8, 9].includes(val)),
        )
        .length(6),
    interpretation: z.object({
        currentHexagram: CurrentHexagram,
        transformedHexagram: BaseHexagram,
        changes: z.array(
            z.object({
                line: z.number().int().min(1).max(6),
                changed: z.boolean(),
            }),
        ),
    }),
});

// Market sentiment moving average structure
const MovingAverage = z.object({
    time: z.array(z.number()),
    sentiment: z.array(z.number()),
});

// Market sentiment data structure
const MarketSentimentData = z.object({
    overview: z.string(),
    moving_average: MovingAverage,
});

// Complete market sentiment structure
const MarketSentiment = z.object({
    data: MarketSentimentData,
});

// News events structure - simplified to match actual API response
const NewsEvents = z.object({
    data: z.array(z.string()),
});

// Divination context structure
const DivinationContext = z.object({
    marketSentiment: MarketSentiment,
    newsEvents: NewsEvents,
    hexagramData: HexagramData,
    interpretation: z.string(),
});

// Complete divination reading structure
export const DivinationReading = z.object({
    "@type": z.tuple([
        z.literal("CreativeWork"),
        z.literal("divination:Reading"),
    ]),
    "@id": z.string().regex(/^urn:hexagram:[1-9][0-9]?$/),
    name: z.string(),
    dateCreated: z.string().datetime(),
    author: z.object({
        "@type": z.literal("Person"),
        identifier: z.string(),
    }),
    "divination:context": DivinationContext,
});

export type DivinationReadingType = z.infer<typeof DivinationReading>;

interface ParsedSentimentOverview {
    Telegram: {
        current: string;
        "24 hours ago"?: string;
        "7 days ago"?: string;
    };
    Reddit: {
        current: string;
        "24 hours ago"?: string;
        "7 days ago"?: string;
    };
    "General market": {
        current: string;
        "24 hours ago"?: string;
        "7 days ago"?: string;
    };
}

/**
 * Transforms raw sentiment data into the proper DKG format
 */
export function transformSentimentData(
    rawSentiment: Record<string, any> | string,
): z.infer<typeof MarketSentiment> {
    // The raw sentiment should already be in the correct format
    if (
        rawSentiment &&
        typeof rawSentiment === "object" &&
        rawSentiment?.data?.overview &&
        rawSentiment?.data?.moving_average
    ) {
        return rawSentiment;
    }

    // If we have a raw overview string, try to parse it
    const overviewStr = typeof rawSentiment === "string" ? rawSentiment : "";
    const overviewMatch = overviewStr.match(/Sentiment data: (.*)/);

    if (overviewMatch) {
        try {
            const parsedOverview: ParsedSentimentOverview = JSON.parse(
                overviewMatch[1].replace(/'/g, '"'),
            );
            return {
                data: {
                    overview: overviewStr,
                    moving_average: {
                        time: [],
                        sentiment: [],
                    },
                },
            };
        } catch (error) {
            console.error("Error parsing sentiment overview:", error);
        }
    }

    // Default case
    return {
        data: {
            overview:
                "Sentiment data: {'Telegram': {'current': 'neutral'}, 'Reddit': {'current': 'neutral'}, 'General market': {'current': 'neutral'}}",
            moving_average: {
                time: [],
                sentiment: [],
            },
        },
    };
}

/**
 * Transforms raw news data into the proper DKG format
 */
export function transformNewsData(rawNews: any): z.infer<typeof NewsEvents> {
    // If rawNews is already in the correct format, return it
    if (rawNews && typeof rawNews === "object" && Array.isArray(rawNews.data)) {
        return rawNews;
    }

    // If rawNews is an array, wrap it in the data property
    if (Array.isArray(rawNews)) {
        return {
            data: rawNews.map((news) =>
                typeof news === "string" ? news : String(news),
            ),
        };
    }

    // Default case: create an empty news events object
    return {
        data: [],
    };
}

/**
 * Creates a DKG-compatible divination reading
 */
export function createDivinationReading({
    hexagramNumber,
    hexagramName,
    userId,
    sentiment,
    news,
    hexagram,
    interpretation,
}: {
    hexagramNumber: number;
    hexagramName: string;
    userId: string;
    sentiment: Record<string, any>;
    news: any;
    hexagram: Record<string, any>;
    interpretation: string;
}): DivinationReadingType {
    const reading: DivinationReadingType = {
        "@type": ["CreativeWork", "divination:Reading"],
        "@id": `urn:hexagram:${hexagramNumber}`,
        name: hexagramName,
        dateCreated: new Date().toISOString(),
        author: {
            "@type": "Person",
            identifier: userId,
        },
        "divination:context": {
            marketSentiment: transformSentimentData(sentiment),
            newsEvents: transformNewsData(news),
            hexagramData: hexagram,
            interpretation,
        },
    };

    // Validate the reading
    DivinationReading.parse(reading);

    return reading;
}

/**
 * Validates a divination reading against the schema
 * @throws {ZodError} if validation fails
 */
export function validateDivinationReading(
    reading: unknown,
): DivinationReadingType {
    return DivinationReading.parse(reading);
}

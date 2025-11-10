import { parseBooleanFromText, IAgentRuntime } from "@elizaos/core";
import { z } from "zod";
export const DEFAULT_MAX_TWEET_LENGTH = 280;

const twitterUsernameSchema = z
    .string()
    .min(1)
    .max(15)
    .regex(
        /^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$|^[A-Za-z]$|^\*$/,
        "Invalid Twitter username format"
    );

export const twitterEnvSchema = z.object({
    TWITTER_DRY_RUN: z.boolean(),
    // OAuth 1.0a credentials
    TWITTER_API_KEY: z.string().min(1, "Twitter API key is required"),
    TWITTER_API_SECRET_KEY: z.string().min(1, "Twitter API secret key is required"),
    TWITTER_ACCESS_TOKEN: z.string().min(1, "Twitter access token is required"),
    TWITTER_ACCESS_TOKEN_SECRET: z.string().min(1, "Twitter access token secret is required"),
    // Username is fetched from API after auth, but can be pre-configured for cache keys
    TWITTER_USERNAME: z.string().optional(),
    MAX_TWEET_LENGTH: z.number().int().default(DEFAULT_MAX_TWEET_LENGTH),
    TWITTER_SEARCH_ENABLE: z.boolean().default(false),
    TWITTER_INTERACTIONS_ENABLE: z.boolean().default(true),
    TWITTER_RETRY_LIMIT: z.number().int(),
    TWITTER_POLL_INTERVAL: z.number().int(),
    TWITTER_TARGET_USERS: z.array(twitterUsernameSchema).default([]),
    POST_INTERVAL_MIN: z.number().int(),
    POST_INTERVAL_MAX: z.number().int(),
    DIVINATION_INTERVAL_MIN: z.number().int(),
    DIVINATION_INTERVAL_MAX: z.number().int(),
    DKG_QUERY_TIMEOUT: z.number().int().default(10000),
    ENABLE_ACTION_PROCESSING: z.boolean(),
    ACTION_INTERVAL: z.number().int(),
    POST_IMMEDIATELY: z.boolean(),
});

export type TwitterConfig = z.infer<typeof twitterEnvSchema>;

function parseTargetUsers(targetUsersStr?: string | null): string[] {
    if (!targetUsersStr?.trim()) {
        return [];
    }

    // Check for wildcard first
    if (
        targetUsersStr.includes("*") ||
        targetUsersStr.toLowerCase().includes("all")
    ) {
        return ["*"];
    }

    return targetUsersStr
        .split(",")
        .map((user) => user.trim())
        .filter(Boolean);
}

function safeParseInt(
    value: string | undefined | null,
    defaultValue: number
): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : Math.max(1, parsed);
}

// This also is organized to serve as a point of documentation for the client
// most of the inputs from the framework (env/character)

// we also do a lot of typing/parsing here
// so we can do it once and only once per character
export async function validateTwitterConfig(
    runtime: IAgentRuntime
): Promise<TwitterConfig> {
    try {
        const twitterConfig = {
            TWITTER_DRY_RUN:
                parseBooleanFromText(
                    runtime.getSetting("TWITTER_DRY_RUN") ||
                        process.env.TWITTER_DRY_RUN
                ) ?? false, // parseBooleanFromText return null if "", map "" to false
            // OAuth 1.0a credentials
            TWITTER_API_KEY:
                runtime.getSetting("TWITTER_API_KEY") ||
                process.env.TWITTER_API_KEY,
            TWITTER_API_SECRET_KEY:
                runtime.getSetting("TWITTER_API_SECRET_KEY") ||
                process.env.TWITTER_API_SECRET_KEY,
            TWITTER_ACCESS_TOKEN:
                runtime.getSetting("TWITTER_ACCESS_TOKEN") ||
                process.env.TWITTER_ACCESS_TOKEN,
            TWITTER_ACCESS_TOKEN_SECRET:
                runtime.getSetting("TWITTER_ACCESS_TOKEN_SECRET") ||
                process.env.TWITTER_ACCESS_TOKEN_SECRET,
            // Username (optional, fetched from API if not provided)
            TWITTER_USERNAME:
                runtime.getSetting("TWITTER_USERNAME") ||
                process.env.TWITTER_USERNAME ||
                undefined,
            // number as string?
            MAX_TWEET_LENGTH: safeParseInt(
                runtime.getSetting("MAX_TWEET_LENGTH") ||
                    process.env.MAX_TWEET_LENGTH,
                DEFAULT_MAX_TWEET_LENGTH
            ),
            // bool
            TWITTER_SEARCH_ENABLE:
                parseBooleanFromText(
                    runtime.getSetting("TWITTER_SEARCH_ENABLE") ||
                        process.env.TWITTER_SEARCH_ENABLE
                ) ?? false,
            // bool
            TWITTER_INTERACTIONS_ENABLE:
                parseBooleanFromText(
                    runtime.getSetting("TWITTER_INTERACTIONS_ENABLE") ||
                        process.env.TWITTER_INTERACTIONS_ENABLE
                ) ?? true,
            // int
            TWITTER_RETRY_LIMIT: safeParseInt(
                runtime.getSetting("TWITTER_RETRY_LIMIT") ||
                    process.env.TWITTER_RETRY_LIMIT,
                5
            ),
            // int in seconds
            TWITTER_POLL_INTERVAL: safeParseInt(
                runtime.getSetting("TWITTER_POLL_INTERVAL") ||
                    process.env.TWITTER_POLL_INTERVAL,
                120
            ), // 2m
            // comma separated string
            TWITTER_TARGET_USERS: parseTargetUsers(
                runtime.getSetting("TWITTER_TARGET_USERS") ||
                    process.env.TWITTER_TARGET_USERS
            ),
            // int in minutes
            POST_INTERVAL_MIN: safeParseInt(
                runtime.getSetting("POST_INTERVAL_MIN") ||
                    process.env.POST_INTERVAL_MIN,
                90
            ), // 1.5 hours
            // int in minutes
            POST_INTERVAL_MAX: safeParseInt(
                runtime.getSetting("POST_INTERVAL_MAX") ||
                    process.env.POST_INTERVAL_MAX,
                180
            ), // 3 hours
            // int in minutes
            DIVINATION_INTERVAL_MIN: safeParseInt(
                runtime.getSetting("DIVINATION_INTERVAL_MIN") ||
                    process.env.DIVINATION_INTERVAL_MIN,
                90
            ), // 1.5 hours
            // int in minutes
            DIVINATION_INTERVAL_MAX: safeParseInt(
                runtime.getSetting("DIVINATION_INTERVAL_MAX") ||
                    process.env.DIVINATION_INTERVAL_MAX,
                180
            ), // 3 hours
            // int in milliseconds
            DKG_QUERY_TIMEOUT: safeParseInt(
                runtime.getSetting("DKG_QUERY_TIMEOUT") ||
                    process.env.DKG_QUERY_TIMEOUT,
                10000
            ), // 10 seconds
            // bool
            ENABLE_ACTION_PROCESSING:
                parseBooleanFromText(
                    runtime.getSetting("ENABLE_ACTION_PROCESSING") ||
                        process.env.ENABLE_ACTION_PROCESSING
                ) ?? false,
            // int in minutes (min 1m)
            ACTION_INTERVAL: safeParseInt(
                runtime.getSetting("ACTION_INTERVAL") ||
                    process.env.ACTION_INTERVAL,
                5
            ), // 5 minutes
            // bool
            POST_IMMEDIATELY:
                parseBooleanFromText(
                    runtime.getSetting("POST_IMMEDIATELY") ||
                        process.env.POST_IMMEDIATELY
                ) ?? false,
        };

        return twitterEnvSchema.parse(twitterConfig);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(
                `Twitter configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}

import {
    IAgentRuntime,
    UUID,
    elizaLogger,
    stringToUuid,
    getEmbeddingZeroVector,
} from "@elizaos/core";
import { ClientBase } from "./base";
import { Tweet } from "./client/index.ts";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment.ts";

export async function postTweet(
    runtime: IAgentRuntime,
    client: ClientBase,
    cleanedContent: string,
    roomId: UUID,
    newTweetContent: string,
    twitterUsername: string
): Promise<string> {
    elizaLogger.log(`Posting new tweet:\n`);

    try {
        const requestContext = {
            cleaned_content: cleanedContent,
            cleaned_content_length: cleanedContent.length,
            new_tweet_content: newTweetContent,
            room_id: roomId,
            twitter_username: twitterUsername,
            use_note_tweet: cleanedContent.length > DEFAULT_MAX_TWEET_LENGTH,
            max_tweet_length: DEFAULT_MAX_TWEET_LENGTH
        };

        elizaLogger.debug("New tweet request context:", requestContext);

        let tweet;

        if (cleanedContent.length > DEFAULT_MAX_TWEET_LENGTH) {
            elizaLogger.debug("Using note tweet for long content");
            tweet = await handleNoteTweet(client, runtime, cleanedContent);
        } else {
            elizaLogger.debug("Using standard tweet");
            tweet = await sendStandardTweet(client, cleanedContent);
        }

        if (!tweet) {
            elizaLogger.error("Tweet API returned null/undefined result:", {
                request_context: requestContext,
                result_received: tweet
            });
            throw new Error("Tweet API returned null/undefined result");
        }

        await processAndCacheTweet(
            runtime,
            client,
            tweet,
            roomId,
            newTweetContent
        );

        elizaLogger.info(`✅ New tweet posted successfully: ${tweet.permanentUrl}`);
        return tweet.id;
    } catch (error) {
        const errorContext = {
            error_name: error.name,
            error_message: error.message,
            error_stack: error.stack,
            error_cause: error.cause,
            cleaned_content: cleanedContent,
            cleaned_content_length: cleanedContent.length,
            new_tweet_content: newTweetContent,
            room_id: roomId,
            twitter_username: twitterUsername,
            timestamp: new Date().toISOString()
        };

        elizaLogger.error("❌ Error sending tweet:", errorContext);
        elizaLogger.error("🔍 Raw tweet error object:", error);
        throw error;
    }
}

export async function postReplyTweet(
    runtime: IAgentRuntime,
    client: ClientBase,
    replyContent: string,
    originalTweetId: string,
    roomId: UUID,
    twitterUsername: string
): Promise<string | null> {
    elizaLogger.log(`Posting reply tweet to ${originalTweetId}:\n${replyContent}`);

    try {
        const requestContext = {
            reply_content: replyContent,
            reply_content_length: replyContent.length,
            original_tweet_id: originalTweetId,
            room_id: roomId,
            twitter_username: twitterUsername,
            use_note_tweet: replyContent.length > DEFAULT_MAX_TWEET_LENGTH,
            max_tweet_length: DEFAULT_MAX_TWEET_LENGTH
        };

        elizaLogger.debug("Reply tweet request context:", requestContext);

        let tweet;

        if (replyContent.length > DEFAULT_MAX_TWEET_LENGTH) {
            elizaLogger.debug("Using note tweet for long reply content");
            tweet = await handleNoteTweet(client, runtime, replyContent, originalTweetId);
        } else {
            elizaLogger.debug("Using standard tweet for reply");
            tweet = await sendStandardTweet(client, replyContent, originalTweetId);
        }

        if (!tweet) {
            elizaLogger.error("Tweet API returned null/undefined result:", {
                request_context: requestContext,
                result_received: tweet
            });
            return null;
        }

        await processAndCacheTweet(
            runtime,
            client,
            tweet,
            roomId,
            replyContent
        );

        elizaLogger.info(`✅ Reply tweet posted successfully: ${tweet.permanentUrl}`);
        return tweet.id;
    } catch (error) {
        const errorContext = {
            error_name: error.name,
            error_message: error.message,
            error_stack: error.stack,
            error_cause: error.cause,
            reply_content: replyContent,
            reply_content_length: replyContent.length,
            original_tweet_id: originalTweetId,
            room_id: roomId,
            twitter_username: twitterUsername,
            timestamp: new Date().toISOString()
        };

        elizaLogger.error("❌ Error sending reply tweet:", errorContext);
        elizaLogger.error("🔍 Raw reply tweet error object:", error);
        return null;
    }
}

export function truncateToCompleteSentence(
    text: string,
    maxLength: number
): string {
    if (text.length <= maxLength) return text;

    const lastPeriodIndex = text.lastIndexOf(".", maxLength - 1);
    if (lastPeriodIndex !== -1) {
        return text.slice(0, lastPeriodIndex + 1).trim();
    }

    const lastSpaceIndex = text.lastIndexOf(" ", maxLength - 3);
    if (lastSpaceIndex !== -1) {
        return text.slice(0, lastSpaceIndex).trim() + "...";
    }

    return text.slice(0, maxLength - 3).trim() + "...";
}

async function processAndCacheTweet(
    runtime: IAgentRuntime,
    client: ClientBase,
    tweet: Tweet,
    roomId: UUID,
    newTweetContent: string
) {
    await runtime.cacheManager.set(
        `twitter/${client.username}/lastPost`,
        {
            id: tweet.id,
            timestamp: Date.now(),
        }
    );

    await client.cacheTweet(tweet);
    elizaLogger.log(`Tweet posted:\n ${tweet.permanentUrl}`);

    await runtime.ensureRoomExists(roomId);
    await runtime.ensureParticipantInRoom(runtime.agentId, roomId);

    await runtime.messageManager.createMemory({
        id: stringToUuid(tweet.id + "-" + runtime.agentId),
        userId: runtime.agentId,
        agentId: runtime.agentId,
        content: {
            text: newTweetContent.trim(),
            url: tweet.permanentUrl,
            source: "twitter",
        },
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: tweet.timestamp * 1000, // Convert seconds to milliseconds
    });
}

async function sendStandardTweet(
    client: ClientBase,
    content: string,
    tweetId?: string
): Promise<Tweet> {
    try {
        elizaLogger.debug("Attempting to send standard tweet:", {
            content_length: content.length,
            is_reply: !!tweetId,
            reply_to: tweetId,
            content_preview: content.slice(0, 100)
        });

        // New API v2 returns a Tweet object directly
        const tweet = await client.requestQueue.add(
            async () => await client.twitterClient.sendTweet(content, tweetId)
        );

        if (!tweet) {
            elizaLogger.error("Twitter API returned null/undefined", {
                content_length: content.length,
                content_preview: content.slice(0, 100),
                is_reply: !!tweetId,
                reply_to: tweetId
            });
            throw new Error("Twitter API returned null/undefined");
        }

        elizaLogger.debug("Twitter API v2 response:", tweet);
        return tweet;
    } catch (error) {
        elizaLogger.error("Error sending standard Tweet:", {
            error_name: error.name,
            error_message: error.message,
            error_stack: error.stack,
            error_cause: error.cause,
            request_content: content,
            request_reply_to: tweetId,
            content_length: content.length,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

async function handleNoteTweet(
    client: ClientBase,
    runtime: IAgentRuntime,
    content: string,
    tweetId?: string
): Promise<Tweet> {
    try {
        elizaLogger.debug("Attempting to send note tweet:", {
            content_length: content.length,
            is_reply: !!tweetId,
            reply_to: tweetId,
            content_preview: content.slice(0, 100)
        });

        // New API v2 returns a Tweet object directly
        const tweet = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendNoteTweet(content, tweetId)
        );

        if (!tweet) {
            elizaLogger.error("Note tweet returned null/undefined", {
                content_length: content.length,
                content_preview: content.slice(0, 100),
                is_reply: !!tweetId,
                reply_to: tweetId
            });
            throw new Error("Note tweet returned null/undefined");
        }

        elizaLogger.debug("Note tweet API v2 response:", tweet);
        return tweet;
    } catch (error) {
        elizaLogger.warn("Note Tweet failed, falling back to standard tweet:", {
            error_name: error.name,
            error_message: error.message,
            error_stack: error.stack,
            request_content: content,
            request_reply_to: tweetId,
            content_length: content.length,
            timestamp: new Date().toISOString()
        });

        // Fallback to standard tweet with truncation
        const truncateContent = truncateToCompleteSentence(
            content,
            client.twitterConfig.MAX_TWEET_LENGTH
        );
        return await sendStandardTweet(
            client,
            truncateContent,
            tweetId
        );
    }
}

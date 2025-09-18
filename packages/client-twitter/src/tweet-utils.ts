import {
    IAgentRuntime,
    UUID,
    elizaLogger,
    stringToUuid,
    getEmbeddingZeroVector,
} from "@elizaos/core";
import { ClientBase } from "./base";
import { Tweet } from "agent-twitter-client";
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

        let result;

        if (cleanedContent.length > DEFAULT_MAX_TWEET_LENGTH) {
            elizaLogger.debug("Using note tweet for long content");
            result = await handleNoteTweet(client, runtime, cleanedContent);
        } else {
            elizaLogger.debug("Using standard tweet");
            result = await sendStandardTweet(client, cleanedContent);
        }

        if (!result) {
            elizaLogger.error("Tweet API returned null/undefined result:", {
                request_context: requestContext,
                result_received: result
            });
            throw new Error("Tweet API returned null/undefined result");
        }

        const tweet = createTweetObject(result, client, twitterUsername);

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

        let result;

        if (replyContent.length > DEFAULT_MAX_TWEET_LENGTH) {
            elizaLogger.debug("Using note tweet for long reply content");
            result = await handleNoteTweet(client, runtime, replyContent, originalTweetId);
        } else {
            elizaLogger.debug("Using standard tweet for reply");
            result = await sendStandardTweet(client, replyContent, originalTweetId);
        }

        if (!result) {
            elizaLogger.error("Tweet API returned null/undefined result:", {
                request_context: requestContext,
                result_received: result
            });
            return null;
        }

        const tweet = createTweetObject(result, client, twitterUsername);

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

function createTweetObject(
    tweetResult: any,
    client: any,
    twitterUsername: string
): Tweet {
    return {
        id: tweetResult.rest_id,
        name: client.profile.screenName,
        username: client.profile.username,
        text: tweetResult.legacy.full_text,
        conversationId: tweetResult.legacy.conversation_id_str,
        createdAt: tweetResult.legacy.created_at,
        timestamp: new Date(tweetResult.legacy.created_at).getTime(),
        userId: client.profile.id,
        inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
        permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: [],
    } as Tweet;
}

async function processAndCacheTweet(
    runtime: IAgentRuntime,
    client: ClientBase,
    tweet: Tweet,
    roomId: UUID,
    newTweetContent: string
) {
    await runtime.cacheManager.set(
        `twitter/${client.profile.username}/lastPost`,
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
        createdAt: tweet.timestamp,
    });
}

async function sendStandardTweet(
    client: ClientBase,
    content: string,
    tweetId?: string
) {
    try {
        elizaLogger.debug("Attempting to send standard tweet:", {
            content_length: content.length,
            is_reply: !!tweetId,
            reply_to: tweetId,
            content_preview: content.slice(0, 100)
        });

        const standardTweetResult = await client.requestQueue.add(
            async () => await client.twitterClient.sendTweet(content, tweetId)
        );

        // Enhanced response logging
        elizaLogger.debug("Twitter API response received:", {
            status: standardTweetResult.status,
            status_text: standardTweetResult.statusText,
            headers: Object.fromEntries(standardTweetResult.headers.entries()),
            content_type: standardTweetResult.headers.get('content-type')
        });

        const body = await standardTweetResult.json();
        elizaLogger.debug("Twitter API response body:", body);

        if (!body?.data?.create_tweet?.tweet_results?.result) {
            const errorDetails = {
                response_body: body,
                errors: body?.errors || [],
                status: standardTweetResult.status,
                status_text: standardTweetResult.statusText,
                request_content: content,
                request_reply_to: tweetId
            };
            elizaLogger.error("Twitter API bad response - missing result:", errorDetails);
            throw new Error(`Twitter API bad response: ${JSON.stringify(errorDetails)}`);
        }
        return body.data.create_tweet.tweet_results.result;
    } catch (error) {
        // Enhanced error logging with full context
        const errorContext = {
            error_name: error.name,
            error_message: error.message,
            error_stack: error.stack,
            error_cause: error.cause,
            request_content: content,
            request_reply_to: tweetId,
            content_length: content.length,
            timestamp: new Date().toISOString()
        };

        elizaLogger.error("Error sending standard Tweet:", errorContext);
        elizaLogger.error("Raw Twitter error object:", error);
        throw error;
    }
}

async function handleNoteTweet(
    client: ClientBase,
    runtime: IAgentRuntime,
    content: string,
    tweetId?: string
) {
    try {
        elizaLogger.debug("Attempting to send note tweet:", {
            content_length: content.length,
            is_reply: !!tweetId,
            reply_to: tweetId,
            content_preview: content.slice(0, 100)
        });

        const noteTweetResult = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendNoteTweet(content, tweetId)
        );

        elizaLogger.debug("Note tweet API response:", {
            has_errors: !!(noteTweetResult.errors && noteTweetResult.errors.length > 0),
            errors: noteTweetResult.errors || [],
            response: noteTweetResult
        });

        if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
            elizaLogger.warn("Note Tweet failed, falling back to standard tweet:", {
                note_errors: noteTweetResult.errors,
                fallback_reason: "authorization_issues"
            });

            // Note Tweet failed due to authorization. Falling back to standard Tweet.
            const truncateContent = truncateToCompleteSentence(
                content,
                client.twitterConfig.MAX_TWEET_LENGTH
            );
            return await sendStandardTweet(
                client,
                truncateContent,
                tweetId
            );
        } else {
            if (!noteTweetResult.data?.notetweet_create?.tweet_results?.result) {
                elizaLogger.error("Note tweet missing result:", {
                    response: noteTweetResult,
                    has_data: !!noteTweetResult.data,
                    has_notetweet_create: !!noteTweetResult.data?.notetweet_create
                });
                throw new Error(`Note tweet missing result: ${JSON.stringify(noteTweetResult)}`);
            }
            return noteTweetResult.data.notetweet_create.tweet_results.result;
        }
    } catch (error) {
        const errorContext = {
            error_name: error.name,
            error_message: error.message,
            error_stack: error.stack,
            request_content: content,
            request_reply_to: tweetId,
            content_length: content.length,
            timestamp: new Date().toISOString()
        };

        elizaLogger.error("Note Tweet failed:", errorContext);
        elizaLogger.error("Raw note tweet error object:", error);
        throw new Error(`Note Tweet failed: ${error.message || error}`);
    }
}

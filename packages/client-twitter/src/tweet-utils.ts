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
) {
    elizaLogger.log(`Posting new tweet:\n`);

    try {
        let result;

        if (cleanedContent.length > DEFAULT_MAX_TWEET_LENGTH) {
            result = await handleNoteTweet(client, runtime, cleanedContent);
        } else {
            result = await sendStandardTweet(client, cleanedContent);
        }

        const tweet = createTweetObject(result, client, twitterUsername);

        await processAndCacheTweet(
            runtime,
            client,
            tweet,
            roomId,
            newTweetContent
        );
    } catch (error) {
        elizaLogger.error("Error sending tweet:", error);
        throw error;
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
        const standardTweetResult = await client.requestQueue.add(
            async () => await client.twitterClient.sendTweet(content, tweetId)
        );
        const body = await standardTweetResult.json();
        if (!body?.data?.create_tweet?.tweet_results?.result) {
            console.error("Error sending tweet; Bad response:", body);
            return;
        }
        return body.data.create_tweet.tweet_results.result;
    } catch (error) {
        elizaLogger.error("Error sending standard Tweet:", error);
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
        const noteTweetResult = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendNoteTweet(content, tweetId)
        );

        if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
            // Note Tweet failed due to authorization. Falling back to standard Tweet.
            const truncateContent = truncateToCompleteSentence(
                content,
                this.client.twitterConfig.MAX_TWEET_LENGTH
            );
            return await this.sendStandardTweet(
                client,
                truncateContent,
                tweetId
            );
        } else {
            return noteTweetResult.data.notetweet_create.tweet_results.result;
        }
    } catch (error) {
        throw new Error(`Note Tweet failed: ${error}`);
    }
}

import {
    Content,
    IAgentRuntime,
    IImageDescriptionService,
    Memory,
    State,
    UUID,
    getEmbeddingZeroVector,
    elizaLogger,
    stringToUuid,
} from "@elizaos/core";
import {
    QueryTweetsResponse,
    SearchMode,
    Tweet,
    Client,
} from "./client/index.ts";
import { EventEmitter } from "events";
import { TwitterConfig } from "./environment.ts";

export function extractAnswer(text: string): string {
    const startIndex = text.indexOf("Answer: ") + 8;
    const endIndex = text.indexOf("<|endoftext|>", 11);
    return text.slice(startIndex, endIndex);
}

type TwitterProfile = {
    id: string;
    username: string;
    screenName: string;
    bio: string;
    nicknames: string[];
};

type QueuedRequest<T> = {
    request: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: any) => void;
};

class RequestQueue {
    private maxRetries: number;
    private minDelay: number = 2000; // Minimum delay between requests (2s = 30 req/min, safe for 450/15min limit)
    private queue: QueuedRequest<any>[] = [];
    private processing: boolean = false;
    private lastRequestTime: number = 0;

    constructor(maxRetries: number = 5) {
        this.maxRetries = maxRetries;
    }

    async add<T>(request: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            // Add request to queue
            this.queue.push({ request, resolve, reject });

            // Start processing if not already running
            if (!this.processing) {
                this.processQueue();
            }
        });
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const queuedRequest = this.queue.shift()!;

            try {
                // Enforce rate limiting: wait for minimum delay since last request
                const timeSinceLastRequest = Date.now() - this.lastRequestTime;
                const waitTime = Math.max(
                    0,
                    this.minDelay + Math.random() * 500 - timeSinceLastRequest
                );

                if (waitTime > 0) {
                    await this.wait(waitTime);
                }

                // Execute request with retry logic
                const result = await this.executeWithRetry(
                    queuedRequest.request,
                    0
                );

                this.lastRequestTime = Date.now();
                queuedRequest.resolve(result);
            } catch (error) {
                queuedRequest.reject(error);
            }
        }

        this.processing = false;
    }

    private async executeWithRetry<T>(
        request: () => Promise<T>,
        retryCount: number
    ): Promise<T> {
        try {
            return await request();
        } catch (error) {
            // Max retries exceeded
            if (retryCount >= this.maxRetries) {
                elizaLogger.error(
                    `Max retries (${this.maxRetries}) exceeded for Twitter API request`,
                    { error }
                );
                throw error;
            }

            // Handle rate limit errors (429)
            if (this.isRateLimitError(error)) {
                const waitTime = this.calculateRateLimitWait(error, retryCount);
                elizaLogger.warn(
                    `Rate limited by Twitter API. Waiting ${Math.round(waitTime / 1000)}s before retry ${retryCount + 1}/${this.maxRetries}`,
                    {
                        resetTime: error?.rateLimit?.reset,
                        remaining: error?.rateLimit?.remaining,
                    }
                );
                await this.wait(waitTime);
                return this.executeWithRetry(request, retryCount + 1);
            }

            // Handle other errors with exponential backoff
            const backoff = this.calculateExponentialBackoff(retryCount);
            elizaLogger.warn(
                `Twitter API error. Retrying in ${Math.round(backoff / 1000)}s (attempt ${retryCount + 1}/${this.maxRetries})`,
                { error: error?.message || error }
            );
            await this.wait(backoff);
            return this.executeWithRetry(request, retryCount + 1);
        }
    }

    private isRateLimitError(error: any): boolean {
        return error?.code === 429 || error?.rateLimit;
    }

    private calculateRateLimitWait(error: any, retryCount: number): number {
        // Try to get reset time from Twitter API headers
        const resetTime = error?.rateLimit?.reset;
        if (resetTime) {
            const now = Math.floor(Date.now() / 1000);
            const waitSeconds = Math.max(0, resetTime - now);
            // Add jitter to prevent thundering herd (0-5s)
            const jitter = Math.random() * 5000;
            return waitSeconds * 1000 + jitter;
        }

        // Fallback to exponential backoff if no reset time available
        elizaLogger.warn(
            "Rate limit error but no reset time in headers, using exponential backoff"
        );
        return this.calculateExponentialBackoff(retryCount);
    }

    private calculateExponentialBackoff(retryCount: number): number {
        const baseDelay = 2000; // 2 seconds
        const maxDelay = 300000; // 5 minutes
        const exponentialDelay = Math.min(
            baseDelay * Math.pow(2, retryCount),
            maxDelay
        );
        // Add jitter (±25% of delay) to prevent thundering herd
        const jitter = exponentialDelay * (0.5 * Math.random() - 0.25);
        return Math.max(0, exponentialDelay + jitter);
    }

    private async wait(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export class ClientBase extends EventEmitter {
    static _twitterClients: { [accountIdentifier: string]: Client } = {};
    twitterClient: Client;
    runtime: IAgentRuntime;
    twitterConfig: TwitterConfig;
    directions: string;
    lastCheckedTweetId: bigint | null = null;
    imageDescriptionService: IImageDescriptionService;
    temperature: number = 0.5;

    requestQueue: RequestQueue;

    // Generic platform-agnostic fields (populated during init)
    username: string;
    userId: string;

    // Platform-specific profile
    profile: TwitterProfile | null;

    async cacheTweet(tweet: Tweet): Promise<void> {
        if (!tweet) {
            console.warn("Tweet is undefined, skipping cache");
            return;
        }

        this.runtime.cacheManager.set(`twitter/tweets/${tweet.id}`, tweet);
    }

    async getCachedTweet(tweetId: string): Promise<Tweet | undefined> {
        const cached = await this.runtime.cacheManager.get<Tweet>(
            `twitter/tweets/${tweetId}`
        );

        return cached;
    }

    async getTweet(tweetId: string): Promise<Tweet> {
        const cachedTweet = await this.getCachedTweet(tweetId);

        if (cachedTweet) {
            return cachedTweet;
        }

        const tweet = await this.requestQueue.add(() =>
            this.twitterClient.getTweetV2(tweetId)
        );

        await this.cacheTweet(tweet);
        return tweet;
    }

    callback: (self: ClientBase) => any = null;

    onReady() {
        throw new Error(
            "Not implemented in base class, please call from subclass"
        );
    }

    constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig) {
        super();
        this.runtime = runtime;
        this.twitterConfig = twitterConfig;

        // Initialize request queue with retry limit from config
        this.requestQueue = new RequestQueue(
            this.twitterConfig.TWITTER_RETRY_LIMIT
        );

        // Use access token as identifier to avoid credential bleeding between accounts
        // (API key/secret are app-level, access token is account-specific)
        const accountKey = twitterConfig.TWITTER_ACCESS_TOKEN;
        if (ClientBase._twitterClients[accountKey]) {
            this.twitterClient = ClientBase._twitterClients[accountKey];
        } else {
            this.twitterClient = new Client();
            ClientBase._twitterClients[accountKey] = this.twitterClient;
        }

        this.directions =
            "- " +
            this.runtime.character.style.all.join("\n- ") +
            "- " +
            this.runtime.character.style.post.join();
    }

    async init() {
        const apiKey = this.twitterConfig.TWITTER_API_KEY;
        const apiSecretKey = this.twitterConfig.TWITTER_API_SECRET_KEY;
        const accessToken = this.twitterConfig.TWITTER_ACCESS_TOKEN;
        const accessTokenSecret = this.twitterConfig.TWITTER_ACCESS_TOKEN_SECRET;
        let retries = this.twitterConfig.TWITTER_RETRY_LIMIT;

        if (!apiKey || !apiSecretKey || !accessToken || !accessTokenSecret) {
            throw new Error("Twitter API credentials not configured");
        }

        elizaLogger.log("Initializing Twitter API v2 client");

        while (retries > 0) {
            try {
                // Login with OAuth 1.0a credentials
                await this.twitterClient.login(
                    "", // username not needed for API v2
                    "", // password not needed for API v2
                    "", // email not needed for API v2
                    "", // 2FA not needed for API v2
                    apiKey,
                    apiSecretKey,
                    accessToken,
                    accessTokenSecret
                );

                if (await this.twitterClient.isLoggedIn()) {
                    elizaLogger.info("Successfully authenticated with Twitter API v2");
                    break;
                }
            } catch (error) {
                elizaLogger.error(`Authentication attempt failed: ${error.message}`);
            }

            retries--;
            elizaLogger.error(
                `Failed to authenticate with Twitter API. Retrying... (${retries} attempts left)`
            );

            if (retries === 0) {
                elizaLogger.error(
                    "Max retries reached. Exiting authentication process."
                );
                throw new Error("Twitter authentication failed after maximum retries.");
            }

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        // Get authenticated user profile
        const profile = await this.twitterClient.me();
        if (profile) {
            elizaLogger.log("Twitter user ID:", profile.userId);
            elizaLogger.log(
                "Twitter loaded: " + JSON.stringify(profile, null, 2)
            );

            // Store profile info for use in responses
            this.profile = {
                id: profile.userId,
                username: profile.username,
                screenName: profile.name,
                bio: profile.biography || "",
                nicknames: [],
            };

            // Populate generic platform-agnostic fields
            this.username = profile.username;
            this.userId = profile.userId;

            // Update config with fetched username for backward compatibility
            this.twitterConfig.TWITTER_USERNAME = profile.username;

            this.runtime.character.twitterProfile = {
                id: this.profile.id,
                username: this.profile.username,
                screenName: this.profile.screenName,
                bio: this.profile.bio,
                nicknames: this.profile.nicknames,
            };
        } else {
            throw new Error("Failed to load profile");
        }

        await this.loadLatestCheckedTweetId();
        await this.populateTimeline();
    }

    async stop() {
        // No session maintenance needed with API v2
        elizaLogger.log("Twitter client stopped");
    }

    async fetchOwnPosts(count: number): Promise<Tweet[]> {
        elizaLogger.debug("fetching own posts");
        const result = await this.twitterClient.getUserTweets(
            this.profile.id,
            count
        );
        return result.tweets;
    }

    /**
     * Fetch timeline for twitter account, optionally only from followed accounts
     */
    async fetchHomeTimeline(
        count: number,
        following?: boolean
    ): Promise<Tweet[]> {
        elizaLogger.debug("fetching home timeline");
        const homeTimeline = following
            ? await this.twitterClient.fetchFollowingTimeline(count, [])
            : await this.twitterClient.fetchHomeTimeline(count, []);

        return homeTimeline;
    }

    async fetchTimelineForActions(count: number): Promise<Tweet[]> {
        elizaLogger.debug("fetching timeline for actions");

        const homeTimeline = await this.twitterClient.fetchHomeTimeline(
            count,
            []
        );

        return homeTimeline.filter((tweet) => tweet.username !== this.username);
    }

    async fetchSearchTweets(
        query: string,
        maxTweets: number,
        searchMode: SearchMode,
        cursor?: string
    ): Promise<QueryTweetsResponse> {
        const maxRetries = 3;
        let retries = 0;

        while (retries < maxRetries) {
            try {
                const timeoutPromise = new Promise((resolve) =>
                    setTimeout(() => resolve({ tweets: [] }), 10000)
                );

                const result = await this.requestQueue.add(
                    async () =>
                        await Promise.race([
                            this.twitterClient.fetchSearchTweets(
                                query,
                                maxTweets,
                                searchMode,
                                cursor
                            ),
                            timeoutPromise,
                        ])
                );

                return (result ?? { tweets: [] }) as QueryTweetsResponse;
            } catch (error) {
                elizaLogger.error("Error fetching search tweets:", error);

                if (retries < maxRetries - 1) {
                    retries++;
                    await new Promise((resolve) =>
                        setTimeout(resolve, 2000 * Math.pow(2, retries))
                    );
                    continue;
                }
                return { tweets: [] };
            }
        }
        return { tweets: [] };
    }

    private async populateTimeline() {
        elizaLogger.debug("populating timeline...");

        const cachedTimeline = await this.getCachedTimeline();

        // Check if the cache file exists
        if (cachedTimeline) {
            // Read the cached search results from the file

            // Get the existing memories from the database
            const existingMemories =
                await this.runtime.messageManager.getMemoriesByRoomIds({
                    roomIds: cachedTimeline.map((tweet) =>
                        stringToUuid(
                            tweet.conversationId + "-" + this.runtime.agentId
                        )
                    ),
                });

            // Create a Set to store the IDs of existing memories
            const existingMemoryIds = new Set(
                existingMemories.map((memory) => memory.id.toString())
            );

            // Check if any of the cached tweets exist in the existing memories
            const someCachedTweetsExist = cachedTimeline.some((tweet) =>
                existingMemoryIds.has(
                    stringToUuid(tweet.id + "-" + this.runtime.agentId)
                )
            );

            if (someCachedTweetsExist) {
                // Filter out the cached tweets that already exist in the database
                const tweetsToSave = cachedTimeline.filter(
                    (tweet) =>
                        !existingMemoryIds.has(
                            stringToUuid(tweet.id + "-" + this.runtime.agentId)
                        )
                );

                console.log({
                    processingTweets: tweetsToSave
                        .map((tweet) => tweet.id)
                        .join(","),
                });

                // Save the missing tweets as memories
                for (const tweet of tweetsToSave) {
                    elizaLogger.log("Saving Tweet", tweet.id);

                    const roomId = stringToUuid(
                        tweet.conversationId + "-" + this.runtime.agentId
                    );

                    const userId =
                        tweet.userId === this.profile.id
                            ? this.runtime.agentId
                            : stringToUuid(tweet.userId);

                    if (tweet.userId === this.profile.id) {
                        await this.runtime.ensureConnection(
                            this.runtime.agentId,
                            roomId,
                            this.profile.username,
                            this.profile.screenName,
                            "twitter"
                        );
                    } else {
                        await this.runtime.ensureConnection(
                            userId,
                            roomId,
                            tweet.username,
                            tweet.name,
                            "twitter"
                        );
                    }

                    const content = {
                        text: tweet.text,
                        url: tweet.permanentUrl,
                        source: "twitter",
                        inReplyTo: tweet.inReplyToStatusId
                            ? stringToUuid(
                                  tweet.inReplyToStatusId +
                                      "-" +
                                      this.runtime.agentId
                              )
                            : undefined,
                    } as Content;

                    elizaLogger.log("Creating memory for tweet", tweet.id);

                    // check if it already exists
                    const memory =
                        await this.runtime.messageManager.getMemoryById(
                            stringToUuid(tweet.id + "-" + this.runtime.agentId)
                        );

                    if (memory) {
                        elizaLogger.log(
                            "Memory already exists, skipping timeline population"
                        );
                        break;
                    }

                    await this.runtime.messageManager.createMemory({
                        id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                        userId,
                        content: content,
                        agentId: this.runtime.agentId,
                        roomId,
                        embedding: getEmbeddingZeroVector(),
                        createdAt: tweet.timestamp * 1000,
                    });

                    await this.cacheTweet(tweet);
                }

                elizaLogger.log(
                    `Populated ${tweetsToSave.length} missing tweets from the cache.`
                );
                return;
            }
        }

        const timeline = await this.fetchHomeTimeline(cachedTimeline ? 10 : 50);

        // Get the most recent 20 mentions and interactions
        const mentionsAndInteractions = await this.fetchSearchTweets(
            `@${this.username}`,
            20,
            SearchMode.Latest
        );

        // Combine the timeline tweets and mentions/interactions
        const allTweets = [...timeline, ...mentionsAndInteractions.tweets];

        // Create a Set to store unique tweet IDs
        const tweetIdsToCheck = new Set<string>();
        const roomIds = new Set<UUID>();

        // Add tweet IDs to the Set
        for (const tweet of allTweets) {
            tweetIdsToCheck.add(tweet.id);
            roomIds.add(
                stringToUuid(tweet.conversationId + "-" + this.runtime.agentId)
            );
        }

        // Check the existing memories in the database
        const existingMemories =
            await this.runtime.messageManager.getMemoriesByRoomIds({
                roomIds: Array.from(roomIds),
            });

        // Create a Set to store the existing memory IDs
        const existingMemoryIds = new Set<UUID>(
            existingMemories.map((memory) => memory.id)
        );

        // Filter out the tweets that already exist in the database
        const tweetsToSave = allTweets.filter(
            (tweet) =>
                !existingMemoryIds.has(
                    stringToUuid(tweet.id + "-" + this.runtime.agentId)
                )
        );

        elizaLogger.debug({
            processingTweets: tweetsToSave.map((tweet) => tweet.id).join(","),
        });

        await this.runtime.ensureUserExists(
            this.runtime.agentId,
            this.username,
            this.runtime.character.name,
            "twitter"
        );

        // Save the new tweets as memories
        for (const tweet of tweetsToSave) {
            elizaLogger.log("Saving Tweet", tweet.id);

            const roomId = stringToUuid(
                tweet.conversationId + "-" + this.runtime.agentId
            );
            const userId =
                tweet.userId === this.userId
                    ? this.runtime.agentId
                    : stringToUuid(tweet.userId);

            if (tweet.userId === this.userId) {
                await this.runtime.ensureConnection(
                    this.runtime.agentId,
                    roomId,
                    this.profile.username,
                    this.profile.screenName,
                    "twitter"
                );
            } else {
                await this.runtime.ensureConnection(
                    userId,
                    roomId,
                    tweet.username,
                    tweet.name,
                    "twitter"
                );
            }

            const content = {
                text: tweet.text,
                url: tweet.permanentUrl,
                source: "twitter",
                inReplyTo: tweet.inReplyToStatusId
                    ? stringToUuid(tweet.inReplyToStatusId)
                    : undefined,
            } as Content;

            await this.runtime.messageManager.createMemory({
                id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                userId,
                content: content,
                agentId: this.runtime.agentId,
                roomId,
                embedding: getEmbeddingZeroVector(),
                createdAt: tweet.timestamp * 1000,
            });

            await this.cacheTweet(tweet);
        }

        // Cache
        await this.cacheTimeline(timeline);
        await this.cacheMentions(mentionsAndInteractions.tweets);
    }

    async saveRequestMessage(message: Memory, state: State) {
        if (message.content.text) {
            const recentMessage = await this.runtime.messageManager.getMemories(
                {
                    roomId: message.roomId,
                    count: 1,
                    unique: false,
                }
            );

            if (
                recentMessage.length > 0 &&
                recentMessage[0].content === message.content
            ) {
                elizaLogger.debug("Message already saved", recentMessage[0].id);
            } else {
                await this.runtime.messageManager.createMemory({
                    ...message,
                    embedding: getEmbeddingZeroVector(),
                });
            }

            await this.runtime.evaluate(message, {
                ...state,
                twitterClient: this.twitterClient,
            });
        }
    }

    async loadLatestCheckedTweetId(): Promise<void> {
        const latestCheckedTweetId =
            await this.runtime.cacheManager.get<string>(
                `twitter/${this.username}/latest_checked_tweet_id`
            );

        if (latestCheckedTweetId) {
            this.lastCheckedTweetId = BigInt(latestCheckedTweetId);
        }
    }

    async cacheLatestCheckedTweetId() {
        if (this.lastCheckedTweetId) {
            await this.runtime.cacheManager.set(
                `twitter/${this.username}/latest_checked_tweet_id`,
                this.lastCheckedTweetId.toString()
            );
        }
    }

    async getCachedTimeline(): Promise<Tweet[] | undefined> {
        return await this.runtime.cacheManager.get<Tweet[]>(
            `twitter/${this.username}/timeline`
        );
    }

    async cacheTimeline(timeline: Tweet[]) {
        await this.runtime.cacheManager.set(
            `twitter/${this.username}/timeline`,
            timeline,
            { expires: Date.now() + 10 * 1000 }
        );
    }

    async cacheMentions(mentions: Tweet[]) {
        await this.runtime.cacheManager.set(
            `twitter/${this.username}/mentions`,
            mentions,
            { expires: Date.now() + 10 * 1000 }
        );
    }

    async fetchProfile(username: string): Promise<TwitterProfile> {
        try {
            const profile = await this.requestQueue.add(async () => {
                const profile = await this.twitterClient.getProfile(username);
                return {
                    id: profile.userId,
                    username,
                    screenName: profile.name || this.runtime.character.name,
                    bio:
                        profile.biography ||
                        typeof this.runtime.character.bio === "string"
                            ? (this.runtime.character.bio as string)
                            : this.runtime.character.bio.length > 0
                              ? this.runtime.character.bio[0]
                              : "",
                    nicknames:
                        this.runtime.character.twitterProfile?.nicknames || [],
                } satisfies TwitterProfile;
            });

            return profile;
        } catch (error) {
            console.error("Error fetching Twitter profile:", error);
            return undefined;
        }
    }
}

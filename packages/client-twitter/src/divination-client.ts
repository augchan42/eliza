import {
    IAgentRuntime,
    ModelClass,
    composeContext,
    elizaLogger,
    generateText,
    stringToUuid,
    parseJSONObjectFromText,
    Memory,
    getEmbeddingZeroVector,
} from "@elizaos/core";
import { ClientBase } from "./base";
import { postTweet, postReplyTweet } from "./tweet-utils";
import {
    pixResearchTweetTemplate,
    pixHexagramReadingTemplate,
} from "./divination-templates";
import { ArxivService } from "./arxiv-service";
import { NewsService } from "./news-service";
import { OracleService } from "./oracle-service";
import {
    ContentSelectionService,
    SelectionCriteria,
} from "./content-selection-service";
import {
    ContentManager,
    ContentItem,
    CONTENT_TYPE_CONFIGS,
} from "./content-types";

export class TwitterDivinationClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private twitterUsername: string;
    private isDryRun: boolean;
    private arxivService: ArxivService;
    public newsService: NewsService;
    private oracleService: OracleService;
    private contentSelectionService: ContentSelectionService;
    private contentManager: ContentManager;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        // Use config username since profile isn't initialized yet
        const username = client.twitterConfig.TWITTER_USERNAME;
        this.arxivService = new ArxivService(runtime, username);
        this.newsService = new NewsService(runtime);
        this.oracleService = new OracleService();
        this.contentSelectionService = new ContentSelectionService(runtime);

        // Initialize content manager with research as default
        // Can be changed via environment variable or runtime config
        const contentType =
            runtime.getSetting("DIVINATION_CONTENT_TYPE") || "research";
        this.contentManager = new ContentManager(
            runtime,
            contentType as keyof typeof CONTENT_TYPE_CONFIGS
        );
    }

    async start() {
        elizaLogger.log("🔮 Starting Twitter divination client...");
        this.divinationLoop();
    }

    // Compatibility methods for TwitterInteractionClient
    public async fetchGoogleNews() {
        return await this.newsService.fetchGoogleNews();
    }

    public async generateSentimentFromNews(articles: any[]) {
        return await this.newsService.generateSentimentFromNews(articles);
    }

    public async fetch8BitOracle() {
        return await this.oracleService.fetch8BitOracle();
    }

    private async divinationLoop() {
        try {
            const lastPost = await this.runtime.cacheManager.get<{
                timestamp: number;
            }>(
                "twitter/" +
                    this.client.twitterConfig.TWITTER_USERNAME +
                    "/lastDivination"
            );

            const lastPostTimestamp = lastPost?.timestamp ?? 0;
            const minMinutes =
                this.client.twitterConfig.DIVINATION_INTERVAL_MIN;
            const maxMinutes =
                this.client.twitterConfig.DIVINATION_INTERVAL_MAX;
            const randomMinutes =
                Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                minMinutes;
            const delay = randomMinutes * 60 * 1000;

            const timeSinceLastPost = Date.now() - lastPostTimestamp;
            elizaLogger.debug(
                `Divination timing check: last post ${Math.floor(timeSinceLastPost / 60000)} minutes ago, delay needed: ${Math.floor(delay / 60000)} minutes`
            );

            if (Date.now() > lastPostTimestamp + delay) {
                elizaLogger.log("🔮 Performing divination now...");
                await this.performDivination();
            } else {
                elizaLogger.debug(
                    `Waiting ${Math.floor((lastPostTimestamp + delay - Date.now()) / 60000)} more minutes before next divination`
                );
            }

            setTimeout(() => {
                this.divinationLoop();
            }, delay);

            const timeUntilNext = Math.max(
                0,
                Math.ceil((lastPostTimestamp + delay - Date.now()) / 60000)
            );
            elizaLogger.log(
                `🔮 Next divination scheduled in ${timeUntilNext} minutes`
            );
        } catch (err) {
            elizaLogger.error("Divination loop error:", err);
            // Retry after delay even if error
            setTimeout(() => this.divinationLoop(), 5 * 60 * 1000);
        }
    }

    private async performDivination() {
        try {
            // First, check for and retry any failed DKG operations
            await this.retryFailedDKGOperations();

            const researchPapers = await this.arxivService.fetchArxivPapers();
            const oracleReading = await this.oracleService.fetch8BitOracle();

            const config = this.contentManager.getConfig();

            // Check if content is unavailable
            const noContent =
                !researchPapers ||
                (Array.isArray(researchPapers) &&
                    researchPapers.length === 1 &&
                    (researchPapers[0].title === "News unavailable" ||
                        researchPapers[0].title === "News feeds unavailable"));
            if (noContent) {
                elizaLogger.warn(`Skipping post: ${config.noContentMessage}`);
                return;
            }

            // Convert raw content to ContentItem array using adapter
            const rawContent = Array.isArray(researchPapers)
                ? researchPapers
                : [researchPapers];
            let filteredContent: ContentItem[] =
                this.contentManager.adaptContentArray(rawContent);

            // Load recent content titles cache
            const recentTitlesCacheKey =
                this.contentManager.getRecentContentCacheKey(
                    this.client.twitterConfig.TWITTER_USERNAME
                );
            const recentTitles =
                (await this.runtime.cacheManager.get<string[]>(
                    recentTitlesCacheKey
                )) || [];

            // Load permanent history (if applicable for this content type)
            const historyCacheKey = this.contentManager.getHistoryCacheKey(
                this.client.twitterConfig.TWITTER_USERNAME
            );
            const historyArray = historyCacheKey
                ? (await this.runtime.cacheManager.get<string[]>(
                      historyCacheKey
                  )) || []
                : [];
            const permanentHistory = new Set<string>(historyArray);

            if (recentTitles.length > 0 || permanentHistory.size > 0) {
                const uniqueContent: ContentItem[] = [];

                for (const item of filteredContent) {
                    let isDuplicate = false;
                    const itemTitle = item.title.toLowerCase().trim();

                    // Check permanent history first (if this item has an ID)
                    if (item.id && permanentHistory.has(item.id)) {
                        elizaLogger.debug(
                            `${config.itemName} already posted: ${item.id}`
                        );
                        isDuplicate = true;
                        continue;
                    }

                    // Tier 1: Exact string matching (catches identical titles)
                    for (const cachedTitle of recentTitles) {
                        if (itemTitle === cachedTitle.toLowerCase().trim()) {
                            elizaLogger.debug(
                                this.contentManager.formatDuplicateLog(
                                    item,
                                    "exact"
                                )
                            );
                            isDuplicate = true;
                            break;
                        }
                    }

                    if (!isDuplicate) {
                        // Tier 2: LLM similarity check (for nuanced variations)
                        const similarityCheck =
                            this.contentManager.getSimilarityPrompt(
                                item.title,
                                recentTitles
                            );

                        try {
                            const response = await generateText({
                                runtime: this.runtime,
                                context: similarityCheck,
                                modelClass: ModelClass.SMALL,
                            });

                            if (response.toLowerCase().includes("yes")) {
                                elizaLogger.debug(
                                    this.contentManager.formatDuplicateLog(
                                        item,
                                        "similarity"
                                    )
                                );
                                isDuplicate = true;
                            }
                        } catch (error) {
                            elizaLogger.warn(
                                `LLM similarity check failed for "${item.title}":`,
                                error
                            );
                            // Continue without LLM check if it fails
                        }
                    }

                    if (!isDuplicate) {
                        uniqueContent.push(item);
                    }
                }

                filteredContent = uniqueContent;
                elizaLogger.debug(
                    this.contentManager.formatDeduplicationLog(
                        filteredContent.length,
                        rawContent.length
                    )
                );
            }

            // If all content was filtered out as duplicates, skip this cycle
            if (filteredContent.length === 0) {
                elizaLogger.warn(
                    `Skipping divination: ${config.allDuplicatesMessage}`
                );
                return;
            }

            // Now select the best content item from the unique items using research-focused criteria
            const researchCriteria: SelectionCriteria = {
                contentType: "research",
                character:
                    "Pix - a digital anthropologist interpreting research through I-Ching wisdom with Discord 3am energy",
                priorities: [
                    "NOVELTY: Is this breakthrough research or novel approach?",
                    "PARADIGM SHIFT: Does this challenge existing assumptions or create new frameworks?",
                    "I-CHING RESONANCE: Can this be interpreted through pattern analysis and ancient wisdom?",
                    "TRANSFORMATIVE POTENTIAL: Will this change how we think about the domain?",
                    "COMPLEXITY INSIGHTS: Does this reveal hidden patterns or structures?",
                ],
                priorityOrder:
                    "Breakthrough research > Paradigm shifts > Pattern recognition > Practical applications",
            };

            const selectedItem =
                await this.contentSelectionService.selectMostRelevant(
                    filteredContent,
                    researchCriteria
                );

            // Format the data before passing to template
            const formattedResearch = JSON.stringify(selectedItem, null, 2);
            const formattedOracle = JSON.stringify(oracleReading, null, 2);

            const roomId = stringToUuid(
                "twitter_generate_room-" +
                    this.client.twitterConfig.TWITTER_USERNAME
            );
            const topics = this.runtime.character.topics.join(", ");

            this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
            this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;

            // Get recent post patterns for template variation
            const recentPostPatterns = await this.getRecentPostPatterns();

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
                    researchPaper: formattedResearch,
                    oracleReading: formattedOracle,
                    maxTweetLength: this.client.twitterConfig.MAX_TWEET_LENGTH,
                    twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
                    recentPostPatterns: recentPostPatterns,
                }
            );

            // Generate research tweet (main tweet with hook)
            const researchContext = composeContext({
                state,
                template: pixResearchTweetTemplate,
            });

            elizaLogger.debug("🚀 Generating research tweet...");
            const researchTweetStart = Date.now();
            const researchTweet = await generateText({
                runtime: this.runtime,
                context: researchContext,
                modelClass: ModelClass.SMALL,
            });
            const researchTime = Date.now() - researchTweetStart;
            elizaLogger.info(
                `✅ Research tweet generated: ${researchTweet.length} chars in ${researchTime}ms`
            );

            // Generate hexagram reading (for reply tweet)
            const hexagramContext = composeContext({
                state,
                template: pixHexagramReadingTemplate,
            });

            elizaLogger.debug("🔮 Generating hexagram reading...");
            const hexagramStart = Date.now();
            const hexagramReading = await generateText({
                runtime: this.runtime,
                context: hexagramContext,
                modelClass: ModelClass.SMALL,
            });
            const hexagramTime = Date.now() - hexagramStart;
            elizaLogger.info(
                `✅ Hexagram reading generated: ${hexagramReading.length} chars in ${hexagramTime}ms`
            );

            // Clean research tweet
            const cleanedResearchTweet = this.cleanLLMResponse(
                researchTweet,
                "research tweet"
            );

            // Clean hexagram reading
            const cleanedHexagramReading = this.cleanLLMResponse(
                hexagramReading,
                "hexagram reading"
            );

            if (this.isDryRun) {
                elizaLogger.info(
                    `Dry run: would have posted tweet: ${cleanedResearchTweet}`
                );
                return;
            }

            try {
                // Post main research tweet (Tweet 1)
                elizaLogger.log(
                    `📱 Posting main research tweet (${cleanedResearchTweet.length} chars):\n ${cleanedResearchTweet}`
                );
                const mainTweetId = await postTweet(
                    this.runtime,
                    this.client,
                    cleanedResearchTweet,
                    roomId,
                    researchTweet, // Raw response for memory
                    this.twitterUsername
                );

                // Post hexagram reading + citation as reply (Tweet 2)
                let hexagramReplyId = null;
                if (mainTweetId && selectedItem.link) {
                    try {
                        // Put citation FIRST so it's visible even when truncated
                        const hexagramWithCitation = `📄 ${selectedItem.title}\n${selectedItem.authors ? `${selectedItem.authors}\n` : ""}${selectedItem.link}\n\n${cleanedHexagramReading}`;

                        elizaLogger.log(
                            `🔮 Posting hexagram reply (${hexagramWithCitation.length} chars):\n${hexagramWithCitation}`
                        );

                        hexagramReplyId = await postReplyTweet(
                            this.runtime,
                            this.client,
                            hexagramWithCitation,
                            mainTweetId,
                            roomId,
                            this.twitterUsername
                        );

                        if (hexagramReplyId) {
                            elizaLogger.info(
                                "✅ Successfully posted hexagram reading reply"
                            );
                        } else {
                            elizaLogger.warn(
                                "Failed to post hexagram reply tweet"
                            );
                        }
                    } catch (replyError) {
                        elizaLogger.error(
                            "Error posting hexagram reply:",
                            replyError
                        );
                        // Don't throw - main tweet was successful
                    }
                }

                // Update recent content cache after successful post
                const recentTitlesCacheKey =
                    this.contentManager.getRecentContentCacheKey(
                        this.client.twitterConfig.TWITTER_USERNAME
                    );
                const recentTitles =
                    (await this.runtime.cacheManager.get<string[]>(
                        recentTitlesCacheKey
                    )) || [];

                recentTitles.unshift(selectedItem.title);
                // Keep 100 titles for ~3 months of deduplication history
                if (recentTitles.length > 100) {
                    recentTitles.pop();
                }

                await this.runtime.cacheManager.set(
                    recentTitlesCacheKey,
                    recentTitles
                );

                // Permanently store content ID if it exists and history is configured
                const historyCacheKey = this.contentManager.getHistoryCacheKey(
                    this.client.twitterConfig.TWITTER_USERNAME
                );
                if (selectedItem.id && historyCacheKey) {
                    const historyArray =
                        (await this.runtime.cacheManager.get<string[]>(
                            historyCacheKey
                        )) || [];

                    if (!historyArray.includes(selectedItem.id)) {
                        historyArray.push(selectedItem.id);

                        // Store back to SQLite via cacheManager
                        await this.runtime.cacheManager.set(
                            historyCacheKey,
                            historyArray
                        );

                        elizaLogger.debug(
                            `Added ${config.itemName} to permanent history: ${selectedItem.id}`
                        );
                    }
                }

                elizaLogger.debug(
                    `Updated ${config.itemName} cache with: "${selectedItem.title}"`
                );

                // Also update the divination timestamp cache for interval management
                await this.runtime.cacheManager.set(
                    "twitter/" +
                        this.client.twitterConfig.TWITTER_USERNAME +
                        "/lastDivination",
                    {
                        timestamp: Date.now(),
                    }
                );

                // Integrate with DKG - store divination to OriginTrail DKG
                try {
                    elizaLogger.info(
                        "Attempting to store divination to DKG..."
                    );

                    // Create synthetic memory for action processing
                    const actionMemory: Memory = {
                        id: stringToUuid(`divination-action-${Date.now()}`),
                        userId: this.runtime.agentId,
                        agentId: this.runtime.agentId,
                        roomId: roomId,
                        content: {
                            text: "Store divination to DKG",
                            action: "INSERT_DIVINATION_MEMORY",
                        },
                        createdAt: Date.now(),
                        embedding: getEmbeddingZeroVector(),
                    };

                    // Prepare structured state for DKG action with BOTH tweets
                    const dkgState = {
                        ...state,
                        oracleReading: formattedOracle, // Already JSON string
                        contentItem: JSON.stringify(selectedItem), // Generic ContentItem (research/news/podcast/etc)
                        contentType: this.contentManager.getConfig().typeName, // "research", "news", "podcast", etc.
                        interpretation: `${cleanedResearchTweet}\n\n---\n\n${cleanedHexagramReading}`, // Both tweets
                        mainTweetContent: cleanedResearchTweet, // Main research tweet
                        hexagramReading: cleanedHexagramReading, // Hexagram reply content
                        userId: this.runtime.agentId,
                        userIdentifier:
                            this.client.twitterConfig.TWITTER_USERNAME,
                        tweetId: mainTweetId, // Main tweet ID for threading
                        replyTweetId: hexagramReplyId || null, // Reply tweet ID (null if reply failed)
                        roomId: roomId, // Room ID for reply posting
                    };

                    // Create callback to handle reply tweet posting
                    const dkgCallback = async (response: any) => {
                        try {
                            if (
                                response.action === "REPLY_TWEET" &&
                                response.metadata
                            ) {
                                elizaLogger.info(
                                    "DKG returned akashic record, posting reply tweet..."
                                );

                                // Handle async operation with explicit promise isolation
                                postReplyTweet(
                                    this.runtime,
                                    this.client,
                                    response.metadata.replyContent,
                                    response.metadata.originalTweetId,
                                    response.metadata.roomId,
                                    this.twitterUsername
                                )
                                    .then((replyTweetId) => {
                                        if (replyTweetId) {
                                            elizaLogger.info(
                                                "Successfully posted akashic record reply tweet"
                                            );
                                        } else {
                                            elizaLogger.warn(
                                                "Failed to post akashic record reply tweet"
                                            );
                                        }
                                    })
                                    .catch((error) => {
                                        // Isolate promise rejection to prevent unhandled rejection
                                        elizaLogger.error(
                                            "Error posting akashic record reply:",
                                            error
                                        );
                                    });
                            }
                        } catch (error) {
                            elizaLogger.error("Error in DKG callback:", error);
                        }
                        return []; // Return empty array as required by HandlerCallback type
                    };

                    // Process action asynchronously with callback - don't await to avoid blocking divination flow
                    this.runtime
                        .processActions(
                            actionMemory,
                            [actionMemory],
                            dkgState,
                            dkgCallback
                        )
                        .then(() => {
                            elizaLogger.info(
                                "Successfully processed DKG storage action"
                            );
                        })
                        .catch((dkgError) => {
                            // Log warning but don't throw - DKG failure shouldn't break divination
                            elizaLogger.warn(
                                "DKG storage failed, but tweet was successful:",
                                {
                                    error:
                                        dkgError instanceof Error
                                            ? {
                                                  message: dkgError.message,
                                                  stack: dkgError.stack,
                                              }
                                            : dkgError,
                                    tweet_content:
                                        cleanedResearchTweet.substring(0, 100) +
                                        "...",
                                }
                            );
                        });
                } catch (dkgError) {
                    // Log warning but don't throw - DKG failure shouldn't break divination
                    elizaLogger.warn(
                        "Failed to initiate DKG storage, but tweet was successful:",
                        {
                            error:
                                dkgError instanceof Error
                                    ? {
                                          message: dkgError.message,
                                          stack: dkgError.stack,
                                      }
                                    : dkgError,
                            tweet_content:
                                cleanedResearchTweet.substring(0, 100) + "...",
                        }
                    );
                }
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
                    content: cleanedResearchTweet,
                    length: cleanedResearchTweet.length,
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

    // Add this new method for testing
    private cleanLLMResponse(response: string, contentType: string): string {
        let cleanedContent = "";

        // Try parsing as JSON first
        elizaLogger.debug(`🧹 Parsing ${contentType} LLM response...`);
        try {
            const parsedResponse = parseJSONObjectFromText(response);
            if (parsedResponse.text) {
                cleanedContent = parsedResponse.text;
            } else if (typeof parsedResponse === "string") {
                cleanedContent = parsedResponse;
            }
        } catch {
            // Handle structured template format for research tweets
            if (
                contentType === "research tweet" &&
                response.includes("**banger:**")
            ) {
                const bangerMatch = response.match(
                    /\*\*banger:\*\*\s*(.*?)(?=\n\*\*|$)/s
                );
                if (bangerMatch) {
                    cleanedContent = bangerMatch[1].trim();
                    elizaLogger.debug(
                        "Extracted banger from structured format"
                    );
                } else {
                    elizaLogger.warn(
                        "Found **banger:** but couldn't extract content"
                    );
                }
            }

            // If we didn't extract from structured format, clean the raw content
            if (!cleanedContent) {
                cleanedContent = response
                    .replace(/^\s*{?\s*"text":\s*"|"\s*}?\s*$/g, "") // Remove JSON-like wrapper
                    .replace(/^['"](.*)['"]$/g, "$1") // Remove quotes
                    .replace(/\\"/g, '"') // Unescape quotes
                    .replace(/\\n/g, "\n") // Unescape newlines
                    .trim();
            }
        }

        if (!cleanedContent) {
            elizaLogger.error(`💥 Failed to extract valid ${contentType}:`, {
                rawResponse: response.substring(0, 500),
                responseLength: response.length,
            });
            throw new Error(
                `Failed to extract valid ${contentType} from LLM response`
            );
        }

        elizaLogger.info(
            `✅ ${contentType} extracted: ${cleanedContent.length} chars`
        );

        // Final cleaning
        const removeQuotes = (str: string) =>
            str.replace(/^['"](.*)['"]$/, "$1");
        const fixNewLines = (str: string) => str.replaceAll(/\\n/g, "\n");

        return removeQuotes(fixNewLines(cleanedContent));
    }

    public async testDivination(): Promise<string> {
        // Force dry run mode
        this.isDryRun = true;

        try {
            const researchPapers = await this.arxivService.fetchArxivPapers();
            const oracleReading = await this.oracleService.fetch8BitOracle();

            // Select the most relevant paper for testing (matching main logic)
            const researchCriteria: SelectionCriteria = {
                contentType: "research",
                character:
                    "Pix - a digital anthropologist interpreting research through I-Ching wisdom with Discord 3am energy",
                priorities: [
                    "NOVELTY: Is this breakthrough research or novel approach?",
                    "PARADIGM SHIFT: Does this challenge existing assumptions or create new frameworks?",
                    "I-CHING RESONANCE: Can this be interpreted through pattern analysis and ancient wisdom?",
                    "TRANSFORMATIVE POTENTIAL: Will this change how we think about the domain?",
                    "COMPLEXITY INSIGHTS: Does this reveal hidden patterns or structures?",
                ],
                priorityOrder:
                    "Breakthrough research > Paradigm shifts > Pattern recognition > Practical applications",
            };

            // Convert to ContentItem array and select most relevant
            const rawContent = Array.isArray(researchPapers)
                ? researchPapers
                : [researchPapers];
            const contentItems =
                this.contentManager.adaptContentArray(rawContent);

            const selectedItem =
                contentItems.length > 0
                    ? await this.contentSelectionService.selectMostRelevant(
                          contentItems,
                          researchCriteria
                      )
                    : contentItems[0];

            // Format the data before passing to template
            const formattedResearch = JSON.stringify(selectedItem, null, 2);
            const formattedOracle = JSON.stringify(oracleReading, null, 2);

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
                    researchPaper: formattedResearch,
                    oracleReading: formattedOracle,
                    maxTweetLength: this.client.twitterConfig.MAX_TWEET_LENGTH,
                    twitterUserName: "test_user",
                }
            );

            const context = composeContext({
                state,
                template: pixResearchTweetTemplate,
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
                const parsedResponse = parseJSONObjectFromText(interpretation);
                if (parsedResponse.text) {
                    cleanedContent = parsedResponse.text;
                } else if (typeof parsedResponse === "string") {
                    cleanedContent = parsedResponse;
                }
            } catch {
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
                researchPapers: researchPapers,
                oracle: oracleReading.interpretation,
            });

            return cleanedContent;
        } catch (error) {
            elizaLogger.error("Error in test divination:", error);
            throw error;
        }
    }

    /**
     * Get first few words of recent posts to show opening patterns
     */
    private async getRecentPostPatterns(): Promise<string> {
        try {
            // Get recent divination posts from cache
            const recentTitlesCacheKey =
                this.contentManager.getRecentContentCacheKey(
                    this.client.twitterConfig.TWITTER_USERNAME
                );
            const recentTitles =
                (await this.runtime.cacheManager.get<string[]>(
                    recentTitlesCacheKey
                )) || [];

            if (recentTitles.length === 0) {
                return "No recent posts found.";
            }

            // Get first 4-5 words from last 10 posts
            const recentOpenings = recentTitles
                .slice(0, 10)
                .map((title) => {
                    const words = title.split(" ");
                    return words.slice(0, 10).join(" ") + "...";
                })
                .join(" | ");

            return `Recent post openings: ${recentOpenings}`;
        } catch (error) {
            elizaLogger.warn("Error getting recent post patterns:", error);
            return "Unable to retrieve recent posts.";
        }
    }

    /**
     * Check for and retry any failed DKG operations
     */
    private async retryFailedDKGOperations(): Promise<void> {
        try {
            // Check if DKG divination plugin is available
            const dkgAction = this.runtime.actions.find(
                (action) => action.name === "INSERT_DIVINATION_MEMORY"
            );
            if (!dkgAction) {
                elizaLogger.debug(
                    "DKG divination plugin not available, skipping retry check"
                );
                return;
            }

            // Import DKG operation handler
            const { DKGOperationHandler } = await import(
                "@elizaos/plugin-dkg-divination/src/dkg-operation-handler"
            );
            const dkgHandler = new DKGOperationHandler(this.runtime);

            // Get all failed operations
            const failedOperations = await dkgHandler.getAllFailedOperations();

            if (failedOperations.length === 0) {
                elizaLogger.debug("No failed DKG operations to retry");
                return;
            }

            elizaLogger.info(
                `🔄 Found ${failedOperations.length} failed DKG operation(s) to retry`
            );

            // Retry each failed operation
            for (const { key, record } of failedOperations) {
                elizaLogger.info(`Retrying failed DKG operation: ${key}`, {
                    originalTimestamp: record.timestamp,
                    retryCount: record.retryCount || 0,
                    originalTweetId: record.state?.tweetId,
                });

                try {
                    // Create callback to handle akashic record replies
                    const retryCallback = async (response: any) => {
                        try {
                            if (
                                response.action === "REPLY_TWEET" &&
                                response.metadata
                            ) {
                                elizaLogger.info(
                                    `Posting akashic record reply for retry: ${key}`
                                );

                                const replyTweetId = await postReplyTweet(
                                    this.runtime,
                                    this.client,
                                    response.metadata.replyContent,
                                    response.metadata.originalTweetId,
                                    response.metadata.roomId,
                                    this.client.twitterConfig.TWITTER_USERNAME
                                );

                                if (replyTweetId) {
                                    elizaLogger.info(
                                        `✅ Successfully posted akashic record reply for retry: ${key}`
                                    );
                                } else {
                                    elizaLogger.warn(
                                        `❌ Failed to post akashic record reply for retry: ${key}`
                                    );
                                }
                            }
                        } catch (error) {
                            elizaLogger.error(
                                `Error in retry callback for ${key}:`,
                                error
                            );
                        }
                        return [];
                    };

                    // Attempt the retry
                    const success = await dkgHandler.retryFailedOperation(
                        key,
                        record,
                        retryCallback
                    );

                    if (success) {
                        elizaLogger.info(
                            `✅ Successfully retried DKG operation: ${key}`
                        );
                    } else {
                        elizaLogger.warn(
                            `❌ Retry attempt failed for DKG operation: ${key} (will try again next cycle)`
                        );
                    }
                } catch (retryError) {
                    elizaLogger.error(
                        `Error during retry of DKG operation ${key}:`,
                        retryError
                    );
                }
            }
        } catch (error) {
            elizaLogger.error(
                "Error checking/retrying failed DKG operations:",
                error
            );
        }
    }
}

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
import { postTweet, postReplyTweet, truncateToCompleteSentence } from "./tweet-utils";
import { pixDivinationTemplate } from "./divination-templates";
import { ArxivService } from "./arxiv-service";
import { NewsService } from "./news-service";
import { OracleService } from "./oracle-service";

export class TwitterDivinationClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private twitterUsername: string;
    private isDryRun: boolean;
    private arxivService: ArxivService;
    private newsService: NewsService;
    private oracleService: OracleService;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        // Use config username since profile isn't initialized yet
        const username = client.twitterConfig.TWITTER_USERNAME;
        this.arxivService = new ArxivService(runtime, username);
        this.newsService = new NewsService(runtime);
        this.oracleService = new OracleService();
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
            }>("twitter/" + this.client.twitterConfig.TWITTER_USERNAME + "/lastDivination");

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
            elizaLogger.debug(`Divination timing check: last post ${Math.floor(timeSinceLastPost / 60000)} minutes ago, delay needed: ${Math.floor(delay / 60000)} minutes`);

            if (Date.now() > lastPostTimestamp + delay) {
                elizaLogger.log("🔮 Performing divination now...");
                await this.performDivination();
            } else {
                elizaLogger.debug(`Waiting ${Math.floor((lastPostTimestamp + delay - Date.now()) / 60000)} more minutes before next divination`);
            }

            setTimeout(() => {
                this.divinationLoop();
            }, delay);

            const timeUntilNext = Math.max(0, Math.ceil((lastPostTimestamp + delay - Date.now()) / 60000));
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
            const researchPapers = await this.arxivService.fetchArxivPapers();
            const oracleReading = await this.oracleService.fetch8BitOracle();

            // Check if research papers are unavailable
            const noPapers = !researchPapers || (Array.isArray(researchPapers) && researchPapers.length === 1 && (researchPapers[0].title === "News unavailable" || researchPapers[0].title === "News feeds unavailable"));
            if (noPapers) {
                elizaLogger.warn("Skipping post: No research papers available.");
                return;
            }

            // Two-tier deduplication system to prevent duplicate posts
            let filteredArticles = Array.isArray(researchPapers) ? researchPapers : [researchPapers];
            const lastHeadlines = await this.runtime.cacheManager.get<string[]>(
                `twitter/${this.client.twitterConfig.TWITTER_USERNAME}/lastDivinationHeadlines`
            ) || [];
            
            // Load permanent arXiv history (all papers ever posted)
            // Stored as array in SQLite via cacheManager
            const arxivHistoryArray = await this.runtime.cacheManager.get<string[]>(
                `twitter/${this.client.twitterConfig.TWITTER_USERNAME}/arxivPaperHistory`
            ) || [];
            const arxivHistory = new Set<string>(arxivHistoryArray);

            if (lastHeadlines.length > 0 || arxivHistory.size > 0) {
                const uniqueArticles = [];
                
                for (const article of filteredArticles) {
                    let isDuplicate = false;
                    const articleTitle = article.title.toLowerCase().trim();
                    
                    // Check permanent arXiv history first (if this is an arXiv paper)
                    if (article.arxivId && arxivHistory.has(article.arxivId)) {
                        elizaLogger.debug(`ArXiv paper already posted: ${article.arxivId}`);
                        isDuplicate = true;
                        continue;
                    }
                    
                    // Tier 1: Exact string matching (catches identical headlines)
                    for (const cachedHeadline of lastHeadlines) {
                        if (articleTitle === cachedHeadline.toLowerCase().trim()) {
                            elizaLogger.debug(`EXACT MATCH duplicate filtered: "${article.title}"`);
                            isDuplicate = true;
                            break;
                        }
                    }
                    
                    if (!isDuplicate) {
                        // Tier 2: LLM similarity check (for nuanced story variations)
                        const similarityCheck = `Is "${article.title}" covering the same story as any of these recent headlines?

Recent headlines:
${lastHeadlines.map((h, i) => `${i+1}. ${h}`).join('\n')}

Respond ONLY with "YES" if covering the exact same story/event, "NO" if different stories.`;

                        try {
                            const response = await generateText({
                                runtime: this.runtime,
                                context: similarityCheck,
                                modelClass: ModelClass.SMALL,
                            });

                            if (response.toLowerCase().includes("yes")) {
                                elizaLogger.debug(`LLM SIMILARITY duplicate filtered: "${article.title}"`);
                                isDuplicate = true;
                            }
                        } catch (error) {
                            elizaLogger.warn(`LLM similarity check failed for "${article.title}":`, error);
                            // Continue without LLM check if it fails
                        }
                    }
                    
                    if (!isDuplicate) {
                        uniqueArticles.push(article);
                    }
                }
                
                filteredArticles = uniqueArticles;
                elizaLogger.debug(`Deduplication results: ${filteredArticles.length} unique articles from ${Array.isArray(researchPapers) ? researchPapers.length : 1} candidates`);
            }

            // If all articles were filtered out as duplicates, skip this cycle
            if (filteredArticles.length === 0) {
                elizaLogger.warn("Skipping divination: All articles are duplicates of recent headlines");
                return;
            }

            // Now select the best article from the unique articles
            const selectedArticle = await this.newsService.selectMostEngaging(filteredArticles);

            // Format the data before passing to template
            const formattedResearch = JSON.stringify(researchPapers, null, 2);
            const formattedOracle = JSON.stringify(
                oracleReading,
                null,
                2
            );

            const roomId = stringToUuid(
                "twitter_generate_room-" + this.client.twitterConfig.TWITTER_USERNAME
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
                    researchPaper: formattedResearch,
                    oracleReading: formattedOracle,
                    maxTweetLength: this.client.twitterConfig.MAX_TWEET_LENGTH,
                    twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
                }
            );

            const context = composeContext({
                state,
                template: pixDivinationTemplate,
            });

            elizaLogger.log("divination sending context: ", context);

            // Generate interpretation
            elizaLogger.debug("🤖 Generating LLM interpretation...");
            const genStart = Date.now();
            const interpretation = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });
            const genTime = Date.now() - genStart;
            
            elizaLogger.info(`🤖 LLM generation complete: ${interpretation.length} chars in ${genTime}ms`);
            elizaLogger.debug(`📝 Raw LLM response: ${interpretation.substring(0, 300)}...`);

            // First attempt to clean content
            let cleanedContent = "";

            // Try parsing as JSON first
            elizaLogger.debug("🧹 Parsing LLM response...");
            try {
                const parsedResponse = JSON.parse(interpretation);
                elizaLogger.debug("✅ JSON parse successful:", Object.keys(parsedResponse));
                
                if (parsedResponse.text) {
                    cleanedContent = parsedResponse.text;
                    elizaLogger.debug("✅ Using parsedResponse.text field");
                } else if (typeof parsedResponse === "string") {
                    cleanedContent = parsedResponse;
                    elizaLogger.debug("✅ Using parsedResponse as string");
                }
            } catch (jsonError) {
                elizaLogger.debug("⚠️ JSON parse failed, using text cleanup:", jsonError.message);
                
                // If not JSON, clean the raw content
                cleanedContent = interpretation
                    .replace(/^\s*{?\s*"text":\s*"|"\s*}?\s*$/g, "") // Remove JSON-like wrapper
                    .replace(/^['"](.*)['"]$/g, "$1") // Remove quotes
                    .replace(/\\"/g, '"') // Unescape quotes
                    .replace(/\\n/g, "\n") // Unescape newlines
                    .trim();
                
                elizaLogger.debug(`🧹 Text cleanup result: ${cleanedContent.length} chars`);
            }

            if (!cleanedContent) {
                elizaLogger.error("💥 Failed to extract valid content from response:", {
                    rawResponse: interpretation.substring(0, 500),
                    responseLength: interpretation.length,
                    attempted: "JSON parsing + text cleanup",
                    jsonParseAttempted: true,
                    textCleanupAttempted: true
                });
                return;
            }

            elizaLogger.info(`✅ Content extracted successfully: ${cleanedContent.length} chars`);

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
                const tweetId = await postTweet(
                    this.runtime,
                    this.client,
                    cleanedContent,
                    roomId,
                    interpretation,
                    this.twitterUsername
                );

                // Post citation as reply tweet  
                if (tweetId && selectedArticle.link) {
                    try {
                        const citationContent = `📄 ${selectedArticle.title}\n\n${selectedArticle.authors ? `By ${selectedArticle.authors}\n` : ''}${selectedArticle.link}`;
                        
                        elizaLogger.log(`Posting citation reply (${citationContent.length} chars):\n${citationContent}`);
                        
                        const replyTweetId = await postReplyTweet(
                            this.runtime,
                            this.client,
                            citationContent,
                            tweetId,
                            roomId,
                            this.twitterUsername
                        );
                        
                        if (replyTweetId) {
                            elizaLogger.info("Successfully posted citation reply tweet");
                        } else {
                            elizaLogger.warn("Failed to post citation reply tweet");
                        }
                    } catch (replyError) {
                        elizaLogger.error("Error posting citation reply:", replyError);
                        // Don't throw - main tweet was successful
                    }
                }

                // Update headline cache after successful post
                const lastHeadlines = await this.runtime.cacheManager.get<string[]>(
                    `twitter/${this.client.twitterConfig.TWITTER_USERNAME}/lastDivinationHeadlines`
                ) || [];
                
                lastHeadlines.unshift(selectedArticle.title);
                // Keep 100 headlines for ~3 months of deduplication history
                if (lastHeadlines.length > 100) {
                    lastHeadlines.pop();
                }
                
                await this.runtime.cacheManager.set(
                    `twitter/${this.client.twitterConfig.TWITTER_USERNAME}/lastDivinationHeadlines`,
                    lastHeadlines
                );
                
                // Permanently store arXiv paper ID if it exists
                if (selectedArticle.arxivId) {
                    const arxivHistoryArray = await this.runtime.cacheManager.get<string[]>(
                        `twitter/${this.client.twitterConfig.TWITTER_USERNAME}/arxivPaperHistory`
                    ) || [];
                    
                    if (!arxivHistoryArray.includes(selectedArticle.arxivId)) {
                        arxivHistoryArray.push(selectedArticle.arxivId);
                        
                        // Store back to SQLite via cacheManager
                        await this.runtime.cacheManager.set(
                            `twitter/${this.client.twitterConfig.TWITTER_USERNAME}/arxivPaperHistory`,
                            arxivHistoryArray
                        );
                        
                        elizaLogger.debug(`Added arXiv paper to permanent history: ${selectedArticle.arxivId}`);
                    }
                }
                
                elizaLogger.debug(`Updated headline cache with: "${selectedArticle.title}"`);

                // Also update the divination timestamp cache for interval management
                await this.runtime.cacheManager.set(
                    "twitter/" + this.client.twitterConfig.TWITTER_USERNAME + "/lastDivination",
                    {
                        timestamp: Date.now(),
                    }
                );

                // Integrate with DKG - store divination to OriginTrail DKG
                try {
                    elizaLogger.info("Attempting to store divination to DKG...");
                    
                    // Create synthetic memory for action processing
                    const actionMemory: Memory = {
                        id: stringToUuid(`divination-action-${Date.now()}`),
                        userId: this.runtime.agentId,
                        agentId: this.runtime.agentId,
                        roomId: roomId,
                        content: {
                            text: "Store divination to DKG",
                            action: "INSERT_DIVINATION_MEMORY"
                        },
                        createdAt: Date.now(),
                        embedding: getEmbeddingZeroVector()
                    };

                    // Prepare structured state for DKG action
                    const dkgState = {
                        ...state,
                        oracleReading: formattedOracle,      // Already JSON string
                        researchPaper: formattedResearch,    // JSON string  
                        interpretation: cleanedContent,      // Final tweet text
                        userId: this.runtime.agentId,
                        userIdentifier: this.client.twitterConfig.TWITTER_USERNAME,
                        tweetId: tweetId,                    // Original tweet ID for threading
                        roomId: roomId                       // Room ID for reply posting
                    };

                    // Create callback to handle reply tweet posting
                    const dkgCallback = async (response: any) => {
                        try {
                            if (response.action === "REPLY_TWEET" && response.metadata) {
                                elizaLogger.info("DKG returned akashic record, posting reply tweet...");
                                
                                const replyTweetId = await postReplyTweet(
                                    this.runtime,
                                    this.client,
                                    response.metadata.replyContent,
                                    response.metadata.originalTweetId,
                                    response.metadata.roomId,
                                    this.twitterUsername
                                );
                                
                                if (replyTweetId) {
                                    elizaLogger.info("Successfully posted akashic record reply tweet");
                                } else {
                                    elizaLogger.warn("Failed to post akashic record reply tweet");
                                }
                            }
                        } catch (error) {
                            elizaLogger.error("Error posting akashic record reply:", error);
                        }
                        return []; // Return empty array as required by HandlerCallback type
                    };

                    // Process action asynchronously with callback - don't await to avoid blocking divination flow
                    this.runtime.processActions(actionMemory, [actionMemory], dkgState, dkgCallback)
                        .then(() => {
                            elizaLogger.info("Successfully processed DKG storage action");
                        })
                        .catch((dkgError) => {
                            // Log warning but don't throw - DKG failure shouldn't break divination
                            elizaLogger.warn("DKG storage failed, but tweet was successful:", {
                                error: dkgError instanceof Error ? {
                                    message: dkgError.message,
                                    stack: dkgError.stack
                                } : dkgError,
                                tweet_content: cleanedContent.substring(0, 100) + "..."
                            });
                        });
                    
                } catch (dkgError) {
                    // Log warning but don't throw - DKG failure shouldn't break divination
                    elizaLogger.warn("Failed to initiate DKG storage, but tweet was successful:", {
                        error: dkgError instanceof Error ? {
                            message: dkgError.message,
                            stack: dkgError.stack
                        } : dkgError,
                        tweet_content: cleanedContent.substring(0, 100) + "..."
                    });
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

    // Add this new method for testing
    public async testDivination(): Promise<string> {
        // Force dry run mode
        this.isDryRun = true;

        try {
            const researchPapers = await this.arxivService.fetchArxivPapers();
            const oracleReading = await this.oracleService.fetch8BitOracle();

            // Format the data before passing to template
            const formattedResearch = JSON.stringify(researchPapers, null, 2);
            const formattedOracle = JSON.stringify(
                oracleReading,
                null,
                2
            );

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
                template: pixDivinationTemplate,
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
                const parsedResponse = JSON.parse(interpretation);
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
}
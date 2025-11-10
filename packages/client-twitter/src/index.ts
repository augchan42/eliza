import { Client, elizaLogger, IAgentRuntime } from "@elizaos/core";
import { ClientBase } from "./base.ts";
import { validateTwitterConfig, TwitterConfig } from "./environment.ts";
import { TwitterInteractionClient } from "./interactions.ts";
import { TwitterPostClient } from "./post.ts";
import { TwitterSearchClient } from "./search.ts";
import { TwitterDivinationClient } from "./divination.ts";

class TwitterManager {
    client: ClientBase;
    post: TwitterPostClient;
    search: TwitterSearchClient;
    interaction?: TwitterInteractionClient;
    divination: TwitterDivinationClient;
    constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig) {
        this.client = new ClientBase(runtime, twitterConfig);
        this.post = new TwitterPostClient(this.client, runtime);

        if (twitterConfig.TWITTER_SEARCH_ENABLE) {
            // this searches topics from character file
            elizaLogger.warn("Twitter/X client running in a mode that:");
            elizaLogger.warn("1. violates consent of random users");
            elizaLogger.warn("2. burns your rate limit");
            elizaLogger.warn("3. can get your account banned");
            elizaLogger.warn("use at your own risk");
            this.search = new TwitterSearchClient(this.client, runtime);
        }

        if (twitterConfig.TWITTER_INTERACTIONS_ENABLE) {
            this.interaction = new TwitterInteractionClient(this.client, runtime);
        }
        this.divination = new TwitterDivinationClient(this.client, runtime);
        elizaLogger.log("📱 Twitter manager initialized with divination client");
    }
}

export const TwitterClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        const twitterConfig: TwitterConfig =
            await validateTwitterConfig(runtime);

        elizaLogger.log("Twitter client started");

        const manager = new TwitterManager(runtime, twitterConfig);

        await manager.client.init();

        // await manager.post.start();

        if (manager.search) await manager.search.start();

        if (manager.interaction) {
            await manager.interaction.start();
        } else {
            elizaLogger.log("📵 Twitter interactions disabled");
        }

        if (manager.divination) {
            elizaLogger.log("🎯 Starting Twitter divination client...");
            await manager.divination.start();
        } else {
            elizaLogger.warn("❌ No divination client found - this shouldn't happen");
        }

        return manager;
    },
    async stop(_runtime: IAgentRuntime, client?: any) {
        if (client && typeof client.stop === 'function') {
            await client.stop();
            elizaLogger.success("✅ Twitter client stopped successfully");
        } else {
            elizaLogger.warn("Twitter client instance not provided or missing stop method");
        }
    },
};

export default TwitterClientInterface;

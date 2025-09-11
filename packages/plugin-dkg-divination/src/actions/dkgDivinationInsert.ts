// packages/plugin-divination/src/actions/dkgDivinationInsert.ts
import {
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    HandlerCallback,
    type Action,
} from "@elizaos/core";
import DKG from "dkg.js";

export const dkgDivinationInsert: Action = {
    name: "INSERT_DIVINATION_MEMORY",
    similes: [], // No similes to prevent accidental triggering
    description: "Store market divination readings in the OriginTrail DKG - ONLY USE FOR /scan COMMAND",
    examples: [], // Action is called programmatically, no examples needed
    validate: async (runtime: IAgentRuntime) => {
        const requiredEnvVars = [
            "DKG_ENVIRONMENT",
            "DKG_HOSTNAME",
            "DKG_PORT",
            "DKG_BLOCKCHAIN_NAME",
            "DKG_PUBLIC_KEY",
            "DKG_PRIVATE_KEY",
        ];

        const missingVars = requiredEnvVars.filter(
            (varName) => !runtime.getSetting(varName)
        );

        if (missingVars.length > 0) {
            elizaLogger.error(
                `Missing required environment variables: ${missingVars.join(", ")}`
            );
            return false;
        }

        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback: HandlerCallback,
    ): Promise<boolean> => {
        try {
            elizaLogger.info("Starting DKG divination insert with:", {
                message_id: message.id,
                has_state: !!state,
                state_keys: Object.keys(state),
                oracle_reading_type: typeof state.oracleReading,
                market_sentiment_type: typeof state.marketSentiment,
                news_events_type: typeof state.newsEvent
            });

            const DkgClient = new DKG({
                environment: runtime.getSetting("DKG_ENVIRONMENT"),
                endpoint: runtime.getSetting("DKG_HOSTNAME"),
                port: runtime.getSetting("DKG_PORT"),
                blockchain: {
                    name: runtime.getSetting("DKG_BLOCKCHAIN_NAME"),
                    publicKey: runtime.getSetting("DKG_PUBLIC_KEY"),
                    privateKey: runtime.getSetting("DKG_PRIVATE_KEY"),
                },
                maxNumberOfRetries: 300,
                frequency: 2,
                contentType: "all",
                nodeApiVersion: "/v1",
            });

            // Extract data from state
            const hexagramData = JSON.parse(state.oracleReading as string);
            const marketSentiment = state.marketSentiment as string; // Plain text sentiment analysis
            const newsEvents = JSON.parse(state.newsEvent as string);
            const interpretation = state.interpretation as string;

            elizaLogger.info("Parsed state data for knowledge graph:", {
                has_hexagram: !!hexagramData,
                hexagram_number: hexagramData?.interpretation?.currentHexagram?.number,
                has_market_sentiment: !!marketSentiment,
                has_news: !!newsEvents,
                news_count: newsEvents?.length,
                has_interpretation: !!interpretation,
            });

            const memoryKnowledgeGraph = {
                "@context": [
                    "https://schema.org",
                    {
                        hexagram: "https://app.8bitoracle.ai/schema/hexagram#",
                        divination: "https://app.8bitoracle.ai/schema/divination#",
                    },
                ],
                "@type": ["CreativeWork", "divination:Reading"],
                "@id": `urn:hexagram:${hexagramData.interpretation.currentHexagram.number}`,
                name: `${hexagramData.interpretation.currentHexagram.name.pinyin} - ${hexagramData.interpretation.currentHexagram.name.chinese}`,
                dateCreated: new Date().toISOString(),
                author: {
                    "@type": "Person",
                    "@id": state.userId,
                    identifier: state.userIdentifier || state.userId,
                },
                "hexagram:data": hexagramData,
                "divination:context": {
                    marketSentiment,
                    newsEvents,
                    interpretation,
                },
            };

            elizaLogger.info("Persisting divination to DKG:", {
                hexagram_number: hexagramData.interpretation.currentHexagram.number,
                hexagram_name: hexagramData.interpretation.currentHexagram.name,
                has_transformed: !!hexagramData.interpretation.transformedHexagram,
                asset_template: JSON.stringify(memoryKnowledgeGraph, null, 2)
            });

            const createAssetResult = await DkgClient.asset.create(
                {
                    public: memoryKnowledgeGraph,
                },
                { epochsNum: 12 },
            );

            if (createAssetResult.UAL) {
                const explorerLink = `https://dkg.${runtime.getSetting("DKG_ENVIRONMENT")}.origintrail.io/`;
                elizaLogger.info("Successfully persisted divination to DKG:", {
                    UAL: createAssetResult.UAL,
                    explorer_link: `${explorerLink}${createAssetResult.UAL}`,
                    hexagram: hexagramData.interpretation.currentHexagram.number
                });
                callback({
                    text: `Created a new divination memory!\n\nRead my mind on @origin_trail Decentralized Knowledge Graph ${explorerLink}${createAssetResult.UAL}`,
                });
                return true;
            } else {
                throw new Error("No UAL returned from DKG");
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            elizaLogger.error("Error in divination DKG insert:", {
                error: errorMsg,
                memory_id: message.id,
            });
            callback({
                text: `Failed to create divination memory: ${errorMsg}`,
                error: true,
            });
            return false;
        }
    },
};
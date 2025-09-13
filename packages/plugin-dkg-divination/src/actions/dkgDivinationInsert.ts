// packages/plugin-divination/src/actions/dkgDivinationInsert.ts
import {
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    HandlerCallback,
    type Action,
    ModelClass,
    generateText,
} from "@elizaos/core";
import DKG from "dkg.js";
import schemaContext from "../schema-context.json";

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

            // Extract data from state with error handling
            let hexagramData, newsEvents;
            try {
                hexagramData = JSON.parse(state.oracleReading as string);
            } catch (error) {
                elizaLogger.error("Failed to parse oracleReading JSON:", {
                    error: error.message,
                    data: state.oracleReading
                });
                throw new Error(`Invalid oracleReading JSON: ${error.message}`);
            }
            
            try {
                newsEvents = JSON.parse(state.newsEvent as string);
            } catch (error) {
                elizaLogger.error("Failed to parse newsEvent JSON:", {
                    error: error.message,
                    data: state.newsEvent
                });
                throw new Error(`Invalid newsEvent JSON: ${error.message}`);
            }
            
            const marketSentiment = state.marketSentiment as string; // Plain text sentiment analysis
            const interpretation = state.interpretation as string;

            elizaLogger.info("Parsed state data for knowledge graph:", {
                has_hexagram: !!hexagramData,
                hexagram_number: hexagramData?.interpretation?.currentHexagram?.number,
                has_market_sentiment: !!marketSentiment,
                has_news: !!newsEvents,
                news_count: newsEvents?.length,
                has_interpretation: !!interpretation,
            });

            // Create a clean, essential-only hexagram data structure
            const cleanHexagramData = {
                hexagramLineValues: hexagramData.hexagramLineValues,
                interpretation: {
                    currentHexagram: hexagramData.interpretation.currentHexagram,
                    transformedHexagram: hexagramData.interpretation.transformedHexagram,
                    changes: hexagramData.interpretation.changes
                }
                // Exclude fullHexagramData (computation details) to reduce size
            };

            const memoryKnowledgeGraph = {
                "@context": schemaContext["@context"],
                "@type": "CreativeWork",
                "@id": `urn:divination:${message.id}`,
                name: `${hexagramData.interpretation.currentHexagram.name.pinyin} - ${hexagramData.interpretation.currentHexagram.name.chinese}`,
                dateCreated: new Date().toISOString(),
                author: {
                    "@type": "Person",
                    identifier: state.userIdentifier || state.userId,
                },
                keywords: [`hexagram-${hexagramData.interpretation.currentHexagram.number}`, "divination", "market-analysis"],
                additionalProperty: [
                    {
                        "@type": "PropertyValue",
                        name: "hexagramData",
                        value: JSON.stringify(cleanHexagramData)
                    },
                    {
                        "@type": "PropertyValue", 
                        name: "marketSentiment",
                        value: marketSentiment
                    },
                    {
                        "@type": "PropertyValue",
                        name: "newsEvents", 
                        value: JSON.stringify(newsEvents)
                    },
                    {
                        "@type": "PropertyValue",
                        name: "interpretation",
                        value: interpretation
                    }
                ]
            };

            elizaLogger.info("Persisting divination to DKG:", {
                hexagram_number: hexagramData.interpretation.currentHexagram.number,
                hexagram_name: hexagramData.interpretation.currentHexagram.name,
                has_transformed: !!hexagramData.interpretation.transformedHexagram,
                asset_template: JSON.stringify(memoryKnowledgeGraph, null, 2)
            });

            let createAssetResult;

            try {
                elizaLogger.log("Publishing divination to DKG");
                elizaLogger.log(
                    `Knowledge Asset: ${JSON.stringify(memoryKnowledgeGraph, null, 2)}`
                );

                createAssetResult = await DkgClient.asset.create(
                    {
                        public: memoryKnowledgeGraph,
                    },
                    { epochsNum: 12 },
                );

                elizaLogger.log("======================== DIVINATION ASSET CREATED");
                elizaLogger.log(JSON.stringify(createAssetResult));
            } catch (error) {
                elizaLogger.error(
                    "Error occurred while publishing divination to DKG:",
                    error.message,
                );

                if (error.stack) {
                    elizaLogger.error("Stack trace:", error.stack);
                }
                if (error.response) {
                    elizaLogger.error(
                        "Response data:",
                        JSON.stringify(error.response.data, null, 2),
                    );
                }

                // LLM-powered JSON fix retry logic
                if (
                    error.message.includes("Unexpected") ||
                    error.message.includes("JSON") ||
                    error.message.includes("schema") ||
                    error.message.includes("malformed")
                ) {
                    elizaLogger.warn(
                        "Detected JSON/schema formatting issue. Attempting LLM fix...",
                    );
                    try {
                        const fixedJSON = await generateText({
                            runtime,
                            context: `Fix this malformed JSON-LD and return ONLY the corrected JSON:

${JSON.stringify(memoryKnowledgeGraph, null, 2)}

Fix: quotes, commas, brackets. Keep structure intact. No explanations.`,
                            modelClass: ModelClass.SMALL, // Use smaller model for simple JSON fixes
                        });

                        elizaLogger.log(
                            `Fixed JSON generated by LLM: ${fixedJSON}. Retrying...`,
                        );

                        createAssetResult = await DkgClient.asset.create(
                            { public: JSON.parse(fixedJSON) },
                            { epochsNum: 12 },
                        );

                        elizaLogger.log(
                            "======================== DIVINATION ASSET CREATED AFTER LLM FIX",
                        );
                        elizaLogger.log(JSON.stringify(createAssetResult));
                    } catch (llmError) {
                        elizaLogger.error(
                            "Failed to fix divination JSON using LLM:",
                            llmError.message,
                        );
                        throw error; // Re-throw original error
                    }
                } else {
                    throw error; // Re-throw non-JSON errors
                }
            }

            if (createAssetResult?.UAL) {
                const explorerLink = `https://dkg.${runtime.getSetting("DKG_ENVIRONMENT")}.origintrail.io/`;
                const akashicRecordUrl = `@origin_trail akashic record: ${explorerLink}${createAssetResult.UAL}`;
                
                elizaLogger.info("Successfully persisted divination to DKG:", {
                    UAL: createAssetResult.UAL,
                    explorer_link: `${explorerLink}${createAssetResult.UAL}`,
                    hexagram: hexagramData.interpretation.currentHexagram.number,
                    akashic_record: akashicRecordUrl
                });
                
                // Call callback only if provided (for interactive use or reply posting)
                if (callback) {
                    callback({
                        text: akashicRecordUrl,
                        action: "REPLY_TWEET", // Signal to post as reply
                        metadata: {
                            originalTweetId: state.tweetId,
                            roomId: state.roomId,
                            replyContent: akashicRecordUrl
                        }
                    });
                }
                return true;
            } else {
                throw new Error("No UAL returned from DKG after processing");
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
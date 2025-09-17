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
import schemaContext from "../schema-context.json";
import { DKGOperationHandler } from "../dkg-operation-handler";

export const dkgDivinationInsert: Action = {
    name: "INSERT_DIVINATION_MEMORY",
    similes: [], // No similes to prevent accidental triggering
    description:
        "Store market divination readings in the OriginTrail DKG - ONLY USE FOR /scan COMMAND",
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
        callback: HandlerCallback
    ): Promise<boolean> => {
        try {
            elizaLogger.info("Starting DKG divination insert with:", {
                message_id: message.id,
                has_state: !!state,
                state_keys: Object.keys(state),
                oracle_reading_type: typeof state.oracleReading,
                content_item_type: typeof state.contentItem,
                content_type: state.contentType,
            });

            // Initialize DKG operation handler with failover capabilities
            const dkgHandler = new DKGOperationHandler(runtime);

            // Extract data from state with error handling
            let hexagramData, contentItem;
            try {
                hexagramData = JSON.parse(state.oracleReading as string);
            } catch (error) {
                elizaLogger.error("Failed to parse oracleReading JSON:", {
                    error: error.message,
                    data: state.oracleReading,
                });
                throw new Error(`Invalid oracleReading JSON: ${error.message}`);
            }

            // Parse contentItem (generic content data - research/news/podcast/etc)
            if (state.contentItem && state.contentItem !== 'undefined') {
                try {
                    contentItem = JSON.parse(state.contentItem as string);
                } catch (error) {
                    elizaLogger.warn("Failed to parse contentItem JSON, using empty object:", {
                        error: error.message,
                        data: state.contentItem,
                    });
                    contentItem = {};
                }
            } else {
                contentItem = {};
            }

            // Extract content type and metadata
            const contentType = (state.contentType as string) || "unknown";
            const interpretation = state.interpretation as string;

            elizaLogger.info("Parsed state data for knowledge graph:", {
                has_hexagram: !!hexagramData,
                hexagram_number:
                    hexagramData?.interpretation?.currentHexagram?.number,
                content_type: contentType,
                content_title: contentItem.title || "unknown",
                content_id: contentItem.id || "unknown",
                has_interpretation: !!interpretation,
            });

            // Create a clean, essential-only hexagram data structure
            const cleanHexagramData = {
                hexagramLineValues: hexagramData.hexagramLineValues,
                interpretation: {
                    currentHexagram:
                        hexagramData.interpretation.currentHexagram,
                    transformedHexagram:
                        hexagramData.interpretation.transformedHexagram,
                    changes: hexagramData.interpretation.changes,
                },
                // Exclude fullHexagramData (computation details) to reduce size
            };

            const memoryKnowledgeGraph = {
                "@context": schemaContext["@context"],
                "@type": "CreativeWork",
                "@id": `urn:divination:${message.id}`,
                name: `${hexagramData.interpretation.currentHexagram.name.pinyin} - ${contentItem.title || 'Unknown Content'}`,
                description: `Oracle divination on ${contentType} content using the I-Ching. Hexagrams by 8bitoracle.ai (Tech Noir I-Ching)`,
                dateCreated: new Date().toISOString(),
                author: {
                    "@type": "Person",
                    identifier: state.userIdentifier || state.userId,
                },
                keywords: [
                    `hexagram-${hexagramData.interpretation.currentHexagram.number}`,
                    "divination",
                    `${contentType}-analysis`,
                    contentType,
                    "8bitoracle",
                ],
                additionalProperty: [
                    {
                        "@type": "PropertyValue",
                        name: "hexagramData",
                        value: JSON.stringify(cleanHexagramData),
                    },
                    {
                        "@type": "PropertyValue",
                        name: "oracleSource",
                        value: "8-Bit Oracle (Tech Noir I-Ching)",
                    },
                    {
                        "@type": "PropertyValue",
                        name: "oracleUrl",
                        value: "https://8bitoracle.ai",
                    },
                    {
                        "@type": "PropertyValue",
                        name: "contentItem",
                        value: JSON.stringify(contentItem),
                    },
                    {
                        "@type": "PropertyValue",
                        name: "contentType",
                        value: contentType,
                    },
                    {
                        "@type": "PropertyValue",
                        name: "interpretation",
                        value: interpretation,
                    },
                ],
            };

            elizaLogger.info("Starting persistent DKG storage:", {
                hexagram_number: hexagramData.interpretation.currentHexagram.number,
                hexagram_name: hexagramData.interpretation.currentHexagram.name,
                has_transformed: !!hexagramData.interpretation.transformedHexagram,
                memory_id: message.id,
                divination_id: `divination-${message.id}`
            });

            // Execute DKG operation with failover and enhanced error handling
            try {
                await dkgHandler.createAsset(memoryKnowledgeGraph, state, callback);
                elizaLogger.info("✅ Divination completed successfully, DKG archival completed");
                return true;
            } catch (error) {
                elizaLogger.error(`DKG storage failed permanently for divination-${message.id}:`, {
                    error: error.message,
                    memory_id: message.id,
                    divination_id: `divination-${message.id}`,
                    is_permanent_failure: true
                });

                // Still return true since divination succeeded, just DKG archival failed
                elizaLogger.info("✅ Divination completed successfully, DKG archival failed");
                return true;
            }
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
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

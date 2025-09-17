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

            const DkgClient = new DKG({
                environment: runtime.getSetting("DKG_ENVIRONMENT"),
                endpoint: runtime.getSetting("DKG_HOSTNAME"),
                port: runtime.getSetting("DKG_PORT"),
                blockchain: {
                    name: runtime.getSetting("DKG_BLOCKCHAIN_NAME"),
                    publicKey: runtime.getSetting("DKG_PUBLIC_KEY"),
                    privateKey: runtime.getSetting("DKG_PRIVATE_KEY"),
                },
                maxNumberOfRetries: 1,  // Let our custom retry wrapper handle persistence
                frequency: 1,
                contentType: "all",
                nodeApiVersion: "/v1",
            });


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

            // DKG retry system with limits and smart error handling
            const createBoundedDKGRetry = (operation, identifier) => {
                const startTime = Date.now();
                const MAX_ATTEMPTS = 5; // 1 initial + 4 retries
                const MAX_TOTAL_TIME = 300000; // 5 minutes total
                let attempt = 1;

                // Check if error is retryable
                const isRetryableError = (error) => {
                    const errorMsg = error.message?.toLowerCase() || '';
                    const errorStr = error.toString?.().toLowerCase() || '';

                    // Permanent failures - don't retry
                    if (errorMsg.includes('insufficient funds') ||
                        errorMsg.includes('insufficient balance') ||
                        errorMsg.includes('invalid private key') ||
                        errorMsg.includes('invalid credentials') ||
                        errorMsg.includes('unauthorized') ||
                        errorMsg.includes('forbidden') ||
                        errorStr.includes('401') ||
                        errorStr.includes('403') ||
                        errorStr.includes('400')) {
                        elizaLogger.error(`🚫 Permanent DKG failure detected - not retrying: ${errorMsg}`);
                        return false;
                    }

                    // Retryable errors: network issues, timeouts, 5xx, rate limits
                    return errorMsg.includes('timeout') ||
                           errorMsg.includes('network') ||
                           errorMsg.includes('econnreset') ||
                           errorMsg.includes('enotfound') ||
                           errorStr.includes('5') || // 5xx errors
                           errorMsg.includes('rate limit') ||
                           errorMsg.includes('too many requests');
                };

                const boundedRetry = async () => {
                    try {
                        elizaLogger.info(`DKG attempt ${attempt}/${MAX_ATTEMPTS} for ${identifier} (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
                        const result = await operation();
                        elizaLogger.info(`✅ DKG operation succeeded on attempt ${attempt}/${MAX_ATTEMPTS} after ${Math.round((Date.now() - startTime) / 1000)}s for ${identifier}`);
                        return result;
                    } catch (error) {
                        const elapsedTime = Date.now() - startTime;
                        const errorMsg = error.message || error.toString();

                        // Check for permanent failures or limits exceeded
                        if (!isRetryableError(error)) {
                            elizaLogger.error(`🚫 DKG permanent failure for ${identifier}: ${errorMsg}`);
                            throw new Error(`DKG permanent failure: ${errorMsg}`);
                        }

                        if (attempt >= MAX_ATTEMPTS) {
                            elizaLogger.error(`🚫 DKG max attempts (${MAX_ATTEMPTS}) exceeded for ${identifier} after ${Math.round(elapsedTime/1000)}s: ${errorMsg}`);
                            throw new Error(`DKG failed after ${MAX_ATTEMPTS} attempts: ${errorMsg}`);
                        }

                        if (elapsedTime >= MAX_TOTAL_TIME) {
                            elizaLogger.error(`🚫 DKG max time (${MAX_TOTAL_TIME/1000}s) exceeded for ${identifier}: ${errorMsg}`);
                            throw new Error(`DKG failed after ${MAX_TOTAL_TIME/1000}s timeout: ${errorMsg}`);
                        }

                        // Calculate next delay: exponential backoff with jitter
                        const baseDelay = Math.min(3000 * Math.pow(1.5, attempt - 1), 60000); // Start 3s, cap at 1min
                        const jitter = Math.random() * 2000; // 0-2s jitter
                        const delay = baseDelay + jitter;

                        elizaLogger.warn(`❌ DKG retryable failure, attempt ${attempt}/${MAX_ATTEMPTS} for ${identifier}, retrying in ${Math.round(delay/1000)}s:`, {
                            error: errorMsg,
                            attempt,
                            max_attempts: MAX_ATTEMPTS,
                            elapsed_seconds: Math.round(elapsedTime / 1000),
                            next_delay_seconds: Math.round(delay / 1000)
                        });

                        attempt++;

                        // Wait and retry (with proper promise chain)
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return boundedRetry();
                    }
                };
                return boundedRetry();
            };

            // Create persistent DKG operation with LLM JSON fix capability
            const dkgOperation = async () => {
                elizaLogger.log("Publishing divination to DKG");
                elizaLogger.log(`Knowledge Asset: ${JSON.stringify(memoryKnowledgeGraph, null, 2)}`);

                let createAssetResult;
                try {
                    createAssetResult = await DkgClient.asset.create(
                        { public: memoryKnowledgeGraph },
                        { epochsNum: 12 }
                    );
                } catch (error) {
                    // LLM-powered JSON fix for schema/format errors
                    if (
                        error.message.includes("Unexpected") ||
                        error.message.includes("JSON") ||
                        error.message.includes("schema") ||
                        error.message.includes("malformed")
                    ) {
                        elizaLogger.warn("Detected JSON/schema issue, attempting LLM fix...");

                        const fixedJSON = await generateText({
                            runtime,
                            context: `Fix this malformed JSON-LD and return ONLY the corrected JSON:

${JSON.stringify(memoryKnowledgeGraph, null, 2)}

Fix: quotes, commas, brackets. Keep structure intact. No explanations.`,
                            modelClass: ModelClass.SMALL,
                        });

                        elizaLogger.log(`Fixed JSON generated by LLM: ${fixedJSON}. Retrying...`);
                        createAssetResult = await DkgClient.asset.create(
                            { public: JSON.parse(fixedJSON) },
                            { epochsNum: 12 }
                        );

                        elizaLogger.log("======================== DIVINATION ASSET CREATED AFTER LLM FIX");
                    } else {
                        throw error; // Re-throw non-JSON errors for retry
                    }
                }

                if (!createAssetResult?.UAL) {
                    throw new Error("No UAL returned from DKG after processing");
                }

                elizaLogger.log("======================== DIVINATION ASSET CREATED");
                elizaLogger.log(JSON.stringify(createAssetResult));

                // Process successful result
                elizaLogger.debug("DKG UAL processing:", {
                    raw_UAL: createAssetResult.UAL,
                    UAL_type: createAssetResult.UAL.startsWith('https://') ? 'full_url' : 'identifier',
                    UAL_length: createAssetResult.UAL.length,
                    DKG_ENVIRONMENT: runtime.getSetting("DKG_ENVIRONMENT")
                });

                const finalUrl = createAssetResult.UAL.startsWith('https://')
                    ? createAssetResult.UAL
                    : `https://dkg-${runtime.getSetting("DKG_ENVIRONMENT")}.origintrail.io/explore?ual=${createAssetResult.UAL}`;

                const akashicRecordUrl = `@origin_trail akashic record: ${finalUrl}`;

                elizaLogger.info("Successfully persisted divination to DKG:", {
                    UAL: createAssetResult.UAL,
                    explorer_link: finalUrl,
                    hexagram: hexagramData.interpretation.currentHexagram.number,
                    akashic_record: akashicRecordUrl,
                });

                // Execute callback when DKG succeeds
                if (callback) {
                    elizaLogger.debug("Sending callback with akashic record URL:", {
                        akashic_record_url: akashicRecordUrl,
                        final_url_in_callback: finalUrl,
                        original_tweet_id: state.tweetId,
                        callback_text_length: akashicRecordUrl.length
                    });

                    callback({
                        text: akashicRecordUrl,
                        action: "REPLY_TWEET",
                        metadata: {
                            originalTweetId: state.tweetId,
                            roomId: state.roomId,
                            replyContent: akashicRecordUrl,
                        },
                    });
                }

                return createAssetResult;
            };

            // Start bounded background retry with intelligent error handling
            createBoundedDKGRetry(dkgOperation, `divination-${message.id}`).catch(err => {
                elizaLogger.error(`DKG storage failed permanently for divination-${message.id}:`, {
                    error: err.message,
                    memory_id: message.id,
                    divination_id: `divination-${message.id}`,
                    is_permanent_failure: true
                });
            });

            // Return immediately - divination succeeded, DKG storage is background archival
            elizaLogger.info("✅ Divination completed successfully, DKG archival in progress");
            return true;
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

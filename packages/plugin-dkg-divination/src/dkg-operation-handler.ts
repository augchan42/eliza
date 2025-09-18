// DKG operation handler with failover and retry logic
import { elizaLogger, IAgentRuntime, HandlerCallback, State } from "@elizaos/core";
import { NodeSelector, TESTNET_NODES } from "./dkg-nodes";
import { DKGClientFactory } from "./dkg-client-factory";
import { DKGErrorHandler, DEFAULT_RETRY_CONFIG } from "./dkg-error-handler";

export interface DKGOperationResult {
    UAL: string;
    datasetRoot?: string;
    operation?: any;
}

export class DKGOperationHandler {
    private nodeSelector: NodeSelector;
    private clientFactory: DKGClientFactory;
    private runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.nodeSelector = new NodeSelector(TESTNET_NODES);
        this.clientFactory = new DKGClientFactory(runtime);

        // Initialize with configured hostname if available
        const configuredHost = runtime.getSetting("DKG_HOSTNAME");
        this.nodeSelector.initializeFromConfig(configuredHost);
    }

    /**
     * Execute DKG asset creation with failover across nodes
     */
    async createAsset(
        knowledgeGraph: any,
        state: State,
        callback?: HandlerCallback
    ): Promise<DKGOperationResult> {
        let lastError: any;
        const maxAttempts = DEFAULT_RETRY_CONFIG.maxNodeAttempts * this.nodeSelector.getNodeCount();

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const node = this.nodeSelector.getNextNode();
            const client = this.clientFactory.createClient(node);

            try {
                elizaLogger.log(`📡 Publishing to DKG via ${node.name} (attempt ${attempt + 1}/${maxAttempts})`);
                elizaLogger.log(`📄 Knowledge Asset: ${JSON.stringify(knowledgeGraph, null, 2)}`);

                const createAssetResult = await client.asset.create(
                    { public: knowledgeGraph },
                    { epochsNum: 12 }
                );

                // Log response for debugging
                this.logDKGResponse(createAssetResult, node.name);

                // Extract UAL from various possible locations
                const ual = this.extractUAL(createAssetResult, node.name);

                if (!ual) {
                    throw new Error(`No UAL found in response from ${node.name}`);
                }

                // Success! Process the result
                const result = this.processSuccessfulResult(createAssetResult, ual, state, callback);
                elizaLogger.info(`✅ DKG asset created successfully on ${node.name}`, {
                    UAL: ual,
                    node: node.name,
                    attempt: attempt + 1
                });

                return result;

            } catch (error) {
                lastError = error;
                DKGErrorHandler.logError(error, `${node.name} attempt ${attempt + 1}`, node.hostname);

                // Add delay before next attempt (unless it's the last one)
                if (attempt < maxAttempts - 1) {
                    const delay = DKGErrorHandler.calculateDelay(attempt);
                    elizaLogger.info(`⏳ Waiting ${Math.round(delay/1000)}s before trying next node...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All attempts failed - record for permanent retry until success
        const failureRecord = {
            timestamp: new Date().toISOString(),
            knowledgeGraph: knowledgeGraph,
            state: state,
            attempts: maxAttempts,
            lastError: lastError?.message,
            allErrors: maxAttempts > 1 ? "Multiple errors across nodes" : lastError?.message,
            retryCount: 0  // Track how many retry sessions we've done
        };

        // Store failure permanently for retry on next divination cycle
        await this.recordFailureForRetry(failureRecord);

        const finalError = new Error(
            `DKG asset creation failed on all nodes after ${maxAttempts} attempts. Last error: ${lastError?.message}`
        );
        elizaLogger.error("🚫 All DKG nodes exhausted", {
            totalAttempts: maxAttempts,
            lastError: lastError?.message,
            recordedForRetry: true
        });
        throw finalError;
    }

    /**
     * Log DKG response for debugging
     */
    private logDKGResponse(response: any, nodeName: string): void {
        elizaLogger.info(`🔍 DKG response from ${nodeName}:`, {
            hasResult: !!response,
            type: typeof response,
            keys: response ? Object.keys(response) : [],
            UAL: response?.UAL,
            ual: response?.ual,
            operation: response?.operation ? 'present' : 'missing',
            fullResponse: JSON.stringify(response, null, 2)
        });
    }

    /**
     * Extract UAL from DKG response in various possible formats
     */
    private extractUAL(response: any, nodeName: string): string | null {
        const ual = response?.UAL ||
                   response?.ual ||
                   response?.operation?.mintKnowledgeAsset?.tokenId ||
                   response?.assertionId;

        if (!ual) {
            elizaLogger.warn(`⚠️  No UAL found in ${nodeName} response`, {
                responseKeys: response ? Object.keys(response) : [],
                hasOperation: !!response?.operation
            });
        }

        return ual;
    }

    /**
     * Process successful DKG result and execute callback
     */
    private processSuccessfulResult(
        createAssetResult: any,
        ual: string,
        state: State,
        callback?: HandlerCallback
    ): DKGOperationResult {
        // Normalize UAL property
        createAssetResult.UAL = ual;

        // Generate explorer URL
        const finalUrl = ual.startsWith('https://')
            ? ual
            : `https://dkg-${this.runtime.getSetting("DKG_ENVIRONMENT")}.origintrail.io/explore?ual=${ual}`;

        const akashicRecordUrl = `@origin_trail akashic record: ${finalUrl}`;

        elizaLogger.info("📚 Akashic record created:", {
            UAL: ual,
            explorerUrl: finalUrl,
            recordLength: akashicRecordUrl.length
        });

        // Execute callback for reply tweet
        if (callback) {
            elizaLogger.debug("📤 Executing callback for akashic record tweet", {
                originalTweetId: state.tweetId,
                roomId: state.roomId,
                contentLength: akashicRecordUrl.length
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

        return {
            UAL: ual,
            datasetRoot: createAssetResult.datasetRoot,
            operation: createAssetResult.operation
        };
    }

    /**
     * Record failed DKG operations permanently for retry in database
     */
    private async recordFailureForRetry(failureRecord: any): Promise<void> {
        try {
            const failureKey = `dkg_failure_${failureRecord.state.tweetId || failureRecord.timestamp}`;

            // Store permanently in database-backed cache (no expiry - retry until success)
            await this.runtime.cacheManager.set(
                failureKey,
                failureRecord
                // No expiry - never give up until it succeeds
            );

            elizaLogger.info("📝 Recorded DKG failure permanently in database for retry:", {
                failureKey: failureKey,
                timestamp: failureRecord.timestamp,
                originalTweetId: failureRecord.state.tweetId,
                retryCount: failureRecord.retryCount,
                neverExpires: true,
                persistsAcrossRestarts: true
            });

        } catch (error) {
            elizaLogger.warn("Failed to record DKG failure for retry:", error.message);
        }
    }

    /**
     * Retry a specific failed DKG operation
     */
    async retryFailedOperation(failureKey: string, failureRecord: any, callback?: HandlerCallback): Promise<boolean> {
        try {
            elizaLogger.info(`🔄 Retrying failed DKG operation: ${failureKey}`, {
                originalTimestamp: failureRecord.timestamp,
                retryCount: failureRecord.retryCount + 1,
                originalTweetId: failureRecord.state.tweetId
            });

            // Increment retry count
            failureRecord.retryCount = (failureRecord.retryCount || 0) + 1;

            // Try the operation again (up to 4 attempts this retry session)
            const result = await this.createAsset(
                failureRecord.knowledgeGraph,
                failureRecord.state,
                callback
            );

            // Success! Remove from failure database
            await this.runtime.cacheManager.delete(failureKey);
            elizaLogger.info(`✅ DKG retry succeeded - removed from failure database: ${failureKey}`);

            return true;

        } catch (error) {
            // Still failing - update the retry count and keep in database
            await this.runtime.cacheManager.set(failureKey, failureRecord);
            elizaLogger.warn(`❌ DKG retry attempt failed: ${failureKey}`, {
                retryCount: failureRecord.retryCount,
                error: error.message,
                willRetryNextCycle: true
            });
            return false;
        }
    }

    /**
     * Get all failed operations for retry (would need cache enumeration)
     * For now, this would be called with specific failure keys
     */
    async getFailedOperation(failureKey: string): Promise<any | null> {
        try {
            const failureRecord = await this.runtime.cacheManager.get(failureKey);
            return failureRecord || null;
        } catch (error) {
            elizaLogger.warn(`Failed to retrieve operation for retry: ${failureKey}`, error.message);
            return null;
        }
    }
}
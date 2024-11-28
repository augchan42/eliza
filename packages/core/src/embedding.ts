import path from "node:path";

import { models } from "./models.ts";
import { IAgentRuntime, ModelProviderName, ModelClass } from "./types.ts";
// import fs from "fs";
import { trimTokens } from "./generation.ts";
import settings from "./settings.ts";
import elizaLogger from "./logger.ts";
import { EmbeddingModel } from "fastembed";
import { embeddingZeroVector } from "./memory.ts";

interface EmbeddingOptions {
    model: string;
    endpoint: string;
    apiKey?: string;
    length?: number;
    isOllama?: boolean;
    dimensions?: number;
    provider?: string;
}

// Add the embedding configuration
export const embeddingConfig = {
    dimensions:
        settings.USE_OPENAI_EMBEDDING?.toLowerCase() === "true" ? 1536 : 384,
    model:
        settings.USE_OPENAI_EMBEDDING?.toLowerCase() === "true"
            ? "text-embedding-3-small"
            : EmbeddingModel.BGESmallENV15,
    provider:
        settings.USE_OPENAI_EMBEDDING?.toLowerCase() === "true"
            ? "OpenAI"
            : "BGE",
};

async function getRemoteEmbedding(
    input: string,
    options: EmbeddingOptions
): Promise<number[]> {
    // Ensure endpoint ends with /v1 for OpenAI
    const baseEndpoint = options.endpoint.endsWith("/v1")
        ? options.endpoint
        : `${options.endpoint}${options.isOllama ? "/v1" : ""}`;

    // Construct full URL
    const fullUrl = `${baseEndpoint}/embeddings`;

    const requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(options.apiKey
                ? {
                      Authorization: `Bearer ${options.apiKey}`,
                  }
                : {}),
        },
        body: JSON.stringify({
            input,
            model: options.model,
            dimensions:
                options.dimensions ||
                options.length ||
                embeddingConfig.dimensions, // Prefer dimensions, fallback to length
        }),
    };

    try {
        const response = await fetch(fullUrl, requestOptions);

        if (!response.ok) {
            elizaLogger.error("API Response:", await response.text()); // Debug log
            throw new Error(
                `Embedding API Error: ${response.status} ${response.statusText}`
            );
        }

        interface EmbeddingResponse {
            data: Array<{ embedding: number[] }>;
        }

        const data: EmbeddingResponse = await response.json();
        return data?.data?.[0].embedding;
    } catch (e) {
        elizaLogger.error("Full error details:", e);
        throw e;
    }
}

/**
 * Send a message to the OpenAI API for embedding.
 * @param input The input to be embedded.
 * @returns The embedding of the input.
 */
export async function embed(runtime: IAgentRuntime, input: string) {
    if (!input || typeof input !== "string" || input.trim().length === 0) {
        // Return zero vector instead of throwing error
        return embeddingZeroVector;
    }

    elizaLogger.debug("Embedding request:", {
        modelProvider: runtime.character.modelProvider,
        useOpenAI: process.env.USE_OPENAI_EMBEDDING,
        input: input?.slice(0, 50) + "...",
        inputType: typeof input,
        inputLength: input?.length,
        isString: typeof input === "string",
        isEmpty: !input,
    });

    // Add input validation
    if (!input || typeof input !== "string") {
        throw new Error(
            "Invalid input for embedding: input must be a non-empty string"
        );
    }

    const modelProvider = models[runtime.character.modelProvider];

    elizaLogger.debug("Model Provider:", runtime.character.modelProvider);
    elizaLogger.debug("USE_OPENAI_EMBEDDING:", settings.USE_OPENAI_EMBEDDING);

    //need to have env override for this to select what to use for embedding if provider doesnt provide or using openai
    const embeddingModel =
        settings.USE_OPENAI_EMBEDDING?.toLowerCase() === "true"
            ? "text-embedding-3-small"
            : modelProvider.model?.[ModelClass.EMBEDDING] ||
              models[ModelProviderName.OPENAI].model[ModelClass.EMBEDDING];

    if (!embeddingModel) {
        throw new Error("No embedding model configured");
    }

    // // Try local embedding first
    // Check if we're in Node.js environment
    const isNode =
        typeof process !== "undefined" &&
        process.versions != null &&
        process.versions.node != null;

    elizaLogger.debug("DEBUG - Conditions for local embedding:", {
        isNode,
        modelProvider: runtime.character.modelProvider,
        useOpenAI: settings.USE_OPENAI_EMBEDDING,
        willUseLocal:
            isNode &&
            runtime.character.modelProvider !== ModelProviderName.OPENAI &&
            settings.USE_OPENAI_EMBEDDING?.toLowerCase() !== "true",
    });

    if (
        isNode &&
        runtime.character.modelProvider !== ModelProviderName.OPENAI &&
        settings.USE_OPENAI_EMBEDDING?.toLowerCase() !== "true"
    ) {
        elizaLogger.debug("DEBUG - Using local embedding path");
        return await getLocalEmbedding(input);
    }

    elizaLogger.debug("DEBUG - Using remote embedding path");
    // Check cache
    const cachedEmbedding = await retrieveCachedEmbedding(runtime, input);
    if (cachedEmbedding) {
        return cachedEmbedding;
    }

    // Determine API key
    let apiKey = undefined;
    if (settings.USE_OPENAI_EMBEDDING) {
        apiKey = settings.OPENAI_API_KEY;
    }
    if (!settings.USE_OPENAI_EMBEDDING && typeof runtime.token === "string") {
        apiKey = runtime.token;
    }
    // Get remote embedding
    const embedding = await getRemoteEmbedding(input, {
        model: embeddingModel,
        endpoint: settings.USE_OPENAI_EMBEDDING
            ? "https://api.openai.com/v1"
            : runtime.character.modelEndpointOverride || modelProvider.endpoint,
        apiKey,
        isOllama:
            runtime.character.modelProvider === ModelProviderName.OLLAMA &&
            !settings.USE_OPENAI_EMBEDDING,
        dimensions: embeddingConfig.dimensions, // Add the dimensions
    });

    // Add some debugging
    elizaLogger.debug("Selected embedding model:", embeddingModel);
    elizaLogger.debug(
        "Using local embedding:",
        isNode &&
            runtime.character.modelProvider !== ModelProviderName.OPENAI &&
            !settings.USE_OPENAI_EMBEDDING
    );

    elizaLogger.debug("Generated embedding:", {
        dimensions: embedding.length,
        provider: process.env.USE_OPENAI_EMBEDDING ? "OpenAI" : "BGE",
    });

    // Add embedding validation
    if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(
            "Invalid embedding generated: embedding must be a non-empty array of numbers"
        );
    }

    return embedding;
}

//  TODO: Add back in when it can work in browser and locally
async function getLocalEmbedding(input: string): Promise<number[]> {
    elizaLogger.debug("DEBUG - Inside getLocalEmbedding function");
    // Check if we're in Node.js environment
    const isNode =
        typeof process !== "undefined" &&
        process.versions != null &&
        process.versions.node != null;

    if (isNode) {
        const fs = await import("fs");
        const { FlagEmbedding } = await import("fastembed");
        const { fileURLToPath } = await import("url");

        function getRootPath() {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);

            const rootPath = path.resolve(__dirname, "..");
            if (rootPath.includes("/eliza/")) {
                return rootPath.split("/eliza/")[0] + "/eliza/";
            }

            return path.resolve(__dirname, "..");
        }

        const cacheDir = getRootPath() + "/cache/";

        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const embeddingModel = await FlagEmbedding.init({
            cacheDir: cacheDir,
            model: EmbeddingModel.BGESmallENV15, // Use the enum value for bge-small-en-v1.5
        });

        const trimmedInput = trimTokens(input, 8000, "gpt-4o-mini");
        const embedding = await embeddingModel.queryEmbed(trimmedInput);

        // Debug the raw embedding
        // elizaLogger.debug("Raw embedding from BGE:", {
        //     type: typeof embedding,
        //     isArray: Array.isArray(embedding),
        //     dimensions: Array.isArray(embedding) ? embedding.length : 'not an array',
        //     sample: Array.isArray(embedding) ? embedding.slice(0, 5) : embedding
        // });

        // Ensure we get a flat array of numbers
        let finalEmbedding: number[];

        if (
            ArrayBuffer.isView(embedding) &&
            embedding.constructor === Float32Array
        ) {
            finalEmbedding = Array.from(embedding);
        } else if (
            Array.isArray(embedding) &&
            ArrayBuffer.isView(embedding[0]) &&
            embedding[0].constructor === Float32Array
        ) {
            finalEmbedding = Array.from(embedding[0]);
        } else if (Array.isArray(embedding)) {
            finalEmbedding = embedding;
        } else {
            throw new Error(`Unexpected embedding format: ${typeof embedding}`);
        }

        elizaLogger.debug("Processed embedding:", {
            length: finalEmbedding.length,
            sample: finalEmbedding.slice(0, 5),
            allNumbers: finalEmbedding.every((n) => typeof n === "number"),
        });

        // Format the array for Postgres vector type
        finalEmbedding = finalEmbedding.map((n) => Number(n)); // Ensure all values are numbers

        // Ensure the array starts with proper values but keep as number[]
        if (!Array.isArray(finalEmbedding) || finalEmbedding[0] === undefined) {
            throw new Error(
                "Invalid embedding format: must be an array starting with a number"
            );
        }

        return finalEmbedding;
    } else {
        // Browser implementation - fallback to remote embedding
        elizaLogger.warn(
            "Local embedding not supported in browser, falling back to remote embedding"
        );
        throw new Error("Local embedding not supported in browser");
    }
}

export async function retrieveCachedEmbedding(
    runtime: IAgentRuntime,
    input: string
) {
    if (!input) {
        elizaLogger.log("No input to retrieve cached embedding for");
        return null;
    }

    const similaritySearchResult =
        await runtime.messageManager.getCachedEmbeddings(input);
    if (similaritySearchResult.length > 0) {
        return similaritySearchResult[0].embedding;
    }
    return null;
}

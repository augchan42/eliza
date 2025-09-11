import dotenv from "dotenv";
dotenv.config();
import {
    IAgentRuntime,
    Memory,
    Provider,
    State,
    elizaLogger,
    ModelClass,
    generateText,
} from "@elizaos/core";
import {
    combinedSparqlExample,
    dkgMemoryTemplate,
    generalSparqlQuery,
} from "../constants.ts";
// @ts-ignore
import DKG from "dkg.js";
import { DKGSelectQuerySchema, isDKGSelectQuery } from "../types.ts";

// Provider configuration
const PROVIDER_CONFIG = {
    environment: process.env.DKG_ENVIRONMENT || "testnet",
    endpoint: process.env.DKG_HOSTNAME || "http://default-endpoint",
    port: process.env.DKG_PORT || "8900",
    blockchain: {
        name: process.env.DKG_BLOCKCHAIN_NAME || "base:84532",
        publicKey: process.env.DKG_PUBLIC_KEY || "",
        privateKey: process.env.DKG_PRIVATE_KEY || "",
    },
    maxNumberOfRetries: 300,
    frequency: 2,
    contentType: "all",
    nodeApiVersion: "/v1",
};

interface BlockchainConfig {
    name: string;
    publicKey: string;
    privateKey: string;
}

interface DKGClientConfig {
    environment: string;
    endpoint: string;
    port: string;
    blockchain: BlockchainConfig;
    maxNumberOfRetries?: number;
    frequency?: number;
    contentType?: string;
    nodeApiVersion?: string;
}

async function constructSparqlQuery(
    runtime: IAgentRuntime,
    userQuery: string,
): Promise<string> {
    elizaLogger.info("Constructing SPARQL query for user input:", {
        query_length: userQuery.length,
        query_preview: userQuery.substring(0, 100),
    });

    const context = `
    You are tasked with generating a SPARQL query to retrieve information from a Decentralized Knowledge Graph (DKG).
    The query should align with the JSON-LD memory template provided below:

    ${JSON.stringify(dkgMemoryTemplate)}

    ** Examples **
    Use the following SPARQL example to understand the format:
    ${combinedSparqlExample}

    ** Instructions **
    1. Analyze the user query and identify the key fields and concepts it refers to.
    2. Use these fields and concepts to construct a SPARQL query.
    3. Ensure the SPARQL query follows standard syntax and can be executed against the DKG.
    4. Use 'OR' logic when constructing the query to ensure broader matching results. For example, if multiple keywords or concepts are provided, the query should match any of them, not all.
    5. Replace the examples with actual terms from the user's query.
    6. Always select distinct results by adding the DISTINCT keyword.
    7. Always select headline and article body. Do not select other fields.

    ** User Query **
    ${userQuery}

    ** Output **
    Provide only the SPARQL query, wrapped in a sparql code block for clarity.
  `;

    elizaLogger.info("Generating SPARQL query using LLM", {
        context_length: context.length,
        model_class: ModelClass.LARGE,
    });

    const sparqlTextResult = await generateText({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
    });

    elizaLogger.info("Raw LLM response received", {
        response_length: sparqlTextResult.length,
        response_preview: sparqlTextResult.substring(0, 100),
    });

    const sparqlQueryMatch = sparqlTextResult.match(/```sparql([\s\S]*?)```/);
    const sparqlQuery = sparqlQueryMatch ? sparqlQueryMatch[1].trim() : null;

    if (!sparqlQuery) {
        elizaLogger.warn(
            "Failed to extract valid SPARQL query from LLM response",
            {
                raw_response: sparqlTextResult,
            },
        );
    } else {
        elizaLogger.info("Successfully extracted SPARQL query", {
            query_length: sparqlQuery.length,
            query: sparqlQuery,
        });
    }

    return sparqlQuery;
}

export class DKGProvider {
    private client: any; // TODO: add type
    constructor(config: DKGClientConfig) {
        elizaLogger.info("Initializing DKG Provider with config:", {
            environment: config.environment,
            endpoint: config.endpoint,
            port: config.port,
            blockchain_name: config.blockchain.name,
            has_public_key: !!config.blockchain.publicKey,
            has_private_key: !!config.blockchain.privateKey,
        });
        this.validateConfig(config);
    }

    private validateConfig(config: DKGClientConfig): void {
        elizaLogger.info("Validating DKG provider configuration");
        const requiredStringFields = ["environment", "endpoint", "port"];

        for (const field of requiredStringFields) {
            elizaLogger.debug(`Validating ${field}`, {
                field_value_exists: !!config[field as keyof DKGClientConfig],
                field_type: typeof config[field as keyof DKGClientConfig],
            });

            if (typeof config[field as keyof DKGClientConfig] !== "string") {
                const error = `Invalid configuration: Missing or invalid value for '${field}'`;
                elizaLogger.error(error);
                throw new Error(error);
            }
        }

        if (!config.blockchain || typeof config.blockchain !== "object") {
            const error =
                "Invalid configuration: 'blockchain' must be an object";
            elizaLogger.error(error);
            throw new Error(error);
        }

        const blockchainFields = ["name", "publicKey", "privateKey"];
        for (const field of blockchainFields) {
            elizaLogger.debug(`Validating blockchain.${field}`, {
                field_value_exists:
                    !!config.blockchain[field as keyof BlockchainConfig],
                field_type:
                    typeof config.blockchain[field as keyof BlockchainConfig],
            });

            if (
                typeof config.blockchain[field as keyof BlockchainConfig] !==
                "string"
            ) {
                const error = `Invalid configuration: Missing or invalid value for 'blockchain.${field}'`;
                elizaLogger.error(error);
                throw new Error(error);
            }
        }

        elizaLogger.info(
            "Configuration validation successful, initializing DKG client",
        );
        this.client = new DKG(config);
    }

    async search(runtime: IAgentRuntime, message: Memory): Promise<string> {
        elizaLogger.info("Starting DKG graph search", {
            memory_id: message.id,
            content_length: message.content.text?.length,
        });

        const userQuery = message.content.text;
        elizaLogger.info("Processing user query", {
            query_preview: userQuery.substring(0, 100),
            query_length: userQuery.length,
        });

        const query = await constructSparqlQuery(runtime, userQuery);
        elizaLogger.info("Generated SPARQL query for search", {
            query_length: query?.length,
            query: query,
        });

        let queryOperationResult;
        try {
            elizaLogger.info("Executing SPARQL query against DKG");
            queryOperationResult = await this.client.graph.query(
                query,
                "SELECT",
            );
            elizaLogger.info("DKG query execution completed", {
                has_results: !!queryOperationResult?.data,
                result_count: queryOperationResult?.data?.length || 0,
            });
        } catch (error) {
            elizaLogger.error("Error executing SPARQL query", {
                error: error.message,
                stack: error.stack,
                query: query,
            });
        }

        if (!queryOperationResult || !queryOperationResult.data?.length) {
            elizaLogger.info(
                "LLM-generated query failed, falling back to basic query",
                {
                    fallback_query: generalSparqlQuery,
                },
            );

            try {
                queryOperationResult = await this.client.graph.query(
                    generalSparqlQuery,
                    "SELECT",
                );
                elizaLogger.info("Fallback query execution completed", {
                    has_results: !!queryOperationResult?.data,
                    result_count: queryOperationResult?.data?.length || 0,
                });
            } catch (error) {
                elizaLogger.error("Error executing fallback query", {
                    error: error.message,
                    stack: error.stack,
                });
                return "No results found";
            }
        }

        elizaLogger.info("Processing search results", {
            total_results: queryOperationResult.data.length,
        });

        // TODO: take 5 results instead of all based on similarity in the future
        const result = queryOperationResult.data.map(
            (entry: any, index: number) => {
                elizaLogger.debug(`Processing result ${index + 1}`, {
                    keys: Object.keys(entry),
                });
                const formattedParts = Object.keys(entry).map(
                    (key) => `${key}: ${entry[key]}`,
                );
                return formattedParts.join(", ");
            },
        );

        elizaLogger.info("Search completed successfully", {
            formatted_result_count: result.length,
            total_length: result.join("\n").length,
        });

        return result.join("\n");
    }
}

export const graphSearch: Provider = {
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state?: State,
    ): Promise<string | null> => {
        elizaLogger.info("Graph search provider invoked", {
            memory_id: message.id,
            has_state: !!_state,
        });

        try {
            elizaLogger.info("Creating DKG provider instance with config", {
                environment: PROVIDER_CONFIG.environment,
                endpoint: PROVIDER_CONFIG.endpoint,
            });

            const provider = new DKGProvider(PROVIDER_CONFIG);
            const result = await provider.search(runtime, message);

            elizaLogger.info("Graph search completed", {
                has_result: !!result,
                result_length: result?.length,
            });

            return result;
        } catch (error) {
            elizaLogger.error("Error in graph search provider:", {
                error: error.message,
                stack: error.stack,
                memory_id: message.id,
            });
            return null;
        }
    },
};

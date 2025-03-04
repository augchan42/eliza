import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from "@ai-sdk/deepseek";

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import {
    generateObject as aiGenerateObject,
    generateText as aiGenerateText,
    type CoreTool,
    type GenerateObjectResult,
    type StepResult as AIStepResult,
} from "ai";
import { Buffer } from "buffer";
import { createOllama } from "ollama-ai-provider";
import OpenAI from "openai";
import { encodingForModel, type TiktokenModel } from "js-tiktoken";
import { AutoTokenizer } from "@huggingface/transformers";
import Together from "together-ai";
import type { ZodSchema } from "zod";
import { elizaLogger } from "./index.ts";
import {
    models,
    getModelSettings,
    getImageModelSettings,
    getEndpoint,
} from "./models.ts";
import {
    parseBooleanFromText,
    parseJsonArrayFromText,
    parseJSONObjectFromText,
    parseShouldRespondFromText,
    parseActionResponseFromText,
} from "./parsing.ts";
import settings from "./settings.ts";
import {
    type Content,
    type IAgentRuntime,
    type IImageDescriptionService,
    type ITextGenerationService,
    ModelClass,
    ModelProviderName,
    ServiceType,
    type ActionResponse,
    type IVerifiableInferenceAdapter,
    type VerifiableInferenceOptions,
    type VerifiableInferenceResult,
    //VerifiableInferenceProvider,
    type TelemetrySettings,
    TokenizerType,
} from "./types.ts";
import { fal } from "@fal-ai/client";

import BigNumber from "bignumber.js";
import { createPublicClient, http } from "viem";

type Tool = CoreTool<any, any>;
type StepResult = AIStepResult<any>;

// Static storage for last evaluation context
const lastEvaluationContext = new Map<string, { decision: "RESPOND" | "IGNORE" | "STOP"; reasoning?: string }>();

/**
 * Trims the provided text context to a specified token limit using a tokenizer model and type.
 *
 * The function dynamically determines the truncation method based on the tokenizer settings
 * provided by the runtime. If no tokenizer settings are defined, it defaults to using the
 * TikToken truncation method with the "gpt-4o" model.
 *
 * @async
 * @function trimTokens
 * @param {string} context - The text to be tokenized and trimmed.
 * @param {number} maxTokens - The maximum number of tokens allowed after truncation.
 * @param {IAgentRuntime} runtime - The runtime interface providing tokenizer settings.
 *
 * @returns {Promise<string>} A promise that resolves to the trimmed text.
 *
 * @throws {Error} Throws an error if the runtime settings are invalid or missing required fields.
 *
 * @example
 * const trimmedText = await trimTokens("This is an example text", 50, runtime);
 * console.log(trimmedText); // Output will be a truncated version of the input text.
 */
export async function trimTokens(
    context: string,
    maxTokens: number,
    runtime: IAgentRuntime,
) {
    if (!context) return "";
    if (maxTokens <= 0) throw new Error("maxTokens must be positive");

    const tokenizerModel = runtime.getSetting("TOKENIZER_MODEL");
    const tokenizerType = runtime.getSetting("TOKENIZER_TYPE");

    if (!tokenizerModel || !tokenizerType) {
        // Default to TikToken truncation using the "gpt-4o" model if tokenizer settings are not defined
        return truncateTiktoken("gpt-4o", context, maxTokens);
    }

    // Choose the truncation method based on tokenizer type
    if (tokenizerType === TokenizerType.Auto) {
        return truncateAuto(tokenizerModel, context, maxTokens);
    }

    if (tokenizerType === TokenizerType.TikToken) {
        return truncateTiktoken(
            tokenizerModel as TiktokenModel,
            context,
            maxTokens,
        );
    }

    elizaLogger.warn(`Unsupported tokenizer type: ${tokenizerType}`);
    return truncateTiktoken("gpt-4o", context, maxTokens);
}

async function truncateAuto(
    modelPath: string,
    context: string,
    maxTokens: number,
) {
    try {
        const tokenizer = await AutoTokenizer.from_pretrained(modelPath);
        const tokens = tokenizer.encode(context);

        // If already within limits, return unchanged
        if (tokens.length <= maxTokens) {
            return context;
        }

        // Keep the most recent tokens by slicing from the end
        const truncatedTokens = tokens.slice(-maxTokens);

        // Decode back to text - js-tiktoken decode() returns a string directly
        return tokenizer.decode(truncatedTokens);
    } catch (error) {
        elizaLogger.error("Error in trimTokens:", error);
        // Return truncated string if tokenization fails
        return context.slice(-maxTokens * 4); // Rough estimate of 4 chars per token
    }
}

async function truncateTiktoken(
    model: TiktokenModel,
    context: string,
    maxTokens: number,
) {
    try {
        const encoding = encodingForModel(model);

        // Encode the text into tokens
        const tokens = encoding.encode(context);

        // If already within limits, return unchanged
        if (tokens.length <= maxTokens) {
            return context;
        }

        // Keep the most recent tokens by slicing from the end
        const truncatedTokens = tokens.slice(-maxTokens);

        // Decode back to text - js-tiktoken decode() returns a string directly
        return encoding.decode(truncatedTokens);
    } catch (error) {
        elizaLogger.error("Error in trimTokens:", error);
        // Return truncated string if tokenization fails
        return context.slice(-maxTokens * 4); // Rough estimate of 4 chars per token
    }
}

/**
 * Get OnChain EternalAI System Prompt
 * @returns System Prompt
 */
async function getOnChainEternalAISystemPrompt(
    runtime: IAgentRuntime,
): Promise<string> | undefined {
    const agentId = runtime.getSetting("ETERNALAI_AGENT_ID");
    const providerUrl = runtime.getSetting("ETERNALAI_RPC_URL");
    const contractAddress = runtime.getSetting(
        "ETERNALAI_AGENT_CONTRACT_ADDRESS",
    );
    if (agentId && providerUrl && contractAddress) {
        // get on-chain system-prompt
        const contractABI = [
            {
                inputs: [
                    {
                        internalType: "uint256",
                        name: "_agentId",
                        type: "uint256",
                    },
                ],
                name: "getAgentSystemPrompt",
                outputs: [
                    { internalType: "bytes[]", name: "", type: "bytes[]" },
                ],
                stateMutability: "view",
                type: "function",
            },
        ];

        const publicClient = createPublicClient({
            transport: http(providerUrl),
        });

        try {
            const validAddress: `0x${string}` =
                contractAddress as `0x${string}`;
            const result = await publicClient.readContract({
                address: validAddress,
                abi: contractABI,
                functionName: "getAgentSystemPrompt",
                args: [new BigNumber(agentId)],
            });
            if (result) {
                elizaLogger.info("on-chain system-prompt response", result[0]);
                const value = result[0].toString().replace("0x", "");
                const content = Buffer.from(value, "hex").toString("utf-8");
                elizaLogger.info("on-chain system-prompt", content);
                return await fetchEternalAISystemPrompt(runtime, content);
            } else {
                return undefined;
            }
        } catch (error) {
            elizaLogger.error(error);
            elizaLogger.error("err", error);
        }
    }
    return undefined;
}

/**
 * Fetch EternalAI System Prompt
 * @returns System Prompt
 */
async function fetchEternalAISystemPrompt(
    runtime: IAgentRuntime,
    content: string,
): Promise<string> | undefined {
    const IPFS = "ipfs://";
    const containsSubstring: boolean = content.includes(IPFS);
    if (containsSubstring) {
        const lightHouse = content.replace(
            IPFS,
            "https://gateway.lighthouse.storage/ipfs/",
        );
        elizaLogger.info("fetch lightHouse", lightHouse);
        const responseLH = await fetch(lightHouse, {
            method: "GET",
        });
        elizaLogger.info("fetch lightHouse resp", responseLH);
        if (responseLH.ok) {
            const data = await responseLH.text();
            return data;
        } else {
            const gcs = content.replace(
                IPFS,
                "https://cdn.eternalai.org/upload/",
            );
            elizaLogger.info("fetch gcs", gcs);
            const responseGCS = await fetch(gcs, {
                method: "GET",
            });
            elizaLogger.info("fetch lightHouse gcs", responseGCS);
            if (responseGCS.ok) {
                const data = await responseGCS.text();
                return data;
            } else {
                throw new Error("invalid on-chain system prompt");
            }
        }
    } else {
        return content;
    }
}

/**
 * Gets the Cloudflare Gateway base URL for a specific provider if enabled
 * @param runtime The runtime environment
 * @param provider The model provider name
 * @returns The Cloudflare Gateway base URL if enabled, undefined otherwise
 */
function getCloudflareGatewayBaseURL(
    runtime: IAgentRuntime,
    provider: string,
): string | undefined {
    const isCloudflareEnabled =
        runtime.getSetting("CLOUDFLARE_GW_ENABLED") === "true";
    const cloudflareAccountId = runtime.getSetting("CLOUDFLARE_AI_ACCOUNT_ID");
    const cloudflareGatewayId = runtime.getSetting("CLOUDFLARE_AI_GATEWAY_ID");

    elizaLogger.debug("Cloudflare Gateway Configuration:", {
        isEnabled: isCloudflareEnabled,
        hasAccountId: !!cloudflareAccountId,
        hasGatewayId: !!cloudflareGatewayId,
        provider: provider,
    });

    if (!isCloudflareEnabled) {
        elizaLogger.debug("Cloudflare Gateway is not enabled");
        return undefined;
    }

    if (!cloudflareAccountId) {
        elizaLogger.warn(
            "Cloudflare Gateway is enabled but CLOUDFLARE_AI_ACCOUNT_ID is not set",
        );
        return undefined;
    }

    if (!cloudflareGatewayId) {
        elizaLogger.warn(
            "Cloudflare Gateway is enabled but CLOUDFLARE_AI_GATEWAY_ID is not set",
        );
        return undefined;
    }

    const baseURL = `https://gateway.ai.cloudflare.com/v1/${cloudflareAccountId}/${cloudflareGatewayId}/${provider.toLowerCase()}`;
    elizaLogger.info("Using Cloudflare Gateway:", {
        provider,
        baseURL,
        accountId: cloudflareAccountId,
        gatewayId: cloudflareGatewayId,
    });

    return baseURL;
}

/**
 * Send a message to the model for a text generateText - receive a string back and parse how you'd like
 * @param opts - The options for the generateText request.
 * @param opts.context The context of the message to be completed.
 * @param opts.stop A list of strings to stop the generateText at.
 * @param opts.model The model to use for generateText.
 * @param opts.frequency_penalty The frequency penalty to apply to the generateText.
 * @param opts.presence_penalty The presence penalty to apply to the generateText.
 * @param opts.temperature The temperature to apply to the generateText.
 * @param opts.max_context_length The maximum length of the context to apply to the generateText.
 * @returns The completed message.
 */

export async function generateText({
    runtime,
    context,
    modelClass,
    tools = {},
    onStepFinish,
    maxSteps = 1,
    stop,
    customSystemPrompt,
    verifiableInference = process.env.VERIFIABLE_INFERENCE_ENABLED === "true",
    verifiableInferenceOptions,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    tools?: Record<string, Tool>;
    onStepFinish?: (event: StepResult) => Promise<void> | void;
    maxSteps?: number;
    stop?: string[];
    customSystemPrompt?: string;
    verifiableInference?: boolean;
    verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    verifiableInferenceOptions?: VerifiableInferenceOptions;
}): Promise<string> {
    if (!context) {
        console.error("generateText context is empty");
        return "";
    }

    elizaLogger.log("Generating text...");

    elizaLogger.info("Generating text with options:", {
        modelProvider: runtime.modelProvider,
        model: modelClass,
        verifiableInference,
    });
    elizaLogger.log("Using provider:", runtime.modelProvider);
    // If verifiable inference is requested and adapter is provided, use it
    if (verifiableInference && runtime.verifiableInferenceAdapter) {
        elizaLogger.log(
            "Using verifiable inference adapter:",
            runtime.verifiableInferenceAdapter,
        );
        try {
            const result: VerifiableInferenceResult =
                await runtime.verifiableInferenceAdapter.generateText(
                    context,
                    modelClass,
                    verifiableInferenceOptions,
                );
            elizaLogger.log("Verifiable inference result:", result);
            // Verify the proof
            const isValid =
                await runtime.verifiableInferenceAdapter.verifyProof(result);
            if (!isValid) {
                throw new Error("Failed to verify inference proof");
            }

            return result.text;
        } catch (error) {
            elizaLogger.error("Error in verifiable inference:", error);
            throw error;
        }
    }

    const provider = runtime.modelProvider;
    elizaLogger.debug("Provider settings:", {
        provider,
        hasRuntime: !!runtime,
        runtimeSettings: {
            CLOUDFLARE_GW_ENABLED: runtime.getSetting("CLOUDFLARE_GW_ENABLED"),
            CLOUDFLARE_AI_ACCOUNT_ID: runtime.getSetting(
                "CLOUDFLARE_AI_ACCOUNT_ID",
            ),
            CLOUDFLARE_AI_GATEWAY_ID: runtime.getSetting(
                "CLOUDFLARE_AI_GATEWAY_ID",
            ),
        },
    });

    const endpoint =
        runtime.character.modelEndpointOverride || getEndpoint(provider);
    const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
    let model = modelSettings.name;

    // allow character.json settings => secrets to override models
    // FIXME: add MODEL_MEDIUM support
    switch (provider) {
        // if runtime.getSetting("LLAMACLOUD_MODEL_LARGE") is true and modelProvider is LLAMACLOUD, then use the large model
        case ModelProviderName.LLAMACLOUD:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("LLAMACLOUD_MODEL_LARGE") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("LLAMACLOUD_MODEL_SMALL") ||
                                model;
                        }
                        break;
                }
            }
            break;
        case ModelProviderName.TOGETHER:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("TOGETHER_MODEL_LARGE") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("TOGETHER_MODEL_SMALL") ||
                                model;
                        }
                        break;
                }
            }
            break;
        case ModelProviderName.OPENROUTER:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("LARGE_OPENROUTER_MODEL") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("SMALL_OPENROUTER_MODEL") ||
                                model;
                        }
                        break;
                }
            }
            break;
    }

    elizaLogger.info("Selected model:", model);

    const modelConfiguration = runtime.character?.settings?.modelConfig;
    const temperature =
        modelConfiguration?.temperature || modelSettings.temperature;
    const frequency_penalty =
        modelConfiguration?.frequency_penalty ||
        modelSettings.frequency_penalty;
    const presence_penalty =
        modelConfiguration?.presence_penalty || modelSettings.presence_penalty;
    const max_context_length =
        modelConfiguration?.maxInputTokens || modelSettings.maxInputTokens;
    const max_response_length =
        modelConfiguration?.max_response_length ||
        modelSettings.maxOutputTokens;
    const experimental_telemetry =
        modelConfiguration?.experimental_telemetry ||
        modelSettings.experimental_telemetry;

    const apiKey = runtime.token;

    try {
        elizaLogger.debug(
            `Trimming context to max length of ${max_context_length} tokens.`,
        );

        context = await trimTokens(context, max_context_length, runtime);

        let response: string;

        const _stop = stop || modelSettings.stop;
        elizaLogger.debug(
            `Using provider: ${provider}, model: ${model}, temperature: ${temperature}, max response length: ${max_response_length}`,
        );

        switch (provider) {
            // OPENAI & LLAMACLOUD shared same structure.
            case ModelProviderName.OPENAI:
            case ModelProviderName.ALI_BAILIAN:
            case ModelProviderName.VOLENGINE:
            case ModelProviderName.LLAMACLOUD:
            case ModelProviderName.NANOGPT:
            case ModelProviderName.HYPERBOLIC:
            case ModelProviderName.TOGETHER:
            case ModelProviderName.NINETEEN_AI:
            case ModelProviderName.AKASH_CHAT_API: {
                elizaLogger.debug(
                    "Initializing OpenAI model with Cloudflare check",
                );
                const baseURL =
                    getCloudflareGatewayBaseURL(runtime, "openai") || endpoint;

                //elizaLogger.debug("OpenAI baseURL result:", { baseURL });
                const openai = createOpenAI({
                    apiKey,
                    baseURL,
                    fetch: runtime.fetch,
                });

                const { text: openaiResponse } = await aiGenerateText({
                    model: openai.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = openaiResponse;
                console.log("Received response from OpenAI model.");
                break;
            }

            case ModelProviderName.ETERNALAI: {
                elizaLogger.debug("Initializing EternalAI model.");
                const openai = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    fetch: async (
                        input: RequestInfo | URL,
                        init?: RequestInit,
                    ): Promise<Response> => {
                        const url =
                            typeof input === "string"
                                ? input
                                : input.toString();
                        const chain_id =
                            runtime.getSetting("ETERNALAI_CHAIN_ID") || "45762";

                        const options: RequestInit = { ...init };
                        if (options?.body) {
                            const body = JSON.parse(options.body as string);
                            body.chain_id = chain_id;
                            options.body = JSON.stringify(body);
                        }

                        const fetching = await runtime.fetch(url, options);

                        if (
                            parseBooleanFromText(
                                runtime.getSetting("ETERNALAI_LOG"),
                            )
                        ) {
                            elizaLogger.info(
                                "Request data: ",
                                JSON.stringify(options, null, 2),
                            );
                            const clonedResponse = fetching.clone();
                            try {
                                clonedResponse.json().then((data) => {
                                    elizaLogger.info(
                                        "Response data: ",
                                        JSON.stringify(data, null, 2),
                                    );
                                });
                            } catch (e) {
                                elizaLogger.debug(e);
                            }
                        }
                        return fetching;
                    },
                });

                let system_prompt =
                    runtime.character.system ??
                    settings.SYSTEM_PROMPT ??
                    undefined;
                try {
                    const on_chain_system_prompt =
                        await getOnChainEternalAISystemPrompt(runtime);
                    if (!on_chain_system_prompt) {
                        elizaLogger.error(
                            new Error("invalid on_chain_system_prompt"),
                        );
                    } else {
                        system_prompt = on_chain_system_prompt;
                        elizaLogger.info(
                            "new on-chain system prompt",
                            system_prompt,
                        );
                    }
                } catch (e) {
                    elizaLogger.error(e);
                }

                const { text: openaiResponse } = await aiGenerateText({
                    model: openai.languageModel(model),
                    prompt: context,
                    system: system_prompt,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                });

                response = openaiResponse;
                elizaLogger.debug("Received response from EternalAI model.");
                break;
            }

            case ModelProviderName.GOOGLE: {
                const google = createGoogleGenerativeAI({
                    apiKey,
                    fetch: runtime.fetch,
                });

                const { text: googleResponse } = await aiGenerateText({
                    model: google(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = googleResponse;
                elizaLogger.debug("Received response from Google model.");
                break;
            }

            case ModelProviderName.MISTRAL: {
                const mistral = createMistral();

                const { text: mistralResponse } = await aiGenerateText({
                    model: mistral(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                });

                response = mistralResponse;
                elizaLogger.debug("Received response from Mistral model.");
                break;
            }

            case ModelProviderName.ANTHROPIC: {
                elizaLogger.debug(
                    "Initializing Anthropic model with Cloudflare check",
                );
                const baseURL =
                    getCloudflareGatewayBaseURL(runtime, "anthropic") ||
                    "https://api.anthropic.com/v1";
                elizaLogger.debug("Anthropic baseURL result:", { baseURL });

                const anthropic = createAnthropic({
                    apiKey,
                    baseURL,
                    fetch: runtime.fetch,
                });
                const { text: anthropicResponse } = await aiGenerateText({
                    model: anthropic.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = anthropicResponse;
                elizaLogger.debug("Received response from Anthropic model.");
                break;
            }

            case ModelProviderName.CLAUDE_VERTEX: {
                elizaLogger.debug("Initializing Claude Vertex model.");

                const anthropic = createAnthropic({
                    apiKey,
                    fetch: runtime.fetch,
                });

                const { text: anthropicResponse } = await aiGenerateText({
                    model: anthropic.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = anthropicResponse;
                elizaLogger.debug(
                    "Received response from Claude Vertex model.",
                );
                break;
            }

            case ModelProviderName.GROK: {
                elizaLogger.debug("Initializing Grok model.");
                const grok = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: grokResponse } = await aiGenerateText({
                    model: grok.languageModel(model, {
                        parallelToolCalls: false,
                    }),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = grokResponse;
                elizaLogger.debug("Received response from Grok model.");
                break;
            }

            case ModelProviderName.GROQ: {
                elizaLogger.debug(
                    "Initializing Groq model with Cloudflare check",
                );
                const baseURL = getCloudflareGatewayBaseURL(runtime, "groq");
                elizaLogger.debug("Groq handleGroq baseURL:", { baseURL });
                const groq = createGroq({
                    apiKey,
                    fetch: runtime.fetch,
                    baseURL,
                });

                const { text: groqResponse } = await aiGenerateText({
                    model: groq.languageModel(model),
                    prompt: context,
                    temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools,
                    onStepFinish: onStepFinish,
                    maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry,
                });

                response = groqResponse;
                elizaLogger.debug("Received response from Groq model.");
                break;
            }

            case ModelProviderName.LLAMALOCAL: {
                elizaLogger.debug(
                    "Using local Llama model for text completion.",
                );
                const textGenerationService =
                    runtime.getService<ITextGenerationService>(
                        ServiceType.TEXT_GENERATION,
                    );

                if (!textGenerationService) {
                    throw new Error("Text generation service not found");
                }

                response = await textGenerationService.queueTextCompletion(
                    context,
                    temperature,
                    _stop,
                    frequency_penalty,
                    presence_penalty,
                    max_response_length,
                );
                elizaLogger.debug("Received response from local Llama model.");
                break;
            }

            case ModelProviderName.REDPILL: {
                elizaLogger.debug("Initializing RedPill model.");
                const serverUrl = getEndpoint(provider);
                const openai = createOpenAI({
                    apiKey,
                    baseURL: serverUrl,
                    fetch: runtime.fetch,
                });

                const { text: redpillResponse } = await aiGenerateText({
                    model: openai.languageModel(model),
                    prompt: context,
                    temperature: temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = redpillResponse;
                elizaLogger.debug("Received response from redpill model.");
                break;
            }

            case ModelProviderName.OPENROUTER: {
                elizaLogger.debug("Initializing OpenRouter model.");
                const serverUrl = getEndpoint(provider);
                const openrouter = createOpenAI({
                    apiKey,
                    baseURL: serverUrl,
                    fetch: runtime.fetch,
                });

                const { text: openrouterResponse } = await aiGenerateText({
                    model: openrouter.languageModel(model),
                    prompt: context,
                    temperature: temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = openrouterResponse;
                elizaLogger.debug("Received response from OpenRouter model.");
                break;
            }

            case ModelProviderName.OLLAMA:
                {
                    elizaLogger.debug("Initializing Ollama model.");

                    const ollamaProvider = createOllama({
                        baseURL: getEndpoint(provider) + "/api",
                        fetch: runtime.fetch,
                    });
                    const ollama = ollamaProvider(model);

                    elizaLogger.debug("****** MODEL\n", model);

                    const { text: ollamaResponse } = await aiGenerateText({
                        model: ollama,
                        prompt: context,
                        tools: tools,
                        onStepFinish: onStepFinish,
                        temperature: temperature,
                        maxSteps: maxSteps,
                        maxTokens: max_response_length,
                        frequencyPenalty: frequency_penalty,
                        presencePenalty: presence_penalty,
                        experimental_telemetry: experimental_telemetry,
                    });

                    response = ollamaResponse;
                }
                elizaLogger.debug("Received response from Ollama model.");
                break;

            case ModelProviderName.HEURIST: {
                elizaLogger.debug("Initializing Heurist model.");
                const heurist = createOpenAI({
                    apiKey: apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: heuristResponse } = await aiGenerateText({
                    model: heurist.languageModel(model),
                    prompt: context,
                    system:
                        customSystemPrompt ??
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    maxSteps: maxSteps,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = heuristResponse;
                elizaLogger.debug("Received response from Heurist model.");
                break;
            }
            case ModelProviderName.GAIANET: {
                elizaLogger.debug("Initializing GAIANET model.");

                var baseURL = getEndpoint(provider);
                if (!baseURL) {
                    switch (modelClass) {
                        case ModelClass.SMALL:
                            baseURL =
                                settings.SMALL_GAIANET_SERVER_URL ||
                                "https://llama3b.gaia.domains/v1";
                            break;
                        case ModelClass.MEDIUM:
                            baseURL =
                                settings.MEDIUM_GAIANET_SERVER_URL ||
                                "https://llama8b.gaia.domains/v1";
                            break;
                        case ModelClass.LARGE:
                            baseURL =
                                settings.LARGE_GAIANET_SERVER_URL ||
                                "https://qwen72b.gaia.domains/v1";
                            break;
                    }
                }

                elizaLogger.debug("Using GAIANET model with baseURL:", baseURL);

                const openai = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: openaiResponse } = await aiGenerateText({
                    model: openai.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = openaiResponse;
                elizaLogger.debug("Received response from GAIANET model.");
                break;
            }

            case ModelProviderName.ATOMA: {
                elizaLogger.debug("Initializing Atoma model.");
                const atoma = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: atomaResponse } = await aiGenerateText({
                    model: atoma.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = atomaResponse;
                elizaLogger.debug("Received response from Atoma model.");
                break;
            }

            case ModelProviderName.GALADRIEL: {
                elizaLogger.debug("Initializing Galadriel model.");
                const headers = {};
                const fineTuneApiKey = runtime.getSetting(
                    "GALADRIEL_FINE_TUNE_API_KEY",
                );
                if (fineTuneApiKey) {
                    headers["Fine-Tune-Authentication"] = fineTuneApiKey;
                }
                const galadriel = createOpenAI({
                    headers,
                    apiKey: apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: galadrielResponse } = await aiGenerateText({
                    model: galadriel.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = galadrielResponse;
                elizaLogger.debug("Received response from Galadriel model.");
                break;
            }

            case ModelProviderName.INFERA: {
                elizaLogger.debug("Initializing Infera model.");

                const apiKey = settings.INFERA_API_KEY || runtime.token;

                const infera = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    headers: {
                        api_key: apiKey,
                        "Content-Type": "application/json",
                    },
                });

                const { text: inferaResponse } = await aiGenerateText({
                    model: infera.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                });
                response = inferaResponse;
                elizaLogger.debug("Received response from Infera model.");
                break;
            }

            case ModelProviderName.VENICE: {
                elizaLogger.debug("Initializing Venice model.");
                const venice = createOpenAI({
                    apiKey: apiKey,
                    baseURL: endpoint,
                });

                const { text: veniceResponse } = await aiGenerateText({
                    model: venice.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    temperature: temperature,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                });

                response = veniceResponse;
                elizaLogger.debug("Received response from Venice model.");
                break;
            }

            case ModelProviderName.NVIDIA: {
                elizaLogger.debug("Initializing NVIDIA model.");

                // const nvidia = createOpenAI({
                //     apiKey: apiKey,
                //     baseURL: endpoint,
                // });

                const nvidia = new OpenAI({
                    apiKey: apiKey,
                    baseURL: endpoint,
                });

                // const { text: nvidiaResponse } = await aiGenerateText({
                //     model: nvidia.languageModel(model),
                //     prompt: context,
                //     system:
                //         runtime.character.system ??
                //         settings.SYSTEM_PROMPT ??
                //         undefined,
                //     tools: tools,
                //     onStepFinish: onStepFinish,
                //     temperature: temperature,
                //     maxSteps: maxSteps,
                //     maxTokens: max_response_length,
                // });

                const completion = await nvidia.chat.completions.create({
                    model: model,
                    messages: [
                        // User message
                        {
                            role: "user" as const,
                            content: context,
                        },
                    ],
                    temperature: temperature,
                    top_p: 0.7,
                    max_tokens: max_response_length,
                    stream: false, // If you want streaming
                });

                response = completion.choices[0].message.content;
                elizaLogger.debug("Received response from NVIDIA model.");
                break;
            }

            case ModelProviderName.DEEPSEEK: {
                let initialReasoning = ""; //
                const customFetch = async (
                    input: RequestInfo | URL,
                    init?: RequestInit,
                ) => {
                    const response = await runtime.fetch(input, init);
                    const data = await response.json();
                    // Capture reasoning from first call
                    if (
                        !initialReasoning &&
                        data.choices?.[0]?.message?.reasoning_content
                    ) {
                        initialReasoning =
                            data.choices[0].message.reasoning_content;
                    }

                    elizaLogger.debug("Extracted reasoning:", {
                        value: initialReasoning,
                        type: typeof initialReasoning,
                        length: initialReasoning?.length,
                        isEmpty: initialReasoning === "",
                        isNull: initialReasoning === null,
                        isUndefined: initialReasoning === undefined,
                    });

                    // Deep merge the metadata
                    data.experimental_providerMetadata = {
                        ...(data.experimental_providerMetadata || {}),
                        deepseek: { reasoning_content: initialReasoning },
                        openai:
                            data.experimental_providerMetadata?.openai || {},
                    };
                    // Store reasoning in metadata
                    // data.experimental_providerMetadata = {
                    //     ...data.experimental_providerMetadata,
                    //     deepseek: { reasoning_content: reasoning },
                    // };
                    elizaLogger.debug("Raw DeepSeek response:", data);

                    return new Response(JSON.stringify(data));
                };
                elizaLogger.debug("Initializing Deepseek model.");
                const serverUrl = models[provider].endpoint;
                const deepseek = createDeepSeek({
                    apiKey,
                    baseURL: serverUrl,
                    // fetch: runtime.fetch,
                    fetch: customFetch,
                });

                const {
                    text: deepseekResponse,
                    experimental_providerMetadata,
                    response: dsResponse,
                } = await aiGenerateText({
                    model: deepseek.languageModel(model),
                    prompt: context,
                    temperature: temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: (step) => {
                        elizaLogger.debug("Step data:", {
                            raw: step.response,
                            rawStep: step,
                        });
                    }, //
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                // response = deepseekResponse;

                elizaLogger.debug("Full Response details:", {
                    providerMetadata: experimental_providerMetadata,
                    messages: dsResponse.messages,
                    raw: dsResponse,
                    rawKeys: Object.keys(dsResponse),
                });

                elizaLogger.debug("experimental_providerMetadata:", {
                    type: typeof experimental_providerMetadata,
                    keys: experimental_providerMetadata
                        ? Object.keys(experimental_providerMetadata)
                        : null,
                    value: experimental_providerMetadata,
                    reasoning: experimental_providerMetadata?.reasoning_content,
                });

                // const reasoning =
                //     experimental_providerMetadata?.reasoning_content;
                elizaLogger.debug("Reasoning:", initialReasoning);
                elizaLogger.debug("Received response from Deepseek model.");

                response = `${initialReasoning ? `Reasoning:\n${initialReasoning}\n\n` : ""}${deepseekResponse}`;
                elizaLogger.debug("Final response construction:", {
                    reasoningCheck: !!initialReasoning,
                    reasoningValue: initialReasoning,
                    responseLength: response.length,
                });

                break;
            }

            case ModelProviderName.LIVEPEER: {
                elizaLogger.debug("Initializing Livepeer model.");

                if (!endpoint) {
                    throw new Error("Livepeer Gateway URL is not defined");
                }

                const requestBody = {
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content:
                                runtime.character.system ??
                                settings.SYSTEM_PROMPT ??
                                "You are a helpful assistant",
                        },
                        {
                            role: "user",
                            content: context,
                        },
                    ],
                    max_tokens: max_response_length,
                    stream: false,
                };

                const fetchResponse = await runtime.fetch(endpoint + "/llm", {
                    method: "POST",
                    headers: {
                        accept: "text/event-stream",
                        "Content-Type": "application/json",
                        Authorization: "Bearer eliza-app-llm",
                    },
                    body: JSON.stringify(requestBody),
                });

                if (!fetchResponse.ok) {
                    const errorText = await fetchResponse.text();
                    throw new Error(
                        `Livepeer request failed (${fetchResponse.status}): ${errorText}`,
                    );
                }

                const json = await fetchResponse.json();

                if (!json?.choices?.[0]?.message?.content) {
                    throw new Error("Invalid response format from Livepeer");
                }

                response = json.choices[0].message.content.replace(
                    /<\|start_header_id\|>assistant<\|end_header_id\|>\n\n/,
                    "",
                );
                elizaLogger.debug(
                    "Successfully received response from Livepeer model",
                );
                break;
            }

            default: {
                const errorMessage = `Unsupported provider: ${provider}`;
                elizaLogger.error(errorMessage);
                throw new Error(errorMessage);
            }
        }

        return response;
    } catch (error) {
        elizaLogger.error("Error in generateText:", error);
        throw error;
    }
}

// Type for the structured response
export interface ShouldRespondResult {
    decision: "RESPOND" | "IGNORE" | "STOP";
    reasoning?: string;
    __structured?: true;
}

/**
 * Sends a message to the model to determine if it should respond to the given context.
 * @param opts - The options for the generateText request
 * @param opts.context The context to evaluate for response
 * @param opts.stop A list of strings to stop the generateText at
 * @param opts.model The model to use for generateText
 * @param opts.frequency_penalty The frequency penalty to apply (0.0 to 2.0)
 * @param opts.presence_penalty The presence penalty to apply (0.0 to 2.0)
 * @param opts.temperature The temperature to control randomness (0.0 to 2.0)
 * @param opts.serverUrl The URL of the API server
 * @param opts.max_context_length Maximum allowed context length in tokens
 * @param opts.max_response_length Maximum allowed response length in tokens
 * @returns Promise resolving to "RESPOND", "IGNORE", "STOP" or null
 */
export async function generateShouldRespond<T extends boolean = false>({
    runtime,
    context,
    modelClass = ModelClass.SMALL,
    structured = false as T,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass?: ModelClass;
    structured?: T;
}): Promise<T extends true ? ShouldRespondResult : "RESPOND" | "IGNORE" | "STOP"> {
    const response = await generateText({
        runtime,
        context,
        modelClass,
    });

    const parsedResponse = parseJSONObjectFromText(response) as {
        decision: "RESPOND" | "IGNORE" | "STOP";
        reasoning?: string;
    };

    if (!parsedResponse) {
        elizaLogger.error("Failed to parse response as JSON object:", {
            response: response.substring(0, 200) + "..."
        });
        throw new Error("Failed to generate valid JSON response");
    }

    // Validate the response matches our expected schema
    if (!parsedResponse.decision ||
        !["RESPOND", "IGNORE", "STOP"].includes(parsedResponse.decision) ||
        (parsedResponse.reasoning && typeof parsedResponse.reasoning !== "string")) {
        elizaLogger.error("Invalid response format:", parsedResponse);
        throw new Error("Response does not match expected schema");
    }

    // Return structured response if requested
    if (structured) {
        return {
            ...parsedResponse,
            __structured: true
        } as T extends true ? ShouldRespondResult : "RESPOND" | "IGNORE" | "STOP";
    }

    // For backward compatibility, return just the decision
    return parsedResponse.decision as T extends true ? ShouldRespondResult : "RESPOND" | "IGNORE" | "STOP";
}

/**
 * Splits content into chunks of specified size with optional overlapping bleed sections
 * @param content - The text content to split into chunks
 * @param chunkSize - The maximum size of each chunk in tokens
 * @param bleed - Number of characters to overlap between chunks (default: 20)
 * @returns Promise resolving to array of text chunks with bleed sections
 */
export async function splitChunks(
    content: string,
    chunkSize = 512,
    bleed = 20,
): Promise<string[]> {
    elizaLogger.debug(`[splitChunks] Starting text split`);

    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: Number(chunkSize),
        chunkOverlap: Number(bleed),
    });

    const chunks = await textSplitter.splitText(content);
    elizaLogger.debug(`[splitChunks] Split complete:`, {
        numberOfChunks: chunks.length,
        averageChunkSize:
            chunks.reduce((acc, chunk) => acc + chunk.length, 0) /
            chunks.length,
    });

    return chunks;
}

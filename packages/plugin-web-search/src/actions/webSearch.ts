import {
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    elizaLogger,
} from "@elizaos/core";
import { encodingForModel, type TiktokenModel } from "js-tiktoken";
import { WebSearchService } from "../services/webSearchService";
import type { SearchResult } from "../types";

const DEFAULT_MAX_WEB_SEARCH_TOKENS = 4000;
const DEFAULT_MODEL_ENCODING = "gpt-3.5-turbo";

function getTotalTokensFromString(
    str: string,
    encodingName: TiktokenModel = DEFAULT_MODEL_ENCODING,
) {
    const encoding = encodingForModel(encodingName);
    return encoding.encode(str).length;
}

function MaxTokens(
    data: string,
    maxTokens: number = DEFAULT_MAX_WEB_SEARCH_TOKENS,
): string {
    if (getTotalTokensFromString(data) >= maxTokens) {
        return data.slice(0, maxTokens);
    }
    return data;
}

export const webSearch: Action = {
    name: "WEB_SEARCH",
    similes: [
        "SEARCH_WEB",
        "INTERNET_SEARCH",
        "LOOKUP",
        "QUERY_WEB",
        "FIND_ONLINE",
        "SEARCH_ENGINE",
        "WEB_LOOKUP",
        "ONLINE_SEARCH",
        "FIND_INFORMATION",
    ],
    suppressInitialMessage: true,
    description:
        "Perform a web search to find information related to the message.",
    // eslint-disable-next-line
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const tavilyApiKeyOk = !!runtime.getSetting("TAVILY_API_KEY");

        return tavilyApiKeyOk;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback,
    ) => {
        elizaLogger.debug(
            "[WEB_SEARCH]: Composing state for message:",
            message,
        );
        state = (await runtime.composeState(message)) as State;
        const userId = runtime.agentId;
        elizaLogger.debug("[WEB_SEARCH]: User ID:", userId);

        let webSearchPrompt = message.content.text;
        elizaLogger.debug(
            "[WEB_SEARCH]: web search prompt received:",
            webSearchPrompt,
        );

        // Remove agent name references (case insensitive)
        const agentName = runtime.character.name;
        const nameRegex = new RegExp(`\\b${agentName}\\b`, "gi");
        webSearchPrompt = webSearchPrompt.replace(nameRegex, "");

        // Remove common prefixes
        const prefixesToRemove = [
            "tell me",
            "what are",
            "what is",
            "show me",
            "find",
            "search for",
            "look up",
            "get me",
        ];

        for (const prefix of prefixesToRemove) {
            const prefixRegex = new RegExp(`^${prefix}\\s+`, "i");
            webSearchPrompt = webSearchPrompt.replace(prefixRegex, "");
        }

        // Clean up punctuation and multiple spaces
        webSearchPrompt = webSearchPrompt
            .replace(/[,.?!]$/, "")
            .replace(/\s+/g, " ")
            .trim();

        elizaLogger.debug(
            "[WEB_SEARCH]: Cleaned web search prompt:",
            webSearchPrompt,
        );

        const webSearchService = new WebSearchService();
        await webSearchService.initialize(runtime);
        const searchResponse = await webSearchService.search(webSearchPrompt);

        if (searchResponse && searchResponse.results.length) {
            const responseList = searchResponse.answer
                ? `${searchResponse.answer}${
                      Array.isArray(searchResponse.results) &&
                      searchResponse.results.length > 0
                          ? `\n\nFor more details, you can check out these resources:\n${searchResponse.results
                                .map(
                                    (result: SearchResult, index: number) =>
                                        `${index + 1}. [${result.title}](${result.url})`,
                                )
                                .join("\n")}`
                          : ""
                  }`
                : "";

            callback({
                text: MaxTokens(responseList, DEFAULT_MAX_WEB_SEARCH_TOKENS),
            });
        } else {
            elizaLogger.error(
                "[WEB_SEARCH]: search failed or returned no data.",
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "latest news?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here is the latest news:",
                    action: "WEB_SEARCH",
                },
            },
        ],
    ],
} as Action;

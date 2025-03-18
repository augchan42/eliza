import { Action, IAgentRuntime } from "@elizaos/core";
import { DivinationResponse } from "../types/response";

export const performDivinationAction: Action = {
    name: "PERFORM_DIVINATION",
    description: "Generate a market-aware I-Ching reading",

    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
        // Check if required services are available
        const service = runtime.getService("DIVINATION_SERVICE");
        return !!service;
    },

    handler: async (runtime: IAgentRuntime): Promise<DivinationResponse> => {
        const service = runtime.getService("DIVINATION_SERVICE");
        if (!service) {
            throw new Error("Divination service not available");
        }

        return await service.performDivination();
    },
};

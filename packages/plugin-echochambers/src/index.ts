import {
    elizaLogger,
    type Client,
    type IAgentRuntime,
    type Plugin,
} from "@elizaos/core";
import { EchoChamberClient } from "./echoChamberClient";
import { InteractionClient } from "./interactions";
import type { EchoChamberConfig } from "./types";
import { validateEchoChamberConfig } from "./environment";

export const EchoChamberClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        try {
            // Get validated configuration
            const validatedConfig = await validateEchoChamberConfig(runtime);

            const config: EchoChamberConfig = {
                ...validatedConfig,
                model: runtime.modelProvider,
            };

            elizaLogger.log("Starting EchoChambers client...");

            // Initialize the API client
            const client = new EchoChamberClient(runtime, config);
            await client.start();

            // Initialize the interaction handler
            const interactionClient = new InteractionClient(client, runtime);
            await interactionClient.start();

            elizaLogger.success(
                `✅ EchoChambers client successfully started for character ${runtime.character.name}`,
            );

            return { client, interactionClient };
        } catch (error) {
            elizaLogger.error("Failed to start EchoChambers client:", error);
            throw error;
        }
    },

    async stop(runtime: IAgentRuntime) {
        try {
            elizaLogger.warn("Stopping EchoChambers client...");

            // Get client instances if they exist
            const clients = (runtime as any).clients?.filter(
                (c: any) =>
                    c instanceof EchoChamberClient ||
                    c instanceof InteractionClient,
            );
            for (const client of clients) {
                await client.stop();
            }

            elizaLogger.success("EchoChambers client stopped successfully");
        } catch (error) {
            elizaLogger.error("Error stopping EchoChambers client:", error);
            throw error;
        }
    },
};

export const echoChambersPlugin: Plugin = {
    name: "echochambers",
    description:
        "Plugin for interacting with EchoChambers API to enable multi-agent communication",
    actions: [], // No custom actions needed - core functionality handled by client
    evaluators: [], // No custom evaluators needed
    providers: [], // No custom providers needed
    clients: [EchoChamberClientInterface],
};

export default echoChambersPlugin;

// Export types and classes
export * from "./types";
export { EchoChamberClient } from "./echoChamberClient";
export { InteractionClient } from "./interactions";

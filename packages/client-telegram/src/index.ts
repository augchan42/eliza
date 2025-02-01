import { elizaLogger } from "@elizaos/core";
import type { Client, IAgentRuntime } from "@elizaos/core";
import { TelegramClient } from "./telegramClient.ts";
import { validateTelegramConfig } from "./environment.ts";
import { initializeTemplates } from "@elizaos/core";

export const TelegramClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        await validateTelegramConfig(runtime);

        // Add template initialization here
        if (runtime.character.templates) {
            const templateStrings: Record<string, string> = {};
            for (const [key, value] of Object.entries(
                runtime.character.templates,
            )) {
                if (typeof value === "string") {
                    templateStrings[key] = value;
                }
            }
            await initializeTemplates(templateStrings);
        }

        const tg = new TelegramClient(
            runtime,
            runtime.getSetting("TELEGRAM_BOT_TOKEN"),
        );

        await tg.start();

        elizaLogger.success(
            `✅ Telegram client successfully started for character ${runtime.character.name}`,
        );
        return tg;
    },
    stop: async (_runtime: IAgentRuntime) => {
        elizaLogger.warn("Telegram client does not support stopping yet");
    },
};

export default TelegramClientInterface;

import { elizaLogger } from "@elizaos/core";
import { Client, IAgentRuntime } from "@elizaos/core";
import { TelegramClient } from "./telegramClient.ts";
import { validateTelegramConfig } from "./environment.ts";

export const TelegramClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        await validateTelegramConfig(runtime);

        const tg = new TelegramClient(
            runtime,
            runtime.getSetting("TELEGRAM_BOT_TOKEN")
        );

        await tg.start();

        elizaLogger.success(
            `✅ Telegram client successfully started for character ${runtime.character.name}`
        );
        return tg;
    },
    stop: async (_runtime: IAgentRuntime, client?: any) => {
        if (client && typeof client.stop === 'function') {
            await client.stop();
            elizaLogger.success("✅ Telegram client stopped successfully");
        } else {
            elizaLogger.warn("Telegram client instance not provided or missing stop method");
        }
    },
};

export default TelegramClientInterface;

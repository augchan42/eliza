import { elizaLogger } from "@ai16z/eliza";
import { Client, IAgentRuntime } from "@ai16z/eliza";
import { TelegramClient } from "./telegramClient.ts";

export const TelegramClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        try {
            const botToken = runtime.getSetting("TELEGRAM_BOT_TOKEN");
            
            if (!botToken) {
                elizaLogger.warn("No Telegram bot token found, skipping Telegram client");
                return null;
            }

            const tg = new TelegramClient(runtime, botToken);
            
            tg.addErrorHandler((err) => {
                if (err.response?.error_code === 403 && err.response?.description?.includes('kicked')) {
                    const chatId = err.on?.payload?.chat_id;
                    elizaLogger.warn("Bot was kicked from chat:", {
                        chatId,
                        error: err.response.description
                    });
                    
                    // Clean up any chat-specific resources
                    tg.handleChatKick(chatId);
                    return; // Prevent crash
                }
                
                elizaLogger.error("Telegram Error:", {
                    error: err,
                    details: err.response
                });
            });

            await tg.start();

            elizaLogger.success(
                `✅ Telegram client successfully started for character ${runtime.character.name}`
            );
            return tg;
        } catch (error) {
            elizaLogger.error("Failed to start Telegram client:", {
                error,
                character: runtime.character.name
            });
            // Don't throw, just return null so other clients can continue
            return null;
        }
    },
    stop: async (runtime: IAgentRuntime) => {
        try {
            // TODO: Implement proper stopping mechanism
            elizaLogger.warn("Telegram client does not support stopping yet");
        } catch (error) {
            elizaLogger.error("Error stopping Telegram client:", error);
        }
    },
};

export default TelegramClientInterface;
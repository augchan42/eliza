import type { Message } from "@telegraf/types";
import type { Context, Telegraf } from "telegraf";
import {
    composeContext,
    elizaLogger,
    ServiceType,
    composeRandomUser,
    getTemplate,
} from "@elizaos/core";
import { getEmbeddingZeroVector } from "@elizaos/core";
import {
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type IImageDescriptionService,
    type Memory,
    ModelClass,
    type State,
    type UUID,
    type Media,
    type ShouldRespondResult,
    type MessageResponseResult,
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { generateMessageResponse, generateShouldRespond } from "@elizaos/core";
import {
    telegramMessageHandlerTemplate,
    telegramShouldRespondTemplate,
    telegramAutoPostTemplate,
    telegramPinnedMessageTemplate,
} from "./templates";
import { cosineSimilarity, escapeMarkdown } from "./utils";
import {
    MESSAGE_CONSTANTS,
    TIMING_CONSTANTS,
    RESPONSE_CHANCES,
    TEAM_COORDINATION,
} from "./constants";
import { ResponseValidator } from "./responseValidator";

import fs from "fs";
import { HexagramGenerateResponse } from "./divination";

enum MediaType {
    PHOTO = "photo",
    VIDEO = "video",
    DOCUMENT = "document",
    AUDIO = "audio",
    ANIMATION = "animation",
}

const MAX_MESSAGE_LENGTH = 4096; // Telegram's max message length

interface MessageContext {
    content: string;
    timestamp: number;
}

interface AutoPostConfig {
    enabled: boolean;
    monitorTime: number;
    inactivityThreshold: number; // milliseconds
    mainChannelId: string;
    pinnedMessagesGroups: string[]; // Instead of announcementChannelIds
    lastAutoPost?: number;
    minTimeBetweenPosts?: number;
}

export type InterestChats = {
    [key: string]: {
        currentHandler: string | undefined;
        lastMessageSent: number;
        messages: { userId: UUID; userName: string; content: Content }[];
        previousContext?: MessageContext;
        contextSimilarityThreshold?: number;
    };
};

export class MessageManager {
    public bot: Telegraf<Context>;
    private runtime: IAgentRuntime;
    private interestChats: InterestChats = {};
    private teamMemberUsernames: Map<string, string> = new Map();
    private lastResponseTimes: Map<string, number> = new Map();

    private autoPostConfig: AutoPostConfig;
    private lastChannelActivity: { [channelId: string]: number } = {};
    private autoPostInterval: NodeJS.Timeout;

    private responseValidator: ResponseValidator;

    // Define plugin keyword mappings
    private readonly PLUGIN_KEYWORDS = {
        weather: ["weather"],
        news: ["news"],
        // Add other plugins and their keywords here
    } as const;

    private recentHexagrams: string[] = [];
    private currentPerspectiveIndex: number = 0;
    private readonly perspectives = [
        {
            name: 'analytical',
            prompt: 'Analyze the situation objectively, focusing on patterns and implications.'
        },
        {
            name: 'emotional',
            prompt: 'Connect with the emotional aspects, considering feelings and personal impact.'
        },
        {
            name: 'practical',
            prompt: 'Focus on concrete, practical aspects and real-world applications.'
        },
        {
            name: 'intuitive',
            prompt: 'Draw upon intuitive understanding and subtle connections.'
        },
        {
            name: 'reflective',
            prompt: 'Consider the broader context and deeper meanings.'
        }
    ];

    constructor(bot: Telegraf<Context>, runtime: IAgentRuntime) {
        this.bot = bot;
        this.runtime = runtime;
        this.responseValidator = new ResponseValidator(runtime);

        this._initializeTeamMemberUsernames().catch((error) =>
            elizaLogger.error(
                "Error initializing team member usernames:",
                error,
            ),
        );

        this.autoPostConfig = {
            enabled:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.enabled || false,
            monitorTime:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.monitorTime || 300000,
            inactivityThreshold:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.inactivityThreshold || 3600000,
            mainChannelId:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.mainChannelId,
            pinnedMessagesGroups:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.pinnedMessagesGroups || [],
            minTimeBetweenPosts:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.minTimeBetweenPosts || 7200000,
        };

        if (this.autoPostConfig.enabled) {
            this._startAutoPostMonitoring();
        }
    }

    private async _initializeTeamMemberUsernames(): Promise<void> {
        if (!this.runtime.character.clientConfig?.telegram?.isPartOfTeam)
            return;

        const teamAgentIds =
            this.runtime.character.clientConfig.telegram.teamAgentIds || [];

        for (const id of teamAgentIds) {
            try {
                const chat = await this.bot.telegram.getChat(id);
                if ("username" in chat && chat.username) {
                    this.teamMemberUsernames.set(id, chat.username);
                    elizaLogger.info(
                        `Cached username for team member ${id}: ${chat.username}`,
                    );
                }
            } catch (error) {
                elizaLogger.error(
                    `Error getting username for team member ${id}:`,
                    error,
                );
            }
        }
    }

    private _startAutoPostMonitoring(): void {
        // Wait for bot to be ready
        if (this.bot.botInfo) {
            elizaLogger.info(
                "[AutoPost Telegram] Bot ready, starting monitoring",
            );
            this._initializeAutoPost();
        } else {
            elizaLogger.info(
                "[AutoPost Telegram] Bot not ready, waiting for ready event",
            );
            this.bot.telegram.getMe().then(() => {
                elizaLogger.info(
                    "[AutoPost Telegram] Bot ready, starting monitoring",
                );
                this._initializeAutoPost();
            });
        }
    }

    private _initializeAutoPost(): void {
        setTimeout(() => {
            // Get intervals from settings (in minutes)
            const minInterval = parseInt(
                this.runtime.getSetting("DIVINATION_INTERVAL_MIN") || "1380",
                10,
            ); // Default 23 hours
            const maxInterval = parseInt(
                this.runtime.getSetting("DIVINATION_INTERVAL_MAX") || "1500",
                10,
            ); // Default 25 hours

            // Convert to milliseconds and ensure valid values
            const minMs = Math.max(
                minInterval * 60 * 1000,
                23 * 60 * 60 * 1000,
            ); // Minimum 23 hours
            const maxMs = Math.max(
                maxInterval * 60 * 1000,
                minMs + 2 * 60 * 60 * 1000,
            ); // At least 2 hours more than min

            this.autoPostInterval = setInterval(
                () => {
                    // Check recent message volume
                    this._checkChannelActivity();
                },
                Math.floor(Math.random() * (maxMs - minMs) + minMs),
            );
        }, 5000);
    }

    private async _checkChannelActivity(): Promise<void> {
        if (!this.autoPostConfig.enabled || !this.autoPostConfig.mainChannelId)
            return;

        try {
            // Check recent message volume
            const lastHourMessages =
                await this.runtime.messageManager.getMemories({
                    roomId: stringToUuid(
                        this.autoPostConfig.mainChannelId +
                            "-" +
                            this.runtime.agentId,
                    ),
                    start: Date.now() - 60 * 60 * 1000, // Last hour
                });

            // Only post if chat has been quiet (no messages in last hour)
            if (!lastHourMessages?.length) {
                this._checkChannelActivity();
            }
        } catch (error) {
            elizaLogger.warn(
                "[AutoPost Telegram] Error checking channel activity:",
                error,
            );
        }
    }

    private async _monitorPinnedMessages(ctx: Context): Promise<void> {
        if (!this.autoPostConfig.pinnedMessagesGroups.length) {
            elizaLogger.warn(
                "[AutoPost Telegram] Auto post config no pinned message groups",
            );
            return;
        }

        if (!ctx.message || !("pinned_message" in ctx.message)) {
            return;
        }

        const pinnedMessage = ctx.message.pinned_message;
        if (!pinnedMessage) return;

        if (
            !this.autoPostConfig.pinnedMessagesGroups.includes(
                ctx.chat.id.toString(),
            )
        )
            return;

        const mainChannel = this.autoPostConfig.mainChannelId;
        if (!mainChannel) return;

        try {
            elizaLogger.info(
                `[AutoPost Telegram] Processing pinned message in group ${ctx.chat.id}`,
            );

            // Explicitly type and handle message content
            const messageContent: string =
                "text" in pinnedMessage &&
                typeof pinnedMessage.text === "string"
                    ? pinnedMessage.text
                    : "caption" in pinnedMessage &&
                        typeof pinnedMessage.caption === "string"
                      ? pinnedMessage.caption
                      : "New pinned message";

            const roomId = stringToUuid(
                mainChannel + "-" + this.runtime.agentId,
            );
            const memory = {
                id: stringToUuid(`pinned-${Date.now()}`),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                roomId,
                content: {
                    text: messageContent,
                    source: "telegram",
                    metadata: {
                        messageId: pinnedMessage.message_id,
                        pinnedMessageData: pinnedMessage,
                    },
                },
                embedding: getEmbeddingZeroVector(),
                createdAt: Date.now(),
            };

            let state = await this.runtime.composeState(memory, {
                telegramBot: this.bot,
                pinnedMessageContent: messageContent,
                pinnedGroupId: ctx.chat.id.toString(),
                agentName: this.runtime.character.name,
            });

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates
                        ?.telegramPinnedMessageTemplate ||
                    telegramPinnedMessageTemplate,
            });

            const responseContent = await this._generateResponse(
                memory,
                state,
                context,
            );
            if (!responseContent?.text) return;

            // Send message using telegram bot
            const messageText = responseContent.reasoning
                ? `Reasoning: ${responseContent.reasoning}\n\n${responseContent.text.trim()}`
                : responseContent.text.trim();

            const messages = await Promise.all(
                this.splitMessage(messageText).map((chunk) =>
                    this.bot.telegram.sendMessage(mainChannel, chunk),
                ),
            );

            elizaLogger.debug(
                "[Send Message] Sending response with reasoning",
                {
                    reasoningFirst: true,
                    reasoningLength:
                        typeof responseContent.reasoning === "string"
                            ? responseContent.reasoning.length
                            : undefined,
                    textLength: responseContent.text?.length,
                    totalChunks: this.splitMessage(
                        `Reasoning: ${responseContent.reasoning}\n\n${responseContent.text.trim()}`,
                    ).length,
                },
            );

            const memories = messages.map((m) => ({
                id: stringToUuid(
                    m.message_id.toString() + "-" + this.runtime.agentId,
                ),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                content: {
                    ...responseContent,
                    text: m.text,
                },
                roomId,
                embedding: getEmbeddingZeroVector(),
                createdAt: m.date * 1000,
            }));

            for (const m of memories) {
                await this.runtime.messageManager.createMemory(m);
            }

            state = await this.runtime.updateRecentMessageState(state);
            await this.runtime.evaluate(memory, state, true);
        } catch (error) {
            elizaLogger.warn(
                `[AutoPost Telegram] Error processing pinned message:`,
                error,
            );
        }
    }

    private _getTeamMemberUsername(id: string): string | undefined {
        return this.teamMemberUsernames.get(id);
    }

    private _getNormalizedUserId(id: string | number): string {
        return id.toString().replace(/[^0-9]/g, "");
    }

    private _isTeamMember(userId: string | number): boolean {
        const teamConfig = this.runtime.character.clientConfig?.telegram;
        if (!teamConfig?.isPartOfTeam || !teamConfig.teamAgentIds) return false;

        const normalizedUserId = this._getNormalizedUserId(userId);
        return teamConfig.teamAgentIds.some(
            (teamId) => this._getNormalizedUserId(teamId) === normalizedUserId,
        );
    }

    private _isTeamLeader(): boolean {
        return (
            this.bot.botInfo?.id.toString() ===
            this.runtime.character.clientConfig?.telegram?.teamLeaderId
        );
    }

    private _isTeamCoordinationRequest(content: string): boolean {
        const contentLower = content.toLowerCase();
        return TEAM_COORDINATION.KEYWORDS?.some((keyword) =>
            contentLower.includes(keyword.toLowerCase()),
        );
    }

    private _isRelevantToTeamMember(
        content: string,
        chatId: string,
        lastAgentMemory: Memory | null = null,
    ): boolean {
        const teamConfig = this.runtime.character.clientConfig?.telegram;

        // Check leader's context based on last message
        if (this._isTeamLeader() && lastAgentMemory?.content.text) {
            const timeSinceLastMessage = Date.now() - lastAgentMemory.createdAt;
            if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
                return false;
            }

            const similarity = cosineSimilarity(
                content.toLowerCase(),
                lastAgentMemory.content.text.toLowerCase(),
            );

            return (
                similarity >=
                MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD_FOLLOW_UPS
            );
        }

        // Check team member keywords
        if (!teamConfig?.teamMemberInterestKeywords?.length) {
            return false; // If no keywords defined, only leader maintains conversation
        }

        // Check if content matches any team member keywords
        return teamConfig.teamMemberInterestKeywords.some((keyword) =>
            content.toLowerCase().includes(keyword.toLowerCase()),
        );
    }

    private async _analyzeContextSimilarity(
        currentMessage: string,
        previousContext?: MessageContext,
        agentLastMessage?: string,
    ): Promise<number> {
        if (!previousContext) return 1;

        const timeDiff = Date.now() - previousContext.timestamp;
        const timeWeight = Math.max(0, 1 - timeDiff / (5 * 60 * 1000));

        const similarity = cosineSimilarity(
            currentMessage.toLowerCase(),
            previousContext.content.toLowerCase(),
            agentLastMessage?.toLowerCase(),
        );

        return similarity * timeWeight;
    }

    private async _shouldRespond(
        message: Message,
        state: State,
    ): Promise<boolean> {
        elizaLogger.debug(
            `[shouldRespond] Starting response evaluation for message`,
            {
                messageType: message.chat.type,
                chatId: message.chat.id,
                hasText: "text" in message,
                hasPhoto: "photo" in message,
                isDocument: "document" in message,
            },
        );

        const messageText =
            "text" in message
                ? message.text
                : "caption" in message
                  ? message.caption
                  : "";

        // Check for plugin keywords
        for (const [plugin, keywords] of Object.entries(this.PLUGIN_KEYWORDS)) {
            if (
                keywords.some((keyword) =>
                    messageText.toLowerCase().includes(keyword)
                )
            ) {
                elizaLogger.debug(
                    `[shouldRespond] ${plugin} query detected, setting plugin flag`,
                );
                state.pluginQuery = plugin;
                return true; // Allow processing to continue for plugin handling
            }
        }

        if (
            this.runtime.character.clientConfig?.telegram
                ?.shouldRespondOnlyToMentions
        ) {
            elizaLogger.debug(
                `[shouldRespond] Bot configured to respond only to mentions`,
            );
            const shouldRespond = this._isMessageForMe(message);
            elizaLogger.debug(
                `[shouldRespond] Message for me check result: ${shouldRespond}`,
            );
            return shouldRespond;
        }

        // Respond if bot is mentioned
        if (
            "text" in message &&
            message.text?.includes(`@${this.bot.botInfo?.username}`)
        ) {
            elizaLogger.debug(
                `[shouldRespond] Bot explicitly mentioned in message`,
            );
            return true;
        }

        // Respond to private chats
        if (message.chat.type === "private") {
            elizaLogger.debug(
                `[shouldRespond] Message is in private chat, responding`,
            );
            return true;
        }

        // Don't respond to images in group chats
        if (
            "photo" in message ||
            ("document" in message &&
                message.document?.mime_type?.startsWith("image/"))
        ) {
            elizaLogger.debug(
                `[shouldRespond] Image in group chat, skipping response`,
            );
            return false;
        }

        const chatId = message.chat.id.toString();
        const chatState = this.interestChats[chatId];
        elizaLogger.debug(`[shouldRespond] Chat state`, {
            chatId,
            hasState: !!chatState,
            currentHandler: chatState?.currentHandler,
            messageCount: chatState?.messages?.length,
        });

        // Final context check
        if ("text" in message || ("caption" in message && message.caption)) {
            elizaLogger.debug(
                `[shouldRespond] Making final context-based decision`,
                {
                    hasText: "text" in message,
                    hasCaption: "caption" in message,
                    messageLength: messageText.length,
                },
            );

            const templateToUse =
                this.runtime.character.templates
                    ?.telegramShouldRespondTemplate ||
                this.runtime.character?.templates?.shouldRespondTemplate ||
                telegramShouldRespondTemplate;

            // Handle the special case where we need to compose random users
            const baseTemplate =
                typeof templateToUse === "string"
                    ? getTemplate(templateToUse)
                    : templateToUse({ state });
            const templateWithRandomUsers =
                templateToUse === telegramShouldRespondTemplate
                    ? composeRandomUser(baseTemplate, 2)
                    : baseTemplate;

            const shouldRespondContext = composeContext({
                state,
                template: templateWithRandomUsers,
            });

            const response = await generateShouldRespond({
                runtime: this.runtime,
                context: shouldRespondContext,
                modelClass: ModelClass.SMALL,
                structured: true
            }) as "RESPOND" | "IGNORE" | "STOP" | null | ShouldRespondResult;

            elizaLogger.debug(`[shouldRespond] LLM decision received:`, response);

            if (typeof response === "string") {
                return response === "RESPOND";
            }

            // Store reasoning for later use
            if (response?.reasoning) {
                state.evaluationReasoning = response.reasoning;
            }

            return response?.decision === "RESPOND";
        }

        elizaLogger.debug(
            `[shouldRespond] No text/caption content, defaulting to false`,
        );
        return false;
    }

    private _isMessageForMe(message: Message): boolean {
        const botUsername = this.bot.botInfo?.username;
        const characterName = this.runtime.character.name;
        if (!botUsername) return false;

        const messageText = "text" in message ? message.text :
                           "caption" in message ? message.caption : "";
        if (!messageText) return false;

        const isReplyToBot = (message as any).reply_to_message?.from?.is_bot === true &&
                            (message as any).reply_to_message?.from?.username === botUsername;

        const isMentioned = messageText.toLowerCase()
            .split(/\s+/)
            .some(word =>
                word === botUsername.toLowerCase() ||
                word === `@${botUsername.toLowerCase()}` ||
                word === characterName.toLowerCase()
            );

        const hasUsername = messageText.toLowerCase().includes(botUsername.toLowerCase());

        // If it's a direct mention or reply, bypass rate limiting
        const isDirectInteraction = isReplyToBot || isMentioned;

        // Only apply rate limiting for non-direct messages
        if (!isDirectInteraction) {
            const lastResponseTime = this.lastResponseTimes.get(message.chat.id.toString()) || 0;
            const minTimeBetweenResponses = 60000; // 60 seconds
            const timeSinceLastResponse = Date.now() - lastResponseTime;
            if (timeSinceLastResponse < minTimeBetweenResponses) {
                elizaLogger.debug(
                    `Rate limited: Last response was ${timeSinceLastResponse / 1000}s ago`,
                );
                return false;
            }
        }

        return (
            isReplyToBot ||
            isMentioned ||
            (!this.runtime.character.clientConfig?.telegram
                ?.shouldRespondOnlyToMentions &&
                hasUsername)
        );
    }

    private _checkInterest(chatId: string): boolean {
        const chatState = this.interestChats[chatId];
        if (!chatState) return false;

        const lastMessage = chatState.messages[chatState.messages.length - 1];
        const timeSinceLastMessage = Date.now() - chatState.lastMessageSent;

        if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
            delete this.interestChats[chatId];
            return false;
        } else if (
            timeSinceLastMessage > MESSAGE_CONSTANTS.PARTIAL_INTEREST_DECAY
        ) {
            return this._isRelevantToTeamMember(
                lastMessage?.content.text || "",
                chatId,
            );
        }

        // Team leader specific checks
        if (this._isTeamLeader() && chatState.messages.length > 0) {
            if (
                !this._isRelevantToTeamMember(
                    lastMessage?.content.text || "",
                    chatId,
                )
            ) {
                const recentTeamResponses = chatState.messages
                    .slice(-3)
                    .some(
                        (m) =>
                            m.userId !== this.runtime.agentId &&
                            this._isTeamMember(m.userId.toString()),
                    );

                if (recentTeamResponses) {
                    delete this.interestChats[chatId];
                    return false;
                }
            }
        }

        return true;
    }

    // Process image messages and generate descriptions
    private async processImage(
        message: Message,
    ): Promise<{ description: string } | null> {
        try {
            let imageUrl: string | null = null;

            elizaLogger.info(`Telegram Message: ${message}`);

            if ("photo" in message && message.photo?.length > 0) {
                const photo = message.photo[message.photo.length - 1];
                const fileLink = await this.bot.telegram.getFileLink(
                    photo.file_id,
                );
                imageUrl = fileLink.toString();
            } else if (
                "document" in message &&
                message.document?.mime_type?.startsWith("image/")
            ) {
                const fileLink = await this.bot.telegram.getFileLink(
                    message.document.file_id,
                );
                imageUrl = fileLink.toString();
            }

            if (imageUrl) {
                const imageDescriptionService =
                    this.runtime.getService<IImageDescriptionService>(
                        ServiceType.IMAGE_DESCRIPTION,
                    );
                const { title, description } =
                    await imageDescriptionService.describeImage(imageUrl);
                return { description: `[Image: ${title}\n${description}]` };
            }
        } catch (error) {
            console.error("❌ Error processing image:", error);
        }

        return null;
    }

    // Send long messages in chunks
    private async sendMessageInChunks(
        ctx: Context,
        content: Content,
        replyToMessageId?: number,
    ): Promise<Message.TextMessage[]> {
        elizaLogger.debug("[sendMessageInChunks] Starting message sending", {
            chatId: ctx.chat.id,
            contentLength: content.text?.length,
            hasAttachments: !!content.attachments?.length,
        });

        if (content.attachments?.length) {
            elizaLogger.debug("[sendMessageInChunks] Processing attachments", {
                count: content.attachments.length,
            });

            content.attachments.map(async (attachment: Media) => {
                const typeMap: { [key: string]: MediaType } = {
                    "image/gif": MediaType.ANIMATION,
                    image: MediaType.PHOTO,
                    doc: MediaType.DOCUMENT,
                    video: MediaType.VIDEO,
                    audio: MediaType.AUDIO,
                };

                let mediaType: MediaType | undefined;
                for (const prefix in typeMap) {
                    if (attachment.contentType.startsWith(prefix)) {
                        mediaType = typeMap[prefix];
                        break;
                    }
                }

                if (!mediaType) {
                    elizaLogger.debug(
                        "[sendMessageInChunks] Unsupported media type",
                        {
                            contentType: attachment.contentType,
                        },
                    );
                    throw new Error(
                        `Unsupported Telegram attachment content type: ${attachment.contentType}`,
                    );
                }

                elizaLogger.debug("[sendMessageInChunks] Sending media", {
                    mediaType,
                    hasDescription: !!attachment.description,
                });

                await this.sendMedia(
                    ctx,
                    attachment.url,
                    mediaType,
                    attachment.description,
                );
            });
        } else {
            // Don't combine reasoning with text - they should be separate
            const messageText = content.text;

            // Split on double newlines to get sections
            const sections = messageText.split(/\n\n+/);

            // Remove any duplicate sections
            const uniqueSections = [...new Set(sections)];

            // Rejoin with double newlines
            const cleanedText = uniqueSections.join('\n\n');

            const chunks = this.splitMessage(cleanedText);
            elizaLogger.debug("[sendMessageInChunks] Splitting text message", {
                chunkCount: chunks.length,
                originalLength: messageText.length,
                cleanedLength: cleanedText.length
            });

            const sentMessages: Message.TextMessage[] = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = escapeMarkdown(chunks[i]);
                elizaLogger.debug("[sendMessageInChunks] Sending chunk", {
                    chunkIndex: i,
                    chunkLength: chunk.length,
                    isReply: i === 0 && !!replyToMessageId,
                });

                const sentMessage = (await ctx.telegram.sendMessage(
                    ctx.chat.id,
                    chunk,
                    {
                        reply_parameters:
                            i === 0 && replyToMessageId
                                ? { message_id: replyToMessageId }
                                : undefined,
                        parse_mode: "Markdown",
                    },
                )) as Message.TextMessage;

                sentMessages.push(sentMessage);
            }

            elizaLogger.debug(
                "[sendMessageInChunks] Completed sending chunks",
                {
                    totalMessagesSent: sentMessages.length,
                },
            );
            return sentMessages;
        }
    }

    private async sendMedia(
        ctx: Context,
        mediaPath: string,
        type: MediaType,
        caption?: string,
    ): Promise<void> {
        try {
            const isUrl = /^(http|https):\/\//.test(mediaPath);
            const sendFunctionMap: Record<MediaType, Function> = {
                [MediaType.PHOTO]: ctx.telegram.sendPhoto.bind(ctx.telegram),
                [MediaType.VIDEO]: ctx.telegram.sendVideo.bind(ctx.telegram),
                [MediaType.DOCUMENT]: ctx.telegram.sendDocument.bind(
                    ctx.telegram,
                ),
                [MediaType.AUDIO]: ctx.telegram.sendAudio.bind(ctx.telegram),
                [MediaType.ANIMATION]: ctx.telegram.sendAnimation.bind(
                    ctx.telegram,
                ),
            };

            const sendFunction = sendFunctionMap[type];

            if (!sendFunction) {
                throw new Error(`Unsupported media type: ${type}`);
            }

            if (isUrl) {
                // Handle HTTP URLs
                await sendFunction(ctx.chat.id, mediaPath, { caption });
            } else {
                // Handle local file paths
                if (!fs.existsSync(mediaPath)) {
                    throw new Error(`File not found at path: ${mediaPath}`);
                }

                const fileStream = fs.createReadStream(mediaPath);

                try {
                    await sendFunction(
                        ctx.chat.id,
                        { source: fileStream },
                        { caption },
                    );
                } finally {
                    fileStream.destroy();
                }
            }

            elizaLogger.info(
                `${
                    type.charAt(0).toUpperCase() + type.slice(1)
                } sent successfully: ${mediaPath}`,
            );
        } catch (error) {
            elizaLogger.error(
                `Failed to send ${type}. Path: ${mediaPath}. Error: ${error.message}`,
            );
            elizaLogger.debug(error.stack);
            throw error;
        }
    }

    // Split message into smaller parts
    private splitMessage(text: string): string[] {
        const chunks: string[] = [];
        let currentChunk = "";

        const lines = text.split("\n");
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 <= MAX_MESSAGE_LENGTH) {
                currentChunk += (currentChunk ? "\n" : "") + line;
            } else {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = line;
            }
        }

        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    private getNextPerspective(messageText: string): { name: string; prompt: string } {
        // Check if it's a personal question
        const isPersonalQuestion = /what('?s| is) your (favorite|favourite)|do you (like|enjoy|prefer)|how (are|do) you feel/i.test(messageText);

        if (isPersonalQuestion) {
            return {
                name: 'personal',
                prompt: 'Focus on expressing genuine preferences and feelings. Keep responses direct and authentic without philosophical complexity.'
            };
        }

        // Use rotating perspectives for non-personal questions
        const perspective = this.perspectives[this.currentPerspectiveIndex];
        this.currentPerspectiveIndex = (this.currentPerspectiveIndex + 1) % this.perspectives.length;
        return perspective;
    }

    // Generate a response using AI
    private async _generateResponse(
        message: Memory,
        _state: State,
        context: string,
    ): Promise<Content> {
        const cleanContext = context.replace(/&quot;/g, "");
        const messageText = message.content.text || '';

        // Get the appropriate perspective based on message content
        const perspective = this.getNextPerspective(messageText);

        elizaLogger.debug("Generating response with perspective:", {
            messageId: message.id,
            perspective: perspective.name,
            messageContent: message.content,
        });

        // Simplified context with appropriate perspective
        const enhancedContext = cleanContext + `
RESPONSE GUIDANCE:
You are having a natural conversation while maintaining the [SCAN], [PATTERN], and [TRANSMISSION] structure.

Current Perspective: ${perspective.name}
${perspective.prompt}

Guidelines:
1. Avoid using these recently used hexagrams: ${this.recentHexagrams.join(', ')}
2. Keep responses direct and relevant to the question
3. For personal questions about preferences or feelings:
   - Give clear, direct answers
   - Avoid philosophical or market-related responses
   - Focus on the specific subject being asked about
4. Choose hexagrams that reflect the personal nature of the conversation

Remember: This is a unique moment - your response should be authentic while maintaining the required structure.`;

        let attempts = 0;
        const maxAttempts = 3;
        let validResponse: MessageResponseResult = null;

        while (attempts < maxAttempts && !validResponse) {
            attempts++;

            // Generate response with structured format
            const response = await generateMessageResponse({
                runtime: this.runtime,
                context: enhancedContext,
                modelClass: ModelClass.LARGE,
                structured: true
            }) as MessageResponseResult;

            if (!response?.text) {
                elizaLogger.error("No response text generated");
                continue;
            }

            // For personal questions, validate that the response actually answers the question
            if (perspective.name === 'personal') {
                const sections = response.text.split(/\n\n+/);
                const scanSection = sections.find(s => s.startsWith('[SCAN]'));
                const transmissionSection = sections.find(s => s.startsWith('[TRANSMISSION]'));

                if (!scanSection || !transmissionSection) {
                    elizaLogger.error("Response missing required sections");
                    continue;
                }

                // Check if the response addresses the specific subject
                const subjectMatch = messageText.match(/what('?s| is) your (favorite|favourite) (\w+)|do you (like|enjoy|prefer) (\w+)|how (are|do) you feel/i);
                if (subjectMatch) {
                    const subject = subjectMatch[3] || subjectMatch[5] || 'feeling';
                    if (!transmissionSection.toLowerCase().includes(subject.toLowerCase())) {
                        elizaLogger.error(`Response doesn't address the subject: ${subject}`);
                        continue;
                    }
                }
            }

            // Extract and update hexagram
            const sections = response.text.split(/\n\n+/);
            const patternSection = sections.find(s => s.startsWith('[PATTERN]'));
            if (patternSection) {
                const hexagramMatch = patternSection.match(/Hexagram: ([^(]+)/);
                if (hexagramMatch) {
                    const hexagram = hexagramMatch[1].trim();
                    if (!this.recentHexagrams.includes(hexagram)) {
                        this.recentHexagrams.unshift(hexagram);
                        this.recentHexagrams = this.recentHexagrams.slice(0, 5);
                    }
                }
            }

            // If we get here, the response is valid
            validResponse = response;
        }

        if (!validResponse) {
            elizaLogger.error(`Failed to generate valid response after ${maxAttempts} attempts`);
            return {
                text: "I apologize, but I'm having trouble formulating a response. Could you please rephrase your question?",
                source: "telegram"
            };
        }

        // Log the response generation
        await this.runtime.databaseAdapter.log({
            body: {
                message,
                cleanContext,
                response: validResponse,
                perspective: perspective.name,
                attempts
            },
            userId: message.userId,
            roomId: message.roomId,
            type: "response",
        });

        return validResponse;
    }

    // Main handler for incoming messages
    public async handleMessage(ctx: Context): Promise<void> {
        if (!ctx.message || !ctx.from) {
            return; // Exit if no message or sender info
        }

        this.lastChannelActivity[ctx.chat.id.toString()] = Date.now();

        // Check for pinned message and route to monitor function
        if (
            this.autoPostConfig.enabled &&
            ctx.message &&
            "pinned_message" in ctx.message
        ) {
            // We know this is a message update context now
            await this._monitorPinnedMessages(ctx);
            return;
        }

        if (
            this.runtime.character.clientConfig?.telegram
                ?.shouldIgnoreBotMessages &&
            ctx.from.is_bot
        ) {
            return;
        }
        if (
            this.runtime.character.clientConfig?.telegram
                ?.shouldIgnoreDirectMessages &&
            ctx.chat?.type === "private"
        ) {
            return;
        }

        const message = ctx.message;
        const chatId = ctx.chat?.id.toString();

        elizaLogger.debug("[Message Processing] Extracting message content", {
            messageId: message.message_id,
            chatId,
            messageType:
                "text" in message
                    ? "text"
                    : "caption" in message
                      ? "caption"
                      : "other",
        });

        const messageText =
            "text" in message
                ? message.text
                : "caption" in message
                  ? message.caption
                  : "";

        elizaLogger.debug("[Message Processing] Processed message text", {
            hasText: !!messageText,
            textLength: messageText?.length,
            truncatedText: messageText?.substring(0, 50),
        });

        // Add team handling at the start
        if (
            this.runtime.character.clientConfig?.telegram?.isPartOfTeam &&
            !this.runtime.character.clientConfig?.telegram
                ?.shouldRespondOnlyToMentions
        ) {
            const isDirectlyMentioned = this._isMessageForMe(message);
            const hasInterest = this._checkInterest(chatId);

            // Non-leader team member showing interest based on keywords
            if (
                !this._isTeamLeader() &&
                this._isRelevantToTeamMember(messageText, chatId)
            ) {
                this.interestChats[chatId] = {
                    currentHandler: this.bot.botInfo?.id.toString(),
                    lastMessageSent: Date.now(),
                    messages: [],
                };
            }

            const isTeamRequest = this._isTeamCoordinationRequest(messageText);
            const isLeader = this._isTeamLeader();

            // Check for continued interest
            if (hasInterest && !isDirectlyMentioned) {
                const lastSelfMemories =
                    await this.runtime.messageManager.getMemories({
                        roomId: stringToUuid(
                            chatId + "-" + this.runtime.agentId,
                        ),
                        unique: false,
                        count: 5,
                    });

                const lastSelfSortedMemories = lastSelfMemories
                    ?.filter((m) => m.userId === this.runtime.agentId)
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

                const isRelevant = this._isRelevantToTeamMember(
                    messageText,
                    chatId,
                    lastSelfSortedMemories?.[0],
                );

                if (!isRelevant) {
                    delete this.interestChats[chatId];
                    return;
                }
            }

            // Handle team coordination requests
            if (isTeamRequest) {
                if (isLeader) {
                    this.interestChats[chatId] = {
                        currentHandler: this.bot.botInfo?.id.toString(),
                        lastMessageSent: Date.now(),
                        messages: [],
                    };
                } else {
                    this.interestChats[chatId] = {
                        currentHandler: this.bot.botInfo?.id.toString(),
                        lastMessageSent: Date.now(),
                        messages: [],
                    };

                    if (!isDirectlyMentioned) {
                        this.interestChats[chatId].lastMessageSent = 0;
                    }
                }
            }

            // Check for other team member mentions using cached usernames
            const otherTeamMembers =
                this.runtime.character.clientConfig.telegram.teamAgentIds.filter(
                    (id) => id !== this.bot.botInfo?.id.toString(),
                );

            const mentionedTeamMember = otherTeamMembers.find((id) => {
                const username = this._getTeamMemberUsername(id);
                return username && messageText?.includes(`@${username}`);
            });

            // If another team member is mentioned, clear our interest
            if (mentionedTeamMember) {
                if (
                    hasInterest ||
                    this.interestChats[chatId]?.currentHandler ===
                        this.bot.botInfo?.id.toString()
                ) {
                    delete this.interestChats[chatId];

                    // Only return if we're not the mentioned member
                    if (!isDirectlyMentioned) {
                        return;
                    }
                }
            }

            // Set/maintain interest only if we're mentioned or already have interest
            if (isDirectlyMentioned) {
                this.interestChats[chatId] = {
                    currentHandler: this.bot.botInfo?.id.toString(),
                    lastMessageSent: Date.now(),
                    messages: [],
                };
            } else if (!isTeamRequest && !hasInterest) {
                return;
            }

            // Update message tracking
            if (this.interestChats[chatId]) {
                this.interestChats[chatId].messages.push({
                    userId: stringToUuid(ctx.from.id.toString()),
                    userName:
                        ctx.from.username ||
                        ctx.from.first_name ||
                        "Unknown User",
                    content: { text: messageText, source: "telegram" },
                });

                if (
                    this.interestChats[chatId].messages.length >
                    MESSAGE_CONSTANTS.MAX_MESSAGES
                ) {
                    this.interestChats[chatId].messages = this.interestChats[
                        chatId
                    ].messages.slice(-MESSAGE_CONSTANTS.MAX_MESSAGES);
                }
            }
        }

        try {
            // Convert IDs to UUIDs
            const userId = stringToUuid(ctx.from.id.toString()) as UUID;

            // Get user name
            const userName =
                ctx.from.username || ctx.from.first_name || "Unknown User";

            // Get chat ID
            const chatId = stringToUuid(
                ctx.chat?.id.toString() + "-" + this.runtime.agentId,
            ) as UUID;

            // Get agent ID
            const agentId = this.runtime.agentId;

            // Get room ID
            const roomId = chatId;

            // Ensure connection
            await this.runtime.ensureConnection(
                userId,
                roomId,
                userName,
                userName,
                "telegram",
            );

            // Get message ID
            const messageId = stringToUuid(
                message.message_id.toString() + "-" + this.runtime.agentId,
            ) as UUID;

            // Handle images
            const imageInfo = await this.processImage(message);

            // Get text or caption
            let messageText = "";
            if ("text" in message) {
                messageText = message.text;
            } else if ("caption" in message && message.caption) {
                messageText = message.caption;
            }

            // Combine text and image description
            const fullText = imageInfo
                ? `${messageText} ${imageInfo.description}`
                : messageText;

            if (!fullText) {
                return; // Skip if no content
            }

            // Create content
            const content: Content = {
                text: fullText,
                source: "telegram",
                inReplyTo:
                    "reply_to_message" in message && message.reply_to_message
                        ? stringToUuid(
                              message.reply_to_message.message_id.toString() +
                                  "-" +
                                  this.runtime.agentId,
                          )
                        : undefined,
            };

            // Create memory for the message
            const memory: Memory = {
                id: messageId,
                agentId,
                userId,
                roomId,
                content,
                createdAt: message.date * 1000,
                embedding: getEmbeddingZeroVector(),
            };

            // Create memory
            await this.runtime.messageManager.createMemory(memory);

            // Update state with the new memory
            let state = await this.runtime.composeState(memory);
            state = await this.runtime.updateRecentMessageState(state);

            // Decide whether to respond
            const shouldRespond = await this._shouldRespond(message, state);

            // Send response in chunks
            const callback: HandlerCallback = async (content: Content) => {
                elizaLogger.debug(
                    "[Callback Handler] Starting message callback",
                    {
                        contentLength: content.text?.length,
                        hasAction: !!content.action,
                    },
                );

                const sentMessages = await this.sendMessageInChunks(
                    ctx,
                    content,
                    message.message_id,
                );

                if (sentMessages) {
                    elizaLogger.debug("[Callback Handler] Messages sent", {
                        messageCount: sentMessages.length,
                    });

                    const memories: Memory[] = [];

                    for (let i = 0; i < sentMessages.length; i++) {
                        const sentMessage = sentMessages[i];
                        const isLastMessage = i === sentMessages.length - 1;

                        const memory: Memory = {
                            id: stringToUuid(
                                sentMessage.message_id.toString() +
                                    "-" +
                                    this.runtime.agentId,
                            ),
                            agentId,
                            userId: agentId,
                            roomId,
                            content: {
                                ...content,
                                text: sentMessage.text,
                                inReplyTo: messageId,
                            },
                            createdAt: sentMessage.date * 1000,
                            embedding: getEmbeddingZeroVector(),
                        };

                        memory.content.action = !isLastMessage
                            ? "CONTINUE"
                            : content.action;

                        elizaLogger.debug(
                            "[Callback Handler] Creating memory for message",
                            {
                                messageIndex: i,
                                isLastMessage,
                                action: memory.content.action,
                                textLength: sentMessage.text.length,
                            },
                        );

                        await this.runtime.messageManager.createMemory(memory);
                        memories.push(memory);
                    }

                    elizaLogger.debug(
                        "[Callback Handler] Completed memory creation",
                        {
                            totalMemories: memories.length,
                        },
                    );

                    return memories;
                }
            };

            if (shouldRespond) {
                elizaLogger.debug(
                    "[Response Generation] Starting response generation",
                    {
                        memoryId: memory.id,
                        stateSize: Object.keys(state).length,
                    },
                );

                // Get the template path/name from the configuration
                const templateToUse =
                    this.runtime.character.templates
                        ?.telegramMessageHandlerTemplate ||
                    this.runtime.character?.templates?.messageHandlerTemplate ||
                    telegramMessageHandlerTemplate;

                // Get the actual template content from the registry
                const templateContent =
                    typeof templateToUse === "string"
                        ? getTemplate(templateToUse)
                        : templateToUse({ state });

                elizaLogger.debug("[Context Generation] Template selection:", {
                    selectedTemplate: templateToUse,
                    hasContent: !!templateContent,
                    contentLength: templateContent?.length,
                });

                const context = composeContext({
                    state,
                    template: templateContent,
                });

                // const context = composeContext({
                //     state,
                //     template:
                //         this.runtime.character.templates
                //             ?.telegramMessageHandlerTemplate ||
                //         this.runtime.character?.templates
                //             ?.messageHandlerTemplate ||
                //         telegramMessageHandlerTemplate,
                // });

                elizaLogger.debug("[Response Generation] Created context", {
                    contextLength: context.length,
                    templateSource: this.runtime.character.templates
                        ?.telegramMessageHandlerTemplate
                        ? "telegram"
                        : this.runtime.character?.templates
                                ?.messageHandlerTemplate
                          ? "character_default"
                          : "telegram_default",
                });

                const responseContent = await this._generateResponse(
                    memory,
                    state,
                    context,
                );
                elizaLogger.debug(
                    "[Response Generation] Generated response content",
                    {
                        hasResponse: !!responseContent,
                        responseLength: responseContent?.text?.length,
                    },
                );

                if (!responseContent?.text) {
                    elizaLogger.debug(
                        "[Response Generation] No response text, skipping",
                    );
                    return;
                }

                const responseMessages = await callback(responseContent);
                elizaLogger.debug(
                    "[Response Generation] Sent response messages",
                    {
                        messageCount: responseMessages?.length,
                    },
                );

                state = await this.runtime.updateRecentMessageState(state);
                elizaLogger.debug(
                    "[Response Generation] Updated state after response",
                );

                await this.runtime.processActions(
                    memory,
                    responseMessages,
                    state,
                    callback,
                );
                elizaLogger.debug(
                    "[Response Generation] Processed response actions",
                );
            }

            await this.runtime.evaluate(memory, state, shouldRespond, callback);
        } catch (error) {
            elizaLogger.error("❌ Error handling message:", error);
            elizaLogger.error("Error sending message:", error);
        }
    }
}

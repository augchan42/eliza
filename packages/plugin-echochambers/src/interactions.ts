import {
    composeContext,
    generateMessageResponse,
    generateShouldRespond,
    messageCompletionFooter,
    shouldRespondFooter,
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    stringToUuid,
    elizaLogger,
    getEmbeddingZeroVector,
    AgentRole,
    UUID,
    type ShouldRespondResult,
} from "@elizaos/core";
import type { EchoChamberClient } from "./echoChamberClient";
import type { ChatMessage, ChatRoom } from "./types";
import { StoryContext, StoryState } from "./story/types";
import { StoryManager } from "./story/storyManager";
import { IASIP_CHARACTERS } from "./story/iasipTemplate";
import { RoomId } from "./story/roomId";

function createMessageTemplate(currentRoom: string, roomTopic: string) {
    return (
        `
# About {{agentName}}:
{{bio}}
{{lore}}
{{knowledge}}

# Story Context:
Scene {{storyState.currentScene + 1}}/4: {{currentSceneDescription}}
Story Progress: {{storyState.progress}}
Your Understanding: {{characterState.understanding}}

# Your Current Role:
Goal: {{characterPrompts.goal}}
Suggested Action: {{characterPrompts.suggestion}}

# Your Relationships:
{{#each characterState.relationships}}
- {{@key}}: {{this}} {{#if this === "ally"}}(work together){{else if this === "rival"}}(oppose them){{/if}}
{{/each}}

Current Room: ${currentRoom}
Room Topic: ${roomTopic}

{{messageDirections}}

Recent conversation history:
{{recentMessages}}

Thread Context:
{{formattedConversation}}

# Task: Generate a response as {{agentName}} that:
1. Advances your character's current goal: {{characterPrompts.currentGoal}}
2. Maintains your character relationships:
{{characterPrompts.relationships}}
3. Stays in character and true to your role
4. Contributes to the current scene
5. Responds naturally to the conversation

Remember:
- Keep responses in character
- Work towards your story goals
- Maintain relationships with other characters
- Stay focused on advancing the scene
` + messageCompletionFooter
    );
}

function createShouldRespondTemplate(currentRoom: string, roomTopic: string) {
    return (
        `
# About {{agentName}}:
{{bio}}
{{knowledge}}

# Story Context:
Scene {{storyState.currentScene + 1}}/4: {{currentSceneDescription}}
Story Progress: {{storyState.progress}}
Your Understanding: {{characterState.understanding}}

# Your Current Role:
Goal: {{characterPrompts.goal}}
Suggested Action: {{characterPrompts.suggestion}}

# Your Relationships:
{{#each characterState.relationships}}
- {{@key}}: {{this}} {{#if this === "ally"}}(work together){{else if this === "rival"}}(oppose them){{/if}}
{{/each}}

Current Room: ${currentRoom}
Room Topic: ${roomTopic}

# Last Message Context:
Sender: {{lastMessage.sender}}
Action: {{lastMessage.action}}
Content: {{lastMessage.content}}

# RESPONSE EXAMPLES
{{user1}}: I just saw a really great movie
{{user2}}: Oh? Which movie?
Result: [IGNORE]

{{agentName}}: Oh, this is my favorite scene
{{user1}}: sick
{{user2}}: wait, why is it your favorite scene
Result: [RESPOND]

{{user1}}: stfu bot
Result: [STOP]

{{user1}}: Hey {{agent}}, can you help me with something
Result: [RESPOND]

{{user1}}: {{agentName}} stfu plz
Result: [STOP]

{{user1}}: i need help
{{agentName}}: how can I help you?
{{user1}}: no. i need help from someone else
Result: [IGNORE]

{{user1}}: Hey {{agent}}, can I ask you a question
{{agentName}}: Sure, what is it
{{user1}}: can you ask claude to create a basic react module that demonstrates a counter
Result: [RESPOND]

{{user1}}: {{agentName}} can you tell me a story
{{user1}}: about a girl named elara
{{agentName}}: Sure.
{{agentName}}: Once upon a time, in a quaint little village, there was a curious girl named Elara.
{{agentName}}: Elara was known for her adventurous spirit and her knack for finding beauty in the mundane.
{{user1}}: I'm loving it, keep going
Result: [RESPOND]

{{user1}}: {{agentName}} stop responding plz
Result: [STOP]

{{user1}}: okay, i want to test something. can you say marco?
{{agentName}}: marco
{{user1}}: great. okay, now do it again
Result: [RESPOND]

Response options are [RESPOND], [IGNORE] and [STOP].

{{agentName}} should:
- RESPOND when:
  * Message is from an ally or rival character
  * Message directly relates to your current goal
  * Message advances the current story beat
  * Message requires your character's expertise/perspective
  * Message creates dramatic or comedic opportunity
  * Message mentions you or your interests

- IGNORE when:
  * Message is not relevant to your character arc
  * Already responded recently without story progression
  * Other characters are handling the current beat
  * Message doesn't advance relationships or plot
  * Scene doesn't require your involvement

- STOP when:
  * Story beat has concluded
  * Character's role in current phase is complete
  * Scene has moved to different characters
  * Asked to stop participating

Recent messages:
{{recentMessages}}

Thread Context:
{{formattedConversation}}

# Task: Choose whether {{agentName}} should respond to the last message.
Consider:
1. Message relevance to your character and goals
2. Opportunity for character development
3. Impact on story progression
4. Relationship dynamics with sender
5. Time since last response

Respond with [RESPOND], [IGNORE], or [STOP] followed by brief reasoning.
` + shouldRespondFooter
    );
}

function createConversationStarterTemplate(
    currentRoom: string,
    roomTopic: string,
) {
    return (
        `
# Room Context:
Room: ${currentRoom}
Topic: ${roomTopic}

# About {{agentName}}:
{{bio}}
{{lore}}
{{knowledge}}

# Story Context:
Current Scene: {{storyState.currentScene}}
Your Current Goal: {{characterPrompts.currentGoal}}

# Task: Generate a conversation starter that:
1. Advances your character's current goal
2. Fits the current story beat
3. Draws from {{agentName}}'s character
4. Encourages story progression
5. Is natural and conversational

Keep it focused on advancing the story while staying in character.
` + messageCompletionFooter
    );
}

export class InteractionClient {
    private client: EchoChamberClient;
    private runtime: IAgentRuntime;
    private lastCheckedTimestamps: Map<string, string> = new Map();
    private lastResponseTimes: Map<string, number> = new Map();
    private messageThreads: Map<string, ChatMessage[]> = new Map();
    private messageHistory: Map<
        string,
        { message: ChatMessage; response: ChatMessage | null }[]
    > = new Map();
    private pollInterval: NodeJS.Timeout | null = null;
    private conversationStarterInterval: NodeJS.Timeout | null = null;
    private isDirector: boolean;
    private storyManager: StoryManager;
    private activeStories: Set<string> = new Set();

    constructor(client: EchoChamberClient, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.isDirector = runtime.character?.role
            ? runtime.character.role === AgentRole.DIRECTOR
            : false;

        elizaLogger.info("[InteractionClient] Initializing:", {
            characterName: runtime.character?.name,
            role: runtime.character?.role,
            isDirector: this.isDirector,
        });

        this.storyManager = new StoryManager(runtime, client, this.isDirector);
    }

    async start() {
        elizaLogger.info("[InteractionClient] Starting", {
            isDirector: this.isDirector,
        });

        if (this.isDirector) {
            elizaLogger.info(
                "[InteractionClient] Starting story initialization as director",
            );
            await this.storyManager.initializeStories();
        } else {
            elizaLogger.info(
                "[InteractionClient] Not a director, skipping story initialization",
            );
        }

        try {
            if (!this.isDirector) {
                elizaLogger.info(
                    "[InteractionClient] Joining cookiedelphia room",
                    {
                        agentName: this.runtime.character?.name,
                        role: this.runtime.character?.role,
                        isDirector: this.isDirector,
                    },
                );
                await this.client.joinRoom("cookiedelphia");
            }
        } catch (error: any) {
            elizaLogger.error(
                "[InteractionClient] Failed to join cookiedelphia room:",
                {
                    error: error?.message || error,
                    stack: error?.stack,
                    details: error?.details || "No additional details",
                    agentName: this.runtime.character?.name,
                    role: this.runtime.character?.role,
                },
            );
        }

        const pollInterval = Number(
            this.runtime.getSetting("ECHOCHAMBERS_POLL_INTERVAL") || 60,
        );

        const conversationStarterInterval = Number(
            this.runtime.getSetting(
                "ECHOCHAMBERS_CONVERSATION_STARTER_INTERVAL",
            ) || 300,
        );

        // Reactive message handling loop
        const handleInteractionsLoop = () => {
            this.handleInteractions();
            this.pollInterval = setTimeout(
                handleInteractionsLoop,
                pollInterval * 1000,
            );
        };

        // Proactive conversation loop
        const conversationStarterLoop = () => {
            this.checkForDeadRooms();
            this.conversationStarterInterval = setTimeout(
                conversationStarterLoop,
                conversationStarterInterval * 1000,
            );
        };

        handleInteractionsLoop();
        conversationStarterLoop();

        elizaLogger.debug(
            "[InteractionClient] Started interaction and conversation loops",
            {
                pollInterval,
                conversationStarterInterval,
            },
        );
    }

    async stop() {
        elizaLogger.debug("[InteractionClient] Stopping client");
        if (this.pollInterval) {
            clearTimeout(this.pollInterval);
            this.pollInterval = null;
            elizaLogger.debug("[InteractionClient] Cleared poll interval");
        }

        if (this.conversationStarterInterval) {
            clearTimeout(this.conversationStarterInterval);
            this.conversationStarterInterval = null;
            elizaLogger.debug(
                "[InteractionClient] Cleared conversation starter interval",
            );
        }
        elizaLogger.info("[InteractionClient] Stopped");
    }

    private async buildMessageThread(
        message: ChatMessage,
        messages: ChatMessage[],
    ): Promise<ChatMessage[]> {
        elizaLogger.debug("[buildMessageThread] Building thread for message:", {
            messageId: message.id,
            roomId: message.roomId,
            totalMessages: messages.length,
        });
        const thread: ChatMessage[] = [];
        const maxThreadLength = Number(
            this.runtime.getSetting("ECHOCHAMBERS_MAX_MESSAGES") || 10,
        );

        // Start with the current message
        thread.push(message);

        // Get recent messages in the same room, ordered by timestamp
        const roomMessages = messages
            .filter((msg) => msg.roomId === message.roomId)
            .sort(
                (a, b) =>
                    new Date(b.timestamp).getTime() -
                    new Date(a.timestamp).getTime(),
            );

        // Add recent messages to provide context
        for (const msg of roomMessages) {
            if (thread.length >= maxThreadLength) break;
            if (msg.id !== message.id) {
                thread.unshift(msg);
            }
        }

        return thread;
    }

    private shouldProcessMessage(
        message: ChatMessage,
        room: { topic: string },
    ): boolean {
        try {
            elizaLogger.debug("[shouldProcessMessage] Evaluating message:", {
                messageId: message.id,
                roomId: message.roomId,
                sender: message?.sender?.username,
            });

            if (this.isDirector) {
                elizaLogger.debug(
                    "[shouldProcessMessage] Skipping - is director",
                );
                return false;
            }

            // Validate message object
            if (
                !message?.sender?.username ||
                !message.content ||
                !message.roomId ||
                !message.id
            ) {
                elizaLogger.debug("Invalid message object:", message);
                return false;
            }

            const modelInfo = this.client.getModelInfo();
            if (!modelInfo?.username) {
                elizaLogger.debug("Invalid model info");
                return false;
            }

            // Don't process own messages
            if (message.sender.username === modelInfo.username) {
                elizaLogger.debug(
                    `Skipping own message from ${modelInfo.username}`,
                );
                return false;
            }

            // Check if we've processed this message before
            const lastChecked =
                this.lastCheckedTimestamps.get(message.roomId) || "0";
            if (!message.timestamp || message.timestamp <= lastChecked) {
                elizaLogger.debug(
                    `Skipping already processed message: ${message.id}`,
                );
                return false;
            }

            // Check rate limiting for responses
            const lastResponseTime =
                this.lastResponseTimes.get(message.roomId) || 0;
            const minTimeBetweenResponses = 60000; // 60 seconds
            const timeSinceLastResponse = Date.now() - lastResponseTime;
            if (timeSinceLastResponse < minTimeBetweenResponses) {
                elizaLogger.debug(
                    `Rate limited: Last response was ${timeSinceLastResponse / 1000}s ago`,
                );
                return false;
            }

            // Validate room topic
            if (!room?.topic) {
                elizaLogger.debug("Invalid room topic");
                return false;
            }

            // More lenient relevance check with null safety
            const isMentioned = message.content
                .toLowerCase()
                .includes(modelInfo.username.toLowerCase());

            // Split topic into keywords and check if any match
            const topicKeywords = (room.topic || "")
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);
            const isRelevantToTopic = topicKeywords.some(
                (keyword) =>
                    keyword.length > 3 &&
                    message.content.toLowerCase().includes(keyword),
            );

            // Add random chance to respond even if not directly relevant
            const randomChance = Math.random() < 50; // 50% chance

            elizaLogger.debug("[shouldProcessMessage] Processing checks:", {
                username: modelInfo.username,
                messageId: message.id,
                isMentioned,
                isRelevantToTopic,
                randomChance,
            });

            const shouldProcess =
                isMentioned || isRelevantToTopic || randomChance;
            elizaLogger.debug(
                `[shouldProcessMessage] ${shouldProcess ? "Will process" : "Skipping"} message ${message.id}`,
            );

            return shouldProcess;
        } catch (error) {
            elizaLogger.error("[shouldProcessMessage] Error:", error);
            return false;
        }
    }

    private async handleInteractions() {
        elizaLogger.debug("[handleInteractions] Starting interaction check");
        try {
            const watchedRooms = this.client.getWatchedRooms();
            const rooms = await this.client.listRooms();

            elizaLogger.debug("[handleInteractions] Processing rooms:", {
                watchedRooms,
                availableRooms: rooms.map((r) => r.id),
            });

            for (const room of rooms) {
                // Only process messages from watched rooms
                if (!watchedRooms.includes(room.id)) {
                    continue;
                }

                const messages = await this.client.getRoomHistory(room.id);
                this.messageThreads.set(room.id, messages);

                // Get only the most recent message that we should process
                const latestMessages = messages
                    .filter((msg) => this.shouldProcessMessage(msg, room))
                    .sort(
                        (a, b) =>
                            new Date(b.timestamp).getTime() -
                            new Date(a.timestamp).getTime(),
                    );

                if (latestMessages.length > 0) {
                    const latestMessage = latestMessages[0];
                    await this.handleMessage(latestMessage, room.topic);

                    // Update history
                    const roomHistory = this.messageHistory.get(room.id) || [];
                    roomHistory.push({
                        message: latestMessage,
                        response: null,
                    });
                    this.messageHistory.set(room.id, roomHistory);

                    // Update last checked timestamp
                    if (
                        latestMessage.timestamp >
                        (this.lastCheckedTimestamps.get(room.id) || "0")
                    ) {
                        this.lastCheckedTimestamps.set(
                            room.id,
                            latestMessage.timestamp,
                        );
                    }
                }
            }

            elizaLogger.log("Finished checking EchoChambers interactions");
        } catch (error) {
            elizaLogger.error("[handleInteractions] Error:", error);
        }
    }

    private async logMessageDetails(message: ChatMessage): Promise<void> {
        elizaLogger.debug("[logMessageDetails] Processing message:", {
            id: message.id,
            room: message.roomId,
            sender: message?.sender?.username,
            content: message.content?.substring(0, 50) + "...", // First 50 chars
        });
    }

    private async setupIds(
        message: ChatMessage,
    ): Promise<{ roomId: RoomId; userId: UUID }> {
        elizaLogger.debug("[setupIds] Converting IDs for message:", {
            messageId: message.id,
            roomId: message.roomId,
            sender: message.sender.username,
        });
        return {
            roomId: RoomId.fromString(message.roomId),
            userId: stringToUuid(message.sender.username),
        };
    }

    private async createMemoryFromMessage(
        message: ChatMessage,
        userId: UUID,
        roomId: RoomId,
        thread: any[],
    ): Promise<Memory> {
        elizaLogger.debug("[createMemoryFromMessage] Creating memory:", {
            messageId: message.id,
            userId,
            roomId,
            threadLength: thread.length,
        });
        return {
            id: stringToUuid(message.id),
            userId,
            agentId: this.runtime.agentId,
            roomId: roomId.forDatabase(),
            content: {
                text: message.content,
                source: "echochambers",
                thread: thread.map((msg) => ({
                    text: msg.content,
                    sender: msg.sender.username,
                    timestamp: msg.timestamp,
                })),
            },
            createdAt: new Date(message.timestamp).getTime(),
            embedding: getEmbeddingZeroVector(),
        };
    }

    private async checkAndSaveMemory(memory: Memory): Promise<boolean> {
        elizaLogger.debug("[checkAndSaveMemory] Checking memory:", {
            memoryId: memory.id,
            roomId: memory.roomId,
        });
        const existing = await this.runtime.messageManager.getMemoryById(
            memory.id,
        );
        if (existing) {
            elizaLogger.debug(
                `[checkAndSaveMemory] Already processed memory ${memory.id}, skipping`,
            );
            return false;
        }
        await this.runtime.messageManager.createMemory(memory);
        elizaLogger.debug("[checkAndSaveMemory] Saved new memory:", memory.id);
        return true;
    }

    private async prepareResponseDecision(
        state: any,
        message: ChatMessage,
        roomTopic: string,
    ): Promise<{ shouldRespond: string; responseContext: any }> {
        elizaLogger.debug("[prepareResponseDecision] Story state in context:", {
            storyState: state.storyState,
            characterPrompts: state.characterPrompts,
        });

        const shouldRespondTemplate =
            this.runtime.character.templates?.shouldRespondTemplate ||
            createShouldRespondTemplate(message.roomId, roomTopic);

        elizaLogger.debug(
            "[prepareResponseDecision] Using shouldRespond template:",
            {
                usingCustom:
                    !!this.runtime.character.templates?.shouldRespondTemplate,
                template: shouldRespondTemplate,
            },
        );

        const shouldRespondContext = composeContext({
            state,
            template: shouldRespondTemplate,
        });

        const response = await generateShouldRespond({
            runtime: this.runtime,
            context: shouldRespondContext,
            modelClass: ModelClass.SMALL,
        });

        // Handle all possible response types
        let decision: "RESPOND" | "IGNORE" | "STOP";

        if (response === null) {
            decision = "IGNORE";
        } else if (typeof response === "string") {
            decision = response;
        } else {
            // We know it's a ShouldRespondResult at this point
            decision = response.decision;
            // Store reasoning if present
            if (response.reasoning) {
                state.evaluationReasoning = response.reasoning;
            }
        }

        if (decision !== "RESPOND") {
            return { shouldRespond: decision, responseContext: null };
        }

        const messageTemplate =
            this.runtime.character.templates?.messageHandlerTemplate ||
            createMessageTemplate(message.roomId, roomTopic);

        const responseContext = composeContext({
            state,
            template: messageTemplate,
        });

        return { shouldRespond: decision, responseContext };
    }

    private async handleResponseCallback(
        message: ChatMessage,
        content: Content,
        roomId: RoomId,
        thread: any[],
    ): Promise<Memory[]> {
        elizaLogger.debug("[handleResponseCallback] Sending response:", {
            messageId: message.id,
            roomId: message.roomId,
            contentLength: content.text.length,
        });
        const sentMessage = await this.client.sendMessage(
            message.roomId,
            content.text,
        );

        this.lastResponseTimes.set(message.roomId, Date.now());

        const roomHistory = this.messageHistory.get(message.roomId) || [];
        const lastEntry = roomHistory[roomHistory.length - 1];
        if (lastEntry && lastEntry.message.id === message.id) {
            lastEntry.response = sentMessage;
        }

        const responseMemory: Memory = {
            id: stringToUuid(sentMessage.id),
            userId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            roomId: roomId.forDatabase(),
            content: {
                text: sentMessage.content,
                source: "echochambers",
                action: content.action,
                thread: thread.map((msg) => ({
                    text: msg.content,
                    sender: msg.sender.username,
                    timestamp: msg.timestamp,
                })),
            },
            createdAt: new Date(sentMessage.timestamp).getTime(),
            embedding: getEmbeddingZeroVector(),
        };

        await this.runtime.messageManager.createMemory(responseMemory);
        return [responseMemory];
    }

    private async handleMessage(message: ChatMessage, roomTopic: string) {
        try {
            await this.logMessageDetails(message);

            // Setup IDs and ensure connection
            const { roomId, userId } = await this.setupIds(message);
            await this.runtime.ensureConnection(
                userId,
                roomId.forDatabase(),
                message.sender.username,
                message.sender.username,
                "echochambers",
            );

            // Build thread and create memory
            const thread = await this.buildMessageThread(
                message,
                this.messageThreads.get(message.roomId) || [],
            );

            const memory = await this.createMemoryFromMessage(
                message,
                userId,
                roomId,
                thread,
            );
            if (!(await this.checkAndSaveMemory(memory))) {
                return;
            }

            // Get or create story state
            const context: StoryContext = {
                roomId: message.roomId,
                topic: roomTopic,
                characters: IASIP_CHARACTERS,
                template: "IASIP",
            };

            const storyState =
                await this.storyManager.getOrCreateStoryState(context);
            if (!storyState) {
                elizaLogger.debug("Waiting for story initialization");
                return;
            }

            // Compose state with story context
            let state = await this.runtime.composeState(memory);
            const characterPrompts = this.storyManager.getCharacterPrompts(
                roomId,
                this.runtime.character.name,
            );

            state = {
                ...state,
                storyState,
                characterPrompts,
            };

            // Prepare and generate response
            const { shouldRespond, responseContext } =
                await this.prepareResponseDecision(state, message, roomTopic);

            if (shouldRespond !== "RESPOND" || !responseContext) {
                elizaLogger.debug(
                    `Not responding to message: ${shouldRespond}`,
                );
                return;
            }

            const response = await generateMessageResponse({
                runtime: this.runtime,
                context: responseContext,
                modelClass: ModelClass.LARGE,
            });

            if (
                !response?.text ||
                (await this.isDuplicateResponse(message.roomId, response.text))
            ) {
                return;
            }

            // Send response and handle story progression
            await this.handleResponseCallback(
                message,
                response,
                roomId,
                thread,
            );
            await this.checkStoryProgression(
                context,
                message.roomId,
                roomTopic,
            );
        } catch (error) {
            elizaLogger.error("[handleMessage] Error:", error);
        }
    }

    private async isDuplicateResponse(
        roomId: string,
        text: string,
    ): Promise<boolean> {
        const recentMessages = await this.client.getRecentMessages(roomId, 5);
        return recentMessages.some(
            (msg) =>
                msg.sender.username === this.runtime.character.name &&
                similarity(msg.content, text) > 0.8,
        );
    }

    private async checkStoryProgression(
        context: StoryContext,
        roomId: string,
        topic: string,
    ) {
        if (!this.isDirector) return;

        const state = await this.storyManager.getStoryState(
            RoomId.fromString(roomId),
        );
        if (!state) {
            elizaLogger.info(`Creating new story for room ${roomId}`);
            await this.storyManager.initializeNewStory(roomId, topic);
            return;
        }

        // Check if current scene should conclude
        const shouldProgress =
            await this.storyManager.shouldProgressScene(context);
        if (shouldProgress) {
            elizaLogger.info(`Progressing story in room ${roomId}`);
            await this.storyManager.progressScene(roomId);
        }
    }

    private async handleStoryProgression(
        context: StoryContext,
        room: ChatRoom,
    ) {
        // Check if scene should progress
        const shouldProgress =
            await this.storyManager.shouldProgressScene(context);
        if (!shouldProgress) return;

        elizaLogger.info("[STORY] Progressing scene in room:", {
            room: room.name,
            roomId: room.id,
        });

        // Progress to next scene
        await this.storyManager.progressScene(room.id);

        // Get updated state to check if story concluded
        const state = await this.storyManager.getStoryState(
            RoomId.fromString(room.id),
        );

        if (!state) {
            elizaLogger.info(`Story concluded in room ${room.id}`);
            this.activeStories.delete(room.id);
            setTimeout(
                () => this.storyManager.initializeNewStory(room.id, room.topic),
                5000,
            );
        }
    }

    private async checkForDeadRooms() {
        elizaLogger.debug("[checkForDeadRooms] Starting dead room check");
        try {
            const watchedRooms = this.client.getWatchedRooms();
            elizaLogger.debug(
                "[checkForDeadRooms] Watched rooms:",
                watchedRooms,
            );

            const rooms = await this.client.listRooms();
            elizaLogger.debug(
                "[checkForDeadRooms] Available rooms:",
                rooms.map((r) => ({ id: r.id, name: r.name })),
            );

            for (const roomId of watchedRooms) {
                try {
                    elizaLogger.debug(`Checking room ${roomId}`);

                    const room = rooms.find((r) => r.id === roomId);
                    if (!room) {
                        elizaLogger.debug(`Room ${roomId} not found, skipping`);
                        continue;
                    }

                    // Log room details
                    elizaLogger.debug("Room details:", {
                        id: room.id,
                        name: room.name,
                        topic: room.topic,
                    });

                    // Random check with logging
                    const randomCheck = Math.random();
                    elizaLogger.debug(
                        `Random check for ${room.name}: ${randomCheck}`,
                    );

                    if (randomCheck > 0.5) {
                        elizaLogger.debug(
                            `Checking conversation state for ${room.name}`,
                        );

                        const shouldInitiate =
                            await this.client.shouldInitiateConversation(room);
                        elizaLogger.debug(
                            `Should initiate conversation in ${room.name}:`,
                            shouldInitiate,
                        );

                        if (shouldInitiate) {
                            elizaLogger.debug(
                                `Starting conversation initiation in ${room.name}`,
                            );
                            await this.initiateConversation(room);
                            elizaLogger.debug(
                                `Completed conversation initiation in ${room.name}`,
                            );
                        }
                    }

                    // Add story progression check
                    const context: StoryContext = {
                        roomId: room.id,
                        topic: room.topic,
                        characters: await this.client.getRoomParticipants(
                            room.id,
                        ),
                        template: "IASIP",
                    };

                    await this.handleStoryProgression(context, room);
                } catch (roomError: any) {
                    // Log individual room errors without stopping the loop
                    elizaLogger.error(`Error processing room ${roomId}:`, {
                        error: roomError?.message || roomError,
                        stack: roomError?.stack,
                    });
                }
            }
        } catch (error: any) {
            elizaLogger.error(
                "Error in checkForDeadRooms:",
                error?.message || error || "Unknown error",
            );
            elizaLogger.debug("Full error details:", {
                error,
                stack: error?.stack,
                type: typeof error,
            });
        }
    }

    private async initiateConversation(room: ChatRoom) {
        try {
            elizaLogger.debug("[initiateConversation] Starting for room:", {
                roomName: room.name,
                roomId: room.id,
                topic: room.topic,
            });
            // Director should not initiate conversations
            if (this.isDirector) {
                return;
            }

            // Initialize story if needed
            const context: StoryContext = {
                roomId: room.id,
                topic: room.topic,
                characters: await this.client.getRoomParticipants(room.id),
                template: "IASIP",
            };

            const storyState =
                await this.storyManager.getOrCreateStoryState(context);
            if (!storyState && !this.isDirector) {
                elizaLogger.debug("Waiting for story initialization");
                return;
            }

            elizaLogger.debug(`Starting initiateConversation for ${room.name}`);

            // Create a dummy memory instead of passing null
            const dummyMemory: Memory = {
                id: stringToUuid("conversation-starter"),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                roomId: RoomId.fromString(room.id).forDatabase(),
                content: {
                    text: "",
                    source: "echochambers",
                    thread: [],
                },
                createdAt: Date.now(),
                embedding: getEmbeddingZeroVector(),
            };

            const state = await this.runtime.composeState(dummyMemory);
            elizaLogger.debug("Composed state for conversation");

            const contextForConversation = composeContext({
                state,
                template: createConversationStarterTemplate(
                    room.name,
                    room.topic,
                ),
            });
            elizaLogger.debug(
                "Created conversation context: ",
                contextForConversation,
            );

            const content = await generateMessageResponse({
                runtime: this.runtime,
                context: contextForConversation,
                modelClass: ModelClass.SMALL,
            });
            elizaLogger.debug("Generated response content:", {
                hasContent: !!content,
                textLength: content?.text?.length,
            });

            if (content?.text) {
                elizaLogger.debug(`Sending message to ${room.name}`);
                await this.client.sendMessage(room.id, content.text);
                elizaLogger.info(
                    `Started conversation in ${room.name} (Topic: ${room.topic})`,
                );
            }
        } catch (error: any) {
            elizaLogger.error("[initiateConversation] Error:", {
                error: error?.message || error,
                stack: error?.stack,
            });
            throw error;
        }
    }
}

// Helper function to calculate text similarity
function similarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\W+/);
    const words2 = str2.toLowerCase().split(/\W+/);
    const intersection = words1.filter((w) => words2.includes(w));
    return intersection.length / Math.max(words1.length, words2.length);
}

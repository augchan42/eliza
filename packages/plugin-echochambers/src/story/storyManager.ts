import { elizaLogger } from "@elizaos/core";
import {
    StoryState,
    StoryDirective,
    StoryPlot,
    Scene,
    Progress,
    StoryContext,
    StoryAction,
    Understanding,
    Relationship,
    TOTAL_SCENES,
} from "./types";
import { StoryBuilder } from "./storyBuilder";
import { IAgentRuntime } from "@elizaos/core";
import { EchoChamberClient } from "../echoChamberClient";
import { IASIP_CHARACTERS } from "./iasipTemplate";
import { generateText } from "@elizaos/core";
import { parseJSONObjectFromText } from "@elizaos/core";
import { ModelClass } from "@elizaos/core";
import { STORY_PROGRESSION_TEMPLATE } from "./iasipTemplate";
import { RoomId } from "./roomId";
import { ChatMessage } from "../types";
import { StoryScene } from "./types";

export class StoryManager {
    // Make these static to persist across instance recreations
    private static storyPlots: Map<string, StoryPlot> = new Map();
    private static storyStates: Map<string, StoryState> = new Map();
    private static lastStateFetch: Map<string, number> = new Map();

    private storyBuilder: StoryBuilder;
    private activeStories: Set<string> = new Set();

    constructor(
        private runtime: IAgentRuntime,
        private client: EchoChamberClient,
        private isDirector: boolean,
    ) {
        this.storyBuilder = new StoryBuilder(runtime);
    }

    public async createStory(
        context: StoryContext,
    ): Promise<StoryState | null> {
        elizaLogger.debug("[STORY] Creating new story:", {
            roomId: context.roomId,
            topic: context.topic,
        });

        try {
            // Initialize story using StoryBuilder's method
            const { plot, state } = await this.storyBuilder.initializeStory(
                context.roomId,
                context.topic,
            );

            if (!plot || !state) {
                elizaLogger.error("[STORY] Failed to initialize story");
                return null;
            }

            // Cache both plot and state
            StoryManager.storyPlots.set(context.roomId, plot);
            StoryManager.storyStates.set(context.roomId, state);

            // Save to server using correct client methods
            const savedPlot = await this.client.createStoryPlot(
                context.roomId,
                plot,
            );
            await this.client.createStoryState(context.roomId, state);

            elizaLogger.debug(
                "[STORY] Successfully created and cached story:",
                {
                    roomId: context.roomId,
                    plotId: savedPlot.id,
                    scene: state.currentScene,
                    progress: state.progress,
                },
            );

            return state;
        } catch (error) {
            elizaLogger.error("[STORY] Error creating story:", error);
            return null;
        }
    }

    async getStoryState(roomId: RoomId): Promise<StoryState | null> {
        const cacheKey = roomId.forStory();
        const now = Date.now();
        const lastFetch = StoryManager.lastStateFetch.get(cacheKey) || 0;

        // Only fetch if more than 5 seconds have passed
        if (now - lastFetch > 5000) {
            try {
                const serverState = await this.client.getStoryState(cacheKey);
                if (serverState) {
                    StoryManager.storyStates.set(cacheKey, serverState);
                    StoryManager.lastStateFetch.set(cacheKey, now);
                    return serverState;
                }
            } catch (error) {
                elizaLogger.error("[STORY] Failed to fetch state:", error);
            }
        }

        return StoryManager.storyStates.get(cacheKey) || null;
    }

    public async getStoryPlot(roomId: string): Promise<StoryPlot | null> {
        // Check cache first
        const cachedPlot = StoryManager.storyPlots.get(roomId);
        if (cachedPlot) {
            elizaLogger.debug("[STORY] Found plot in cache:", {
                roomId,
                plotId: cachedPlot.id,
            });
            return cachedPlot;
        }

        elizaLogger.debug("[STORY] Plot not in cache, fetching from server:", {
            roomId,
        });

        try {
            const plot = await this.client.getStoryPlot(roomId);
            if (plot) {
                // Cache the plot after fetching
                StoryManager.storyPlots.set(roomId, plot);
                elizaLogger.debug("[STORY] Cached plot from server:", {
                    roomId,
                    plotId: plot.id,
                });
            }
            return plot;
        } catch (error) {
            elizaLogger.error("[STORY] Error fetching plot:", {
                roomId,
                error,
            });
            return null;
        }
    }

    async getOrCreateStoryState(
        context: StoryContext,
    ): Promise<StoryState | null> {
        elizaLogger.debug("[STORY] Getting or creating story state:", {
            roomId: context.roomId,
            // topic: context.topic,
            isDirector: this.isDirector,
        });

        // Use getStoryState instead of direct cache access
        const existingState = await this.getStoryState(
            RoomId.fromString(context.roomId),
        );

        if (existingState) {
            elizaLogger.debug("[STORY] Found existing state:", {
                roomId: context.roomId,
                scene: existingState.currentScene,
            });
            return existingState;
        }

        if (!this.isDirector) {
            elizaLogger.debug(
                "[STORY] Waiting for director to initialize story",
                {
                    roomId: context.roomId,
                    character: this.runtime.character.name,
                },
            );
            return null;
        }

        elizaLogger.debug("[STORY] Creating new story as director:", {
            roomId: context.roomId,
            character: this.runtime.character.name,
        });

        return await this.createStory(context);
    }

    async evaluateStoryProgression(
        context: StoryContext,
    ): Promise<StoryDirective | null> {
        const state = await this.getOrCreateStoryState(context);
        const plot = await this.getStoryPlot(context.roomId);

        if (!state || !plot) {
            elizaLogger.debug(
                "[STORY] Missing state or plot, cannot evaluate progression",
            );
            return null;
        }

        elizaLogger.debug("[STORY] Evaluating progression:", {
            currentScene: state.currentScene,
            progress: state.progress,
        });

        // Check if we should progress
        const shouldProgress = await this.shouldProgressScene(context);
        elizaLogger.debug("[STORY] Progress check result:", { shouldProgress });

        const action = shouldProgress
            ? StoryAction.ADVANCE
            : StoryAction.CONTINUE;
        const nextScene =
            shouldProgress && state.currentScene < Scene.ENDING
                ? state.currentScene + 1
                : undefined;

        return {
            action,
            guidance: {
                nextScene,
                characterPrompts: this.generateCharacterPrompts(state, plot),
            },
        };
    }

    private generateCharacterPrompts(state: StoryState, plot: StoryPlot) {
        const currentScene = plot.scenes[state.currentScene];
        if (!currentScene) return {};

        const prompts: Record<string, { goal: string; suggestion: string }> =
            {};

        for (const [character, charState] of Object.entries(
            state.characterStates,
        )) {
            prompts[character] = {
                goal: currentScene.characterGoals[character],
                suggestion: this.generateSuggestion(
                    character,
                    charState,
                    currentScene,
                ),
            };
        }

        return prompts;
    }

    private generateSuggestion(
        character: string,
        charState: StoryState["characterStates"][string],
        currentScene: StoryScene,
    ): string {
        const basePrompt = `Try to ${currentScene.characterGoals[character]}`;
        const relationshipHint = Object.entries(charState.relationships)
            .filter(([other, rel]) => rel !== "neutral")
            .map(
                ([other, rel]) =>
                    `${rel === "ally" ? "Work with" : "Oppose"} ${other}`,
            )
            .join(". ");

        return `${basePrompt}. ${relationshipHint}`;
    }

    async getCharacterPrompts(
        roomId: RoomId,
        characterName: string,
    ): Promise<{ goal: string; suggestion: string } | null> {
        // Always use string version for story operations
        const state = await this.getStoryState(roomId);
        const plot = await this.getStoryPlot(roomId.forStory());

        if (!state || !plot) return null;

        const currentScene = plot.scenes[state.currentScene];
        if (!currentScene) return null;

        const charState = state.characterStates[characterName];
        if (!charState) return null;

        return {
            goal: currentScene.characterGoals[characterName],
            suggestion: this.generateSuggestion(
                characterName,
                charState,
                currentScene,
            ),
        };
    }

    public async initializeStories() {
        try {
            elizaLogger.info(
                "[STORY] Director initializing stories for all rooms",
            );
            const rooms = await this.client.listRooms();
            elizaLogger.debug("[STORY] Found rooms:", rooms);

            for (const room of rooms) {
                elizaLogger.debug(`[STORY] Processing room:`, {
                    id: room.id,
                    name: room.name,
                    topic: room.topic,
                });

                if (room.id === "cookiedelphia") {
                    try {
                        // Try to get or create story state using existing method
                        const context: StoryContext = {
                            roomId: room.id,
                            topic: room.topic,
                            characters: IASIP_CHARACTERS,
                            template: "IASIP",
                        };

                        const state = await this.getOrCreateStoryState(context);

                        if (state) {
                            this.activeStories.add(room.id);
                            elizaLogger.info(
                                `[STORY] Story initialized for room ${room.id}`,
                                {
                                    scene: state.currentScene,
                                    progress: state.progress,
                                },
                            );
                        } else {
                            elizaLogger.error(
                                `[STORY] Failed to initialize story for room ${room.id}`,
                            );
                        }
                    } catch (roomError: any) {
                        elizaLogger.error(
                            `[STORY] Error processing room ${room.id}:`,
                            {
                                error: roomError?.message || roomError,
                                stack: roomError?.stack,
                                room: {
                                    id: room.id,
                                    name: room.name,
                                    topic: room.topic,
                                },
                            },
                        );
                    }
                } else {
                    elizaLogger.debug(
                        `[STORY] Skipping non-cookiedelphia room: ${room.id}`,
                    );
                }
            }
        } catch (error: any) {
            elizaLogger.error("[STORY] Error in initializeStories:", {
                error: error?.message || error,
                stack: error?.stack,
            });
            throw error;
        }
    }

    public async initializeNewStory(roomId: string, topic: string) {
        if (this.isDirector && !this.activeStories.has(roomId)) {
            elizaLogger.info("[STORY] Initializing new story for room", {
                roomId,
                topic,
            });

            const context: StoryContext = {
                roomId,
                topic,
                characters: await this.client.getRoomParticipants(roomId),
                template: "IASIP",
            };

            const state = await this.getOrCreateStoryState(context);
            if (state) {
                this.activeStories.add(roomId);
                elizaLogger.info("[STORY] New story initialized", {
                    roomId,
                    scene: state.currentScene,
                    progress: state.progress,
                });
            }
        }
    }

    async shouldProgressScene(context: StoryContext): Promise<boolean> {
        const state = await this.getStoryState(
            RoomId.fromString(context.roomId),
        );
        if (!state) {
            elizaLogger.debug("[STORY] No state found for progression check");
            return false;
        }

        // Get recent messages to check for scene completion
        const recentMessages = await this.client.getRecentMessages(
            context.roomId,
            10,
        );
        elizaLogger.debug("[STORY] Checking recent messages for progression:", {
            messageCount: recentMessages.length,
            messages: recentMessages.map((m) => ({
                content: m.content.substring(0, 50),
                sender: m.sender,
            })),
        });

        const plot = await this.getStoryPlot(context.roomId);
        if (!plot || state.currentScene >= Object.keys(plot.scenes).length) {
            elizaLogger.debug(
                "[STORY] Invalid plot or scene state for progression",
            );
            return false;
        }

        const currentScene = plot.scenes[state.currentScene];
        elizaLogger.debug("[STORY] Current scene details:", {
            sceneIndex: state.currentScene,
            description: currentScene.description,
            completionCriteria: currentScene.completionCriteria,
        });

        const completionMet = this.checkCompletionCriteria(
            currentScene.completionCriteria,
            recentMessages,
        );
        elizaLogger.debug("[STORY] Scene completion check:", { completionMet });

        if (completionMet) {
            // Update state to ready for advancement
            const updatedState: StoryState = {
                ...state,
                progress: Progress.READY_TO_ADVANCE,
            };
            await this.saveStoryState(
                RoomId.fromString(context.roomId),
                updatedState,
            );
            elizaLogger.info("[STORY] Scene ready for advancement");
        }

        return completionMet;
    }

    private checkCompletionCriteria(
        criteria: string,
        messages: ChatMessage[],
    ): boolean {
        const keywords = criteria.toLowerCase().split(/\W+/).filter(Boolean);
        const messageText = messages
            .map((m) => m.content.toLowerCase())
            .join(" ");

        elizaLogger.debug("[STORY] Checking completion criteria:", {
            keywords,
            messageTextPreview: messageText.substring(0, 100),
            keywordMatches: keywords.map((k) => ({
                keyword: k,
                found: messageText.includes(k),
            })),
        });

        return keywords.every((keyword) => messageText.includes(keyword));
    }

    async progressScene(roomId: string): Promise<void> {
        const state = await this.getStoryState(RoomId.fromString(roomId));
        if (!state) return;

        const plot = await this.getStoryPlot(roomId);
        if (!plot) return;

        // Move to next scene
        const nextScene = state.currentScene + 1;

        // Check if story should conclude
        if (nextScene >= Object.keys(plot.scenes).length) {
            await this.concludeStory(roomId);
            return;
        }

        // Update scene and character states
        const updatedState: StoryState = {
            ...state,
            currentScene: nextScene,
            characterStates: this.updateCharacterStates(
                plot,
                state.characterStates,
                nextScene,
            ),
        };

        await this.saveStoryState(RoomId.fromString(roomId), updatedState);

        // Announce scene transition
        await this.client.sendMessage(
            roomId,
            `[Scene ${nextScene + 1}] ${plot.scenes[nextScene].description}`,
        );
    }

    private updateCharacterStates(
        plot: StoryPlot,
        currentStates: Record<string, any>,
        newScene: number,
    ): Record<string, any> {
        const updatedStates = { ...currentStates };

        // Update each character's goals for the new scene
        for (const [character, state] of Object.entries(updatedStates)) {
            if (plot.scenes[newScene].characterGoals[character]) {
                updatedStates[character] = {
                    ...state,
                    currentGoal:
                        plot.scenes[newScene].characterGoals[character],
                    lastActive: new Date().toISOString(),
                };
            }
        }

        return updatedStates;
    }

    private async concludeStory(roomId: string): Promise<void> {
        try {
            const state = await this.getStoryState(RoomId.fromString(roomId));
            if (!state) return;

            const concludedState: StoryState = {
                ...state,
                progress: Progress.CONCLUDED,
            };

            await this.saveStoryState(
                RoomId.fromString(roomId),
                concludedState,
            );
            this.activeStories.delete(roomId);

            elizaLogger.info("[STORY] Story concluded:", {
                roomId,
                finalScene: state.currentScene,
            });

            // Announce conclusion
            await this.client.sendMessage(
                roomId,
                "🎬 The End - Another classic episode concludes!",
            );
        } catch (error) {
            elizaLogger.error("[STORY] Error concluding story:", error);
            throw error;
        }
    }

    private async saveStoryState(
        roomId: RoomId,
        state: StoryState,
    ): Promise<void> {
        try {
            // Update cache
            StoryManager.storyStates.set(roomId.forStory(), state);

            // Save to server
            await this.client.updateStoryState(roomId.forStory(), state);

            elizaLogger.debug("[STORY] Successfully saved state:", {
                roomId: roomId.forStory(),
                scene: state.currentScene,
                progress: state.progress,
            });
        } catch (error) {
            elizaLogger.error("[STORY] Error saving state:", error);
            throw error;
        }
    }
}

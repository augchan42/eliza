import {
    StoryPlot,
    StoryState,
    Progress,
    Understanding,
    Relationship,
    StoryTemplate,
    Scene,
    StoryScene,
} from "./types";
import { IAgentRuntime } from "@elizaos/core";
import {
    ModelClass,
    elizaLogger,
    generateText,
    parseJSONObjectFromText,
} from "@elizaos/core";

export const messageCompletionFooter = `\nResponse format should be formatted in a JSON block like this:
\`\`\`json
{ "user": "{{agentName}}", "text": "string", "action": "string" }
\`\`\``;

const PREMISE_TEMPLATE =
    `
#TOPIC
{{topic}}

Create a funny "It's Always Sunny" episode premise about the above topic.
The gang should misunderstand and chaos should ensue.

Format as JSON:
{
    "title": "string",  // Funny episode title
    "premise": "string",  // 1-2 sentence setup
    "mainConflict": "string"  // What goes wrong
}
` + messageCompletionFooter;

const CHARACTER_GOALS_TEMPLATE =
    `
Topic: {{topic}}
Premise: {{premise}}
Conflict: {{mainConflict}}

Define how each character misunderstands and reacts to the situation.

Format as JSON:
{
    "dennis": {
        "role": "string",
        "initialGoal": "string",
        "misunderstanding": "string"
    },
    "mac": { /* same structure */ },
    "charlie": { /* same structure */ },
    "frank": { /* same structure */ }
}
` + messageCompletionFooter;

const RELATIONSHIP_TEMPLATE =
    `
Given these character goals:
{{characterGoals}}

Define their relationships and alliances for this scheme.

Format as JSON:
{
    "dennis": {
        "mac": "ally|rival|neutral",
        "charlie": "ally|rival|neutral",
        "frank": "ally|rival|neutral"
    },
    // Repeat for other characters
}
` + messageCompletionFooter;

const SCENE_SEQUENCE_TEMPLATE =
    `
Premise: {{premise}}
Character Goals: {{characterGoals}}
Relationships: {{relationships}}

Create 4 scenes showing how this scheme falls apart:
1. OPENING: Initial discovery/misunderstanding
2. BUILD_UP: Getting invested in the scheme
3. PROBLEM: Things start going wrong
4. ENDING: Everything falls apart

Format as JSON:
{
    "scenes": {
        "0": {
            "description": "string",  // Detailed description of what happens
            "completionCriteria": "string",  // When to move to next scene
            "characterGoals": {
                "dennis": "string",
                "mac": "string",
                "charlie": "string",
                "frank": "string"
            }
        },
        "1": {
            // Same structure as above"
        },
        "2": {
            // Same structure
        },
        "3": {
            // Same structure
        }
    }
}
` + messageCompletionFooter;

// const OUTCOMES_TEMPLATE =
//     `
// Based on how events unfold:
// {{sceneSequence}}

// Predict likely outcomes for each character.

// Format as JSON:
// {
//     "outcomes": [
//         {
//             "character": "string",
//             "outcome": "string",
//             "arc": "${CharacterArc.POSITIVE}|${CharacterArc.NEGATIVE}|${CharacterArc.FLAT}",
//             "engagement": "${CharacterEngagement.ACTIVE}|${CharacterEngagement.PASSIVE}|${CharacterEngagement.ABSENT}"
//         }
//         // One for each character
//     ]
// }
// ` + messageCompletionFooter;

export class StoryBuilder {
    constructor(private runtime: IAgentRuntime) {}

    async buildFullPlot(roomId: string, topic: string): Promise<StoryPlot> {
        elizaLogger.debug("Starting buildFullPlot:", { roomId, topic });

        try {
            // Clean up topic
            const cleanTopic = topic
                .split("\n")[0]
                .replace(/<[^>]*>/g, "")
                .replace(/\([^)]*\)/g, "")
                .trim();

            // Step 1: Get basic premise
            const premise = await this.generateWithTemplate(PREMISE_TEMPLATE, {
                topic: cleanTopic,
            });

            // Step 2: Get character goals
            const characterGoals = await this.generateWithTemplate(
                CHARACTER_GOALS_TEMPLATE,
                {
                    topic,
                    premise: premise.premise,
                    mainConflict: premise.mainConflict,
                },
            );

            // Step 3: Determine relationships
            const relationships = await this.generateWithTemplate(
                RELATIONSHIP_TEMPLATE,
                {
                    characterGoals: JSON.stringify(characterGoals),
                },
            );

            // Step 4: Create scene sequence
            const scenes = await this.generateWithTemplate(
                SCENE_SEQUENCE_TEMPLATE,
                {
                    premise: premise.premise,
                    characterGoals: JSON.stringify(characterGoals),
                    relationships: JSON.stringify(relationships),
                },
            );

            // Step 5: Combine everything into final plot structure
            const plot = this.assemblePlot(
                roomId,
                premise,
                characterGoals,
                relationships,
                scenes,
            );

            return plot;
        } catch (error) {
            elizaLogger.error("Error in buildFullPlot:", error);
            throw error;
        }
    }

    private async generateWithTemplate(template: string, context: any) {
        try {
            elizaLogger.debug("Generating with template:", {
                templateName:
                    template === PREMISE_TEMPLATE
                        ? "PREMISE"
                        : template === CHARACTER_GOALS_TEMPLATE
                          ? "CHARACTER_GOALS"
                          : template === RELATIONSHIP_TEMPLATE
                            ? "RELATIONSHIPS"
                            : template === SCENE_SEQUENCE_TEMPLATE
                              ? "SCENE_SEQUENCE"
                              : "UNKNOWN",
                context: JSON.stringify(context, null, 2),
            });

            const prompt = template.replace(
                /{{(\w+)}}/g,
                (_, key) => context[key] || "",
            );

            const response = await generateText({
                runtime: this.runtime,
                context: prompt,
                modelClass: ModelClass.LARGE,
            });

            const parsedResponse = parseJSONObjectFromText(response);
            if (!parsedResponse) {
                throw new Error("Failed to parse JSON response");
            }

            return parsedResponse;
        } catch (error) {
            elizaLogger.error("Template generation error:", error);
            throw error;
        }
    }

    private assemblePlot(
        roomId: string,
        premise: any,
        characterGoals: any,
        relationships: any,
        scenes: any,
    ): StoryPlot {
        try {
            const plot: StoryPlot = {
                id: crypto.randomUUID(),
                roomId,
                title: premise.title,
                premise: premise.premise,
                characterArcs: this.buildCharacterArcs(
                    characterGoals,
                    relationships,
                ),
                scenes: Object.entries(scenes.scenes).reduce(
                    (acc, [sceneIndex, s]: [string, any]) => ({
                        ...acc,
                        [sceneIndex]: {
                            description: s.description,
                            completionCriteria: s.completionCriteria,
                            characterGoals: s.characterGoals,
                            phase: s.phase,
                            beatKey: s.beatKey,
                            tensionLevel: s.tensionLevel,
                        },
                    }),
                    {} as Record<Scene, StoryScene>,
                ),
                expectedOutcomes: Object.entries(characterGoals).map(
                    ([char, goals]: [string, any]) => ({
                        character: char,
                        outcome: "Fails miserably, as always", // It's Always Sunny!
                    }),
                ),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            return plot;
        } catch (error) {
            elizaLogger.error("Error in assemblePlot:", error);
            throw error;
        }
    }

    private buildCharacterArcs(goals: any, relationships: any) {
        const characters = ["dennis", "mac", "charlie", "frank"]; //TODO: PARAMETERIZE
        const arcs: Record<
            string,
            {
                role: string;
                goals: string[];
                relationships: Record<string, Relationship>;
            }
        > = {};

        for (const char of characters) {
            arcs[char] = {
                role: goals[char].role,
                goals: [goals[char].initialGoal],
                relationships: relationships[char],
            };
        }

        return arcs;
    }

    async createInitialState(plot: StoryPlot): Promise<StoryState> {
        const initialState: StoryState = {
            currentScene: 0, // Start with opening scene
            progress: Progress.ONGOING,
            characterStates: {},
            coveredPoints: [],
            template: StoryTemplate.IASIP,
        };

        // Initialize character states
        for (const [character, arc] of Object.entries(plot.characterArcs)) {
            initialState.characterStates[character] = {
                lastActive: new Date().toISOString(),
                currentGoal: arc.goals[0],
                understanding: Understanding.OBLIVIOUS,
                relationships: arc.relationships,
            };
        }

        return initialState;
    }

    async initializeStory(
        roomId: string,
        topic: string,
    ): Promise<{
        plot: StoryPlot;
        state: StoryState;
    }> {
        try {
            const plot = await this.buildFullPlot(roomId, topic);
            const state = await this.createInitialState(plot);

            elizaLogger.debug("Initialized new story:", {
                roomId,
                topic,
                plot,
                state,
            });

            return { plot, state };
        } catch (error) {
            elizaLogger.error("Error initializing story:", error);
            throw error;
        }
    }
}

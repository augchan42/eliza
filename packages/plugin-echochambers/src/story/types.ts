// Standardize all state enums
export enum StoryPhase {
    SETUP = "setup",
    ESCALATION = "escalation",
    CRISIS = "crisis",
    RESOLUTION = "resolution",
}

export enum StoryProgress {
    BEGINNING = "beginning",
    MIDDLE = "middle",
    NEAR_COMPLETION = "near_completion",
}

// Add generic beat keys that work for any topic
export enum StoryBeatKey {
    DISCOVERY = "discovery", // Group discovers opportunity/problem
    COMMITMENT = "commitment", // Group commits to plan/idea
    COMPLICATION = "complication", // Plan starts having issues
    CLIMAX = "climax", // Everything comes to a head
}

export enum TensionLevel {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    PEAK = "peak",
}

export enum CharacterUnderstanding {
    OBLIVIOUS = "oblivious",
    PARTIALLY_AWARE = "partially_aware",
    FULLY_AWARE = "fully_aware",
}

export enum CharacterEngagement {
    ACTIVE = "active",
    PASSIVE = "passive",
    ABSENT = "absent",
}

export enum CharacterContribution {
    HELPING = "helping",
    HINDERING = "hindering",
    NEUTRAL = "neutral",
}

export enum CharacterArc {
    POSITIVE = "positive",
    NEGATIVE = "negative",
    FLAT = "flat",
}

export enum StoryAction {
    CONTINUE = "continue",
    ADVANCE = "advance",
    CONCLUDE = "conclude",
}

// In both StoryPlot and StoryState interfaces, use:
export type Relationship = "ally" | "rival" | "neutral";

// Simplify StoryState to remove numerical tracking
export interface StoryState {
    currentScene: Scene;
    progress: Progress;
    characterStates: Record<
        string,
        {
            lastActive: string;
            currentGoal: string;
            understanding: Understanding;
            relationships: Record<string, Relationship>;
        }
    >;
    coveredPoints: string[];
}

// Simplify directive structure
export interface StoryDirective {
    action: StoryAction;
    guidance?: {
        nextScene?: Scene;
        characterPrompts?: Record<
            string,
            {
                goal: string;
                suggestion: string;
            }
        >;
    };
}

// Remove PHASE_DURATIONS - let narrative flow naturally

// Add type for Director's evaluation
export interface SceneEvaluation {
    phase: StoryPhase;
    progress: "flowing" | "stalled" | "needs_direction";
    characterStatus: Record<
        string,
        {
            engagement: CharacterEngagement;
            contribution: CharacterContribution;
        }
    >;
    suggestedAction?: StoryDirective;
}

export interface StoryPlot {
    id: string;
    roomId: string;
    title: string;
    premise: string;
    characterArcs: Record<
        string,
        {
            role: string;
            goals: string[];
            relationships: Record<string, Relationship>;
        }
    >;
    scenes: Array<{
        description: string;
        completionCriteria: string;
        characterGoals: Record<string, string>;
    }>;
    expectedOutcomes: Array<{
        character: string;
        outcome: string;
    }>;
    createdAt: string;
    updatedAt: string;
}

export type StoryTemplate = "IASIP" | "SILICON_VALLEY" | "OFFICE";

export interface StoryContext {
    roomId: string;
    topic: string;
    characters: string[];
    template: "IASIP" | "SILICON_VALLEY" | "OFFICE";
}

export const TOTAL_SCENES = 4;

// Core story structure
export enum Scene {
    OPENING = 0, // Introduce situation/opportunity
    BUILD_UP = 1, // Get invested/committed
    PROBLEM = 2, // Things go wrong
    ENDING = 3, // Everything falls apart
}

// Simple progress tracking
export enum Progress {
    ONGOING = "ongoing",
    READY_TO_ADVANCE = "ready_to_advance",
}

// Character states
export enum Understanding {
    OBLIVIOUS = "oblivious",
    AWARE = "aware",
    FULLY_AWARE = "fully_aware",
}

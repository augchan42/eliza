export const IASIP_CHARACTERS = ["dennis", "mac", "charlie", "frank"];

// Basic setup template - can work with smaller models
export const BASIC_SETUP_TEMPLATE = `
# Room Context
Room: {{roomId}}
Topic: {{topic}}

# Task: Create a simple IASIP-style crypto episode premise

Create a short premise for an "It's Always Sunny" episode where the gang gets involved with {{topic}}.
Keep it simple and funny. Format as JSON:

{
    "title": "string",
    "premise": "string",
    "initialBeats": ["string", "string"]
}

Remember: Keep it chaotic but focused on {{topic}}.
`;

// Can expand the plot with additional calls if needed
export const CHARACTER_SETUP_TEMPLATE = `
# Context
Title: {{title}}
Premise: {{premise}}

# Task: Define initial character goals for this episode

For each character, provide their initial goal and relationship to others.
Format as JSON for ONE character:

{
    "character": "name",
    "role": "string",
    "initialGoal": "string",
    "relationships": {
        "otherCharacter": "ally|rival|neutral"
    }
}
`;

export const IASIP_STORY_TEMPLATE = `
# Room Context
Room: {{roomId}}
Topic: {{topic}}

# Task: Initialize an "It's Always Sunny in Philadelphia"-style crypto discussion

You are directing an episode of "It's Always Crypto in Philadelphia". Set up a scene where the gang discusses {{topic}} in their signature chaotic style while maintaining some semblance of technical accuracy.

Character Dynamics to Consider:
- Dennis: Narcissistic crypto trader who thinks he's a master of market psychology
- Frank: Old-school investor who's suspiciously knowledgeable about questionable crypto schemes
- Mac: Over-enthusiastic crypto bro who misunderstands most concepts but acts like an expert
- Charlie: Wildcard who somehow stumbles into brilliant crypto insights through complete misunderstanding

Scene Framework Requirements:

1. Initial Phase Selection:
   - Must match IASIP episode structure
   - Set up for maximum chaos while maintaining topic focus
   - Enable characteristic scheme escalation

2. Topic Focus Definition:
   - Core crypto/tech concept
   - Potential for misunderstandings and schemes
   - Opportunities for character-specific delusions
   - Must lead to hilarious technical confusion

3. Key Discussion Points:
   - 3-5 plot points that escalate naturally
   - Technical concepts each character will misinterpret
   - Opportunities for alliances and betrayals
   - Inevitable technical disaster setup

4. Character-Specific Elements:
   - Dennis's manipulation angle
   - Frank's shady past experiences
   - Mac's misguided technical explanations
   - Charlie's wild card element

5. Scene Parameters:
   - Duration: 5 minutes (before scheme inevitably fails)
   - Chaos progression guidelines
   - Technical accuracy amid mayhem
   - Topic containment (before complete derailment)

Format the response as JSON:
{
    "currentPhase": "string",
    "topicFocus": "string",
    "keyPoints": ["string"],
    "characterDynamics": {
        "dennis": { "angle": "string", "delusion": "string" },
        "frank": { "scheme": "string", "pastExperience": "string" },
        "mac": { "misunderstanding": "string", "expertise": "string" },
        "charlie": { "wildcard": "string", "accidentalInsight": "string" }
    },
    "estimatedDuration": number,
    "phaseTriggers": ["string"],
    "schemeEscalation": ["string"],
    "inevitableOutcome": "string"
}

Remember:
- Maintain IASIP chaotic energy while keeping crypto focus
- Each character must stay true to their established patterns
- Technical concepts should be actual crypto/tech topics
- Scene should escalate naturally to chaos
- The scheme must technically make sense while being completely absurd
`;

export const STORY_PROGRESSION_TEMPLATE = `
System: You are a TV show director analyzing the current state of an "It's Always Sunny in Philadelphia" episode.

Current Story State:
Phase: {{currentPhase}}
Progress: {{progress}}
Tension Level: {{tension}}
Current Beat: {{currentBeat}}
Completed Beats: {{completedBeats}}
Topic: {{topic}}
Covered Points: {{coveredPoints}}

Character States:
{{characterStates}}

Story Plot Details:
Title: {{title}}
Premise: {{premise}}
Key Points: {{keyPoints}}

Scene Sequence:
{{sceneSequence}}

Character Arcs:
{{characterArcs}}

Expected Outcomes:
{{expectedOutcomes}}

Analyze the current state and determine the next action. Consider:
1. Story phase progression (setup → escalation → crisis → resolution)
2. Current tension level vs expected tension
3. Character engagement and relationship dynamics
4. Progress through planned beats
5. Coverage of key story points

Respond with JSON in this format:
{
    "evaluation": {
        "phase": "setup" | "escalation" | "crisis" | "resolution",
        "progress": "flowing" | "stalled" | "needs_direction",
        "characterStatus": {
            [characterName: string]: {
                "engagement": "active" | "passive" | "absent",
                "contribution": "helping" | "hindering" | "neutral"
            }
        }
    },
    "suggestedAction": {
        "action": "continue" | "progress_phase" | "redirect" | "conclude",
        "guidance": {
            "phase": "setup" | "escalation" | "crisis" | "resolution",
            "beat": "string",
            "characterPrompts": {
                [characterName: string]: {
                    "goal": "string",
                    "suggestion": "string"
                }
            }
        }
    },
    "reasoning": "Explanation of the evaluation and suggested action"
}
`;

export const createDirectorTemplate = (
    currentRoom: string,
    roomTopic: string,
) => `
# Director Instructions:
Current Room: ${currentRoom}
Room Topic: ${roomTopic}

Story State:
{{storyState}}

Character Participation:
{{characterParticipation}}

Recent conversation:
{{recentMessages}}

# Task: Evaluate and guide the story progression:
1. Monitor character participation
2. Ensure topic relevance
3. Guide narrative progression
4. Maintain scene pacing
5. Initiate phase transitions when appropriate

Remember to:
- Keep interventions minimal
- Guide naturally without breaking immersion
- Encourage character interaction
- Maintain focus on the main topic
`;

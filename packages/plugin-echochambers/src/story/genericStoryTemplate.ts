const STORY_INIT_TEMPLATE = `
# Room Context
Room: {{roomId}}
Topic: {{topic}}

# Task: Initialize a sitcom-style story framework for a crypto/tech discussion

You are the director setting up a scene. Create an engaging framework that:
- Maintains topic relevance while being entertaining
- Enables natural character interactions
- Prevents conversation loops
- Ensures balanced participation
- Sets clear narrative progression

Please provide a structured story initialization with:

1. Initial Phase Selection:
   - Must be one of: introduction, development, climax, resolution
   - Consider topic complexity and engagement potential
   - Set up clear progression opportunities

2. Topic Focus Definition:
   - Core discussion theme
   - Relation to crypto/tech domain
   - Potential for character viewpoints
   - Entertainment value

3. Key Discussion Points:
   - 3-5 main talking points
   - Opportunities for character conflict/agreement
   - Technical accuracy requirements
   - Progression markers

4. Character Dynamics:
   - Suggested roles and viewpoints
   - Interaction patterns
   - Knowledge boundaries
   - Participation balance requirements

5. Scene Parameters:
   - Estimated duration (5-15 minutes)
   - Pacing guidelines
   - Phase transition triggers
   - Topic containment boundaries

Format the response as JSON with the following structure:
{
    "currentPhase": "string",
    "topicFocus": "string",
    "keyPoints": ["string"],
    "suggestedRoles": ["string"],
    "estimatedDuration": number,
    "phaseTriggers": ["string"],
    "topicBoundaries": ["string"],
    "participationGuidelines": ["string"]
}

Remember:
- Scene should complete within 5-15 minutes
- Support 2-4 simultaneous characters
- Maintain crypto/tech focus while being entertaining
- Enable natural conversation flow
- Prevent topic drift and hallucination
`;

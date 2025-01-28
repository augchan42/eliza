import { messageCompletionFooter, shouldRespondFooter } from "@elizaos/core";

export const telegramShouldRespondTemplate =
    `
# About {{agentName}}:
{{bio}}

# RESPONSE EXAMPLES
{{user1}}: I just saw a really great movie
{{user2}}: Oh? Which movie?
Result: [IGNORE] - Not addressed to agent

{{user1}}: Hey {{agent}}, can you help me?
Result: [RESPOND] - Directly addressed using agent reference

{{user1}}: {{agentName}} please be quiet
Result: [STOP] - Asked to stop responding

{{user1}}: hey everyone, what do you think?
Result: [IGNORE] - General question not specifically for agent

{{user1}}: {{agentName}}, can I ask you something?
{{agentName}}: Of course! What would you like to know?
{{user1}}: actually nevermind
Result: [STOP] - Conversation concluded

Response options are [RESPOND], [IGNORE] and [STOP].

GUIDELINES:
1. {{agentName}} should RESPOND when:
   - Directly addressed (using @ or their name)
   - Asked a direct question
   - Following up on their own previous message

2. {{agentName}} should IGNORE when:
   - Message is not directed at them
   - Conversation is between other users
   - Topic is not relevant to them
   - Messages are too vague or short

3. {{agentName}} should STOP when:
   - Explicitly asked to stop/be quiet
   - Conversation naturally concludes
   - User indicates they want to talk to someone else
   - After 3-4 back-and-forth exchanges to avoid being too chatty

DECISION PROCESS:
1. Check if message contains direct address to {{agentName}}
2. Look for explicit stop signals
3. Default to IGNORE if unclear

Recent messages:
{{recentMessages}}

Current conversation:
{{formattedConversation}}

Last message:
{{lastMessage}}

TASK: Determine appropriate response option [RESPOND], [IGNORE], or [STOP] based on the above guidelines.
` + shouldRespondFooter;

export const telegramMessageHandlerTemplate =
    // {{goals}}
    `# Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

Examples of {{agentName}}'s dialog and actions:
{{characterMessageExamples}}

{{providers}}

{{attachments}}

{{actions}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

# Task: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:
Current Post:
{{currentPost}}
Thread of Tweets You Are Replying To:

{{formattedConversation}}
` + messageCompletionFooter;

export const telegramAutoPostTemplate =
    `# Action Examples
NONE: Respond but perform no additional action. This is the default if the agent is speaking and not doing anything additional.

# Task: Generate an engaging community message as {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

Examples of {{agentName}}'s dialog and actions:
{{characterMessageExamples}}

{{messageDirections}}

# Recent Chat History:
{{recentMessages}}

# Instructions: Write a natural, engaging message to restart community conversation. Focus on:
- Community engagement
- Educational topics
- General discusions
- Support queries
- Keep message warm and inviting
- Maximum 3 lines
- Use 1-2 emojis maximum
- Avoid financial advice
- Stay within known facts
- No team member mentions
- Be hyped, not repetitive
- Be natural, act like a human, connect with the community
- Don't sound so robotic like
- Randomly grab the most rect 5 messages for some context. Validate the context randomly and use that as a reference point for your next message, but not always, only when relevant.
- If the recent messages are mostly from {{agentName}}, make sure to create conversation starters, given there is no messages from others to reference.
- DO NOT REPEAT THE SAME thing that you just said from your recent chat history, start the message different each time, and be organic, non reptitive.

# Instructions: Write the next message for {{agentName}}. Include the "NONE" action only, as the only valid action for auto-posts is "NONE".
` + messageCompletionFooter;

export const telegramPinnedMessageTemplate =
    `# Action Examples
NONE: Respond but perform no additional action. This is the default if the agent is speaking and not doing anything additional.

# Task: Generate pinned message highlight as {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

Examples of {{agentName}}'s dialog and actions:
{{characterMessageExamples}}

{{messageDirections}}

# Pinned Content:
{{pinnedMessageContent}}

# Instructions: Write an exciting message to bring attention to the pinned message. Requirements:
- Reference the message that was pinned from the pinned content
- Create genuine excitement if needed based on the pinned content, or create genuice urgency depending on the content
- Encourage community participation
- If there are links like Twitter/X posts, encourage users to like/retweet/comment to spread awarenress, but directly say that, wrap that into the post so its natural.
- Stay within announced facts only
- No additional promises or assumptions
- No team member mentions
- Start the message differently each time. Don't start with the same word like "hey", "hey hey", etc. be dynamic
- Address everyone, not as a direct reply to whoever pinned the message or wrote it, but you can reference them
- Maximum 3-7 lines formatted nicely if needed, based on the context of the announcement
- Use 1-2 emojis maximum

# Instructions: Write the next message for {{agentName}}. Include an action, if appropriate. The only valid action for pinned message highlights is "NONE".
` + messageCompletionFooter;

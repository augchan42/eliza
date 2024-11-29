import {
    ChannelType,
    Message as DiscordMessage,
    TextChannel,
} from "discord.js";
import { IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";

const channelStateProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        // Handle both message and channel cases
        const channel = state?.discordChannel as TextChannel;
        const discordMessage = state?.discordMessage as DiscordMessage;

        // Get guild from either source
        const guild = channel?.guild || discordMessage?.guild;
        const agentName = state?.agentName || "The agent";
        const senderName = state?.senderName || "someone";

        if (!guild) {
            return `${agentName} is currently in a direct message conversation with ${senderName}`;
        }

        const serverName = guild.name;
        const guildId = guild.id;
        const currentChannel = channel || discordMessage?.channel;

        if (!currentChannel) {
            console.log("channel is null");
            return "";
        }

        let response = `${agentName} is currently having a conversation in the channel \`@${currentChannel.id} in the server \`${serverName}\` (@${guildId})`;

        if (
            currentChannel.type === ChannelType.GuildText &&
            (currentChannel as TextChannel).topic
        ) {
            response += `\nThe topic of the channel is: ${(currentChannel as TextChannel).topic}`;
        }

        return response;
    },
};

export default channelStateProvider;

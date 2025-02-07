import { UUID, stringToUuid } from "@elizaos/core";

export class RoomId {
    private static roomNameMap = new Map<string, string>();

    private constructor(
        public readonly asString: string, // Original room name (e.g. "cookiedelphia")
        public readonly asUUID: UUID, // UUID version for database
    ) {}

    // Create from original room name string
    static fromString(roomName: string): RoomId {
        const uuid = stringToUuid(roomName);
        this.roomNameMap.set(uuid, roomName);
        return new RoomId(roomName, uuid);
    }

    // Create from UUID (if we need to reconstruct from database)
    static fromUUID(uuid: UUID): RoomId {
        const originalName = this.roomNameMap.get(uuid) || uuid;
        return new RoomId(originalName, uuid);
    }

    // Helper method to get the correct format based on usage
    forDatabase(): UUID {
        return this.asUUID;
    }

    forStory(): string {
        return this.asString;
    }
}

import { IDatabaseAdapter as DatabaseAdapter, UUID } from "./types";

export class ResponseDeduplicator {
    private readonly db: DatabaseAdapter;
    private readonly roomId: UUID;
    private readonly tableName: string;
    private readonly dedupeTimeWindow: number = 10000; // 10 seconds
    private readonly similarityThreshold: number = 0.8;

    constructor(db: DatabaseAdapter, roomId: UUID, tableName: string) {
        this.db = db;
        this.roomId = roomId;
        this.tableName = tableName;
    }

    public async isDuplicate(
        text: string,
        embedding: number[]
    ): Promise<boolean> {
        // Search for similar responses using vector similarity
        const similarMemories = await this.db.searchMemoriesByEmbedding(
            embedding,
            {
                match_threshold: this.similarityThreshold,
                count: 5, // Limit search to recent responses
                roomId: this.roomId,
                tableName: this.tableName,
                unique: true,
            }
        );

        // Check if any similar responses were found within the time window
        const now = Date.now();
        const recentSimilarMemories = similarMemories.filter(
            (memory) =>
                memory.createdAt &&
                now - memory.createdAt < this.dedupeTimeWindow
        );

        return recentSimilarMemories.length > 0;
    }
}

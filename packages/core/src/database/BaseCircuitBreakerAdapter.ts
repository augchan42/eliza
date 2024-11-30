import { CircuitBreaker } from "./CircuitBreaker";
import { elizaLogger } from "../logger";
import { DatabaseAdapter } from "../database";

export abstract class BaseCircuitBreakerAdapter<T> extends DatabaseAdapter<T> {
    protected circuitBreaker: CircuitBreaker;

    constructor(circuitBreakerConfig?: {
        failureThreshold?: number;
        resetTimeout?: number;
        halfOpenMaxAttempts?: number;
    }) {
        super();
        this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    }

    protected async withCircuitBreaker<T>(
        operation: () => Promise<T>,
        context: string
    ): Promise<T> {
        try {
            return await this.circuitBreaker.execute(operation);
        } catch (error) {
            elizaLogger.error(`Circuit breaker error in ${context}:`, {
                error: error instanceof Error ? error.message : String(error),
                state: this.circuitBreaker.getState(),
            });
            throw error;
        }
    }
}

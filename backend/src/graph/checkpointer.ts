
import { MemorySaver } from "@langchain/langgraph";

/**
 * Factory for getting the State Checkpointer.
 * Currently uses MemorySaver (In-Memory).
 * TODO: Swap to RedisSaver for production persistence.
 */
export class CheckpointerFactory {
    private static instance: MemorySaver;

    public static getCheckpointer() {
        if (!CheckpointerFactory.instance) {
            CheckpointerFactory.instance = new MemorySaver();
            console.log("[Checkpointer] Initialized In-Memory Checkpointer");
        }
        return CheckpointerFactory.instance;
    }
}

import { ChatCompletionMessageParam } from "openai/resources";
import { BaseLLM } from "../llms/BaseLLM";

export abstract class BaseAgent {
    protected basellm: BaseLLM;
    protected systemPrompt: string;
    protected context: ChatCompletionMessageParam[];
    protected maxContext: number;

    constructor(basellm: BaseLLM, systemPrompt: string, maxContext: number = 20) {
        this.basellm = basellm;
        this.systemPrompt = systemPrompt;
        this.context = [{ role: "system", content: systemPrompt }];
        this.maxContext = maxContext;
    }

    resetContext(): void {
        this.context = [{ role: "system", content: this.systemPrompt }];
    }

    getContext(): ChatCompletionMessageParam[] {
        return this.context;
    }

    abstract todo(token: string): Promise<void>;
    abstract tokenDeal(token: string): Promise<void>;

    async chat(message: string): Promise<void> {
        // Add user message to context
        this.context.push({ role: "user", content: message });

        // Get streaming response from LLM
        let resultAll = "";
        try {
            for await (const token of this.basellm.chat(this.context)) {
                resultAll += token;
                await this.tokenDeal(token);
            }

            // Save AI response to context
            this.context.push({ role: "assistant", content: resultAll });

            // Control context length
            if (this.context.length > this.maxContext) {
                this.context = [this.context[0], ...this.context.slice(-this.maxContext)];
            }

            // Call todo callback with complete response
            await this.todo(resultAll);
        } catch (error) {
            console.error("Error in chat:", error);
            throw error;
        }
    }
}
import { ChatCompletionMessageParam } from "openai/resources";

export abstract class BaseLLM {
    protected apiKey: string;
    protected baseUrl: string;
    protected modelName: string;

    constructor(apiKey: string, baseUrl: string, modelName: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.modelName = modelName;
    }

    abstract chat(
        context: ChatCompletionMessageParam[],
        temperature?: number,
        maxTokens?: number
    ): AsyncGenerator<string, void, unknown>;
}
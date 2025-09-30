import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { BaseLLM } from "./BaseLLM";

export class OpenAILLM extends BaseLLM {
    private client: OpenAI;

    constructor(apiKey: string, baseUrl: string = "https://api.openai.com/v1", modelName: string = "gpt-4o-mini") {
        super(apiKey, baseUrl, modelName);
        this.client = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.baseUrl
        });
    }

    async *chat(
        context: ChatCompletionMessageParam[],
        temperature: number = 0.7,
        maxTokens?: number
    ): AsyncGenerator<string, void, unknown> {
        // Validate context format
        for (const msg of context) {
            if (!msg.role || msg.content === undefined) {
                throw new Error("Each message in context must have 'role' and 'content' properties");
            }
        }

        const params: any = { temperature };
        if (maxTokens !== undefined) {
            params.max_tokens = maxTokens;
        }

        try {
            const stream = await this.client.chat.completions.create({
                model: this.modelName,
                messages: context,
                stream: true,
                ...params
            });

            // 使用类型断言为 any 来避免编译错误
            // 这在 OpenAI SDK v4 中是安全的，因为流式响应确实支持异步迭代
            for await (const chunk of stream as any) {
                const delta = chunk.choices[0]?.delta;
                if (delta?.content) {
                    yield delta.content;
                }
            }
        } catch (error: any) {
            if (error.type === 'api_error') {
                throw new Error(`OpenAI API error: ${error.message}`);
            } else {
                throw new Error(`Unexpected error: ${error.message}`);
            }
        }
    }
}
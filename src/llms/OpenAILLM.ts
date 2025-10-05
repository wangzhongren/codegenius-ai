import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { BaseLLM } from "./BaseLLM";

export class OpenAILLM extends BaseLLM {
    private client: OpenAI;
    private currentAbortController: AbortController | null = null;

    constructor(apiKey: string, baseUrl: string = "https://api.openai.com/v1", modelName: string = "gpt-4o-mini") {
        super(apiKey, baseUrl, modelName);
        this.client = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.baseUrl
        });
    }

    // Helper function to check if error is an abort error
    private isAbortError(error: any): boolean {
        if (!error) return false;
        
        // Check for AbortError name
        if (error.name === 'AbortError') return true;
        
        // Check for DOMException with ABORT_ERR code (code 20)
        if (error instanceof DOMException && error.code === 20) return true;
        
        // Check for common abort error messages
        const abortMessages = ['abort', 'aborted', 'cancel', 'cancelled', 'request aborted'];
        const errorMessage = error.message?.toLowerCase() || '';
        return abortMessages.some(msg => errorMessage.includes(msg));
    }

    async *chat(
        context: ChatCompletionMessageParam[],
        temperature: number = 0.7,
        maxTokens?: number,
        signal?: AbortSignal
    ): AsyncGenerator<string, void, unknown> {
        // Validate context format
        for (const msg of context) {
            if (!msg.role || msg.content === undefined) {
                throw new Error("Each message in context must have 'role' and 'content' properties");
            }
        }

        // Cancel previous request if exists and no external signal provided
        if (!signal && this.currentAbortController) {
            this.currentAbortController.abort();
        }

        // Create new AbortController if no external signal provided
        const abortController = signal ? undefined : new AbortController();
        const abortSignal = signal || abortController?.signal;

        // Check if already aborted before making request
        if (abortSignal?.aborted) {
            console.log('Request aborted before starting');
            return;
        }

        const params: any = { temperature };
        if (maxTokens !== undefined) {
            params.max_tokens = maxTokens;
        }
        if (abortSignal) {
            params.signal = abortSignal;
        }

        let stream: any;
        try {
            stream = await this.client.chat.completions.create({
                model: this.modelName,
                messages: context,
                stream: true,
                ...params
            });

            // Store current abort controller for manual cancellation
            if (!signal) {
                this.currentAbortController = abortController!;
            }

            // Process stream with proper abort handling
            for await (const chunk of stream) {
                // Check abort signal before yielding each token
                if (abortSignal?.aborted) {
                    console.log('Stream aborted during processing - stopping token generation');
                    return;
                }
                
                const delta = chunk.choices[0]?.delta;
                if (delta?.content) {
                    yield delta.content;
                }
            }
        } catch (error: any) {
            if (this.isAbortError(error)) {
                console.log('AI request was aborted by OpenAI SDK');
                return;
            }
            if (error.type === 'api_error') {
                throw new Error(`OpenAI API error: ${error.message}`);
            } else {
                throw new Error(`Unexpected error: ${error.message}`);
            }
        } finally {
            if (!signal && this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
        }
    }

    abortCurrentRequest(): void {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
    }
}
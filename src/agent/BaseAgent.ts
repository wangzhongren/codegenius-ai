import { ChatCompletionMessageParam } from "openai/resources";
import { BaseLLM } from "../llms/BaseLLM";

export abstract class BaseAgent {
    protected basellm: BaseLLM;
    protected systemPrompt: string;
    protected context: ChatCompletionMessageParam[];
    protected maxContext: number;
    private currentAbortController: AbortController | null = null;
    private _isPaused: boolean = false;
    private _wasAborted: boolean = false; // Track if current chat was aborted

    constructor(basellm: BaseLLM, systemPrompt: string, maxContext: number = 20) {
        this.basellm = basellm;
        this.systemPrompt = systemPrompt;
        this.context = [{ role: "system", content: this.systemPrompt }];
        this.maxContext = maxContext;
    }

    resetContext(): void {
        this.context = [{ role: "system", content: this.systemPrompt }];
        this._wasAborted = false; // Reset abort state when context is reset
    }

    getContext(): ChatCompletionMessageParam[] {
        return this.context;
    }

    abstract todo(token: string): Promise<void>;
    abstract tokenDeal(token: string): Promise<void>;

    // Helper function to check if error is an abort error
    private isAbortError(error: any): boolean {
        if (!error) return false;
        
        // Check for AbortError name
        if (error.name === 'AbortError') return true;
        
        // Check for DOMException with ABORT_ERR code (code 20)
        if (error instanceof DOMException && error.code === 20) return true;
        
        // Check for common abort error messages
        const abortMessages = ['abort', 'aborted', 'cancel', 'cancelled', 'chat aborted'];
        const errorMessage = error.message?.toLowerCase() || '';
        return abortMessages.some(msg => errorMessage.includes(msg));
    }

    setPaused(paused: boolean): void {
        this._isPaused = paused;
        console.log(`BaseAgent pause state set to: ${paused}`);
    }

    isPaused(): boolean {
        return this._isPaused;
    }

    async chat(message: string, signal?: AbortSignal): Promise<void> {
        // Reset states for new chat
        this._isPaused = false;
        this._wasAborted = false;
        console.log('BaseAgent: Reset pause and abort states for new chat');

        // Cancel previous request if exists and no external signal provided
        if (!signal && this.currentAbortController) {
            this.currentAbortController.abort();
        }

        // Create new AbortController if no external signal provided
        const abortController = signal ? undefined : new AbortController();
        const abortSignal = signal || abortController?.signal;

        // Add user message to context
        this.context.push({ role: "user", content: message });

        // Get streaming response from LLM
        let resultAll = "";
        try {
            // Let the LLM handle the abort signal automatically
            // Check if already aborted before starting
            if (abortSignal?.aborted) {
                console.log('Chat aborted before starting');
                this._wasAborted = true;
                return;
            }
            
            for await (const token of this.basellm.chat(this.context, 0.7, undefined, abortSignal)) {
                // Check if aborted before processing token
                if (abortSignal?.aborted) {
                    console.log('Chat aborted during token processing');
                    this._wasAborted = true;
                    return;
                }
                
                // Only process token if not paused
                if (!this._isPaused) {
                    resultAll += token;
                    await this.tokenDeal(token);
                }
                // If paused, we still accumulate resultAll for when we resume,
                // but don't call tokenDeal (which sends to UI)
            }

            // Check if aborted before calling todo
            if (abortSignal?.aborted) {
                console.log('Chat aborted before todo callback');
                this._wasAborted = true;
                return;
            }

            // Save AI response to context
            this.context.push({ role: "assistant", content: resultAll });

            // Control context length
            if (this.context.length > this.maxContext) {
                this.context = [this.context[0], ...this.context.slice(-this.maxContext)];
            }

            // Only call todo if chat was not aborted
            if (!this._wasAborted) {
                console.log('BaseAgent: Calling todo with complete response');
                await this.todo(resultAll);
            } else {
                console.log('BaseAgent: Skipping todo because chat was aborted');
            }
        } catch (error) {
            if (this.isAbortError(error)) {
                console.log('Chat was aborted by LLM');
                this._wasAborted = true;
                return;
            }
            console.error("Error in chat:", error);
            throw error;
        } finally {
            if (!signal && this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
            // Reset abort state after chat completes (whether successful or aborted)
            this._wasAborted = false;
        }
    }

    abortCurrentChat(): void {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
        this._wasAborted = true;
        // Also reset pause state when aborting
        this._isPaused = false;
        console.log('BaseAgent: Marked as aborted and reset pause state on abort');
    }
}
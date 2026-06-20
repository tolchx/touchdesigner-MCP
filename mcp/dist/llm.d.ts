export interface LlmInput {
    system: string;
    user: string;
}
export interface LlmOutput {
    text: string;
    provider: string;
    model: string;
    latencyMs: number;
}
export declare class AnthropicLlmClient {
    private apiKey;
    private model;
    private baseUrl;
    private retry;
    constructor(options: {
        apiKey: string;
        model: string;
        baseUrl?: string;
    });
    generateText(input: LlmInput): Promise<LlmOutput>;
}
export declare class GeminiLlmClient {
    private apiKey;
    private model;
    private baseUrl;
    private retry;
    constructor(options: {
        apiKey: string;
        model: string;
        baseUrl?: string;
    });
    generateText(input: LlmInput): Promise<LlmOutput>;
}
export declare class GeminiFallbackLlmClient {
    private apiKey;
    private models;
    private baseUrl?;
    constructor(options: {
        apiKey: string;
        models: string[];
        baseUrl?: string;
    });
    generateText(input: LlmInput): Promise<LlmOutput>;
}
export declare class OllamaLlmClient {
    private model;
    private baseUrl;
    private retry;
    constructor(options: {
        model: string;
        baseUrl?: string;
    });
    generateText(input: LlmInput): Promise<LlmOutput>;
}
export declare class OllamaFallbackLlmClient {
    private models;
    private baseUrl?;
    constructor(options: {
        models: string[];
        baseUrl?: string;
    });
    generateText(input: LlmInput): Promise<LlmOutput>;
}
export declare class MockLlmClient {
    private model;
    private responseText;
    constructor(options: {
        model?: string;
        responseText: string;
    });
    generateText(): Promise<LlmOutput>;
}
export declare function createLlmClientFromEnv(): AnthropicLlmClient | GeminiLlmClient | GeminiFallbackLlmClient | OllamaLlmClient | OllamaFallbackLlmClient | MockLlmClient;

export type LlmProviderName = "anthropic" | "gemini" | "ollama" | "mock";
export interface LlmResponse {
    text: string;
    provider: LlmProviderName;
    model: string;
    latencyMs: number;
}
export interface LlmClient {
    generateText(input: {
        system: string;
        user: string;
    }): Promise<LlmResponse>;
}
export declare class AnthropicLlmClient implements LlmClient {
    private apiKey;
    private model;
    private baseUrl;
    private retry;
    constructor(options: {
        apiKey: string;
        model: string;
        baseUrl?: string;
    });
    generateText(input: {
        system: string;
        user: string;
    }): Promise<LlmResponse>;
}
export declare class GeminiLlmClient implements LlmClient {
    private apiKey;
    private model;
    private baseUrl;
    private retry;
    constructor(options: {
        apiKey: string;
        model: string;
        baseUrl?: string;
    });
    generateText(input: {
        system: string;
        user: string;
    }): Promise<LlmResponse>;
}
export declare class GeminiFallbackLlmClient implements LlmClient {
    private apiKey;
    private models;
    private baseUrl;
    constructor(options: {
        apiKey: string;
        models: string[];
        baseUrl?: string;
    });
    generateText(input: {
        system: string;
        user: string;
    }): Promise<LlmResponse>;
}
export declare class OllamaLlmClient implements LlmClient {
    private model;
    private baseUrl;
    private retry;
    constructor(options: {
        model: string;
        baseUrl?: string;
    });
    generateText(input: {
        system: string;
        user: string;
    }): Promise<LlmResponse>;
}
export declare class OllamaFallbackLlmClient implements LlmClient {
    private models;
    private baseUrl?;
    constructor(options: {
        models: string[];
        baseUrl?: string;
    });
    generateText(input: {
        system: string;
        user: string;
    }): Promise<LlmResponse>;
}
export declare class MockLlmClient implements LlmClient {
    private model;
    private responseText;
    constructor(options: {
        model?: string;
        responseText: string;
    });
    generateText(): Promise<LlmResponse>;
}
export declare function createLlmClientFromEnv(): LlmClient;

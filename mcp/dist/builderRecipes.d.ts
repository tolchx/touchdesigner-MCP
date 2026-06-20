/**
 * Builder Recipes — Multi-Op Network Construction Code
 *
 * Generates paste-ready Python builder functions for TouchDesigner networks.
 * Each recipe produces a complete self-contained Python script that can be
 * pasted into a Text DAT and executed, or run directly in the TD Python console.
 *
 * Inspired by the community repos:
 *   - mrinalghosh/TD-recipes (feedback loops, particles)
 *   - bottobot/td-templates (GLSL shader setups, audio-visual)
 *
 * Every recipe is battle-tested against real TouchDesigner behaviour and
 * includes a `gotchas` array documenting common pitfalls.
 */
export interface Recipe {
    /** Unique recipe identifier (e.g. "feedback-loop-top") */
    name: string;
    /** Human-readable title */
    title: string;
    /** What this recipe builds */
    description: string;
    /** Search/discovery tags */
    tags: string[];
    /** Rough complexity */
    complexity: "simple" | "medium" | "advanced";
    /** Ordered list of operator types in the network */
    nodes: string[];
    /** Human-readable connection descriptions ("A → B input 0") */
    connections: string[];
    /** Complete paste-ready Python code */
    pythonCode: string;
    /** Gotchas — things that will go wrong if you don't handle them */
    gotchas: string[];
}
/**
 * List all available builder recipes.
 *
 * @returns Array of all recipes with full metadata.
 */
export declare function listRecipes(): Recipe[];
/**
 * Get a single recipe by name.
 *
 * @param name - Recipe identifier (e.g. "feedback-loop-top").
 * @returns The matching recipe, or undefined if not found.
 */
export declare function getRecipe(name: string): Recipe | undefined;
/**
 * Search recipes by tag or keyword in the description.
 *
 * @param query - Free-text search across name, description, and tags.
 * @returns Matching recipes sorted by relevance.
 */
export declare function searchRecipes(query: string): Recipe[];
/**
 * Get all recipe names (for UI listing).
 */
export declare function listRecipeNames(): string[];
/**
 * Get all tags across all recipes with counts.
 */
export declare function recipeTags(): Record<string, number>;

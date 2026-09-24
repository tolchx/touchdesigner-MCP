import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
/**
 * `td_measure` — muestrear magnitudes REALES antes de fijar escalares.
 *
 * Origen (2026-09-24, auditoría del Discord de TWOZERO — ítem 47 del BACKLOG):
 * el mejor consejo técnico de ese server, de un usuario avanzado:
 *   "the biggest problem has been scale. the llm has no sense of even an order of
 *    magnitude for some things. i've helped it by asking it to sample at the
 *    input before determining scalars for sliders/parameters."
 * El agente escribe `scale = 2.0` sin saber si la señal va de 0..1 o de 0..40000.
 * Esta tool mide la señal y devuelve, además de los números, una interpretación
 * en texto plano pensada para que un LLM la lea y actúe.
 *
 * READ-ONLY: no muta, no fuerza cooks, no crea ni borra nada.
 */
export interface ChannelStats {
    name: string;
    samples: number;
    min: number | null;
    max: number | null;
    mean: number | null;
    first: number | null;
    last: number | null;
    range: number | null;
    is_constant: boolean;
    looks_normalized: boolean;
    looks_unit: boolean;
    suggested_scale: number | null;
    suggested_offset: number | null;
}
export interface MeasureResult {
    path: string;
    family: string;
    type: string | null;
    measured_at: string;
    units_guess: string;
    measurements: Record<string, unknown>;
    summary_for_scaling: {
        ranges: Array<{
            channel: string;
            min: number | null;
            max: number | null;
            range: number | null;
        }>;
        suggested_scalars: Array<{
            channel: string;
            scale: number | null;
            offset: number | null;
        }>;
    };
    interpretation: string;
    warnings: string[];
}
/** OPType de TouchDesigner termina con la familia: noiseTOP, boxPOP, baseCOMP... */
export declare function familyFromOpType(opType: unknown): string | null;
/**
 * Estadística de un canal. Los valores no finitos (NaN/Inf) se CUENTAN y se
 * excluyen del cálculo: devolver un min/max "limpio" calculado sobre NaN sería
 * un número falso disfrazado de medición.
 */
export declare function statsForChannel(name: string, raw: unknown[]): ChannelStats & {
    non_finite: number;
};
/** Texto para el LLM: qué significan estos números y si hay que reescalar. */
export declare function interpretationFor(stats: ChannelStats[], family: string): string;
/**
 * `/exec` devuelve el JSON impreso dentro de `stdout` (string), NO en `.data`.
 * Leerlo mal devolvía `resolution: null` en un TOP que sí reporta width/height.
 */
export declare function parseExecJson(res: any, what: string): any;
export declare function registerMeasureTools(server: McpServer, client: TDClient): void;

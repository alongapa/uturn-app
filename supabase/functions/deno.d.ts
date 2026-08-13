// Tipos mínimos para que `tsc` pueda revisar las Edge Functions.
//
// Las Edge Functions corren en Deno, no en Node ni en React Native, así que
// están excluidas del tsconfig.json de la app. Este archivo (más el
// tsconfig.json de esta carpeta) las devuelve al typecheck sin arrastrar los
// tipos de la app: declara lo que el runtime de Deno provee como global y los
// módulos que se importan por URL, que `tsc` no sabe resolver.
//
// Ojo: NO es la definición completa de Deno. Solo está lo que las funciones de
// este repo usan de verdad (`Deno.serve` y `Deno.env.get`). Si una función
// nueva usa otra API de Deno, hay que agregarla acá — y ese error de
// compilación es a propósito: obliga a declarar lo que se usa.

declare namespace Deno {
  /** Variables de entorno; en Edge Functions son los secretos del proyecto. */
  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
  };

  /** Servidor HTTP nativo de Deno: el punto de entrada de cada función. */
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
  export function serve(
    options: { port?: number; hostname?: string },
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}

// --- Imports por URL -------------------------------------------------------
//
// supabase-js se resuelve por "paths" en tsconfig.json contra el paquete real
// de node_modules, así que ahí sí hay tipos de verdad (createClient, .rpc(),
// .from(), auth.admin, etc.).
//
// El SDK de Anthropic no está en node_modules (solo lo usa ai-bot-reply, que
// corre en Deno), y no vale la pena agregar una dependencia de app solo para
// esto. Se declara la superficie que usa la función; si se empieza a usar más
// del SDK, conviene ampliar esto o instalar @anthropic-ai/sdk como devDependency.
declare module 'https://esm.sh/@anthropic-ai/sdk@0.113.0' {
  class Anthropic {
    constructor(options?: { apiKey?: string });
    messages: {
      create(params: Anthropic.MessageCreateParams): Promise<Anthropic.Message>;
    };
  }

  // Merge de clase + namespace: así `Anthropic.TextBlock` funciona como tipo
  // (es como el SDK real expone los bloques de contenido).
  namespace Anthropic {
    interface TextBlock {
      type: 'text';
      text: string;
    }

    interface ThinkingBlock {
      type: 'thinking';
      thinking: string;
    }

    /** Bloques que aún no se usan acá (tool_use, etc.). */
    interface UnknownBlock {
      type: string;
    }

    type ContentBlock = TextBlock | ThinkingBlock | UnknownBlock;

    /**
     * 'refusal' llega con HTTP 200 y content vacío o parcial: hay que mirar
     * stop_reason ANTES de leer content.
     */
    type StopReason =
      | 'end_turn'
      | 'max_tokens'
      | 'stop_sequence'
      | 'tool_use'
      | 'pause_turn'
      | 'refusal';

    interface Message {
      id: string;
      role: 'assistant';
      model: string;
      content: ContentBlock[];
      stop_reason: StopReason | null;
      /** Solo viene poblado cuando stop_reason === 'refusal'. */
      stop_details?: { type: 'refusal'; category: string | null; explanation?: string } | null;
    }

    /** Thinking adaptativo: el modelo decide cuánto razonar (sin budget_tokens). */
    interface ThinkingConfig {
      type: 'adaptive' | 'disabled';
      display?: 'summarized' | 'omitted';
    }

    interface MessageCreateParams {
      model: string;
      max_tokens: number;
      system?: string;
      thinking?: ThinkingConfig;
      output_config?: { effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' };
      messages: { role: 'user' | 'assistant'; content: string }[];
    }
  }

  export default Anthropic;
}

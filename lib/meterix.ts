/**
 * MeterixClient — Async Buffered TypeScript SDK
 * -----------------------------------------------
 * Fire-and-forget telemetry logging for LLM cost tracking.
 * Designed for serverless (Vercel/Edge), Next.js Route Handlers,
 * and long-running Node.js backend processes.
 *
 * Usage:
 *   import { MeterixClient } from "@/lib/meterix";
 *   const meter = new MeterixClient({ apiKey: process.env.METERIX_API_KEY });
 *   meter.logUsage({ model: "gpt-4o", promptTokens: 1500, completionTokens: 450 });
 */

export interface LogUsageParams {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  sessionId?: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
}

export interface QueuedLog extends LogUsageParams {
  queuedAt: number;
}

export class MeterixSession {
  readonly #client: MeterixClient;
  readonly sessionId: string;

  constructor(client: MeterixClient, sessionId: string) {
    this.#client = client;
    this.sessionId = sessionId;
  }

  /**
   * Log telemetry usage for this session. Automatically attaches session_id to the event.
   */
  logUsage(params: LogUsageParams): { queued: true } {
    const sessionId = this.sessionId;
    const existingMeta = params.metadata ?? {};
    return this.#client.logUsage({
      ...params,
      sessionId,
      session_id: sessionId,
      metadata: {
        session_id: sessionId,
        ...existingMeta,
      },
    });
  }

  /** Flush all queued logs for the underlying client */
  async flush(): Promise<void> {
    await this.#client.flush();
  }
}

export interface MeterixClientOptions {
  /** Your mx_live_... API key */
  apiKey?: string;
  /** Override telemetry endpoint (defaults to /api/v1/telemetry relative, or METERIX_ENDPOINT env) */
  endpoint?: string;
  /** Background flush interval in ms (default: 3000) */
  flushIntervalMs?: number;
  /** Max buffer size before forcing an immediate flush (default: 50) */
  maxBufferSize?: number;
  /** Whether to register Node.js beforeExit/SIGTERM graceful shutdown handlers (default: true) */
  registerShutdownHandlers?: boolean;
}

export class MeterixClient {
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #maxBufferSize: number;

  #buffer: QueuedLog[] = [];
  #flushTimer: ReturnType<typeof setInterval> | null = null;
  #flushing = false;

  constructor(options: MeterixClientOptions = {}) {
    this.#apiKey =
      options.apiKey ??
      (typeof process !== "undefined"
        ? process.env.METERIX_API_KEY ?? process.env.AGENTMETER_API_KEY ?? ""
        : "");

    const envEndpoint =
      typeof process !== "undefined"
        ? process.env.METERIX_ENDPOINT ?? process.env.NEXT_PUBLIC_APP_URL
        : undefined;

    let resolvedEndpoint = options.endpoint ?? envEndpoint ?? "";
    if (resolvedEndpoint && !resolvedEndpoint.endsWith("/api/v1/telemetry")) {
      resolvedEndpoint = `${resolvedEndpoint.replace(/\/$/, "")}/api/v1/telemetry`;
    }
    this.#endpoint = resolvedEndpoint || "/api/v1/telemetry";
    this.#maxBufferSize = options.maxBufferSize ?? 50;

    const intervalMs = options.flushIntervalMs ?? 3000;

    // Start background flush interval (only in non-edge runtimes)
    if (typeof setInterval !== "undefined") {
      this.#flushTimer = setInterval(() => {
        this.#flushBuffer().catch(() => {/* silent */});
      }, intervalMs);

      // Prevent the interval from keeping Node.js alive
      if (this.#flushTimer && typeof this.#flushTimer.unref === "function") {
        this.#flushTimer.unref();
      }
    }

    // Register graceful shutdown handlers for Node.js environments
    if ((options.registerShutdownHandlers ?? true) && typeof process !== "undefined") {
      const onShutdown = () => {
        this.#flushBuffer().catch(() => {/* silent */});
      };
      process.once("beforeExit", onShutdown);
      process.once("SIGTERM", onShutdown);
    }
  }

  /**
   * Create a scoped session logger for multi-call agent tasks.
   * All events logged via this session instance automatically include `session_id`.
   */
  session(sessionId: string): MeterixSession {
    return new MeterixSession(this, sessionId);
  }

  /**
   * Queue a telemetry log. Returns immediately — never blocks.
   * @returns `{ queued: true }` on success
   */
  logUsage(params: LogUsageParams): { queued: true } {
    this.#buffer.push({ ...params, queuedAt: Date.now() });

    // Force flush if buffer is full
    if (this.#buffer.length >= this.#maxBufferSize) {
      this.#flushBuffer().catch(() => {/* silent */});
    }

    return { queued: true };
  }

  /**
   * Manually flush all queued logs to the Meterix API.
   * Use this as an escape hatch or before process termination.
   */
  async flush(): Promise<void> {
    await this.#flushBuffer();
  }

  /**
   * Stop the background flush interval and release resources.
   */
  destroy(): void {
    if (this.#flushTimer !== null) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = null;
    }
  }

  /**
   * Internal: drain the buffer and POST each log to the telemetry endpoint.
   * Failures are caught silently — never thrown to the parent application.
   */
  async #flushBuffer(): Promise<void> {
    if (this.#flushing || this.#buffer.length === 0) return;
    this.#flushing = true;

    const batch = this.#buffer.splice(0, this.#buffer.length);

    await Promise.allSettled(
      batch.map((log) => this.#sendLog(log))
    );

    this.#flushing = false;
  }

  async #sendLog(log: QueuedLog): Promise<void> {
    try {
      const sessionId = log.sessionId ?? log.session_id ?? (log.metadata as any)?.session_id;
      const metadata = {
        ...(log.metadata ?? {}),
        ...(sessionId ? { session_id: sessionId } : {}),
      };

      const payload = {
        model: log.model,
        prompt_tokens: log.promptTokens,
        completion_tokens: log.completionTokens,
        ...(log.cachedTokens !== undefined && { cached_tokens: log.cachedTokens }),
        ...(sessionId && { session_id: sessionId }),
        metadata,
      };

      await fetch(this.#endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.#apiKey}`,
          "User-Agent": "Meterix-TS-SDK/2.0.0",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Silent failure — never propagate to caller
    }
  }
}

/**
 * Vercel / Edge Serverless Helper
 * --------------------------------
 * Use with `waitUntil` from `@vercel/functions` to ensure buffered logs
 * are flushed before the serverless function response is returned.
 *
 * Example:
 *   import { waitUntil } from "@vercel/functions";
 *   import { flushWithWaitUntil } from "@/lib/meterix";
 *   flushWithWaitUntil(meter, waitUntil);
 */
export function flushWithWaitUntil(
  client: MeterixClient,
  waitUntil: (promise: Promise<unknown>) => void
): void {
  waitUntil(client.flush());
}

/** Singleton instance — convenient for module-level usage */
export const meter = new MeterixClient();

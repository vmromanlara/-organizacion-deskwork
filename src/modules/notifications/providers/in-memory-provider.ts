/**
 * DeskWork Ticketing Core / TKT-019.
 * InMemoryProvider — provider fake para tests y dev.
 *
 * Registra cada `send()` en una lista accesible para inspección.
 * Permite inyectar un error programado por mensaje N para simular fallos
 * transitorios y validar el manejo del dispatcher.
 */

import type { EmailMessage, EmailProvider, EmailResult } from "../provider.ts";

export interface InMemoryProviderOptions {
  /** Mensajes a fallar (1-indexed). El N-ésimo send() devuelve { ok: false }. */
  failAtCalls?: number[];
  /** Mensaje de error a devolver cuando se programa un fallo. */
  failureMessage?: string;
}

export class InMemoryProvider implements EmailProvider {
  readonly name = "in-memory";
  readonly sent: EmailMessage[] = [];

  private callCount = 0;
  private readonly options: InMemoryProviderOptions;

  constructor(options: InMemoryProviderOptions = {}) {
    this.options = options;
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    this.callCount += 1;
    const failList = this.options.failAtCalls ?? [];
    if (failList.includes(this.callCount)) {
      return {
        ok: false,
        error: this.options.failureMessage ?? "injected failure",
      };
    }
    this.sent.push(message);
    return { ok: true, providerMessageId: `mem-${this.callCount}` };
  }
}

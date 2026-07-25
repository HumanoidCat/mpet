/**
 * S3-T3 · Cliente del worker de gramática (hilo principal). Dueño: Isaac.
 * Mismo patrón que `asr/asrClient.ts`, ya validado en S2-T4.
 */

import type { Edit } from '@shared/contracts';
import {
  DEFAULT_GRAMMAR_DTYPE,
  DEFAULT_GRAMMAR_MODEL,
  type GrammarDType,
  type GrammarModelId,
  type GrammarRequest,
  type GrammarResponse,
} from './grammarProtocol';

export interface GrammarResult {
  corrected: string;
  edits: Edit[];
}

export interface GrammarClient {
  init(onProgress?: (model: string, progress: number) => void): Promise<void>;
  correct(text: string): Promise<GrammarResult>;
  dispose(): void;
}

export interface GrammarClientOptions {
  model?: GrammarModelId;
  dtype?: GrammarDType;
}

interface Pending {
  resolve: (r: GrammarResult) => void;
  reject: (e: Error) => void;
}

export function createGrammarClient(options: GrammarClientOptions = {}): GrammarClient {
  const model = options.model ?? DEFAULT_GRAMMAR_MODEL;
  const dtype = options.dtype ?? DEFAULT_GRAMMAR_DTYPE;

  const worker = new Worker(new URL('./grammarWorker.ts', import.meta.url), {
    type: 'module',
  });

  const pending = new Map<number, Pending>();
  let nextId = 0;
  let onProgress: ((model: string, progress: number) => void) | undefined;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((e: Error) => void) | null = null;

  const failAll = (error: Error) => {
    readyReject?.(error);
    readyResolve = readyReject = null;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };

  worker.onmessage = (event: MessageEvent<GrammarResponse>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'progress':
        onProgress?.(msg.model, msg.progress);
        break;

      case 'ready':
        readyResolve?.();
        readyResolve = readyReject = null;
        break;

      case 'result':
        pending.get(msg.id)?.resolve({ corrected: msg.corrected, edits: msg.edits });
        pending.delete(msg.id);
        break;

      case 'error': {
        const error = new Error(msg.message);
        if (msg.id !== undefined) {
          pending.get(msg.id)?.reject(error);
          pending.delete(msg.id);
        } else {
          failAll(error);
        }
        break;
      }
    }
  };

  worker.onerror = (e) => failAll(new Error(`Worker de gramática falló: ${e.message}`));

  const send = (msg: GrammarRequest) => worker.postMessage(msg);

  return {
    init(progressCallback) {
      onProgress = progressCallback;
      return new Promise<void>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
        send({ type: 'init', model, dtype });
      });
    },

    correct(text) {
      return new Promise<GrammarResult>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        send({ type: 'correct', id, text });
      });
    },

    dispose() {
      worker.terminate();
      for (const p of pending.values()) {
        p.reject(new Error('Cliente de gramática cerrado antes de terminar.'));
      }
      pending.clear();
    },
  };
}

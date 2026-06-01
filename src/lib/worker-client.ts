// ─── Worker Message Protocol Types ───────────────────────────────────────────
// TO worker:   { id: string; type: string; payload: T }
// FROM worker: { id: string; type: 'progress' | 'result' | 'error'; payload: any }

export interface WorkerRequestMessage<T = unknown> {
  id: string;
  type: string;
  payload: T;
}

export type WorkerResponseType = 'progress' | 'result' | 'error';

export interface WorkerProgressPayload {
  percent: number;
  message: string;
}

export interface WorkerResponseMessage<R = unknown> {
  id: string;
  type: WorkerResponseType;
  payload: R;
}

// ─── Worker Client ────────────────────────────────────────────────────────────
// A generic typed wrapper around a Web Worker that provides:
//   • Typed message passing via generics
//   • Progress reporting (percent + message)
//   • Promise-based result / error handling
//   • Automatic cleanup (terminate + listener removal)
//   • Unique per-call task IDs

export type ProgressCallback = (progress: WorkerProgressPayload) => void;

export class WorkerClient<TPayload = unknown, TResult = unknown> {
  private worker: Worker;
  private pendingResolvers = new Map<
    string,
    {
      resolve: (value: TResult) => void;
      reject: (reason: Error) => void;
      onProgress?: ProgressCallback;
    }
  >();
  private taskIdCounter = 0;
  private _isTerminated = false;

  constructor(worker: Worker) {
    this.worker = worker;
    this.handleMessage = this.handleMessage.bind(this);
    this.worker.addEventListener('message', this.handleMessage);
  }

  // ── Send a task to the worker ───────────────────────────────────────────
  execute(
    type: string,
    payload: TPayload,
    options?: { onProgress?: ProgressCallback; timeoutMs?: number }
  ): Promise<TResult> {
    if (this._isTerminated) {
      return Promise.reject(new Error('Worker has been terminated'));
    }

    const id = `task-${++this.taskIdCounter}`;

    return new Promise<TResult>((resolve, reject) => {
      // Apply optional timeout
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (options?.timeoutMs) {
        timeoutId = setTimeout(() => {
          this.pendingResolvers.delete(id);
          reject(new Error(`Worker task "${type}" timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs);
      }

      this.pendingResolvers.set(id, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timeoutId);
          reject(reason);
        },
        onProgress: options?.onProgress,
      });

      const message: WorkerRequestMessage<TPayload> = { id, type, payload };
      this.worker.postMessage(message);
    });
  }

  // ── Handle incoming messages from the worker ────────────────────────────
  private handleMessage(event: MessageEvent<WorkerResponseMessage<TResult>>) {
    const { id, type, payload } = event.data;

    const entry = this.pendingResolvers.get(id);
    if (!entry) return; // Unknown task — ignore

    switch (type) {
      case 'progress':
        entry.onProgress?.(payload as WorkerProgressPayload);
        break;

      case 'result':
        this.pendingResolvers.delete(id);
        entry.resolve(payload as TResult);
        break;

      case 'error': {
        this.pendingResolvers.delete(id);
        const errorMessage =
          typeof payload === 'string'
            ? payload
            : (payload as Error)?.message ?? 'Unknown worker error';
        entry.reject(new Error(errorMessage));
        break;
      }

      default:
        // Unknown message type — ignore
        break;
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  terminate(): void {
    if (this._isTerminated) return;
    this._isTerminated = true;

    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.terminate();

    // Reject all pending promises
    for (const [, entry] of this.pendingResolvers) {
      entry.reject(new Error('Worker was terminated'));
    }
    this.pendingResolvers.clear();
  }

  get isTerminated(): boolean {
    return this._isTerminated;
  }
}

// ─── Utility: check Web Worker support ───────────────────────────────────────
export function isWorkerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.Worker !== 'undefined'
  );
}

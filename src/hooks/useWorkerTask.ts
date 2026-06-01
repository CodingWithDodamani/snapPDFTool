'use client';

/* eslint-disable react-hooks/set-state-in-effect */
// Worker lifecycle requires synchronous state updates in useEffect for proper
// initialization tracking. This is an intentional pattern for cleanup management.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  WorkerClient,
  isWorkerSupported,
  type WorkerProgressPayload,
} from '@/lib/worker-client';

// ─── Hook types ──────────────────────────────────────────────────────────────

export type WorkerTaskStatus = 'idle' | 'running' | 'done' | 'error';

export interface UseWorkerTaskOptions {
  /** Timeout in milliseconds for a single task (default: 5 minutes) */
  timeoutMs?: number;
  /** Default message type sent to the worker (default: 'execute') */
  messageType?: string;
}

export interface UseWorkerTaskReturn<TPayload, TResult> {
  /** Send a task to the worker; resolves with the result */
  execute: (payload: TPayload, taskType?: string) => Promise<TResult>;
  /** Current progress reported by the worker */
  progress: WorkerProgressPayload;
  /** Lifecycle status of the current / last task */
  status: WorkerTaskStatus;
  /** Error object if the last task failed */
  error: Error | null;
  /** Result of the last successful task */
  result: TResult | null;
  /** Whether the browser supports Web Workers */
  isSupported: boolean;
  /** Whether the worker is active (created successfully) */
  isWorkerActive: boolean;
}

// ─── Worker factory type ─────────────────────────────────────────────────────

type WorkerSource = string | (() => Worker);

// ─── Main-thread fallback type ──────────────────────────────────────────────

type MainThreadFallback<TPayload, TResult> = (
  payload: TPayload,
  taskType: string | undefined,
  reportProgress: (percent: number, message: string) => void
) => Promise<TResult>;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useWorkerTask<TPayload = unknown, TResult = unknown>(
  workerSource: WorkerSource,
  fallback?: MainThreadFallback<TPayload, TResult>,
  options?: UseWorkerTaskOptions
): UseWorkerTaskReturn<TPayload, TResult> {
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
  const defaultMessageType = options?.messageType ?? 'execute';

  const clientRef = useRef<WorkerClient<TPayload, TResult> | null>(null);
  const taskIdRef = useRef(0);

  const [progress, setProgress] = useState<WorkerProgressPayload>({
    percent: 0,
    message: '',
  });
  const [status, setStatus] = useState<WorkerTaskStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<TResult | null>(null);
  const [isSupported] = useState(() => isWorkerSupported());
  const isWorkerActiveRef = useRef(false);
  const [isWorkerActive, setIsWorkerActive] = useState(false);

  // ── Create / destroy worker on mount / unmount ──────────────────────────
  useEffect(() => {
    if (!isSupported) return;

    try {
      let worker: Worker;
      if (typeof workerSource === 'function') {
        worker = workerSource();
      } else {
        worker = new Worker(workerSource);
      }
      clientRef.current = new WorkerClient<TPayload, TResult>(worker);
      isWorkerActiveRef.current = true;
      setIsWorkerActive(true);
    } catch {
      // Worker creation failed (e.g. CSP violation) — fall back silently
      clientRef.current = null;
      isWorkerActiveRef.current = false;
      setIsWorkerActive(false);
    }

    return () => {
      clientRef.current?.terminate();
      clientRef.current = null;
      isWorkerActiveRef.current = false;
      // Flush the state update after unmount
      setIsWorkerActive(false);
    };
  }, [isSupported]);

  // ── execute (supports dynamic task types) ──────────────────────────────
  const execute = useCallback(
    (payload: TPayload, taskType?: string): Promise<TResult> => {
      void ++taskIdRef.current;
      const messageType = taskType ?? defaultMessageType;

      // Reset state for new task
      setStatus('running');
      setError(null);
      setResult(null);
      setProgress({ percent: 0, message: '' });

      // ── Main-thread fallback path ───────────────────────────────────────
      if (!clientRef.current) {
        if (!fallback) {
          const err = new Error(
            'Web Workers are not supported and no fallback was provided'
          );
          setStatus('error');
          setError(err);
          return Promise.reject(err);
        }

        return fallback(payload, taskType, (percent, message) => {
          setProgress({ percent, message });
        })
          .then((res) => {
            setStatus('done');
            setResult(res);
            setProgress({ percent: 100, message: 'Complete' });
            return res;
          })
          .catch((err: Error) => {
            setStatus('error');
            setError(err);
            throw err;
          });
      }

      // ── Worker path ───────────────────────────────────────────────────
      return clientRef.current
        .execute<TPayload>(messageType, payload, {
          timeoutMs,
          onProgress: (p) => setProgress(p),
        })
        .then((res) => {
          setStatus('done');
          setResult(res);
          setProgress((prev) => ({
            ...prev,
            percent: 100,
            message: prev.message || 'Complete',
          }));
          return res;
        })
        .catch((err: Error) => {
          setStatus('error');
          setError(err);
          throw err;
        });
    },
    [defaultMessageType, timeoutMs, fallback]
  );

  return {
    execute,
    progress,
    status,
    error,
    result,
    isSupported,
    isWorkerActive,
  };
}

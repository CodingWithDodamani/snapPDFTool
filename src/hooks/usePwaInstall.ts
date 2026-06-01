'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaInstallState {
  isInstallable: boolean;
  isInstalled: boolean;
  isOffline: boolean;
  isLoading: boolean;
}

interface PwaInstallActions {
  promptInstall: () => Promise<boolean>;
  dismiss: () => void;
}

export function usePwaInstall(): PwaInstallState & PwaInstallActions {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<PwaInstallState>({
    isInstallable: false,
    isInstalled: false,
    isOffline: false,
    isLoading: false,
  });

  useEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setState((prev) => ({ ...prev, isInstalled: true }));
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setState((prev) => ({ ...prev, isInstallable: true }));
    };

    // Listen for successful install
    const handleAppInstalled = () => {
      deferredPrompt.current = null;
      setState((prev) => ({
        ...prev,
        isInstallable: false,
        isInstalled: true,
      }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setState((prev) => ({ ...prev, isOffline: false }));
    const handleOffline = () => setState((prev) => ({ ...prev, isOffline: true }));

    // Set initial state
    setState((prev) => ({ ...prev, isOffline: !navigator.onLine }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt.current) return false;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;

      if (outcome === 'accepted') {
        setState((prev) => ({
          ...prev,
          isInstallable: false,
          isInstalled: true,
          isLoading: false,
        }));
        return true;
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
        return false;
      }
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
      return false;
    } finally {
      deferredPrompt.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    deferredPrompt.current = null;
    setState((prev) => ({ ...prev, isInstallable: false }));
  }, []);

  return {
    ...state,
    promptInstall,
    dismiss,
  };
}
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Smartphone,
  X,
  Zap,
  Shield,
  WifiOff,
  Wifi,
  MonitorDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { cn } from '@/lib/utils';

// === Install Prompt Banner ===
export function PwaInstallBanner() {
  const { isInstallable, isLoading, promptInstall, dismiss } = usePwaInstall();
  const [isVisible, setIsVisible] = useState(false);

  // Show banner after a short delay (don't flash on page load)
  if (isInstallable && !isVisible) {
    const timer = setTimeout(() => setIsVisible(true), 2000);
    clearTimeout(timer);
  }

  if (!isInstallable || !isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-[380px] z-[60]"
      >
        <div className="rounded-2xl border shadow-2xl overflow-hidden glass-card p-0">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-primary to-primary/80 px-5 py-4">
            <button
              onClick={() => { setIsVisible(false); dismiss(); }}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Install SnapPDF</p>
                <p className="text-xs text-white/80">Add to home screen for quick access</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <FeaturePill icon={<Zap className="h-3.5 w-3.5" />} label="Works Offline" />
              <FeaturePill icon={<Shield className="h-3.5 w-3.5" />} label="No Ads" />
              <FeaturePill icon={<MonitorDown className="h-3.5 w-3.5" />} label="Full Screen" />
            </div>
            <Button
              onClick={promptInstall}
              disabled={isLoading}
              className="w-full magnetic-btn"
              size="lg"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Download className="h-4 w-4" />
                  </motion.div>
                  Installing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Install App
                </span>
              )}
            </Button>
            <button
              onClick={() => { setIsVisible(false); dismiss(); }}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Not now
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// === Offline Indicator ===
export function OfflineIndicator() {
  const { isOffline } = usePwaInstall();

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-16 left-0 right-0 z-[55] flex justify-center pointer-events-none"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-medium shadow-lg pointer-events-auto">
            <WifiOff className="h-4 w-4" />
            You&apos;re offline — cached tools still work
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// === Header Install Button (small, in header) ===
export function PwaHeaderButton() {
  const { isInstallable, isInstalled, isLoading, promptInstall } = usePwaInstall();

  if (isInstalled || !isInstallable) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={promptInstall}
      disabled={isLoading}
      className="hidden md:inline-flex gap-1.5 text-xs focus-ring-enhanced rounded-full px-3"
    >
      {isLoading ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Download className="h-3.5 w-3.5" />
        </motion.div>
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      <span className="hidden lg:inline">Install</span>
    </Button>
  );
}

// === Footer PWA Status ===
export function PwaFooterStatus() {
  const { isInstalled, isOffline } = usePwaInstall();

  return (
    <div className="flex items-center gap-3">
      {isInstalled ? (
        <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <Smartphone className="h-3 w-3" />
          Installed
        </span>
      ) : null}
      {isOffline ? (
        <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <WifiOff className="h-3 w-3" />
          Offline
        </span>
      ) : (
        <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <Wifi className="h-3 w-3" />
          Online
        </span>
      )}
    </div>
  );
}

// === Internal Components ===
function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
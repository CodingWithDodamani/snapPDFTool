'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Keyboard,
  Search,
  Navigation,
  Zap,
  Upload,
  Download,
  Undo2,
  Trash2,
  Sun,
  Home,
  ArrowLeft,
  FileDown,
  ImagePlus,
  Merge,
  Split,
  RotateCw,
  Scaling,
  ImageMinus,
  QrCode,
  User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppStore, type ToolId } from '@/store';
import { cn } from '@/lib/utils';

// === Types ===
interface ShortcutItem {
  keys: string[];
  description: string;
  action?: () => void;
}

interface ShortcutSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  shortcuts: ShortcutItem[];
}

// === Kbd Component ===
function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-md bg-muted border border-border text-[11px] font-mono font-medium shadow-sm',
        className
      )}
    >
      {children}
    </kbd>
  );
}

// === Shortcut Row ===
function ShortcutRow({
  shortcut,
  index,
}: {
  shortcut: ShortcutItem;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
    >
      <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
        {shortcut.description}
      </span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            <Kbd>{key}</Kbd>
            {i < shortcut.keys.length - 1 && (
              <span className="text-[10px] text-muted-foreground mx-0.5">+</span>
            )}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// === Section ===
function ShortcutSection({
  section,
  shortcutIndex,
  filter,
}: {
  section: ShortcutSection;
  shortcutIndex: { value: number };
  filter: string;
}) {
  const filtered = filter
    ? section.shortcuts.filter((s) =>
        s.description.toLowerCase().includes(filter) ||
        s.keys.join(' ').toLowerCase().includes(filter)
      )
    : section.shortcuts;

  if (filtered.length === 0) return null;

  return (
    <div>
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 px-3 py-2"
        >
          <div className="section-divider flex-1" />
          <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
            {section.icon}
            {section.title}
          </div>
          <div className="section-divider flex-1" />
        </motion.div>
      </AnimatePresence>
      <div className="space-y-0.5">
        {filtered.map((shortcut, idx) => (
            <ShortcutRow key={`${section.id}-${idx}`} shortcut={shortcut} index={idx} />
        ))}
      </div>
    </div>
  );
}

// === Main Dialog ===
export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { setActiveTool } = useAppStore();

  const handleOpen = useCallback((v: boolean) => {
    setOpen(v);
    if (v) setSearch('');
  }, []);

  // Expose open setter for external trigger
  const openDialog = useCallback(() => handleOpen(true), [handleOpen]);

  const sections = useMemo<ShortcutSection[]>(() => [
    {
      id: 'navigation',
      title: 'Navigation',
      icon: <Navigation className="h-3.5 w-3.5" />,
      shortcuts: [
        { keys: ['⌘', 'K'], description: 'Open Command Palette' },
        { keys: ['⌘', '/'], description: 'Show Keyboard Shortcuts' },
        { keys: ['Esc'], description: 'Go Back / Close Dialog' },
        { keys: ['⌘', 'D'], description: 'Toggle Dark Mode' },
      ],
    },
    {
      id: 'tools',
      title: 'Tool Quick Access',
      icon: <Zap className="h-3.5 w-3.5" />,
      shortcuts: [
        { keys: ['1'], description: 'Compress PDF', action: () => setActiveTool('compress-pdf' as ToolId) },
        { keys: ['2'], description: 'Image to PDF', action: () => setActiveTool('image-to-pdf' as ToolId) },
        { keys: ['3'], description: 'Merge PDFs', action: () => setActiveTool('merge-pdf' as ToolId) },
        { keys: ['4'], description: 'Split PDF', action: () => setActiveTool('split-pdf' as ToolId) },
        { keys: ['5'], description: 'Rotate PDF', action: () => setActiveTool('rotate-pdf' as ToolId) },
        { keys: ['6'], description: 'Resize Image', action: () => setActiveTool('image-resize' as ToolId) },
        { keys: ['7'], description: 'Compress Image', action: () => setActiveTool('image-compress' as ToolId) },
        { keys: ['8'], description: 'QR Generator', action: () => setActiveTool('qr-generator' as ToolId) },
        { keys: ['9'], description: 'Passport Photo', action: () => setActiveTool('passport-photo' as ToolId) },
        { keys: ['0'], description: 'Go to Home', action: () => setActiveTool('home') },
      ],
    },
    {
      id: 'operations',
      title: 'Tool Operations',
      icon: <Upload className="h-3.5 w-3.5" />,
      shortcuts: [
        { keys: ['⌘', 'O'], description: 'Upload / Open File' },
        { keys: ['⌘', 'S'], description: 'Save / Download Result' },
        { keys: ['⌘', 'Z'], description: 'Reset / Undo' },
        { keys: ['Del'], description: 'Clear Files' },
      ],
    },
  ], [setActiveTool]);

  const filter = search.toLowerCase().trim();
  const totalShortcuts = sections.reduce(
    (acc, s) => acc + (filter
      ? s.shortcuts.filter(sc => sc.description.toLowerCase().includes(filter) || sc.keys.join(' ').toLowerCase().includes(filter)).length
      : s.shortcuts.length),
    0
  );

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden glass-card">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Keyboard className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-bold">
                Keyboard Shortcuts
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Navigate faster with keyboard shortcuts
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter shortcuts..."
              className="pl-9 h-9 bg-muted/30"
            />
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="px-3 pt-3 pb-2 max-h-[400px] overflow-y-auto custom-scrollbar">
          {totalShortcuts === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 py-8"
            >
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  No shortcuts found
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Try a different search term
                </p>
              </div>
            </motion.div>
          ) : (
            (() => {
              const counter = { value: 0 };
              return sections.map((section) => (
                <ShortcutSection
                  key={section.id}
                  section={section}
                  shortcutIndex={counter}
                  filter={filter}
                />
              ));
            })()
          )}
        </div>

        {/* Footer */}
        <div className="section-divider" />
        <div className="px-6 py-3 bg-muted/20">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd>?</Kbd>
              <span>Toggle this dialog</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span>Close</span>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// === Trigger Button for Header ===
export function KeyboardShortcutsButton() {
  // This is a trigger-only button; the dialog is controlled internally.
  // We use a custom event to open the dialog from the hook.
  const handleClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent('snap-pdf:shortcuts-toggle'));
  }, []);

  return (
    <button
      onClick={handleClick}
      className="hidden md:flex items-center justify-center w-9 h-9 rounded-xl border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all duration-200 cursor-pointer group focus-ring-enhanced"
      title="Keyboard Shortcuts"
      aria-label="Show keyboard shortcuts"
    >
      <span className="text-xs font-semibold group-hover:text-primary transition-colors">?</span>
    </button>
  );
}

// === Footer Hint ===
export function KeyboardShortcutsHint() {
  const handleClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent('snap-pdf:shortcuts-toggle'));
  }, []);

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 focus-ring-enhanced rounded"
    >
      <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
      <span>
        Press{' '}
        <kbd className="inline-flex h-4 items-center justify-center rounded-md border bg-background/80 shadow-sm px-1 font-mono text-[9px] font-medium ml-0.5">
          ?
        </kbd>
        {' '}for shortcuts
      </span>
    </button>
  );
}

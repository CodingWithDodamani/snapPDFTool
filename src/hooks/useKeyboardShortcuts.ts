'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useAppStore, type ToolId } from '@/store';

// === Tool mapping for number shortcuts ===
const NUMBER_TOOL_MAP: Record<string, ToolId> = {
  '1': 'compress-pdf',
  '2': 'image-to-pdf',
  '3': 'merge-pdf',
  '4': 'split-pdf',
  '5': 'rotate-pdf',
  '6': 'image-resize',
  '7': 'image-compress',
  '8': 'qr-generator',
  '9': 'passport-photo',
  '0': 'home',
};

/**
 * Checks if the event target is an editable element that should suppress shortcuts.
 */
function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (target as HTMLElement).isContentEditable
  );
}

/**
 * Global keyboard shortcuts hook.
 * Listens to keydown events on the document and dispatches actions.
 * - Cmd/Ctrl + K  → Handled by CommandPalette (not duplicated here)
 * - ? / Shift+/   → Toggle keyboard shortcuts dialog
 * - Cmd/Ctrl + D  → Toggle dark mode
 * - Cmd/Ctrl + /  → Toggle keyboard shortcuts dialog
 * - Esc           → Go home or close dialog
 * - 1-9, 0        → Quick tool access (only when not in input)
 * - Cmd/Ctrl + O  → Dispatch snap-pdf:upload
 * - Cmd/Ctrl + S  → Dispatch snap-pdf:save
 * - Cmd/Ctrl + Z  → Dispatch snap-pdf:reset
 * - Delete/Backspace → Dispatch snap-pdf:clear
 */
export function useKeyboardShortcuts() {
  const { setActiveTool, activeTool } = useAppStore();
  const { theme, setTheme } = useTheme();
  const hasTriggeredRef = useRef(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const key = e.key;

      // === Shortcuts that work even in inputs ===
      if (isMod && key.toLowerCase() === '/') {
        // ⌘/Ctrl + / → Toggle keyboard shortcuts dialog
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snap-pdf:shortcuts-toggle'));
        return;
      }

      if (isMod && key.toLowerCase() === 'd') {
        // ⌘/Ctrl + D → Toggle dark mode
        e.preventDefault();
        setTheme(theme === 'dark' ? 'light' : 'dark');
        return;
      }

      // === Shortcuts that should NOT fire in inputs/textareas ===
      if (isEditableElement(e.target)) return;

      // ? key or Shift+/ (when Shift is held, key is '?' on US keyboards)
      // Also handle Shift+/ which produces '?' on most layouts
      if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snap-pdf:shortcuts-toggle'));
        return;
      }

      // Esc → Go home
      if (key === 'Escape') {
        e.preventDefault();
        // Don't navigate home if CommandPalette is open (it handles its own ESC)
        const cmdPaletteOpen = document.querySelector('[cmdk-root]');
        if (!cmdPaletteOpen && activeTool !== 'home') {
          setActiveTool('home');
        }
        return;
      }

      // Number shortcuts 1-9, 0 (no modifier)
      if (!isMod && !e.altKey && !e.shiftKey && key in NUMBER_TOOL_MAP) {
        e.preventDefault();
        const toolId = NUMBER_TOOL_MAP[key];
        if (toolId) {
          setActiveTool(toolId);
        }
        return;
      }

      // ⌘/Ctrl + O → Upload / Open File
      if (isMod && key.toLowerCase() === 'o') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snap-pdf:upload'));
        return;
      }

      // ⌘/Ctrl + S → Save / Download Result
      if (isMod && key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snap-pdf:save'));
        return;
      }

      // ⌘/Ctrl + Z → Reset / Undo
      if (isMod && key.toLowerCase() === 'z') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snap-pdf:reset'));
        return;
      }

      // Delete or Backspace → Clear Files
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snap-pdf:clear'));
        return;
      }
    },
    [setActiveTool, setTheme, theme, activeTool]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

'use client';

import { useEffect, useCallback, useMemo } from 'react';
import {
  Home,
  FileText,
  Image as ImageIcon,
  QrCode,
  Search,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useAppStore, TOOLS, TOOL_CATEGORIES, type ToolId } from '@/store';
import {
  getToolIcon,
  getToolAccentBg,
  getToolAccentText,
} from '@/components/layout/Layout';

// ─── Global keyboard listener hook ───────────────────────────────
function useGlobalShortcut(
  key: string,
  callback: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key) {
        e.preventDefault();
        callback();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback, enabled]);
}

// ─── Category icon helper ─────────────────────────────────────────
function getCategoryIcon(categoryKey: string) {
  switch (categoryKey) {
    case 'pdf':
      return FileText;
    case 'image':
      return ImageIcon;
    case 'qr':
      return QrCode;
    default:
      return FileText;
  }
}

// ─── Recent tool icon ─────────────────────────────────────────────
function getToolIconSafe(iconName: string) {
  return getToolIcon(iconName);
}

// ─── Main Component ───────────────────────────────────────────────
export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    toggleCommandPalette,
    setActiveTool,
    activeTool,
    recentTools,
    trackRecentTool,
  } = useAppStore();

  // Global Cmd+K / Ctrl+K listener
  useGlobalShortcut('k', toggleCommandPalette, true);

  // Handle tool selection
  const handleSelect = useCallback(
    (toolId: ToolId) => {
      setActiveTool(toolId);
      trackRecentTool(toolId);
      setCommandPaletteOpen(false);
    },
    [setActiveTool, trackRecentTool, setCommandPaletteOpen]
  );

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const grouped: Record<string, typeof TOOLS> = {};
    TOOL_CATEGORIES.forEach((cat) => {
      grouped[cat.key] = TOOLS.filter((t) => t.category === cat.key);
    });
    return grouped;
  }, []);

  // Recent tools (excluding current and home, max 5)
  const recentToolsList = useMemo(() => {
    return recentTools
      .filter((t) => t !== 'home' && t !== activeTool)
      .slice(0, 5);
  }, [recentTools, activeTool]);

  return (
    <CommandDialog
      open={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      title="Command Palette"
      description="Search for tools and actions"
    >
      {/* Search Input */}
      <CommandInput
        placeholder="Search tools... (e.g. compress, QR, resize)"
      />

      <CommandList className="max-h-[420px]">
        <CommandEmpty>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex flex-col items-center gap-3 py-8"
          >
            <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No tools found
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Try &quot;PDF&quot;, &quot;image&quot;, &quot;QR&quot;, or &quot;compress&quot;
              </p>
            </div>
          </motion.div>
        </CommandEmpty>

        {/* Home */}
        <CommandGroup heading="Navigation">
          <CommandItem
            value="home all tools dashboard"
            onSelect={() => handleSelect('home')}
            className="gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Home className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">All Tools</p>
              <p className="text-xs text-muted-foreground">
                Go to home dashboard
              </p>
            </div>
            {activeTool === 'home' && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1.5 py-0 h-4 shrink-0"
              >
                Current
              </Badge>
            )}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Recent Tools */}
        {recentToolsList.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentToolsList.map((toolId) => {
                const tool = TOOLS.find((t) => t.id === toolId);
                if (!tool) return null;
                const ToolIcon = getToolIconSafe(tool.icon);
                return (
                  <CommandItem
                    key={`recent-${tool.id}`}
                    value={`${tool.name} ${tool.description} ${tool.keywords?.join(' ')}`}
                    onSelect={() => handleSelect(tool.id)}
                    className="gap-3"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getToolAccentBg(tool.accent)}`}
                    >
                      <ToolIcon
                        className={`h-4 w-4 ${getToolAccentText(tool.accent)}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {tool.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tool.description}
                      </p>
                    </div>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Tools by Category */}
        {TOOL_CATEGORIES.map((category) => {
          const categoryTools = toolsByCategory[category.key] || [];
          if (categoryTools.length === 0) return null;
          const CatIcon = getCategoryIcon(category.key);

          return (
            <CommandGroup
              key={category.key}
              heading={category.name}
            >
              {categoryTools.map((tool) => {
                const ToolIcon = getToolIconSafe(tool.icon);
                const isActive = activeTool === tool.id;

                return (
                  <CommandItem
                    key={tool.id}
                    value={`${tool.name} ${tool.description} ${tool.keywords?.join(' ')} ${category.name} ${tool.category}`}
                    onSelect={() => handleSelect(tool.id)}
                    className="gap-3"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getToolAccentBg(tool.accent)}`}
                    >
                      <ToolIcon
                        className={`h-4 w-4 ${getToolAccentText(tool.accent)}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`font-medium text-sm truncate ${isActive ? 'text-primary' : ''}`}
                        >
                          {tool.name}
                        </p>
                        {tool.badge && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 h-4 shrink-0"
                          >
                            {tool.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {tool.description}
                      </p>
                    </div>
                    {isActive && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 shrink-0 text-primary border-primary/30"
                      >
                        Active
                      </Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}

        <CommandSeparator />

        {/* Footer Hints */}
        <div className="px-3 py-2.5 border-t bg-muted/30">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <kbd className="inline-flex h-5 items-center gap-1 rounded-md border bg-background/80 shadow-sm px-1.5 font-mono text-[10px] font-medium">
                  <ArrowUp className="h-2.5 w-2.5" />
                  <ArrowDown className="h-2.5 w-2.5" />
                </kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="inline-flex h-5 items-center gap-1 rounded-md border bg-background/80 shadow-sm px-1.5 font-mono text-[10px] font-medium">
                  <CornerDownLeft className="h-2.5 w-2.5" />
                </kbd>
                <span>Select</span>
              </span>
            </div>
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex h-5 items-center rounded-md border bg-background/80 shadow-sm px-1.5 font-mono text-[10px] font-medium">
                ESC
              </kbd>
              <span>Close</span>
            </span>
          </div>
        </div>
      </CommandList>
    </CommandDialog>
  );
}

// ─── Trigger Button for Header ────────────────────────────────────
export function CommandPaletteTrigger() {
  const { toggleCommandPalette } = useAppStore();

  return (
    <button
      onClick={toggleCommandPalette}
      className="hidden sm:flex items-center gap-2 h-9 px-3.5 rounded-xl border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all duration-200 text-sm cursor-pointer group focus-ring-enhanced"
    >
      <Search className="h-3.5 w-3.5 group-hover:text-primary transition-colors" />
      <span className="text-xs">Search tools...</span>
      <kbd className="ml-auto inline-flex h-5 items-center rounded-md border bg-background/80 shadow-sm px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  );
}

// ─── Floating Hint for New Users ──────────────────────────────────
export function CommandPaletteHint() {
  const { toggleCommandPalette } = useAppStore();

  return (
    <button
      onClick={toggleCommandPalette}
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 focus-ring-enhanced rounded"
    >
      <Zap className="h-3.5 w-3.5 text-amber-500 icon-glow" />
      <span>
        Quick search{' '}
        <kbd className="inline-flex h-4 items-center rounded-md border bg-background/80 shadow-sm px-1 font-mono text-[9px] font-medium ml-0.5">
          ⌘K
        </kbd>
      </span>
    </button>
  );
}

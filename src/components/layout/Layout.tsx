'use client';

import { useSyncExternalStore, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import {
  Home,
  FileText,
  Image as ImageIcon,
  QrCode,
  Menu,
  Moon,
  Sun,
  Zap,
  Shield,
  Smartphone,
  ChevronDown,
  ImagePlus,
  FileImage,
  FileDown,
  Merge,
  Split,
  RotateCw,
  Scaling,
  ImageMinus,
  Crop,
  User,
  Scan,
  RefreshCw,
  Stamp,
  BarChart3,
  Search,
  Type,
  LayoutGrid,
  Pen,
  Code,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAppStore, TOOL_CATEGORIES, TOOLS } from '@/store';
import { cn } from '@/lib/utils';
import { CommandPaletteTrigger, CommandPaletteHint } from '@/components/shared/CommandPalette';
import { PwaHeaderButton, PwaFooterStatus } from '@/components/shared/PwaInstallPrompt';

export function Header() {
  const { theme, setTheme } = useTheme();
  const { activeTool, setActiveTool } = useAppStore();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <header className="sticky top-0 z-50 w-full glass-subtle border-b/50">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6 max-w-[1400px] mx-auto">
        {/* Logo with hover scale */}
        <motion.button
          onClick={() => setActiveTool('home')}
          className="flex items-center gap-2.5 focus-ring-enhanced rounded-lg p-1 -m-1"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-md">
            <Image
              src="/images/logo.png"
              alt="SnapPDF"
              width={36}
              height={36}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold leading-tight tracking-tight">SnapPDF</span>
            <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">Document Tools</span>
          </div>
        </motion.button>

        {/* Desktop Nav - Tool Categories */}
        <nav className="hidden lg:flex items-center gap-1">
          {TOOL_CATEGORIES.map((cat) => (
            <ToolCategoryDropdown key={cat.key} category={cat} />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'text-sm focus-ring-enhanced',
              activeTool === 'home' && 'bg-accent'
            )}
            onClick={() => setActiveTool('home')}
          >
            <Home className="h-4 w-4 mr-1.5" />
            All Tools
          </Button>
        </nav>

        {/* Command Palette Trigger */}
        <div className="hidden md:flex items-center gap-1">
          <PwaHeaderButton />
          <CommandPaletteTrigger />
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-full hover:bg-accent focus-ring-enhanced"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Mobile Menu */}
          <MobileMenu />
        </div>
      </div>

      {/* Animated gradient line at bottom of header */}
      <div className="section-divider" />
    </header>
  );
}

function ToolCategoryDropdown({ category }: { category: typeof TOOL_CATEGORIES[number] }) {
  const { activeTool, setActiveTool } = useAppStore();
  const categoryTools = TOOLS.filter((t) => t.category === category.key);
  const CatIcon = category.icon === 'FileText' ? FileText : category.icon === 'Image' ? ImageIcon : QrCode;
  const hasActive = categoryTools.some((t) => t.id === activeTool);

  return (
    <div className="group relative">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'text-sm gap-1.5 focus-ring-enhanced',
          hasActive && 'bg-accent font-medium'
        )}
      >
        <CatIcon className="h-4 w-4" />
        {category.name}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </Button>

      {/* Dropdown */}
      <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="w-64 bg-popover rounded-xl border shadow-xl p-2 space-y-0.5">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {category.description}
          </div>
          {categoryTools.map((tool) => {
            const ToolIcon = getToolIcon(tool.icon);
            return (
              <button
                key={tool.id}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors focus-ring-enhanced',
                  activeTool === tool.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent'
                )}
                onClick={() => setActiveTool(tool.id)}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  getToolAccentBg(tool.accent)
                )}>
                  <ToolIcon className={cn('h-4 w-4', getToolAccentText(tool.accent))} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-medium truncate">{tool.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{tool.description}</p>
                </div>
                {tool.badge && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                    {tool.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileMenu() {
  const { activeTool, setActiveTool, sidebarOpen, setSidebarOpen } = useAppStore();
  const [pulseKey, setPulseKey] = useState(0);

  const handleTriggerClick = useCallback(() => {
    setPulseKey(prev => prev + 1);
  }, []);

  return (
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden focus-ring-enhanced rounded-full"
          onClick={handleTriggerClick}
        >
          <motion.div
            key={pulseKey}
            animate={{ scale: [1, 1.18, 1] }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            <Menu className="h-5 w-5" />
          </motion.div>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0">
        <SheetHeader className="p-5 pb-0">
          <SheetTitle className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-xl overflow-hidden shadow-sm">
              <Image
                src="/images/logo.png"
                alt="SnapPDF"
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-bold">SnapPDF</span>
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pt-4 pb-2">
          <Button
            variant={activeTool === 'home' ? 'secondary' : 'ghost'}
            className="w-full justify-start mb-4 focus-ring-enhanced"
            onClick={() => { setActiveTool('home'); setSidebarOpen(false); }}
          >
            <Home className="h-4 w-4 mr-2" />
            All Tools
          </Button>
        </div>
        <div className="px-4 overflow-y-auto max-h-[calc(100vh-8rem)] custom-scrollbar">
          {TOOL_CATEGORIES.map((category) => {
            const CatIcon = category.icon === 'FileText' ? FileText : category.icon === 'Image' ? ImageIcon : QrCode;
            const categoryTools = TOOLS.filter((t) => t.category === category.key);
            return (
              <div key={category.key} className="mb-5">
                {/* Category header with separator */}
                <div className="flex items-center gap-2 px-3 mb-2.5">
                  <div className="section-divider flex-1" />
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                    <CatIcon className="h-3.5 w-3.5" />
                    {category.name}
                  </div>
                  <div className="section-divider flex-1" />
                </div>
                <div className="space-y-0.5">
                  {categoryTools.map((tool, index) => {
                    const ToolIcon = getToolIcon(tool.icon);
                    return (
                      <motion.button
                        key={tool.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: 0.03 * index }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 focus-ring-enhanced',
                          activeTool === tool.id
                            ? 'bg-primary/10 text-primary font-medium shadow-sm shadow-primary/5'
                            : 'hover:bg-accent'
                        )}
                        onClick={() => { setActiveTool(tool.id); setSidebarOpen(false); }}
                      >
                        <div className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                          getToolAccentBg(tool.accent)
                        )}>
                          <ToolIcon className={cn('h-3.5 w-3.5', getToolAccentText(tool.accent))} />
                        </div>
                        <span className="truncate">{tool.name}</span>
                        {tool.badge && (
                          <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4">
                            {tool.badge}
                          </Badge>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Trust indicators */}
          <div className="pt-5 mt-2 space-y-4 px-3">
            <div className="section-divider mb-4" />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400 icon-glow" />
              </div>
              <div>
                <p className="font-medium text-foreground">100% Private</p>
                <p className="text-[11px]">Your files stay on your device</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 icon-glow" />
              </div>
              <div>
                <p className="font-medium text-foreground">Lightning Fast</p>
                <p className="text-[11px]">Instant processing, no uploads</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400 icon-glow" />
              </div>
              <div>
                <p className="font-medium text-foreground">Works Everywhere</p>
                <p className="text-[11px]">Desktop, tablet, and mobile</p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DesktopSidebar() {
  const { activeTool, setActiveTool } = useAppStore();

  return (
    <aside className="hidden xl:block w-[220px] shrink-0 border-r bg-card/50">
      <div className="relative">
        <nav className="sticky top-16 p-3 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar">
          <Button
            variant={activeTool === 'home' ? 'secondary' : 'ghost'}
            className="w-full justify-start mb-3 focus-ring-enhanced"
            onClick={() => setActiveTool('home')}
          >
            <Home className="h-4 w-4 mr-2" />
            All Tools
          </Button>

          {TOOL_CATEGORIES.map((category) => {
            const CatIcon = category.icon === 'FileText' ? FileText : category.icon === 'Image' ? ImageIcon : QrCode;
            const categoryTools = TOOLS.filter((t) => t.category === category.key);
            return (
              <div key={category.key} className="mb-3">
                {/* Category header with subtle separator */}
                <div className="flex items-center gap-2 px-3 mb-2">
                  <div className="section-divider flex-1" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                    {category.name}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {categoryTools.map((tool) => {
                    const ToolIcon = getToolIcon(tool.icon);
                    const isActive = activeTool === tool.id;
                    return (
                      <button
                        key={tool.id}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 focus-ring-enhanced relative',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium sidebar-active-indicator'
                            : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                        )}
                        onClick={() => setActiveTool(tool.id)}
                      >
                        <ToolIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{tool.name}</span>
                        {tool.badge && (
                          <Badge variant="secondary" className="ml-auto text-[8px] px-1 py-0 h-3">
                            {tool.badge}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Scroll fade indicator at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card/50 to-transparent pointer-events-none" />
      </div>
    </aside>
  );
}

export function Footer() {
  const { setActiveTool } = useAppStore();

  const pdfTools = TOOLS.filter(t => t.category === 'pdf');
  const imageTools = TOOLS.filter(t => t.category === 'image');
  const qrTools = TOOLS.filter(t => t.category === 'qr');

  return (
    <footer className="border-t bg-card/50 mt-auto glass-card">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
        {/* Main Footer */}
        <div className="py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="relative w-8 h-8 rounded-xl overflow-hidden shadow-sm">
                <Image src="/images/logo.png" alt="SnapPDF" width={32} height={32} className="w-full h-full object-cover" />
              </div>
              <span className="font-bold text-lg">SnapPDF</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              India&apos;s #1 free document utility. Fast, private, and works on every device.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              <span>Privacy First</span>
              <span className="text-border">|</span>
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span>No Login</span>
            </div>
          </div>

          {/* PDF Tools */}
          <div>
            <h4 className="font-semibold text-sm mb-3">PDF Tools</h4>
            <ul className="space-y-2">
              {pdfTools.map(tool => (
                <li key={tool.id}>
                  <FooterLink toolName={tool.name} onClick={() => setActiveTool(tool.id)} />
                </li>
              ))}
            </ul>
          </div>

          {/* Image Tools */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Image Tools</h4>
            <ul className="space-y-2">
              {imageTools.map(tool => (
                <li key={tool.id}>
                  <FooterLink toolName={tool.name} onClick={() => setActiveTool(tool.id)} />
                </li>
              ))}
            </ul>
          </div>

          {/* QR Tools + Info */}
          <div>
            <h4 className="font-semibold text-sm mb-3">QR Tools</h4>
            <ul className="space-y-2">
              {qrTools.map(tool => (
                <li key={tool.id}>
                  <FooterLink toolName={tool.name} onClick={() => setActiveTool(tool.id)} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Gradient divider above bottom bar */}
        <div className="section-divider" />

        {/* Bottom Bar */}
        <div className="py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="bg-primary/5 text-foreground/80 px-3 py-1 rounded-full font-medium">
              &copy; 2025 SnapPDF. Made with ❤️ in India.
            </span>
            <div className="hidden sm:flex items-center gap-3">
              <CommandPaletteHint />
              <PwaFooterStatus />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-muted/50 px-2.5 py-1 rounded-full">Free to use</span>
            <span className="bg-muted/50 px-2.5 py-1 rounded-full">No watermarks</span>
            <span className="bg-muted/50 px-2.5 py-1 rounded-full">Works offline</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Footer link with animated underline on hover */
function FooterLink({ toolName, onClick }: { toolName: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 focus-ring-enhanced rounded px-0.5 py-0.5"
    >
      {toolName}
      <span className="absolute bottom-0 left-0 h-px w-0 bg-foreground/40 group-hover:w-full transition-[width] duration-300 ease-out" />
    </button>
  );
}

// === Icon Helpers ===
const TOOL_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ImagePlus, FileImage, FileDown, Merge, Split, RotateCw, Scaling, ImageMinus, Crop, User, QrCode, Scan, RefreshCw, Stamp, BarChart3, Type, LayoutGrid, Pen, Code,
};

export function getToolIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return TOOL_ICON_MAP[iconName] || FileDown;
}

export function getToolAccentBg(accent: string): string {
  const map: Record<string, string> = {
    blue: 'bg-blue-500/10',
    emerald: 'bg-emerald-500/10',
    amber: 'bg-amber-500/10',
    rose: 'bg-rose-500/10',
    violet: 'bg-violet-500/10',
    teal: 'bg-teal-500/10',
  };
  return map[accent] || 'bg-primary/10';
}

export function getToolAccentText(accent: string): string {
  const map: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    violet: 'text-violet-600 dark:text-violet-400',
    teal: 'text-teal-600 dark:text-teal-400',
  };
  return map[accent] || 'text-primary';
}

export function getToolAccentBorder(accent: string): string {
  const map: Record<string, string> = {
    blue: 'border-blue-500/20 hover:border-blue-500/40',
    emerald: 'border-emerald-500/20 hover:border-emerald-500/40',
    amber: 'border-amber-500/20 hover:border-amber-500/40',
    rose: 'border-rose-500/20 hover:border-rose-500/40',
    violet: 'border-violet-500/20 hover:border-violet-500/40',
    teal: 'border-teal-500/20 hover:border-teal-500/40',
  };
  return map[accent] || 'border-primary/20 hover:border-primary/40';
}

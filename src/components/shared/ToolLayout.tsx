'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Home, ChevronRight, ImagePlus, FileImage, FileDown, Merge, Split, RotateCw, Scaling, ImageMinus, Crop, User, QrCode, Scan, RefreshCw, Stamp, BarChart3, Type, LayoutGrid, Pen, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore, TOOLS } from '@/store';
import { getToolAccentBg, getToolAccentText } from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

const TOOL_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ImagePlus, FileImage, FileDown, Merge, Split, RotateCw, Scaling, ImageMinus, Crop, User, QrCode, Scan, RefreshCw, Stamp, BarChart3, Type, LayoutGrid, Pen, Code,
};

interface ToolLayoutProps {
  title: string;
  description: string;
  toolId?: string;
  children: React.ReactNode;
}

export function ToolLayout({ title, description, toolId, children }: ToolLayoutProps) {
  const { setActiveTool } = useAppStore();
  const tool = toolId ? TOOLS.find(t => t.id === toolId) : null;
  const IconComponent = tool ? TOOL_ICON_MAP[tool.icon] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto px-4 py-6"
    >
      {/* Breadcrumb with animated chevron separator */}
      <div className="mb-6 animate-fade-in-up">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <button
            onClick={() => setActiveTool('home')}
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </button>
          {tool && (
            <>
              <motion.div
                animate={{ rotate: 0 }}
                className="text-border"
              >
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              </motion.div>
              <span className="text-foreground font-medium">{tool.name}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTool('home')}
            className="shrink-0 rounded-lg magnetic-btn"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>

          {IconComponent && tool && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
              className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', getToolAccentBg(tool.accent))}
            >
              <IconComponent className={cn('h-5 w-5 icon-glow', getToolAccentText(tool.accent))} />
            </motion.div>
          )}

          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold truncate animate-fade-in-up-delay-1">{title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate animate-fade-in-up-delay-2">{description}</p>
          </div>
        </div>
      </div>

      {/* Section divider */}
      <div className="section-divider mb-6" />

      {/* Children wrapper with delayed animation */}
      <div className="space-y-6 animate-fade-in-up-delay-3">{children}</div>
    </motion.div>
  );
}

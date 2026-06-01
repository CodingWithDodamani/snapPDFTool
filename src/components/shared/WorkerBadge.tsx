'use client';

import { Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/**
 * WorkerBadge — Shows a small green indicator when a Web Worker is active.
 * Displayed in tool settings to inform users that heavy processing happens off the main thread.
 */
export function WorkerBadge({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className="text-[10px] gap-1 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 cursor-default select-none"
        >
          <Cpu className="h-3 w-3" />
          Worker Active
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">Heavy processing runs in a background Web Worker — your UI stays responsive.</p>
      </TooltipContent>
    </Tooltip>
  );
}

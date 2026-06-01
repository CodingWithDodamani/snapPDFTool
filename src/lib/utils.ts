import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function parsePageRange(input: string, maxPage: number): number[] {
  const pages = new Set<number>();
  const parts = input.split(',').map((s) => s.trim());
  for (const part of parts) {
    if (part.includes('-')) {
      const dashIndex = part.indexOf('-');
      const startStr = part.slice(0, dashIndex).trim();
      const endStr = part.slice(dashIndex + 1).trim();
      const start = parseInt(startStr);
      let end: number;
      if (endStr.toLowerCase() === 'end' || endStr.toLowerCase() === 'last') {
        end = maxPage;
      } else {
        end = parseInt(endStr);
      }
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(maxPage, end); i++) {
          pages.add(i);
        }
      }
    } else {
      const num = parseInt(part);
      if (!isNaN(num) && num >= 1 && num <= maxPage) {
        pages.add(num);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

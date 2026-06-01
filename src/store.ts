import { create } from 'zustand';

// === Types ===
export type ToolId =
  | 'home'
  | 'image-to-pdf'
  | 'pdf-to-image'
  | 'compress-pdf'
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf'
  | 'watermark-pdf'
  | 'image-resize'
  | 'image-compress'
  | 'image-format-convert'
  | 'image-crop-rotate'
  | 'passport-photo'
  | 'qr-generator'
  | 'qr-scanner'
  | 'size-compare'
  | 'pdf-to-text'
  | 'page-organizer'
  | 'sign-pdf'
  | 'image-to-base64'
  | 'markdown-to-pdf';

export type ToolAccent = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'teal';

export interface Tool {
  id: ToolId;
  name: string;
  description: string;
  longDescription?: string;
  icon: string;
  category: 'pdf' | 'image' | 'qr';
  accent: ToolAccent;
  badge?: string;
  keywords?: string[];
}

export interface ToolCategory {
  key: string;
  name: string;
  description: string;
  icon: string;
  accent: ToolAccent;
}

export interface RecentFile {
  id: string;
  name: string;
  type: string;
  tool: string;
  size: string;
  timestamp: number;
}

// === Tool Categories ===
export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    key: 'pdf',
    name: 'PDF Tools',
    description: 'Convert, compress, merge & edit PDFs',
    icon: 'FileText',
    accent: 'blue',
  },
  {
    key: 'image',
    name: 'Image Tools',
    description: 'Resize, compress, crop & enhance images',
    icon: 'Image',
    accent: 'emerald',
  },
  {
    key: 'qr',
    name: 'QR Tools',
    description: 'Generate & scan QR codes',
    icon: 'QrCode',
    accent: 'violet',
  },
];

// === Tools List ===
export const TOOLS: Tool[] = [
  // PDF Tools
  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    description: 'Convert PDF pages to images',
    longDescription: 'Convert every page of a PDF into high-quality JPG, PNG, or WebP images. Perfect for extracting photos, creating presentations, or sharing individual pages.',
    icon: 'FileImage',
    category: 'pdf',
    accent: 'teal',
    badge: 'New',
    keywords: ['PDF to JPG', 'PDF to PNG', 'Extract images'],
  },
  {
    id: 'watermark-pdf',
    name: 'Watermark PDF',
    description: 'Add text or image watermarks',
    longDescription: 'Stamp PDF pages with custom text (Draft, Confidential, etc.) or logo watermarks. Control opacity, position, rotation, and tiling.',
    icon: 'Stamp',
    category: 'pdf',
    accent: 'rose',
    badge: 'New',
    keywords: ['Stamp', 'Brand', 'Draft', 'Confidential'],
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    description: 'Convert images to PDF',
    longDescription: 'Combine multiple images (JPG, PNG, WebP) into a single PDF document. Perfect for creating multi-page documents from photos.',
    icon: 'ImagePlus',
    category: 'pdf',
    accent: 'blue',
    badge: 'Popular',
    keywords: ['JPG to PDF', 'PNG to PDF', 'Images to PDF'],
  },
  {
    id: 'compress-pdf',
    name: 'Compress PDF',
    description: 'Reduce PDF file size',
    longDescription: 'Compress PDF files to exact sizes like 100KB, 200KB, 500KB — ideal for government form submissions, email attachments, and uploads.',
    icon: 'FileDown',
    category: 'pdf',
    accent: 'blue',
    badge: 'Popular',
    keywords: ['200KB', '100KB', 'Reduce size'],
  },
  {
    id: 'merge-pdf',
    name: 'Merge PDFs',
    description: 'Combine multiple PDFs into one',
    longDescription: 'Merge two or more PDF files into a single document. Reorder pages and create a combined file in seconds.',
    icon: 'Merge',
    category: 'pdf',
    accent: 'emerald',
    keywords: ['Combine', 'Join PDFs'],
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    description: 'Extract pages from PDF',
    longDescription: 'Split a PDF into individual pages or extract specific page ranges. Get exactly the pages you need.',
    icon: 'Split',
    category: 'pdf',
    accent: 'amber',
    keywords: ['Extract pages', 'Separate'],
  },
  {
    id: 'rotate-pdf',
    name: 'Rotate PDF',
    description: 'Rotate PDF pages easily',
    longDescription: 'Rotate all or specific pages in a PDF by 90°, 180°, or 270°. Fix scanned documents that came out sideways.',
    icon: 'RotateCw',
    category: 'pdf',
    accent: 'violet',
    keywords: ['Fix orientation', 'Pages'],
  },
  {
    id: 'size-compare',
    name: 'Size Compare',
    description: 'Compare file sizes visually',
    longDescription: 'Upload multiple files and compare their sizes side-by-side with animated bars, savings calculator, and size requirement checker. Perfect for checking government portal limits.',
    icon: 'BarChart3',
    category: 'pdf',
    accent: 'amber',
    badge: 'New',
    keywords: ['Compare', 'File size', 'Size check', 'Before after', 'Savings'],
  },
  // Image Tools
  {
    id: 'image-resize',
    name: 'Resize Image',
    description: 'Resize to exact dimensions or KB',
    longDescription: 'Resize images to exact pixel dimensions or target file size (20KB, 50KB, 100KB). Perfect for form photos and signatures.',
    icon: 'Scaling',
    category: 'image',
    accent: 'amber',
    badge: 'India',
    keywords: ['Form size', '20KB', '50KB'],
  },
  {
    id: 'image-compress',
    name: 'Compress Image',
    description: 'Reduce image file size',
    longDescription: 'Compress JPG, PNG, and WebP images while maintaining visual quality. Reduce file sizes by up to 90%.',
    icon: 'ImageMinus',
    category: 'image',
    accent: 'emerald',
    keywords: ['Reduce size', 'Optimize'],
  },
  {
    id: 'image-format-convert',
    name: 'Format Convert',
    description: 'Convert image formats',
    longDescription: 'Convert images between JPG, PNG, WebP, and BMP formats instantly. Batch convert multiple images at once with quality control.',
    icon: 'RefreshCw',
    category: 'image',
    accent: 'violet',
    badge: 'New',
    keywords: ['JPG to PNG', 'PNG to WebP', 'Image convert'],
  },
  {
    id: 'image-crop-rotate',
    name: 'Crop & Rotate',
    description: 'Crop and rotate images',
    longDescription: 'Crop images to custom aspect ratios or free-form shapes. Rotate and flip images with precision.',
    icon: 'Crop',
    category: 'image',
    accent: 'teal',
    keywords: ['Aspect ratio', 'Flip'],
  },
  {
    id: 'passport-photo',
    name: 'Passport Photo Maker',
    description: 'Create passport & ID photos',
    longDescription: 'Generate passport-size photos meeting Indian standards (Aadhaar, PAN, Passport). Custom backgrounds and sizes included.',
    icon: 'User',
    category: 'image',
    accent: 'rose',
    badge: 'India',
    keywords: ['Aadhaar', 'PAN', 'Passport'],
  },
  // QR Tools
  {
    id: 'qr-generator',
    name: 'QR Generator',
    description: 'Generate QR codes from text/URL',
    longDescription: 'Create QR codes from any text, URL, email, phone number, or WiFi credentials. Customize colors and download as image.',
    icon: 'QrCode',
    category: 'qr',
    accent: 'violet',
    keywords: ['Create', 'URL to QR'],
  },
  {
    id: 'qr-scanner',
    name: 'QR Scanner',
    description: 'Scan QR codes from images',
    longDescription: 'Scan and decode QR codes from uploaded images. Extract URLs, text, vCards, and other encoded data instantly.',
    icon: 'Scan',
    category: 'qr',
    accent: 'teal',
    keywords: ['Decode', 'Read QR'],
  },
  // New Tools
  {
    id: 'pdf-to-text',
    name: 'PDF to Text',
    description: 'Extract text from PDFs',
    longDescription: 'Extract all text content from PDF files instantly. Search, copy, and download text page by page or as a single document.',
    icon: 'Type',
    category: 'pdf',
    accent: 'teal',
    badge: 'New',
    keywords: ['Extract text', 'Copy text', 'PDF text'],
  },
  {
    id: 'page-organizer',
    name: 'Page Organizer',
    description: 'Reorder & organize PDF pages',
    longDescription: 'Drag and drop to reorder, delete, rotate, or extract pages from any PDF. Visual thumbnail grid makes it easy to organize.',
    icon: 'LayoutGrid',
    category: 'pdf',
    accent: 'amber',
    badge: 'New',
    keywords: ['Reorder', 'Delete pages', 'Organize'],
  },
  {
    id: 'sign-pdf',
    name: 'Sign PDF',
    description: 'Draw & place signatures on PDFs',
    longDescription: 'Draw your signature with mouse or touch, type it, or upload an image. Place it anywhere on any PDF page and download.',
    icon: 'Pen',
    category: 'pdf',
    accent: 'rose',
    badge: 'New',
    keywords: ['Signature', 'Sign', 'e-sign', 'Initials'],
  },
  {
    id: 'image-to-base64',
    name: 'Image to Base64',
    description: 'Convert images to Base64',
    longDescription: 'Encode images to Base64 strings or decode Base64 back to images. Perfect for web development, embedding, and data URIs.',
    icon: 'Code',
    category: 'image',
    accent: 'violet',
    badge: 'New',
    keywords: ['Encode', 'Decode', 'Data URI'],
  },
  {
    id: 'markdown-to-pdf',
    name: 'Markdown to PDF',
    description: 'Convert Markdown to PDF',
    longDescription: 'Write or upload Markdown text and convert it to a beautifully formatted PDF document with headings, bold, lists, and code blocks.',
    icon: 'FileText',
    category: 'pdf',
    accent: 'emerald',
    badge: 'New',
    keywords: ['MD to PDF', 'Convert', 'Document'],
  },
];

// === Processing History ===
export interface ProcessingEntry {
  id: string;
  toolId: ToolId;
  toolName: string;
  inputFileName: string;
  outputFileName: string;
  inputSize: number;
  outputSize: number;
  savingsPercent: number;
  timestamp: number;
}

const HISTORY_STORAGE_KEY = 'snappdf-processing-history';
const MAX_HISTORY_ENTRIES = 50;

function loadHistory(): ProcessingEntry[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveHistory(entries: ProcessingEntry[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

/** Helper: record a processing event. Call from any tool after download. */
export function recordProcessing(
  toolId: ToolId,
  toolName: string,
  inputName: string,
  outputName: string,
  inputSize: number,
  outputSize: number,
) {
  const savingsPercent = inputSize > 0
    ? Math.round(((inputSize - outputSize) / inputSize) * 100)
    : 0;
  const entry: ProcessingEntry = {
    id: crypto.randomUUID(),
    toolId,
    toolName,
    inputFileName: inputName,
    outputFileName: outputName,
    inputSize,
    outputSize,
    savingsPercent,
    timestamp: Date.now(),
  };
  useAppStore.getState().addHistoryEntry(entry);
}

// === Zustand Store ===
interface AppState {
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  recentTools: ToolId[];
  trackRecentTool: (tool: ToolId) => void;
  recentFiles: RecentFile[];
  addRecentFile: (file: RecentFile) => void;
  clearRecentFiles: () => void;
  history: ProcessingEntry[];
  addHistoryEntry: (entry: ProcessingEntry) => void;
  clearHistory: () => void;
  removeHistoryEntry: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTool: 'home',
  setActiveTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      commandPaletteOpen: false,
      sidebarOpen: false,
    })),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  recentTools: [],
  trackRecentTool: (tool) =>
    set((state) => ({
      recentTools: [
        tool,
        ...state.recentTools.filter((t) => t !== tool),
      ].slice(0, 5),
    })),
  recentFiles: [],
  addRecentFile: (file) =>
    set((state) => ({
      recentFiles: [file, ...state.recentFiles].slice(0, 20),
    })),
  clearRecentFiles: () => set({ recentFiles: [] }),
  history: loadHistory(),
  addHistoryEntry: (entry) =>
    set((state) => {
      const updated = [entry, ...state.history].slice(0, MAX_HISTORY_ENTRIES);
      saveHistory(updated);
      return { history: updated };
    }),
  clearHistory: () => {
    saveHistory([]);
    set({ history: [] });
  },
  removeHistoryEntry: (id) =>
    set((state) => {
      const updated = state.history.filter((e) => e.id !== id);
      saveHistory(updated);
      return { history: updated };
    }),
}));

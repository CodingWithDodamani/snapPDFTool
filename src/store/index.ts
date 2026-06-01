import { create } from 'zustand';

export type ToolId =
  | 'home'
  | 'image-to-pdf'
  | 'compress-pdf'
  | 'merge-pdf'
  | 'split-pdf'
  | 'image-resize'
  | 'image-compress'
  | 'image-crop-rotate'
  | 'passport-photo'
  | 'qr-generator'
  | 'qr-scanner'
  | 'rotate-pdf';

export type ToolAccent = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'teal';

export interface ToolInfo {
  id: ToolId;
  name: string;
  description: string;
  longDescription?: string;
  icon: string;
  category: 'pdf' | 'image' | 'qr';
  badge?: string;
  accent: ToolAccent;
  keywords?: string[];
}

export const TOOLS: ToolInfo[] = [
  { id: 'image-to-pdf', name: 'Image to PDF', description: 'Convert JPG/PNG to PDF instantly', longDescription: 'Transform multiple images into a single, professional PDF document with custom quality settings and page orientations.', icon: 'ImagePlus', category: 'pdf', badge: 'Popular', accent: 'blue', keywords: ['jpg to pdf', 'png to pdf', 'image to document'] },
  { id: 'compress-pdf', name: 'Compress PDF', description: 'Reduce PDF to exact KB/MB size', longDescription: 'Smart compression engine that accurately targets file sizes — 100KB, 200KB, 500KB, 1MB or any custom size.', icon: 'FileDown', category: 'pdf', badge: 'Popular', accent: 'emerald', keywords: ['reduce pdf', 'pdf below 200kb', 'compress pdf'] },
  { id: 'merge-pdf', name: 'Merge PDFs', description: 'Combine multiple PDFs into one', longDescription: 'Seamlessly merge multiple PDF documents into a single file. Drag to reorder and combine.', icon: 'Merge', category: 'pdf', accent: 'violet', keywords: ['combine pdf', 'join pdf'] },
  { id: 'split-pdf', name: 'Split PDF', description: 'Extract pages from PDF', longDescription: 'Split any PDF into individual pages or extract specific page ranges with precision.', icon: 'Split', category: 'pdf', accent: 'amber', keywords: ['extract pages', 'separate pdf'] },
  { id: 'rotate-pdf', name: 'Rotate PDF', description: 'Rotate PDF pages easily', longDescription: 'Rotate all or specific pages in your PDF by 90°, 180°, or 270°.', icon: 'RotateCw', category: 'pdf', accent: 'teal', keywords: ['rotate pages', 'fix orientation'] },
  { id: 'image-resize', name: 'Resize Image', description: 'Resize to exact KB or pixels', longDescription: 'Resize images for government forms, passports, signatures — with presets for 20KB, 50KB, 100KB.', icon: 'Scaling', category: 'image', badge: 'Popular', accent: 'blue', keywords: ['resize for form', 'image below 50kb', 'resize photo'] },
  { id: 'image-compress', name: 'Compress Image', description: 'Reduce image file size', longDescription: 'Compress images with real-time quality preview while maintaining visual clarity.', icon: 'ImageMinus', category: 'image', accent: 'emerald', keywords: ['reduce image size', 'optimize image'] },
  { id: 'image-crop-rotate', name: 'Crop & Rotate', description: 'Crop and rotate images', longDescription: 'Interactive image editor with crop, rotate, and flip — perfect for quick edits.', icon: 'Crop', category: 'image', accent: 'amber', keywords: ['crop photo', 'rotate image', 'flip'] },
  { id: 'passport-photo', name: 'Passport Photo', description: 'Create passport-size photos', longDescription: 'Generate perfectly sized photos for Indian documents — Passport, Aadhaar, PAN Card, and Government forms.', icon: 'User', category: 'image', badge: 'India', accent: 'rose', keywords: ['passport photo', 'aadhaar photo', 'pan card photo'] },
  { id: 'qr-generator', name: 'QR Generator', description: 'Create QR codes instantly', longDescription: 'Generate QR codes for URLs, WiFi, UPI payments, contact cards (vCard) with custom colors and sizes.', icon: 'QrCode', category: 'qr', accent: 'violet', keywords: ['create qr', 'upi qr', 'wifi qr'] },
  { id: 'qr-scanner', name: 'QR Scanner', description: 'Scan and read QR codes', longDescription: 'Scan QR codes using your camera or upload an image. Supports URLs, text, WiFi, and more.', icon: 'Scan', category: 'qr', accent: 'teal', keywords: ['read qr', 'scan code'] },
];

export const TOOL_CATEGORIES = [
  { key: 'pdf' as const, name: 'PDF Tools', description: 'Convert, compress & edit PDFs', icon: 'FileText', accent: 'blue' as ToolAccent },
  { key: 'image' as const, name: 'Image Tools', description: 'Resize, compress & edit images', icon: 'Image', accent: 'emerald' as ToolAccent },
  { key: 'qr' as const, name: 'QR Tools', description: 'Generate & scan QR codes', icon: 'QrCode', accent: 'violet' as ToolAccent },
] as const;

interface AppStore {
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;
  recentFiles: RecentFile[];
  addRecentFile: (file: RecentFile) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export interface RecentFile {
  id: string;
  name: string;
  type: string;
  tool: ToolId;
  size: string;
  timestamp: number;
}

export const useAppStore = create<AppStore>((set) => ({
  activeTool: 'home',
  setActiveTool: (tool) => set({ activeTool: tool }),
  recentFiles: [],
  addRecentFile: (file) =>
    set((state) => ({
      recentFiles: [file, ...state.recentFiles].slice(0, 10),
    })),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

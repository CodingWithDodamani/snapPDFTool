'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pen,
  Eraser,
  Undo2,
  Download,
  Trash2,
  FileText,
  Loader2,
  Type,
  MousePointer,
  ImagePlus,
  ZoomIn,
  Stamp,
  Palette,
  Settings2,
  Upload,
  X,
  Check,
  Eye,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { useToast } from '@/hooks/use-toast';
import { formatSize } from '@/lib/utils';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';

/* ─── Types ─── */
type SignatureMode = 'draw' | 'type' | 'upload';
type PageScope = 'all' | 'specific' | 'odd' | 'even';
type PlacementPreset = 'bottom-right' | 'bottom-left' | 'bottom-center' | 'top-right' | 'top-left' | 'top-center' | 'center';

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

const PEN_COLORS = [
  { label: 'Black', value: '#000000' },
  { label: 'Blue', value: '#1a56db' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Custom', value: 'custom' },
];

const PLACEMENT_PRESETS: { value: PlacementPreset; label: string; icon: string }[] = [
  { value: 'bottom-right', label: 'Bottom Right', icon: '↘' },
  { value: 'bottom-left', label: 'Bottom Left', icon: '↙' },
  { value: 'bottom-center', label: 'Bottom Center', icon: '↓' },
  { value: 'top-right', label: 'Top Right', icon: '↗' },
  { value: 'top-left', label: 'Top Left', icon: '↖' },
  { value: 'top-center', label: 'Top Center', icon: '↑' },
  { value: 'center', label: 'Center', icon: '⊕' },
];

/* ─── Helpers ─── */
async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  return pdfjsLib;
}

async function generateThumbnails(buffer: ArrayBuffer, maxPages: number): Promise<string[]> {
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
  const count = Math.min(pdf.numPages, maxPages);
  const thumbs: string[] = [];
  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.4 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    thumbs.push(canvas.toDataURL('image/png'));
  }
  return thumbs;
}

function dataURLtoUint8Array(dataURL: string): Uint8Array {
  const binaryString = atob(dataURL.split(',')[1]);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Render type signature text onto a canvas with cursive styling
function renderTypeSignature(text: string, color: string, fontSize: number): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `italic ${fontSize}px "Georgia", "Palatino", cursive, serif`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;
  canvas.width = Math.ceil(textWidth + 40);
  canvas.height = Math.ceil(textHeight + 20);

  const ctx2 = canvas.getContext('2d')!;
  ctx2.font = `italic ${fontSize}px "Georgia", "Palatino", cursive, serif`;
  ctx2.fillStyle = color;
  ctx2.textBaseline = 'middle';
  ctx2.fillText(text, 20, canvas.height / 2);
  return canvas.toDataURL('image/png');
}

// Get placement coordinates (normalized 0-1) from preset
function getPresetCoords(preset: PlacementPreset, sizeRatio: number): { nx: number; ny: number } {
  const pad = 0.04;
  switch (preset) {
    case 'bottom-right': return { nx: 1 - pad - sizeRatio, ny: pad };
    case 'bottom-left': return { nx: pad, ny: pad };
    case 'bottom-center': return { nx: (1 - sizeRatio) / 2, ny: pad };
    case 'top-right': return { nx: 1 - pad - sizeRatio, ny: 1 - pad - sizeRatio * 0.3 };
    case 'top-left': return { nx: pad, ny: 1 - pad - sizeRatio * 0.3 };
    case 'top-center': return { nx: (1 - sizeRatio) / 2, ny: 1 - pad - sizeRatio * 0.3 };
    case 'center': return { nx: (1 - sizeRatio) / 2, ny: (1 - sizeRatio * 0.3) / 2 };
  }
}

// Render signature overlay on a thumbnail for live preview
function renderSignaturePreview(
  thumbDataUrl: string,
  signatureDataUrl: string,
  placement: { nx: number; ny: number },
  sizePercent: number,
  isAffected: boolean,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      if (isAffected && signatureDataUrl) {
        const sigImg = new Image();
        sigImg.onload = () => {
          const sigWidth = canvas.width * (sizePercent / 100);
          const sigHeight = sigImg.height * (sigWidth / sigImg.width);
          const x = placement.nx * canvas.width;
          const y = placement.ny * canvas.height;
          ctx.drawImage(sigImg, x, y, sigWidth, sigHeight);
          resolve(canvas.toDataURL('image/png'));
        };
        sigImg.onerror = () => resolve(thumbDataUrl);
        sigImg.src = signatureDataUrl;
      } else {
        resolve(canvas.toDataURL('image/png'));
      }
    };
    img.onerror = () => resolve('');
    img.src = thumbDataUrl;
  });
}

/* ─── Signature Canvas Component ─── */
interface SignatureCanvasProps {
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
  penColor: string;
  penWidth: number;
  canvasWidth: number;
  canvasHeight: number;
}

function SignatureCanvas({ strokes, setStrokes, penColor, penWidth, canvasWidth, canvasHeight }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentStrokeRef = useRef<Stroke>({ points: [], color: penColor, width: penWidth });
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Redraw all strokes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw dotted border area
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    ctx.setLineDash([]);

    // Draw baseline
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, canvas.height - 30);
    ctx.lineTo(canvas.width - 30, canvas.height - 30);
    ctx.stroke();

    // Draw "x" mark
    ctx.fillStyle = '#d1d5db';
    ctx.font = '20px serif';
    ctx.fillText('×', 20, canvas.height - 22);

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const midX = (stroke.points[i - 1].x + stroke.points[i].x) / 2;
        const midY = (stroke.points[i - 1].y + stroke.points[i].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i - 1].x, stroke.points[i - 1].y, midX, midY);
      }
      ctx.stroke();
    }
  }, [strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getPointerPos = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPointerPos(e);
    currentStrokeRef.current = { points: [pos], color: penColor, width: penWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [penColor, penWidth, getPointerPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    setCursorPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    if (!isDrawing) return;
    e.preventDefault();
    currentStrokeRef.current.points.push(pos);

    // Draw current stroke segment in real-time
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pts = currentStrokeRef.current.points;
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = currentStrokeRef.current.color;
    ctx.lineWidth = currentStrokeRef.current.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const prev = pts[pts.length - 2];
    const curr = pts[pts.length - 1];
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
  }, [getPointerPos, isDrawing]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStrokeRef.current.points.length > 1) {
      setStrokes((prev) => [...prev, { ...currentStrokeRef.current }]);
    }
    currentStrokeRef.current = { points: [], color: penColor, width: penWidth };
  }, [isDrawing, penColor, penWidth, setStrokes]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full rounded-xl border-2 border-dashed border-muted-foreground/25 bg-[#fafafa] dark:bg-[#1a1a1a] touch-none cursor-crosshair"
        style={{ aspectRatio: `${canvasWidth}/${canvasHeight}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setCursorPos(null);
          handlePointerUp();
        }}
      />
      {/* Cursor indicator dot */}
      {cursorPos && !isDrawing && (
        <div
          className="absolute pointer-events-none rounded-full border-2 border-primary/60 bg-primary/20"
          style={{
            width: Math.max(penWidth, 4),
            height: Math.max(penWidth, 4),
            left: cursorPos.x - Math.max(penWidth, 4) / 2,
            top: cursorPos.y - Math.max(penWidth, 4) / 2,
          }}
        />
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export function SignPdf() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  // ─── File State ───
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbLoading, setThumbLoading] = useState(false);

  // ─── Signature Mode ───
  const [sigMode, setSigMode] = useState<SignatureMode>('draw');

  // Draw mode state
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [penColor, setPenColor] = useState('#000000');
  const [customPenColor, setCustomPenColor] = useState('#1a56db');
  const [penWidth, setPenWidth] = useState(2);

  // Type mode state
  const [typeText, setTypeText] = useState('');
  const [typeFontSize, setTypeFontSize] = useState(48);

  // Upload mode state
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);

  // ─── Signature Image (generated from any mode) ───
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ─── Page Selection ───
  const [pageScope, setPageScope] = useState<PageScope>('all');
  const [pageRange, setPageRange] = useState('');
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  // ─── Placement ───
  const [placementPreset, setPlacementPreset] = useState<PlacementPreset>('bottom-right');
  const [customPlacement, setCustomPlacement] = useState<{ nx: number; ny: number } | null>(null);
  const [signatureSize, setSignatureSize] = useState(25);
  const [isPlacingMode, setIsPlacingMode] = useState(false);

  // ─── Live Preview ───
  const [livePreviews, setLivePreviews] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRenderRef = useRef(0);

  // ─── Processing ───
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);

  // ─── Resolved pen color ───
  const resolvedPenColor = penColor === 'custom' ? customPenColor : penColor;

  // ─── Affected Pages ───
  const getAffectedPages = useCallback((): number[] => {
    if (pageScope === 'all') return Array.from({ length: pageCount }, (_, i) => i);
    if (pageScope === 'odd') return Array.from({ length: Math.ceil(pageCount / 2) }, (_, i) => i * 2);
    if (pageScope === 'even') return Array.from({ length: Math.floor(pageCount / 2) }, (_, i) => i * 2 + 1);
    if (pageScope === 'specific' && selectedPages.size > 0) {
      return Array.from(selectedPages).map((p) => p - 1);
    }
    if (pageRange.trim()) {
      const parts = pageRange.split(',').map((s) => s.trim());
      const pages = new Set<number>();
      for (const part of parts) {
        if (part.includes('-')) {
          const dashIdx = part.indexOf('-');
          const start = parseInt(part.slice(0, dashIdx));
          let end: number;
          const endStr = part.slice(dashIdx + 1).trim().toLowerCase();
          end = (endStr === 'end' || endStr === 'last') ? pageCount : parseInt(endStr);
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = Math.max(1, start); i <= Math.min(pageCount, end); i++) pages.add(i);
          }
        } else {
          const num = parseInt(part);
          if (!isNaN(num) && num >= 1 && num <= pageCount) pages.add(num);
        }
      }
      return Array.from(pages).sort((a, b) => a - b).map((p) => p - 1);
    }
    return [];
  }, [pageScope, pageRange, pageCount, selectedPages]);

  const affectedPagesList = getAffectedPages();

  // ─── Load PDF ───
  const handleFiles = useCallback(async (files: File[]) => {
    const pdf = files.find((f) => f.type === 'application/pdf');
    if (!pdf) return;
    try {
      const buffer = await pdf.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      setPageCount(pdfDoc.getPageCount());
      setFile(pdf);
      setFileBuffer(buffer);
      setResult(null);
      setLivePreviews([]);
      setCustomPlacement(null);
    } catch {
      toast({ title: 'Cannot open PDF', description: 'File may be corrupted or password-protected.', variant: 'destructive' });
    }
  }, [toast]);

  // ─── Generate Thumbnails ───
  useEffect(() => {
    if (!fileBuffer) return;
    let cancelled = false;
    setThumbLoading(true);
    generateThumbnails(fileBuffer, 30)
      .then((t) => {
        if (!cancelled) { setThumbnails(t); setThumbLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setThumbnails([]); setThumbLoading(false); }
      });
    return () => { cancelled = true; };
  }, [fileBuffer]);

  // ─── Build signature image from canvas ───
  const buildSignatureFromCanvas = useCallback(() => {
    // We need a reference canvas to redraw strokes
    const tempCanvas = document.createElement('canvas');
    const w = 600;
    const h = 200;
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    // Calculate bounding box of all strokes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const stroke of strokes) {
      for (const pt of stroke.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }

    if (minX === Infinity || strokes.length === 0) return null;

    const padding = 10;
    const sigWidth = maxX - minX + padding * 2;
    const sigHeight = maxY - minY + padding * 2;
    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = Math.max(1, Math.ceil(sigWidth));
    targetCanvas.height = Math.max(1, Math.ceil(sigHeight));
    const tctx = targetCanvas.getContext('2d')!;

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      tctx.beginPath();
      tctx.strokeStyle = stroke.color;
      tctx.lineWidth = stroke.width;
      tctx.lineCap = 'round';
      tctx.lineJoin = 'round';
      const offsetPts = stroke.points.map((p) => ({
        x: p.x - minX + padding,
        y: p.y - minY + padding,
      }));
      tctx.moveTo(offsetPts[0].x, offsetPts[0].y);
      for (let i = 1; i < offsetPts.length; i++) {
        const midX = (offsetPts[i - 1].x + offsetPts[i].x) / 2;
        const midY = (offsetPts[i - 1].y + offsetPts[i].y) / 2;
        tctx.quadraticCurveTo(offsetPts[i - 1].x, offsetPts[i - 1].y, midX, midY);
      }
      tctx.stroke();
    }

    return targetCanvas.toDataURL('image/png');
  }, [strokes]);

  // ─── Generate signature data URL from current mode ───
  const generateSignatureDataUrl = useCallback(() => {
    if (sigMode === 'draw') {
      return buildSignatureFromCanvas();
    } else if (sigMode === 'type') {
      if (!typeText.trim()) return null;
      return renderTypeSignature(typeText.trim(), resolvedPenColor, typeFontSize);
    } else if (sigMode === 'upload') {
      return uploadedImagePreview;
    }
    return null;
  }, [sigMode, buildSignatureFromCanvas, typeText, resolvedPenColor, typeFontSize, uploadedImagePreview]);

  // ─── Auto-update signature data URL when drawing mode changes ───
  useEffect(() => {
    const url = generateSignatureDataUrl();
    setSignatureDataUrl(url);
  }, [sigMode, strokes, typeText, resolvedPenColor, typeFontSize, uploadedImagePreview, generateSignatureDataUrl]);

  // ─── Live Preview ───
  useEffect(() => {
    if (thumbnails.length === 0 || !signatureDataUrl) { setLivePreviews([]); return; }

    const renderId = ++previewRenderRef.current;
    setPreviewLoading(true);

    const timer = setTimeout(async () => {
      try {
        const previews: string[] = [];
        const placement = customPlacement || getPresetCoords(placementPreset, signatureSize / 100);

        for (let i = 0; i < thumbnails.length; i++) {
          if (renderId !== previewRenderRef.current) return;
          const isAffected = affectedPagesList.includes(i);
          const rendered = await renderSignaturePreview(
            thumbnails[i],
            signatureDataUrl,
            placement,
            signatureSize,
            isAffected,
          );
          previews.push(rendered);
        }
        if (renderId === previewRenderRef.current) {
          setLivePreviews(previews);
          setPreviewLoading(false);
        }
      } catch {
        if (renderId === previewRenderRef.current) {
          setLivePreviews(thumbnails);
          setPreviewLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [thumbnails, signatureDataUrl, placementPreset, customPlacement, signatureSize, affectedPagesList.length]);

  // ─── Handle placement click on page ───
  const handlePageClickForPlacement = useCallback((pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlacingMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setCustomPlacement({ nx: Math.max(0, Math.min(1, nx)), ny: Math.max(0, Math.min(1, ny)) });
    setIsPlacingMode(false);
    toast({ title: 'Signature placed', description: `Position set on page ${pageIndex + 1}` });
  }, [isPlacingMode, toast]);

  // ─── Handle uploaded signature image ───
  const handleSignatureUpload = useCallback((files: File[]) => {
    const img = files.find((f) => f.type.startsWith('image/'));
    if (img) {
      setUploadedImage(img);
      const url = URL.createObjectURL(img);
      setUploadedImagePreview(url);
    }
  }, []);

  // ─── Apply Signature to PDF ───
  const applySignature = useCallback(async () => {
    if (!fileBuffer || !file || !signatureDataUrl) return;
    setProcessing(true);
    setResult(null);

    try {
      const sigBytes = dataURLtoUint8Array(signatureDataUrl);
      const pdfDoc = await PDFDocument.load(fileBuffer.slice(0), { ignoreEncryption: true });
      const embeddedImage = await pdfDoc.embedPng(sigBytes);
      const pages = pdfDoc.getPages();
      const placement = customPlacement || getPresetCoords(placementPreset, signatureSize / 100);

      for (const pageIdx of affectedPagesList) {
        const page = pages[pageIdx];
        const { width, height } = page.getSize();
        const sigWidth = width * (signatureSize / 100);
        const sigHeight = (embeddedImage.height / embeddedImage.width) * sigWidth;
        const x = placement.nx * width;
        const y = placement.ny * height;
        page.drawImage(embeddedImage, { x, y, width: sigWidth, height: sigHeight });
        await new Promise((r) => setTimeout(r, 0));
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResult(blob);

      addRecentFile({
        id: crypto.randomUUID(),
        name: `signed-${file.name}`,
        type: 'application/pdf',
        tool: 'split-pdf',
        size: formatSize(blob.size),
        timestamp: Date.now(),
      });

      toast({
        title: 'Signature applied!',
        description: `${affectedPagesList.length} page${affectedPagesList.length > 1 ? 's' : ''} signed · ${formatSize(blob.size)}`,
      });
    } catch (err) {
      console.error('Signature error:', err);
      toast({ title: 'Failed to sign PDF', description: 'The PDF may be corrupted or encrypted.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  }, [file, fileBuffer, signatureDataUrl, placementPreset, customPlacement, signatureSize, affectedPagesList, addRecentFile, toast]);

  // ─── Apply & Download ───
  const handleApplyAndDownload = useCallback(async () => {
    await applySignature();
    // Wait for state update
    setTimeout(() => {
      const pdfBytes = document.querySelector('[data-result-blob]') as HTMLDivElement;
      // Re-read from result state through a workaround
    }, 300);
  }, [applySignature]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    saveAs(result, `signed-${file.name}`);
    toast({ title: 'Downloaded', description: 'Your signed PDF has been saved.' });
  }, [result, file, toast]);

  // ─── Reset ───
  const resetAll = useCallback(() => {
    setFile(null);
    setFileBuffer(null);
    setPageCount(0);
    setThumbnails([]);
    setLivePreviews([]);
    setStrokes([]);
    setTypeText('');
    setUploadedImage(null);
    setUploadedImagePreview(null);
    setSignatureDataUrl(null);
    setPageScope('all');
    setPageRange('');
    setSelectedPages(new Set());
    setPlacementPreset('bottom-right');
    setCustomPlacement(null);
    setSignatureSize(25);
    setIsPlacingMode(false);
    setResult(null);
    setProcessing(false);
  }, []);

  // ─── Can Apply ───
  const canApply = !processing && file !== null && !!signatureDataUrl && affectedPagesList.length > 0;

  const displayPreviews = livePreviews.length > 0 ? livePreviews : thumbnails;

  // ─── Render ───
  return (
    <ToolLayout
      title="Sign PDF"
      description="Draw, type, or upload signatures and place them on PDF pages"
      toolId="watermark-pdf"
    >
      {!file ? (
        <FileDropzone
          onFiles={handleFiles}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop PDF here or click to upload"
          sublabel="Add your signature to any PDF document"
        />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* ─── File Info ─── */}
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">{pageCount} pages · {formatSize(file.size)}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={resetAll}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* ─── Signature Creation Card ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Stamp className="h-4 w-4 text-primary" />
                Create Your Signature
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Mode Tabs */}
              <Tabs value={sigMode} onValueChange={(v) => setSigMode(v as SignatureMode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="draw" className="flex-1 gap-1.5">
                    <Pen className="h-3.5 w-3.5" />
                    Draw
                  </TabsTrigger>
                  <TabsTrigger value="type" className="flex-1 gap-1.5">
                    <Type className="h-3.5 w-3.5" />
                    Type
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex-1 gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </TabsTrigger>
                </TabsList>

                {/* ─── Draw Mode ─── */}
                <TabsContent value="draw" className="space-y-4 mt-5">
                  {/* Pen Color */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5" />
                      Pen Color
                    </Label>
                    <div className="flex items-center gap-2">
                      {PEN_COLORS.map((c) => (
                        <Tooltip key={c.label}>
                          <TooltipTrigger asChild>
                            <button
                              className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                                penColor === c.value
                                  ? 'border-primary ring-2 ring-primary/30 scale-110'
                                  : 'border-muted-foreground/20 hover:border-muted-foreground/40'
                              }`}
                              style={{ backgroundColor: c.value === 'custom' ? customPenColor : c.value }}
                              onClick={() => setPenColor(c.value)}
                            >
                              {penColor === c.value && (
                                <Check className="h-3 w-3 text-white drop-shadow-sm" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{c.label}</TooltipContent>
                        </Tooltip>
                      ))}
                      {penColor === 'custom' && (
                        <div className="flex items-center gap-2 ml-1">
                          <input
                            type="color"
                            value={customPenColor}
                            onChange={(e) => setCustomPenColor(e.target.value)}
                            className="h-8 w-10 rounded border cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground font-mono">{customPenColor}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pen Thickness */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Pen Thickness</Label>
                      <Badge variant="secondary" className="font-mono">{penWidth}px</Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[penWidth]}
                        onValueChange={(v) => setPenWidth(v[0])}
                        min={1}
                        max={8}
                        step={0.5}
                        className="flex-1"
                      />
                      {/* Live preview of stroke width */}
                      <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-muted/50 border">
                        <div
                          className="rounded-full bg-foreground"
                          style={{
                            width: Math.max(2, penWidth * 2),
                            height: Math.max(2, penWidth * 2),
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Drawing Canvas */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Drawing Area</Label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                          disabled={strokes.length === 0}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setStrokes([])}
                          disabled={strokes.length === 0}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <SignatureCanvas
                      strokes={strokes}
                      setStrokes={setStrokes}
                      penColor={resolvedPenColor}
                      penWidth={penWidth}
                      canvasWidth={600}
                      canvasHeight={200}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Draw your signature using mouse or touch
                    </p>
                  </div>
                </TabsContent>

                {/* ─── Type Mode ─── */}
                <TabsContent value="type" className="space-y-4 mt-5">
                  <div className="space-y-2">
                    <Label htmlFor="sig-type-text">Type Your Signature</Label>
                    <Input
                      id="sig-type-text"
                      value={typeText}
                      onChange={(e) => setTypeText(e.target.value)}
                      placeholder="e.g. John Doe"
                      maxLength={50}
                    />
                  </div>

                  {/* Color for type mode */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5" />
                      Color
                    </Label>
                    <div className="flex items-center gap-2">
                      {PEN_COLORS.map((c) => (
                        <Tooltip key={c.label}>
                          <TooltipTrigger asChild>
                            <button
                              className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                                penColor === c.value
                                  ? 'border-primary ring-2 ring-primary/30 scale-110'
                                  : 'border-muted-foreground/20 hover:border-muted-foreground/40'
                              }`}
                              style={{ backgroundColor: c.value === 'custom' ? customPenColor : c.value }}
                              onClick={() => setPenColor(c.value)}
                            >
                              {penColor === c.value && (
                                <Check className="h-3 w-3 text-white drop-shadow-sm" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{c.label}</TooltipContent>
                        </Tooltip>
                      ))}
                      {penColor === 'custom' && (
                        <div className="flex items-center gap-2 ml-1">
                          <input
                            type="color"
                            value={customPenColor}
                            onChange={(e) => setCustomPenColor(e.target.value)}
                            className="h-8 w-10 rounded border cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground font-mono">{customPenColor}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Font Size</Label>
                      <Badge variant="secondary" className="font-mono">{typeFontSize}px</Badge>
                    </div>
                    <Slider value={[typeFontSize]} onValueChange={(v) => setTypeFontSize(v[0])} min={24} max={96} step={2} />
                  </div>

                  {/* Type signature preview */}
                  {typeText.trim() && (
                    <div className="p-4 rounded-lg bg-[#fafafa] dark:bg-[#1a1a1a] border border-dashed">
                      <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                      <p
                        className="overflow-hidden"
                        style={{
                          fontFamily: '"Georgia", "Palatino", cursive, serif',
                          fontStyle: 'italic',
                          color: resolvedPenColor,
                          fontSize: `${Math.min(typeFontSize, 48)}px`,
                          lineHeight: 1.3,
                        }}
                      >
                        {typeText}
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* ─── Upload Mode ─── */}
                <TabsContent value="upload" className="space-y-4 mt-5">
                  <div className="space-y-2">
                    <Label>Upload Signature Image</Label>
                    <FileDropzone
                      onFiles={handleSignatureUpload}
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      multiple={false}
                      label="Drop signature image here"
                      sublabel="PNG, JPG, or WebP — transparent backgrounds work best"
                      icon="image"
                      variant="compact"
                    />
                    {uploadedImagePreview && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                        <img
                          src={uploadedImagePreview}
                          alt="Signature"
                          className="h-12 w-auto max-w-32 object-contain rounded border bg-white"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{uploadedImage?.name}</p>
                          <p className="text-xs text-muted-foreground">{uploadedImage ? formatSize(uploadedImage.size) : ''}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setUploadedImage(null); setUploadedImagePreview(null); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* ─── Signature Preview Strip ─── */}
              {signatureDataUrl && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-muted/30 border"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Signature Preview</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {sigMode === 'draw' ? 'Drawn' : sigMode === 'type' ? 'Typed' : 'Uploaded'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-center p-3 bg-white dark:bg-muted rounded-lg border">
                    <img
                      src={signatureDataUrl}
                      alt="Signature"
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* ─── Page Selection & Placement Card ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Placement & Page Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Page Scope */}
              <div className="space-y-2">
                <Label>Apply to Pages</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { val: 'all', label: 'All Pages', sub: `${pageCount}` },
                    { val: 'odd', label: 'Odd Pages', sub: '1, 3, 5...' },
                    { val: 'even', label: 'Even Pages', sub: '2, 4, 6...' },
                    { val: 'specific', label: 'Specific', sub: 'Custom' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.val}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        pageScope === opt.val
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-muted hover:border-muted-foreground/30'
                      }`}
                      onClick={() => {
                        setPageScope(opt.val);
                        if (opt.val !== 'specific') setSelectedPages(new Set());
                      }}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{opt.sub}</p>
                    </button>
                  ))}
                </div>
                {pageScope === 'specific' && (
                  <div className="space-y-2 mt-2">
                    <Label htmlFor="sig-page-range">Page Numbers (comma-separated)</Label>
                    <Input
                      id="sig-page-range"
                      value={pageRange}
                      onChange={(e) => setPageRange(e.target.value)}
                      placeholder="e.g. 1, 3, 5-10"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use &quot;end&quot; for last page. Range: 1-{pageCount}
                    </p>
                    {affectedPagesList.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {affectedPagesList.length} page{affectedPagesList.length > 1 ? 's' : ''} selected
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Placement Preset */}
              <div className="space-y-2">
                <Label>Placement Position</Label>
                <div className="flex flex-wrap gap-2">
                  {PLACEMENT_PRESETS.map((p) => (
                    <Button
                      key={p.value}
                      variant={placementPreset === p.value && !customPlacement ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => {
                        setPlacementPreset(p.value);
                        setCustomPlacement(null);
                      }}
                    >
                      <span>{p.icon}</span>
                      {p.label}
                    </Button>
                  ))}
                </div>

                {/* Custom placement toggle */}
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant={isPlacingMode ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setIsPlacingMode(!isPlacingMode)}
                  >
                    <MousePointer className="h-3.5 w-3.5" />
                    {isPlacingMode ? 'Click on a page to place...' : 'Custom Placement'}
                  </Button>
                  {customPlacement && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      Custom: {Math.round(customPlacement.nx * 100)}%, {Math.round(customPlacement.ny * 100)}%
                    </Badge>
                  )}
                </div>
                {isPlacingMode && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-primary font-medium flex items-center gap-1"
                  >
                    <MousePointer className="h-3 w-3" />
                    Click on any page thumbnail below to set signature position
                  </motion.p>
                )}
              </div>

              {/* Signature Size */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Signature Size (% of page width)</Label>
                  <Badge variant="secondary" className="font-mono">{signatureSize}%</Badge>
                </div>
                <Slider
                  value={[signatureSize]}
                  onValueChange={(v) => setSignatureSize(v[0])}
                  min={5}
                  max={60}
                  step={1}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Small (5%)</span>
                  <span>Medium (25%)</span>
                  <span>Large (60%)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Page Thumbnails with Live Preview ─── */}
          {(thumbLoading || displayPreviews.length > 0) && (
            <Card className={signatureDataUrl ? 'border-primary/30' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ZoomIn className="h-4 w-4" />
                    Page Preview
                    {previewLoading && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {affectedPagesList.length}/{pageCount} pages
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isPlacingMode
                    ? 'Click on a page to place your signature'
                    : 'Pages highlighted with your signature applied'}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 overflow-x-auto pb-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar snap-x snap-mandatory">
                  {(thumbLoading
                    ? Array.from({ length: Math.min(pageCount, 6) })
                    : displayPreviews
                  ).map((thumb, idx) => {
                    const isAffected = affectedPagesList.includes(idx);
                    const src = typeof thumb === 'string' ? thumb : '';
                    return (
                      <button
                        key={idx}
                        onClick={(e) => handlePageClickForPlacement(idx, e)}
                        className={`relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all text-left cursor-pointer group snap-start ${
                          isPlacingMode
                            ? 'border-primary hover:ring-4 hover:ring-primary/30 cursor-crosshair'
                            : isAffected
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-muted opacity-50 hover:opacity-70'
                        }`}
                        style={{ width: '140px' }}
                      >
                        {src ? (
                          <img src={src} alt={`Page ${idx + 1}`} className="w-full h-auto" />
                        ) : (
                          <Skeleton className="aspect-[3/4] rounded-none" style={{ width: '140px' }} />
                        )}

                        {/* Affected overlay badge */}
                        {isAffected && !thumbLoading && (
                          <div className="absolute top-1 left-1">
                            <Badge className="text-[10px] px-1 py-0 h-4" variant="default">
                              <Stamp className="h-2.5 w-2.5" />
                            </Badge>
                          </div>
                        )}

                        {/* Placement mode crosshair overlay */}
                        {isPlacingMode && !thumbLoading && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                            <div className="w-6 h-6 relative">
                              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary" />
                              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary" />
                            </div>
                          </div>
                        )}

                        <div className={`absolute bottom-0 left-0 right-0 text-[10px] px-1.5 py-0.5 text-center font-medium ${
                          isAffected ? 'bg-primary text-primary-foreground' : 'bg-black/60 text-white'
                        }`}>
                          Page {idx + 1}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {pageCount > 30 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Showing first 30 of {pageCount} pages
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ─── Apply & Download ─── */}
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="border-emerald-200 dark:border-emerald-900">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      PDF Signed Successfully!
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                      <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">signed-{file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatSize(result.size)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setResult(null)}>
                          Edit
                        </Button>
                        <Button size="sm" onClick={handleDownload}>
                          <Download className="h-4 w-4 mr-1.5" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="apply"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Button
                  className="w-full"
                  size="lg"
                  disabled={!canApply}
                  onClick={applySignature}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing PDF...
                    </>
                  ) : (
                    <>
                      <Stamp className="h-4 w-4 mr-2" />
                      Sign & Download PDF
                    </>
                  )}
                </Button>
                {!signatureDataUrl && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Create a signature above to enable signing
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </ToolLayout>
  );
}

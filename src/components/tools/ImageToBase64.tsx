'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image,
  FileText,
  Copy,
  Check,
  Download,
  Upload,
  ArrowRightLeft,
  Code,
  Trash2,
  Loader2,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ToolLayout } from '@/components/shared/ToolLayout';
import { FileDropzone } from '@/components/shared/FileDropzone';
import { useAppStore } from '@/store';
import { useToast } from '@/hooks/use-toast';
import { formatSize } from '@/lib/utils';
import { saveAs } from 'file-saver';
import { useWorkerTask } from '@/hooks/useWorkerTask';
import { createImageWorker } from '@/lib/worker-factories';

/* ─── Types ─── */
interface EncodedImage {
  id: string;
  file: File;
  preview: string;
  base64: string;
  base64Raw: string;
  mime: string;
  dims: { w: number; h: number };
  encoding: boolean;
  error: boolean;
  copyChecked: boolean;
}

interface DecodedImage {
  dataUrl: string;
  mime: string;
  dims: { w: number; h: number };
  size: number;
  loading: boolean;
  error: string | null;
}

/* ─── Helpers ─── */
function guessMimeFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf.slice(0, 12));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return 'image/png';
}

function guessMimeFromBase64(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('PD94bW')) return 'image/svg+xml';
  if (b64.startsWith('Qk')) return 'image/bmp';
  return 'image/png';
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
  };
  return map[mime] || '.png';
}

/* ─── Main Component ─── */
export function ImageToBase64() {
  const { addRecentFile } = useAppStore();
  const { toast } = useToast();

  /* ─── Encode State ─── */
  const [encodedImages, setEncodedImages] = useState<EncodedImage[]>([]);
  const [includeDataUri, setIncludeDataUri] = useState(true);
  const [selectedEncodeId, setSelectedEncodeId] = useState<string | null>(null);

  /* ─── Decode State ─── */
  const [decodeInput, setDecodeInput] = useState('');
  const [decodedImage, setDecodedImage] = useState<DecodedImage | null>(null);

  /* ─── Cleanup object URLs ─── */
  useEffect(() => {
    return () => {
      encodedImages.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, []);

  /* ─── Web Worker for base64 encoding ─── */
  const base64Fallback = useCallback(async (
    payload: { imageData: ArrayBuffer; includeDataUri: boolean },
    _taskType: string | undefined,
    reportProgress: (percent: number, message: string) => void,
  ) => {
    reportProgress(30, 'Encoding on main thread...');
    const { imageData, includeDataUri } = payload;
    const bytes = new Uint8Array(imageData);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += new TextDecoder().decode(chunk);
      reportProgress(Math.round((i / bytes.length) * 80) + 20, `Encoding... ${Math.round((i / bytes.length) * 100)}%`);
    }
    const raw = btoa(binary);
    const mime = guessMimeFromBuffer(imageData);
    const base64 = includeDataUri ? `data:${mime};base64,${raw}` : raw;
    return { base64, length: raw.length };
  }, []);

  const { execute: executeBase64Task, isWorkerActive } = useWorkerTask(
    createImageWorker,
    base64Fallback,
    { timeoutMs: 5 * 60 * 1000 },
  );

  /* ─── Encode helpers ─── */
  const addEncodeFiles = useCallback(
    (files: File[]) => {
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif'];
      const validFiles = files.filter((f) => validTypes.includes(f.type));

      if (validFiles.length === 0) {
        toast({
          title: 'No valid images',
          description: 'Please upload PNG, JPG, WebP, SVG, or GIF images.',
          variant: 'destructive',
        });
        return;
      }

      const newEntries: EncodedImage[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        base64: '',
        base64Raw: '',
        mime: file.type || 'image/png',
        dims: { w: 0, h: 0 },
        encoding: true,
        error: false,
        copyChecked: false,
      }));

      setEncodedImages((prev) => [...prev, ...newEntries]);

      // Encode each file using the web worker (with main-thread fallback)
      newEntries.forEach((entry) => {
        entry.file.arrayBuffer().then(async (buffer) => {
          try {
            const result = await executeBase64Task(
              { imageData: buffer, includeDataUri: true },
              'encode-base64',
            );
            const fullDataUrl = result.base64;
            const commaIdx = fullDataUrl.indexOf(',');
            const raw = commaIdx >= 0 ? fullDataUrl.slice(commaIdx + 1) : fullDataUrl;
            // Get dimensions by loading the encoded image
            const img = new window.Image();
            img.onload = () => {
              setEncodedImages((prev) =>
                prev.map((e) =>
                  e.id === entry.id
                    ? { ...e, base64: fullDataUrl, base64Raw: raw, dims: { w: img.width, h: img.height }, encoding: false }
                    : e,
                ),
              );
              setSelectedEncodeId((prev) => prev ?? entry.id);
            };
            img.onerror = () => {
              setEncodedImages((prev) =>
                prev.map((e) => (e.id === entry.id ? { ...e, base64: fullDataUrl, base64Raw: raw, encoding: false } : e)),
              );
              setSelectedEncodeId((prev) => prev ?? entry.id);
            };
            img.src = fullDataUrl;
          } catch {
            setEncodedImages((prev) =>
              prev.map((e) => (e.id === entry.id ? { ...e, encoding: false, error: true } : e)),
            );
          }
        }).catch(() => {
          setEncodedImages((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, encoding: false, error: true } : e)),
          );
        });
      });
    },
    [toast, executeBase64Task],
  );

  const removeEncodeImage = useCallback((id: string) => {
    setEncodedImages((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry) URL.revokeObjectURL(entry.preview);
      return prev.filter((e) => e.id !== id);
    });
    setSelectedEncodeId((prev) => {
      const remaining = encodedImages.filter((e) => e.id !== id);
      return remaining.length > 0 ? remaining[0].id : null;
    });
  }, [encodedImages]);

  const clearAllEncoded = useCallback(() => {
    encodedImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setEncodedImages([]);
    setSelectedEncodeId(null);
  }, [encodedImages]);

  const copyBase64 = useCallback(
    (entry: EncodedImage) => {
      const text = includeDataUri ? entry.base64 : entry.base64Raw;
      navigator.clipboard.writeText(text).then(() => {
        setEncodedImages((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, copyChecked: true } : e)),
        );
        setTimeout(() => {
          setEncodedImages((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, copyChecked: false } : e)),
          );
        }, 2000);
        toast({ title: 'Copied!', description: 'Base64 string copied to clipboard.' });
      });
    },
    [includeDataUri, toast],
  );

  const copyAllBase64 = useCallback(() => {
    const allText = encodedImages
      .filter((e) => !e.error && e.base64)
      .map((e) => (includeDataUri ? e.base64 : e.base64Raw))
      .join('\n');
    navigator.clipboard.writeText(allText).then(() => {
      toast({ title: 'Copied all!', description: `${encodedImages.length} Base64 strings copied.` });
    });
  }, [encodedImages, includeDataUri, toast]);

  const downloadTxt = useCallback(
    (entry: EncodedImage) => {
      const text = includeDataUri ? entry.base64 : entry.base64Raw;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const name = entry.file.name.replace(/\.[^.]+$/, '') + '_base64.txt';
      saveAs(blob, name);
    },
    [includeDataUri],
  );

  /* ─── Decode helpers ─── */
  const doDecode = useCallback(
    (input: string) => {
      if (!input.trim()) {
        setDecodedImage(null);
        return;
      }

      setDecodedImage({ dataUrl: '', mime: '', dims: { w: 0, h: 0 }, size: 0, loading: true, error: null });

      try {
        // Strip data URI prefix if present
        let raw = input.trim();
        let mime = 'image/png';

        if (raw.startsWith('data:')) {
          const match = raw.match(/^data:([^;]+);base64,/);
          if (match) {
            mime = match[1];
            raw = raw.replace(/^data:[^;]+;base64,/, '');
          }
        } else {
          mime = guessMimeFromBase64(raw);
        }

        // Clean whitespace
        raw = raw.replace(/\s/g, '');

        // Validate base64
        const decoded = atob(raw);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: mime });
        const dataUrl = URL.createObjectURL(blob);

        // Load to get dimensions
        const img = new window.Image();
        img.onload = () => {
          setDecodedImage({
            dataUrl,
            mime,
            dims: { w: img.width, h: img.height },
            size: bytes.length,
            loading: false,
            error: null,
          });
        };
        img.onerror = () => {
          URL.revokeObjectURL(dataUrl);
          setDecodedImage((prev) => ({
            ...prev!,
            loading: false,
            error: 'The decoded data is not a valid image.',
          }));
        };
        img.src = dataUrl;
      } catch {
        setDecodedImage((prev) => ({
          ...prev!,
          loading: false,
          error: 'Invalid Base64 string. Please check your input and try again.',
        }));
      }
    },
    [],
  );

  const handleDecodeFileUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const file = files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setDecodeInput(text);
        doDecode(text);
      };
      reader.onerror = () => {
        toast({ title: 'Read error', description: 'Could not read the file.', variant: 'destructive' });
      };
      reader.readAsText(file);
    },
    [toast, doDecode],
  );

  const handleDecodeInputChange = useCallback(
    (value: string) => {
      setDecodeInput(value);
      // Debounce decode
      if (value.trim().length > 20) {
        // Only attempt decode if there's a reasonable amount of text
        const timeout = setTimeout(() => doDecode(value), 300);
        return () => clearTimeout(timeout);
      } else {
        setDecodedImage(null);
      }
    },
    [doDecode],
  );

  const downloadDecodedImage = useCallback(() => {
    if (!decodedImage || !decodedImage.dataUrl || decodedImage.error) return;
    const ext = mimeToExt(decodedImage.mime);
    saveAs(decodedImage.dataUrl, `decoded_image${ext}`);
    addRecentFile({
      id: crypto.randomUUID(),
      name: `decoded_image${ext}`,
      type: decodedImage.mime,
      tool: 'image-to-base64',
      size: formatSize(decodedImage.size),
      timestamp: Date.now(),
    });
  }, [decodedImage, addRecentFile]);

  /* ─── Computed ─── */
  const selectedEntry = encodedImages.find((e) => e.id === selectedEncodeId) || encodedImages[0] || null;
  const totalBase64Length = encodedImages.reduce((sum, e) => sum + e.base64Raw.length, 0);

  return (
    <ToolLayout
      title="Image ↔ Base64"
      description="Encode images to Base64 strings or decode Base64 back to images"
      toolId="image-to-base64"
    >
      <Tabs defaultValue="encode" className="w-full">
        {/* ─── Tab Header ─── */}
        <div className="flex justify-center mb-2">
          <TabsList className="h-10 px-1">
            <TabsTrigger value="encode" className="gap-2 px-5">
              <Image className="h-4 w-4" alt="" />
              <span className="hidden sm:inline">Encode</span>
            </TabsTrigger>
            <TabsTrigger value="decode" className="gap-2 px-5">
              <Code className="h-4 w-4" />
              <span className="hidden sm:inline">Decode</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* ─── ENCODE TAB ─── */}
        {/* ══════════════════════════════════════════════════ */}
        <TabsContent value="encode" className="space-y-6 mt-4">
          {encodedImages.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <FileDropzone
                onFiles={addEncodeFiles}
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif"
                multiple={true}
                maxSizeMB={20}
                label="Drop images here or click to upload"
                sublabel="Supports PNG, JPG, WebP, SVG, GIF — upload multiple for batch encoding"
                icon="image"
              />
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              {/* ─── Data URI Toggle & Actions ─── */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    {/* Data URI toggle */}
                    <div className="flex items-center gap-3">
                      <Label className="text-sm font-medium whitespace-nowrap">Data URI prefix</Label>
                      <div className="flex rounded-lg border overflow-hidden">
                        <button
                          type="button"
                          className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            includeDataUri
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                          onClick={() => setIncludeDataUri(true)}
                        >
                          Include
                        </button>
                        <button
                          type="button"
                          className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-l ${
                            !includeDataUri
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                          onClick={() => setIncludeDataUri(false)}
                        >
                          Exclude
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Worker indicator */}
                      {isWorkerActive && (
                        <Badge variant="secondary" className="text-[10px] gap-1 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                          <Cpu className="h-3 w-3" />
                          Web Worker Active
                        </Badge>
                      )}
                      {/* Stats badges */}
                      <motion.div key={`count-${encodedImages.length}`} initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {encodedImages.length} image{encodedImages.length !== 1 ? 's' : ''}
                        </Badge>
                      </motion.div>
                      {totalBase64Length > 0 && (
                        <motion.div key={`len-${totalBase64Length}`} initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                          <Badge variant="outline" className="font-mono text-xs">
                            {totalBase64Length.toLocaleString()} chars
                          </Badge>
                        </motion.div>
                      )}

                      {/* Copy all */}
                      {encodedImages.length > 1 && encodedImages.some((e) => e.base64) && (
                        <Button size="sm" variant="outline" onClick={copyAllBase64}>
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Copy All
                        </Button>
                      )}

                      {/* Add more */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif';
                          input.multiple = true;
                          input.onchange = (e) => {
                            const files = Array.from((e.target as HTMLInputElement).files || []);
                            if (files.length > 0) addEncodeFiles(files);
                          };
                          input.click();
                        }}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        Add
                      </Button>

                      {/* Clear */}
                      <Button size="sm" variant="outline" onClick={clearAllEncoded}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ─── Batch Thumbnails Selector ─── */}
              {encodedImages.length > 1 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {encodedImages.map((entry) => (
                        <motion.button
                          key={entry.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedEncodeId(entry.id)}
                          className={`relative shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                            selectedEncodeId === entry.id
                              ? 'border-primary ring-2 ring-primary/20 shadow-md'
                              : 'border-muted hover:border-muted-foreground/40'
                          } ${entry.error ? 'opacity-50' : ''}`}
                        >
                          <img
                            src={entry.preview}
                            alt={entry.file.name}
                            className="h-full w-full object-cover"
                          />
                          {entry.encoding && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 text-white animate-spin" />
                            </div>
                          )}
                          {entry.error && (
                            <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                              <AlertCircle className="h-5 w-5 text-red-500" />
                            </div>
                          )}
                          {/* Remove badge */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeEncodeImage(entry.id);
                            }}
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80 transition-colors"
                          >
                            <span className="text-[8px] leading-none">×</span>
                          </button>
                        </motion.button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ─── Selected Image Detail ─── */}
              {selectedEntry && (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedEntry.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-5"
                  >
                    {/* Image Preview & Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Preview Card */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Image className="h-4 w-4 text-muted-foreground" alt="" />
                            Image Preview
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="relative rounded-xl overflow-hidden border bg-muted/30 aspect-square flex items-center justify-center">
                            <img
                              src={selectedEntry.preview}
                              alt={selectedEntry.file.name}
                              className="max-w-full max-h-full object-contain"
                            />
                            {selectedEntry.encoding && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-2">
                                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                                  <span className="text-xs text-white/80">Encoding...</span>
                                </div>
                              </div>
                            )}
                          </div>
                          {/* File info */}
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {selectedEntry.file.name}
                            </Badge>
                            <Badge variant="secondary" className="text-xs font-mono">
                              {formatSize(selectedEntry.file.size)}
                            </Badge>
                            {selectedEntry.dims.w > 0 && (
                              <Badge variant="secondary" className="text-xs font-mono">
                                {selectedEntry.dims.w} × {selectedEntry.dims.h}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Base64 Output Card */}
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Code className="h-4 w-4 text-muted-foreground" />
                              Base64 Output
                            </CardTitle>
                            {selectedEntry.base64 && (
                              <div className="flex items-center gap-1.5">
                                <motion.div
                                  key={`copy-btn-${selectedEntry.copyChecked}`}
                                  initial={selectedEntry.copyChecked ? { scale: 0.8 } : false}
                                  animate={{ scale: 1 }}
                                >
                                  <Button
                                    size="sm"
                                    variant={selectedEntry.copyChecked ? 'default' : 'outline'}
                                    onClick={() => copyBase64(selectedEntry)}
                                    className="gap-1.5 h-8 text-xs"
                                  >
                                    <AnimatePresence mode="wait">
                                      {selectedEntry.copyChecked ? (
                                        <motion.span
                                          key="check"
                                          initial={{ scale: 0, rotate: -90 }}
                                          animate={{ scale: 1, rotate: 0 }}
                                          exit={{ scale: 0, rotate: 90 }}
                                          className="flex items-center gap-1.5"
                                        >
                                          <Check className="h-3.5 w-3.5" />
                                          Copied
                                        </motion.span>
                                      ) : (
                                        <motion.span
                                          key="copy"
                                          initial={{ opacity: 0 }}
                                          animate={{ opacity: 1 }}
                                          exit={{ opacity: 0 }}
                                          className="flex items-center gap-1.5"
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                          Copy
                                        </motion.span>
                                      )}
                                    </AnimatePresence>
                                  </Button>
                                </motion.div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => downloadTxt(selectedEntry)}
                                  className="gap-1.5 h-8 text-xs"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  .txt
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-3">
                          {selectedEntry.error ? (
                            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              Failed to encode this image.
                            </div>
                          ) : selectedEntry.encoding ? (
                            <div className="space-y-3">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-4 w-5/6" />
                              <Skeleton className="h-4 w-2/3" />
                              <Skeleton className="h-4 w-4/5" />
                            </div>
                          ) : (
                            <>
                              {/* Base64 display */}
                              <div className="relative">
                                <div className="rounded-xl border bg-[#f5f5f5] dark:bg-zinc-900 p-4 max-h-72 overflow-y-auto">
                                  <pre className="text-xs break-all whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed select-all">
                                    {includeDataUri ? selectedEntry.base64 : selectedEntry.base64Raw}
                                  </pre>
                                </div>
                              </div>

                              {/* Stats row */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <motion.div
                                  key={`str-len-${selectedEntry.base64Raw.length}`}
                                  initial={{ scale: 0.85, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                >
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {selectedEntry.base64Raw.length.toLocaleString()} chars
                                  </Badge>
                                </motion.div>
                                <motion.div
                                  key={`est-size-${selectedEntry.file.size}`}
                                  initial={{ scale: 0.85, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                >
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    ~{formatSize(Math.ceil((selectedEntry.base64Raw.length * 3) / 4))} decoded
                                  </Badge>
                                </motion.div>
                                <Badge variant="outline" className="text-xs">
                                  {includeDataUri ? 'data:' + selectedEntry.mime + ';base64,...' : 'raw base64'}
                                </Badge>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Single image remove */}
                    {encodedImages.length === 1 && (
                      <div className="flex justify-end">
                        <Button size="sm" variant="ghost" onClick={() => removeEncodeImage(selectedEntry.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </motion.div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════ */}
        {/* ─── DECODE TAB ─── */}
        {/* ══════════════════════════════════════════════════ */}
        <TabsContent value="decode" className="space-y-5 mt-4">
          {/* Input area */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Paste Base64 String
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <Textarea
                value={decodeInput}
                onChange={(e) => handleDecodeInputChange(e.target.value)}
                placeholder="Paste your Base64 string here... (with or without data:image/png;base64, prefix)"
                className="min-h-[140px] font-mono text-xs leading-relaxed resize-y"
              />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {decodeInput.trim().length > 0 && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {decodeInput.trim().length.toLocaleString()} chars
                    </Badge>
                  )}
                  {decodedImage && decodedImage.error && (
                    <Badge variant="destructive" className="text-xs flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Error
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDecodeInput('');
                      setDecodedImage(null);
                    }}
                    disabled={!decodeInput.trim()}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => doDecode(decodeInput)}
                    disabled={!decodeInput.trim() || (decodedImage?.loading ?? false)}
                  >
                    {decodedImage?.loading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Decode
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upload .txt file alternative */}
          <Card>
            <CardContent className="p-4">
              <FileDropzone
                onFiles={handleDecodeFileUpload}
                accept=".txt,text/plain"
                multiple={false}
                maxSizeMB={20}
                label="Upload a .txt file with Base64 content"
                sublabel="Or drag a text file containing Base64 data"
                icon="upload"
                variant="compact"
              />
            </CardContent>
          </Card>

          {/* Decoded result */}
          {decodedImage && (
            <AnimatePresence mode="wait">
              <motion.div
                key="decoded-result"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                {decodedImage.error ? (
                  <Card className="border-destructive/30">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-destructive">Decode Error</p>
                          <p className="text-sm text-muted-foreground mt-1">{decodedImage.error}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : decodedImage.loading ? (
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center gap-3">
                        <Skeleton className="h-48 w-48 rounded-xl" />
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Decoding image...
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Decoded image preview */}
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Image className="h-4 w-4 text-muted-foreground" alt="" />
                            Decoded Image
                          </CardTitle>
                          <Button size="sm" onClick={downloadDecodedImage}>
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Download Image
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-3">
                        <div className="relative rounded-xl overflow-hidden border bg-muted/30 max-h-80 flex items-center justify-center">
                          <img
                            src={decodedImage.dataUrl}
                            alt="Decoded"
                            className="max-w-full max-h-80 object-contain"
                          />
                        </div>
                        {/* Image stats */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {decodedImage.dims.w > 0 && (
                            <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }}>
                              <Badge variant="secondary" className="text-xs font-mono">
                                {decodedImage.dims.w} × {decodedImage.dims.h} px
                              </Badge>
                            </motion.div>
                          )}
                          <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }}>
                            <Badge variant="secondary" className="text-xs font-mono">
                              {formatSize(decodedImage.size)}
                            </Badge>
                          </motion.div>
                          <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }}>
                            <Badge variant="outline" className="text-xs">
                              {decodedImage.mime}
                            </Badge>
                          </motion.div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>
    </ToolLayout>
  );
}

'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect } from 'react';
import { useAppStore, TOOLS } from '@/store';
import { Header, DesktopSidebar, Footer } from '@/components/layout/Layout';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { SmartFileRouter } from '@/components/shared/SmartFileRouter';
import { PwaInstallBanner, OfflineIndicator } from '@/components/shared/PwaInstallPrompt';
import { motion, AnimatePresence } from 'framer-motion';

// Register Service Worker
function useServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered:', reg.scope);

          // Check for updates periodically
          setInterval(() => {
            reg.update();
          }, 60 * 60 * 1000); // every hour
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    }
  }, []);
}

// Lazy-load all tools with dynamic imports to reduce initial bundle size
const HomePage = dynamic(() => import('@/components/home/HomePage').then(m => ({ default: m.HomePage })), { loading: () => <PageLoader toolId="home" /> });
const PdfToImage = dynamic(() => import('@/components/tools/PdfToImage').then(m => ({ default: m.PdfToImage })), { loading: () => <PageLoader toolId="pdf-to-image" /> });
const ImageToPdf = dynamic(() => import('@/components/tools/ImageToPdf').then(m => ({ default: m.ImageToPdf })), { loading: () => <PageLoader toolId="image-to-pdf" /> });
const PdfCompressor = dynamic(() => import('@/components/tools/PdfCompressor').then(m => ({ default: m.PdfCompressor })), { loading: () => <PageLoader toolId="compress-pdf" /> });
const MergePdf = dynamic(() => import('@/components/tools/MergePdf').then(m => ({ default: m.MergePdf })), { loading: () => <PageLoader toolId="merge-pdf" /> });
const SplitPdf = dynamic(() => import('@/components/tools/SplitPdf').then(m => ({ default: m.SplitPdf })), { loading: () => <PageLoader toolId="split-pdf" /> });
const ImageResize = dynamic(() => import('@/components/tools/ImageResize').then(m => ({ default: m.ImageResize })), { loading: () => <PageLoader toolId="image-resize" /> });
const ImageCompress = dynamic(() => import('@/components/tools/ImageCompress').then(m => ({ default: m.ImageCompress })), { loading: () => <PageLoader toolId="image-compress" /> });
const ImageFormatConvert = dynamic(() => import('@/components/tools/ImageFormatConvert').then(m => ({ default: m.ImageFormatConvert })), { loading: () => <PageLoader toolId="image-format-convert" /> });
const ImageCropRotate = dynamic(() => import('@/components/tools/ImageCropRotate').then(m => ({ default: m.ImageCropRotate })), { loading: () => <PageLoader toolId="image-crop-rotate" /> });
const PassportPhotoMaker = dynamic(() => import('@/components/tools/PassportPhotoMaker').then(m => ({ default: m.PassportPhotoMaker })), { loading: () => <PageLoader toolId="passport-photo" /> });
const QRGenerator = dynamic(() => import('@/components/tools/QRGenerator').then(m => ({ default: m.QRGenerator })), { loading: () => <PageLoader toolId="qr-generator" /> });
const QRScanner = dynamic(() => import('@/components/tools/QRScanner').then(m => ({ default: m.QRScanner })), { loading: () => <PageLoader toolId="qr-scanner" /> });
const RotatePdf = dynamic(() => import('@/components/tools/RotatePdf').then(m => ({ default: m.RotatePdf })), { loading: () => <PageLoader toolId="rotate-pdf" /> });
const WatermarkPdf = dynamic(() => import('@/components/tools/WatermarkPdf').then(m => ({ default: m.WatermarkPdf })), { loading: () => <PageLoader toolId="watermark-pdf" /> });
const SizeCompare = dynamic(() => import('@/components/tools/SizeCompare').then(m => ({ default: m.SizeCompare })), { loading: () => <PageLoader toolId="size-compare" /> });
const PdfToText = dynamic(() => import('@/components/tools/PdfToText').then(m => ({ default: m.PdfToText })), { loading: () => <PageLoader toolId="pdf-to-text" /> });
const PageOrganizer = dynamic(() => import('@/components/tools/PageOrganizer').then(m => ({ default: m.PageOrganizer })), { loading: () => <PageLoader toolId="page-organizer" /> });
const SignPdf = dynamic(() => import('@/components/tools/SignPdf').then(m => ({ default: m.SignPdf })), { loading: () => <PageLoader toolId="sign-pdf" /> });
const ImageToBase64 = dynamic(() => import('@/components/tools/ImageToBase64').then(m => ({ default: m.ImageToBase64 })), { loading: () => <PageLoader toolId="image-to-base64" /> });
const MarkdownToPdf = dynamic(() => import('@/components/tools/MarkdownToPdf').then(m => ({ default: m.MarkdownToPdf })), { loading: () => <PageLoader toolId="markdown-to-pdf" /> });

const TOOL_COMPONENTS: Record<string, React.ComponentType> = {
  home: HomePage,
  'pdf-to-image': PdfToImage,
  'image-to-pdf': ImageToPdf,
  'compress-pdf': PdfCompressor,
  'merge-pdf': MergePdf,
  'split-pdf': SplitPdf,
  'image-resize': ImageResize,
  'image-compress': ImageCompress,
  'image-format-convert': ImageFormatConvert,
  'image-crop-rotate': ImageCropRotate,
  'passport-photo': PassportPhotoMaker,
  'qr-generator': QRGenerator,
  'qr-scanner': QRScanner,
  'rotate-pdf': RotatePdf,
  'watermark-pdf': WatermarkPdf,
  'size-compare': SizeCompare,
  'pdf-to-text': PdfToText,
  'page-organizer': PageOrganizer,
  'sign-pdf': SignPdf,
  'image-to-base64': ImageToBase64,
  'markdown-to-pdf': MarkdownToPdf,
};

function PageLoader({ toolId }: { toolId?: string }) {
  const tool = TOOLS.find(t => t.id === toolId);
  const toolName = tool?.name || 'Home';
  const label = toolId === 'home' ? 'Home page' : toolName;

  return (
    <div className="flex items-center justify-center min-h-[300px] px-4">
      <motion.div
        className="flex flex-col items-center gap-5 w-full max-w-sm"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Logo + pulse */}
        <motion.div
          className="relative"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg">
            <Image
              src="/images/logo.png"
              alt="SnapPDF"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          </div>
          {/* subtle glow ring */}
          <motion.div
            className="absolute -inset-1 rounded-xl border border-primary/20"
            animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.04, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Loading text */}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            Loading {label}...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Preparing your workspace
          </p>
        </div>

        {/* Skeleton bars with shimmer */}
        <div className="w-full space-y-3">
          <div className="h-3 rounded-full bg-muted skeleton-shimmer" />
          <div className="h-3 rounded-full bg-muted skeleton-shimmer w-[85%]" style={{ animationDelay: '0.15s' }} />
          <div className="h-3 rounded-full bg-muted skeleton-shimmer w-[65%]" style={{ animationDelay: '0.3s' }} />
        </div>
      </motion.div>
    </div>
  );
}

export default function AppPage() {
  const { activeTool } = useAppStore();
  const ToolComponent = TOOL_COMPONENTS[activeTool] || HomePage;

  useServiceWorker();

  return (
    <SmartFileRouter>
      <div className="min-h-screen flex flex-col">
        <CommandPalette />
        <OfflineIndicator />
        <Header />
        <div className="flex flex-1">
          <DesktopSidebar />
          <main className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTool}
                initial={{ opacity: 0, scale: 0.98, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.98, x: -10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="py-4"
              >
                <ToolComponent />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <Footer />
        <PwaInstallBanner />
      </div>
    </SmartFileRouter>
  );
}

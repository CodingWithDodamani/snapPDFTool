'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Image from 'next/image';
import {
  ImagePlus, FileDown, Merge, Split, RotateCw, Scaling,
  ImageMinus, Crop, User, QrCode, Scan,
  Shield, Zap, Smartphone, Globe, Lock,
  ArrowRight, CheckCircle2, Star, Clock, Download,
  ChevronDown, Wand2, FileUp, ChevronRight,
  RefreshCw, Stamp, BarChart3, Type, LayoutGrid, Pen, Code, FileImage,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAppStore, TOOLS, TOOL_CATEGORIES, type ToolId, type ToolAccent } from '@/store';
import { getToolAccentBg, getToolAccentText, getToolAccentBorder } from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ImagePlus, FileDown, Merge, Split, RotateCw, Scaling, ImageMinus, Crop, User, QrCode, Scan, RefreshCw, Stamp, BarChart3, Type, LayoutGrid, Pen, Code,
};

const ACCENT_STEPS = [
  { step: '01', title: 'Choose a Tool', desc: 'Pick from 20+ powerful tools designed for Indian users', icon: '🎯', color: 'from-blue-500/20 to-blue-600/5' },
  { step: '02', title: 'Upload Your File', desc: 'Drag & drop or select files — no signup needed', icon: '📤', color: 'from-emerald-500/20 to-emerald-600/5' },
  { step: '03', title: 'Get Instant Results', desc: 'Process in seconds and download your file', icon: '⚡', color: 'from-amber-500/20 to-amber-600/5' },
];

const FEATURES = [
  { icon: Shield, title: '100% Private', desc: 'Files never leave your device. All processing happens locally in your browser.', accent: 'emerald' as ToolAccent },
  { icon: Zap, title: 'Lightning Fast', desc: 'Optimized for speed — most operations complete in under 10 seconds.', accent: 'amber' as ToolAccent },
  { icon: Lock, title: 'No Login Required', desc: 'Start using tools immediately. No account, no email, no tracking.', accent: 'blue' as ToolAccent },
  { icon: Smartphone, title: 'Works Everywhere', desc: 'Fully responsive design works on phone, tablet, and desktop.', accent: 'violet' as ToolAccent },
  { icon: Globe, title: 'Works Offline', desc: 'Core tools function without internet. Perfect for areas with poor connectivity.', accent: 'teal' as ToolAccent },
  { icon: Clock, title: 'No Expiration', desc: 'All tools are free forever. No hidden charges, no premium walls.', accent: 'rose' as ToolAccent },
];

const STATS = [
  { value: '20+', label: 'Powerful Tools' },
  { value: '100%', label: 'Free Forever' },
  { value: '<10s', label: 'Avg. Processing' },
  { value: '0', label: 'Files Uploaded' },
];

const TESTIMONIALS = [
  { name: 'Rahul S.', location: 'Mumbai', text: 'Compressed my PDF from 5MB to 200KB in seconds. Exactly what I needed for the government portal!', rating: 5 },
  { name: 'Priya M.', location: 'Delhi', text: 'The passport photo maker saved me a trip to the studio. Perfect Aadhaar photo on the first try!', rating: 5 },
  { name: 'Amit K.', location: 'Bangalore', text: 'Best free document tool I have used. No ads, no watermarks, no fake compression like other apps.', rating: 5 },
];

const FAQ_ITEMS = [
  { q: 'Is SnapPDF really free?', a: 'Yes, completely free with no hidden charges. All 20+ tools are available at no cost, with no file upload limits or watermarks.' },
  { q: 'Are my files safe?', a: 'Absolutely. All file processing happens directly in your browser on your device. Your files are never uploaded to any server.' },
  { q: 'Can I compress a PDF to exactly 200KB?', a: 'Yes! Our smart compression engine targets exact file sizes — choose from 100KB, 200KB, 500KB, 1MB, or enter any custom size.' },
  { q: 'Does it work on mobile phones?', a: 'SnapPDF is fully responsive and optimized for all screen sizes. It works great on Android, iOS, tablets, and desktops.' },
  { q: 'Do I need to create an account?', a: 'No signup or login is required. Just open the tool and start using it immediately.' },
  { q: 'What image formats are supported?', a: 'We support JPG/JPEG, PNG, and WebP formats for all image tools including resize, compress, crop, and passport photo maker.' },
];

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

/** Animated stat counter using framer-motion */
function AnimatedStat({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, type: 'spring', stiffness: 100 }}
      className="text-center"
    >
      <motion.p
        className="text-2xl font-bold"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.5, delay: 0.15, type: 'spring', stiffness: 120, damping: 12 }}
      >
        {value}
      </motion.p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </motion.div>
  );
}

export function HomePage() {
  const { setActiveTool } = useAppStore();

  const handleToolClick = (id: ToolId) => {
    setActiveTool(id);
  };

  return (
    <div className="w-full">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden hero-mesh grid-pattern">
        {/* Animated blob background */}
        <div className="absolute top-20 -left-32 w-96 h-96 bg-gradient-to-br from-primary/20 via-violet-500/15 to-emerald-500/10 blob opacity-40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-32 w-80 h-80 bg-gradient-to-tl from-amber-500/15 via-rose-500/10 to-primary/10 blob opacity-30 blur-3xl pointer-events-none" />

        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="space-y-6 text-center lg:text-left"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-card text-sm font-medium text-primary"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                India&apos;s #1 Free Document Utility
              </motion.div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                All Your Document
                <br />
                <span className="gradient-text">Tools in One Place</span>
              </h1>

              <p className="text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Convert, compress, resize, and share documents instantly. Built for Indian users
                with tools for government forms, passport photos, and more.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start pt-2">
                <Button
                  size="lg"
                  className="magnetic-btn gap-2 text-base px-6 h-12 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
                  onClick={() => handleToolClick('image-to-pdf')}
                >
                  <ImagePlus className="h-5 w-5" />
                  Image to PDF
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="magnetic-btn gap-2 text-base px-6 h-12 rounded-xl"
                  onClick={() => handleToolClick('compress-pdf')}
                >
                  <FileDown className="h-5 w-5" />
                  Compress PDF
                </Button>
              </div>

              {/* Stats with animated counting */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-6 pt-4">
                {STATS.map((stat) => (
                  <AnimatedStat key={stat.label} value={stat.value} label={stat.label} />
                ))}
              </div>

              {/* Smart Upload Hint with icon glow */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="flex items-center gap-2 pt-3 justify-center lg:justify-start"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground glass-card px-3 py-1.5 rounded-full">
                  <Wand2 className="h-3.5 w-3.5 text-primary icon-glow" />
                  <span>
                    Just <strong className="text-foreground">drag &amp; drop</strong> any file — we&apos;ll find the right tool
                  </span>
                </div>
              </motion.div>
            </motion.div>

            {/* Right - Hero Image */}
            <motion.div
              initial={{ opacity: 0, x: 40, rotateY: -5 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative hidden lg:block"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-violet-500/10 to-emerald-500/10 rounded-3xl blur-2xl" />
                <div className="relative rounded-2xl overflow-hidden border shadow-2xl shadow-primary/10">
                  <Image
                    src="/images/hero-illustration.png"
                    alt="SnapPDF Tools"
                    width={672}
                    height={384}
                    className="w-full h-auto"
                    priority
                  />
                </div>
                {/* Floating badges - glass-card styled */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-4 -right-4 glass-card shadow-lg rounded-xl px-3 py-2 flex items-center gap-2"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Compressed</p>
                    <p className="text-[10px] text-muted-foreground">5MB → 200KB</p>
                  </div>
                </motion.div>
                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                  className="absolute -bottom-4 -left-4 glass-card shadow-lg rounded-xl px-3 py-2 flex items-center gap-2"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Download className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Ready to Download</p>
                    <p className="text-[10px] text-muted-foreground">No watermarks</p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-16 lg:py-20 bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="secondary" className="mb-3">How It Works</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold">
              Three Simple Steps
            </h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              No sign-ups, no uploads, no waiting. Get your documents processed in seconds.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 relative">
            {/* Connecting lines between steps (md+ only) */}
            <div className="hidden md:block absolute top-1/2 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] -translate-y-1/2 h-[2px] z-0">
              <div className="w-full h-full bg-gradient-to-r from-primary/20 via-violet-500/20 to-amber-500/20" />
              <motion.div
                className="h-full bg-gradient-to-r from-primary via-violet-500 to-amber-500"
                initial={{ width: '0%' }}
                whileInView={{ width: '100%' }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, delay: 0.3, ease: 'easeInOut' }}
              />
            </div>

            {ACCENT_STEPS.map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative z-10"
              >
                <Card className="glass-card relative overflow-hidden h-full border">
                  <div className={cn('absolute top-0 left-0 right-0 h-1 bg-gradient-to-r', item.color)} />
                  <CardContent className="p-6 lg:p-8">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{item.icon}</span>
                      <span className="text-sm font-bold gradient-text-animated">{item.step}</span>
                    </div>
                    <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ALL TOOLS GRID ===== */}
      <section className="py-16 lg:py-20">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="secondary" className="mb-3">All Tools</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold">
              Everything You Need
            </h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              Powerful tools for PDF, images, and QR codes — all free, all private, all fast.
            </p>
          </motion.div>

          {TOOL_CATEGORIES.map((category, catIndex) => {
            const categoryTools = TOOLS.filter((t) => t.category === category.key);
            const CatIcon = ICON_MAP[
              category.key === 'pdf' ? 'FileDown' : category.key === 'image' ? 'ImagePlus' : 'QrCode'
            ] || FileDown;

            return (
              <motion.div
                key={category.key}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-50px' }}
                variants={stagger}
                className="mb-12 last:mb-0"
              >
                {/* Category header with animated gradient underline */}
                <div className="flex items-center gap-3 mb-6">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', getToolAccentBg(category.accent))}>
                    <CatIcon className={cn('h-4.5 w-4.5', getToolAccentText(category.accent))} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold relative">
                      {category.name}
                      <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-violet-500 to-amber-500 opacity-50" />
                    </h3>
                    <p className="text-xs text-muted-foreground">{category.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger-children">
                  {categoryTools.map((tool) => {
                    const Icon = ICON_MAP[tool.icon] || FileDown;
                    return (
                      <motion.div key={tool.id} variants={fadeUp}>
                        <Card
                          className={cn(
                            'cursor-pointer group h-full glass-card card-hover transition-all duration-200 hover:shadow-lg border',
                            getToolAccentBorder(tool.accent),
                            activeToolAccent(tool.accent)
                          )}
                          onClick={() => handleToolClick(tool.id)}
                        >
                          <CardContent className="p-5">
                            <div className="flex items-start gap-3.5">
                              <div className={cn(
                                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300',
                                getToolAccentBg(tool.accent),
                                'group-hover:scale-110'
                              )}>
                                <Icon className={cn('h-5 w-5 transition-all duration-300', getToolAccentText(tool.accent), 'group-hover:icon-glow')} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                                    {tool.name}
                                  </h4>
                                  {tool.badge && (
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        'text-[9px] px-1.5 py-0 h-4 font-medium',
                                        tool.badge === 'Popular' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                                        tool.badge === 'India' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                      )}
                                    >
                                      {tool.badge}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                  {tool.longDescription || tool.description}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-between">
                              <div className="flex gap-1">
                                {tool.keywords?.slice(0, 2).map(kw => (
                                  <span key={kw} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                              <motion.div
                                className="text-muted-foreground opacity-0 group-hover:opacity-100"
                                initial={false}
                                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                style={{ display: 'inline-flex' }}
                              >
                                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                              </motion.div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ===== WHY SNAPPDF ===== */}
      <section className="py-16 lg:py-20 bg-muted/30">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="secondary" className="mb-3">Why SnapPDF?</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold">
              Built Different
            </h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              No ads, no watermarks, no fake compression. Just fast, private document tools.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div key={feature.title} variants={fadeUp}>
                  <Card className="h-full glass-card card-hover border">
                    <CardContent className="p-6">
                      <div className={cn(
                        'w-11 h-11 rounded-xl flex items-center justify-center mb-4',
                        getToolAccentBg(feature.accent)
                      )}>
                        <Icon className={cn('h-5 w-5 icon-glow', getToolAccentText(feature.accent))} />
                      </div>
                      <h3 className="font-bold mb-1.5">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-16 lg:py-20 relative overflow-hidden">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent pointer-events-none" />
        <div className="relative max-w-[1400px] mx-auto px-4 lg:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="secondary" className="mb-3">Trusted by Users</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold">
              Loved Across India
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full glass-card">
                  <CardContent className="p-6">
                    <div className="flex gap-0.5 mb-4">
                      {Array.from({ length: t.rating }).map((_, j) => (
                        <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.4)]" />
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed mb-4 text-muted-foreground italic">
                      &ldquo;{t.text}&rdquo;
                    </p>
                    <div className="flex items-center gap-3 pt-4 border-t">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {t.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.location}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="py-16 lg:py-20 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 lg:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <Badge variant="secondary" className="mb-3">FAQ</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold">
              Frequently Asked Questions
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Accordion type="single" collapsible className="space-y-2">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="glass-card border rounded-xl px-4 transition-all duration-300 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline py-4">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 hero-mesh grid-pattern" />
        {/* Floating blobs */}
        <div className="absolute top-10 left-[10%] w-40 h-40 bg-gradient-to-br from-primary/15 via-violet-500/10 to-transparent blob opacity-30 blur-2xl pointer-events-none" />
        <div className="absolute bottom-10 right-[15%] w-32 h-32 bg-gradient-to-tl from-emerald-500/15 via-amber-500/10 to-transparent blob opacity-25 blur-2xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-violet-500/10 via-primary/5 to-rose-500/10 blob opacity-20 blur-3xl pointer-events-none" />

        <div className="relative max-w-[1400px] mx-auto px-4 lg:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <h2 className="text-3xl lg:text-5xl font-extrabold tracking-tight">
              Ready to <span className="gradient-text">Get Started</span>?
            </h2>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto">
              Pick a tool above and process your documents in seconds. No sign-up, no payment, no limits.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                size="lg"
                className="magnetic-btn gap-2 text-base px-8 h-12 rounded-xl shadow-lg shadow-primary/20"
                onClick={() => handleToolClick('compress-pdf')}
              >
                <FileDown className="h-5 w-5" />
                Compress PDF Now
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="magnetic-btn gap-2 text-base px-8 h-12 rounded-xl"
                onClick={() => handleToolClick('image-resize')}
              >
                <Scaling className="h-5 w-5" />
                Resize Image
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

function activeToolAccent(accent: string): string {
  return '';
}

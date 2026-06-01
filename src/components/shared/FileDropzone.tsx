'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, FileUp, Plus, Image } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  label?: string;
  sublabel?: string;
  icon?: 'upload' | 'image' | 'plus';
  variant?: 'default' | 'compact';
}

export function FileDropzone({
  onFiles,
  accept = '*',
  multiple = true,
  maxSizeMB = 50,
  label = 'Drop files here or click to upload',
  sublabel,
  icon = 'upload',
  variant = 'default',
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.size <= maxSizeMB * 1024 * 1024
      );
      if (files.length > 0) onFiles(files);
    },
    [maxSizeMB, onFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) onFiles(files);
    },
    [onFiles]
  );

  const IconComponent = icon === 'image' ? Image : icon === 'plus' ? Plus : Upload;
  const ActiveIcon = FileUp;

  return (
    <motion.div
      animate={
        isDragging
          ? { scale: 1.02, y: -4 }
          : { scale: 1, y: 0 }
      }
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'relative rounded-2xl text-center cursor-pointer transition-all duration-300',
        // Animated gradient border
        variant === 'default' && 'animated-border',
        variant === 'default' && isDragging && 'animated-border dragging',
        // Compact: minimal subtle border
        variant === 'compact' ? 'border border-dashed p-6 breathing-border' : 'p-10',
        'hover:bg-primary/[0.03]',
        isDragging && 'bg-primary/5 shadow-lg shadow-primary/10'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex flex-col items-center gap-3">
        <motion.div
          animate={isDragging ? { scale: 1.15, y: -6 } : { scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className={cn(
            'rounded-2xl flex items-center justify-center transition-colors',
            variant === 'default' ? 'w-16 h-16' : 'w-12 h-12',
            isDragging
              ? 'bg-primary/15'
              : 'bg-muted'
          )}
        >
          {isDragging ? (
            <ActiveIcon className={cn(
              variant === 'default' ? 'h-7 w-7' : 'h-5 w-5',
              'text-primary icon-glow'
            )} />
          ) : (
            <IconComponent className={cn(variant === 'default' ? 'h-7 w-7' : 'h-5 w-5', 'text-muted-foreground')} />
          )}
        </motion.div>
        <div>
          <p className={cn(
            'font-medium',
            variant === 'default' ? 'text-base' : 'text-sm',
            variant === 'default' && !isDragging && 'gradient-text'
          )}>{label}</p>
          {sublabel && (
            <p className="text-sm text-muted-foreground mt-1">{sublabel}</p>
          )}
        </div>
        {!isDragging && variant === 'default' && (
          <p className="text-xs text-muted-foreground/60">
            Maximum file size: {maxSizeMB}MB
          </p>
        )}
      </div>
    </motion.div>
  );
}

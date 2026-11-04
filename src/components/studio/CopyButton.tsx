'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/utils';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type='button'
      onClick={() => void copy()}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-xs',
        copied ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/6'
      )}
    >
      {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

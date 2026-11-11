'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/utils';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<'ready' | 'copied' | 'failed'>('ready');
  const copied = status === 'copied';

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setStatus('ready'), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <button
      type='button'
      onClick={() => void copy()}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm',
        copied ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/6'
      )}
    >
      {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
      {copied ? 'Copied' : status === 'failed' ? 'Copy manually' : 'Copy'}
    </button>
  );
}

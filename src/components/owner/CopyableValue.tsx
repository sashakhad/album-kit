import { CopyButton } from '@/components/studio/CopyButton';

export function CopyableValue({ value, label }: { value: string; label: string }) {
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={event => event.currentTarget.select()}
        className='min-h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/15 px-3 text-base sm:text-sm'
      />
      <CopyButton key={value} text={value} label={label.toLowerCase()} />
    </div>
  );
}

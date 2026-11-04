'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const keyFormSchema = z.object({
  key: z.string().min(1, 'Enter the album key.'),
});

type KeyFormValues = z.infer<typeof keyFormSchema>;

export function KeyForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<KeyFormValues>({
    resolver: zodResolver(keyFormSchema),
    defaultValues: { key: '' },
  });

  async function onSubmit(values: KeyFormValues) {
    setError(null);
    const response = await fetch('/api/owner/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: values.key }),
    });
    if (response.ok) {
      router.push(next);
      router.refresh();
      return;
    }
    if (response.status === 503) {
      setError('This site has no album key yet. Run pnpm setup:site, then try again.');
      return;
    }
    setError('That key is wrong.');
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4' noValidate>
        <FormField
          control={form.control}
          name='key'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Album key</FormLabel>
              <FormControl>
                <Input type='password' autoComplete='current-password' autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error === null ? null : (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        )}
        <Button type='submit' disabled={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </Form>
  );
}

import { ExampleForm } from '@/components/ExampleForm';

export default function Home() {
  return (
    <main className='min-h-screen p-8'>
      <div className='mx-auto max-w-4xl space-y-12'>
        <header className='space-y-4 text-center'>
          <h1 className='text-4xl font-bold'>Modern Full-Stack Scaffold</h1>
          <p className='text-muted-foreground text-xl'>
            Next.js App Router, React, TypeScript, Prisma, Tailwind CSS, and shadcn/ui.
          </p>
        </header>

        <section className='grid gap-8 md:grid-cols-2'>
          <div className='space-y-4'>
            <h2 className='text-2xl font-semibold'>Built with Modern Tech</h2>
            <ul className='text-muted-foreground list-disc space-y-2 pl-5'>
              <li>Next.js with App Router and Turbopack</li>
              <li>React with strict TypeScript support</li>
              <li>Prisma with PostgreSQL adapter</li>
              <li>Tailwind CSS with Radix-powered UI primitives</li>
              <li>React Hook Form with Zod validation</li>
            </ul>
          </div>

          <div className='space-y-4'>
            <h2 className='text-2xl font-semibold'>Development Tooling</h2>
            <ul className='text-muted-foreground list-disc space-y-2 pl-5'>
              <li>ESLint and Prettier for code quality</li>
              <li>Vitest and Testing Library for unit tests</li>
              <li>Cypress for end-to-end smoke tests</li>
              <li>Storybook with Vitest browser tests</li>
              <li>Prisma Studio for database management</li>
            </ul>
          </div>
        </section>

        <section className='flex justify-center'>
          <ExampleForm />
        </section>
      </div>
    </main>
  );
}

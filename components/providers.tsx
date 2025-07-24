'use client';

import { QueryProvider } from '@/lib/providers/query-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
    </QueryProvider>
  );
}
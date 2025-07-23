'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DynamicPricingPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard since we don't have billing
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          No Billing Required
        </h1>
        <p className="text-gray-600 mb-6">
          This application is free to use - no payment plans needed!
        </p>
        <p className="text-sm text-gray-500">
          Redirecting to dashboard...
        </p>
      </div>
    </div>
  );
}
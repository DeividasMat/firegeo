'use client';

import Link from 'next/link';
import Image from 'next/image';

export function Navbar() {

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <Image
                src="/firecrawl-logo-with-fire.webp"
                alt="Firecrawl"
                width={120}
                height={25}
                priority
              />
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/chat"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              AI Chat
            </Link>
            <Link
              href="/brand-monitor"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Brand Monitor
            </Link>
            <Link
              href="/dashboard"
              className="btn-firecrawl-orange inline-flex items-center justify-center whitespace-nowrap rounded-[10px] text-sm font-medium transition-all duration-200 h-8 px-3"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
'use client';

import React, { useState, Fragment } from 'react';
import { ProviderComparisonData } from '@/lib/types';
import { ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
import { CompetitorCell } from './competitor-cell';
import { getConfiguredProviders } from '@/lib/provider-config';
import { assignUrlToCompetitor } from '@/lib/brand-monitor-utils';

interface ProviderComparisonMatrixProps {
  data: ProviderComparisonData[];
  brandName: string;
  competitors?: { 
    name: string; 
    url?: string;
    metadata?: {
      ogImage?: string;
      favicon?: string;
      description?: string;
    };
  }[];
}

// Provider icon mapping
const getProviderIcon = (provider: string) => {
  switch (provider) {
    case 'OpenAI':
      return (
        <img 
          src="https://cdn.brandfetch.io/idR3duQxYl/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B" 
          alt="OpenAI" 
          className="w-7 h-7"
        />
      );
    case 'Anthropic':
      return (
        <img 
          src="https://cdn.brandfetch.io/idmJWF3N06/theme/dark/symbol.svg" 
          alt="Anthropic" 
          className="w-5 h-5"
        />
      );
    case 'Google':
      return (
        <div className="w-5 h-5 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        </div>
      );
    case 'Perplexity':
      return (
        <img 
          src="https://cdn.brandfetch.io/idNdawywEZ/w/800/h/800/theme/dark/icon.png?c=1dxbfHSJFAPEGdCLU4o5B" 
          alt="Perplexity" 
          className="w-5 h-5"
        />
      );
    default:
      return <div className="w-5 h-5 bg-gray-400 rounded" />;
  }
};

  // Generate a fallback URL from competitor name using smart logic
const generateFallbackUrl = (competitorName: string): string | undefined => {
  // Use the improved URL assignment logic
  return assignUrlToCompetitor(competitorName);
};

export function ProviderComparisonMatrix({ data, brandName, competitors }: ProviderComparisonMatrixProps) {
  // Hooks must be called before any conditional returns
  const [sortColumn, setSortColumn] = useState<string>('competitor');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('asc');
  
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <p className="text-gray-600 text-lg mb-2">No comparison data available</p>
        <p className="text-gray-500 text-sm">The analysis may still be processing or no providers returned data.</p>
      </div>
    );
  }

  // Get configured providers from centralized config
  const configuredProviders = getConfiguredProviders();
  let providers = configuredProviders.map(p => p.name);
  
  // If no providers configured, extract from data
  if (providers.length === 0 && data.length > 0) {
    const providerSet = new Set<string>();
    data.forEach(item => {
      Object.keys(item.providers).forEach(provider => providerSet.add(provider));
    });
    providers = Array.from(providerSet);
  }
  
  // Don't filter out providers - show all enabled providers even if they have no data
  // This ensures users can see which providers were attempted
  // providers = providers.filter(provider => {
  //   // Check if at least one competitor has data for this provider
  //   return data.some(competitor => {
  //     const providerData = competitor.providers[provider];
  //     // Provider has data if visibilityScore exists and is > 0, or if mentions > 0
  //     return providerData && (providerData.visibilityScore > 0 || providerData.mentions > 0);
  //   });
  // });
  
  // Get background style based on score
  const getBackgroundStyle = (score: number) => {
    const opacity = Math.pow(score / 100, 0.5);
    return {
      backgroundColor: `rgba(251, 146, 60, ${opacity})`,
      border: score > 0 ? '1px solid rgb(251, 146, 60)' : undefined
    };
  };

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc');
      if (sortDirection === null) {
        setSortColumn('competitor');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Get sorted data
  const getSortedData = () => {
    return [...data].sort((a, b) => {
      if (sortDirection === null) return 0;
      
      if (sortColumn === 'competitor') {
        return sortDirection === 'asc' 
          ? a.competitor.localeCompare(b.competitor)
          : b.competitor.localeCompare(a.competitor);
      }
      
      const aValue = a.providers[sortColumn]?.visibilityScore || 0;
      const bValue = b.providers[sortColumn]?.visibilityScore || 0;
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });
  };

  // Get sort icon
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDownIcon className="w-4 h-4 opacity-30" />;
    if (sortDirection === 'asc') return <ArrowUpIcon className="w-4 h-4" />;
    if (sortDirection === 'desc') return <ArrowDownIcon className="w-4 h-4" />;
    return <ArrowUpDownIcon className="w-4 h-4" />;
  };

  // If no providers are included, don't render the component
  if (providers.length === 0) return null;
  
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="bg-gray-50 border-b border-r border-gray-200 w-[180px]">
              <button 
                onClick={() => handleSort('competitor')} 
                className="w-full p-3 font-medium text-gray-900 flex items-center justify-between hover:bg-gray-100 transition-colors text-left"
              >
                Competitors
                {getSortIcon('competitor')}
              </button>
            </th>
            {providers.map((provider, index) => (
              <th 
                key={provider}
                className={`bg-gray-50 border-b ${
                  index < providers.length - 1 ? 'border-r' : ''
                } border-gray-200`}
              >
                <button
                  onClick={() => handleSort(provider)}
                  className="w-full p-3 font-medium text-gray-900 flex items-center justify-center hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-center gap-2">
                    {getProviderIcon(provider)}
                    {getSortIcon(provider)}
                  </div>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {getSortedData().map((competitor, rowIndex) => {
            const competitorData = competitors?.find(c => 
              c.name === competitor.competitor || 
              c.name.toLowerCase() === competitor.competitor.toLowerCase()
            );
            
            // Generate URL if not found - try to guess from competitor name
            const fallbackUrl = !competitorData?.url ? generateFallbackUrl(competitor.competitor) : undefined;
            
            return (
              <tr key={competitor.competitor} className={rowIndex > 0 ? 'border-t border-gray-200' : ''}>
                <td className="border-r border-gray-200 bg-white">
                  <CompetitorCell 
                    name={competitor.competitor}
                    isOwn={competitor.isOwn}
                    favicon={competitorData?.metadata?.favicon}
                    url={competitorData?.url || fallbackUrl}
                  />
                </td>
                {providers.map((provider, index) => {
                  const providerData = competitor.providers[provider];
                  const score = providerData?.visibilityScore || 0;
                  
                  return (
                    <td 
                      key={provider} 
                      className={`text-center p-3 ${
                        index < providers.length - 1 ? 'border-r border-gray-200' : ''
                      }`}
                      style={getBackgroundStyle(score)}
                    >
                      <span className="text-orange-900 font-medium text-xs">
                        {score}%
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
} 
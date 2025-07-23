'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ProviderSpecificRanking } from '@/lib/types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Image from 'next/image';
import { getConfiguredProviders } from '@/lib/provider-config';
import { assignUrlToCompetitor } from '@/lib/brand-monitor-utils';

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
          className="w-6 h-6"
        />
      );
    case 'Google':
      return (
        <div className="w-7 h-7 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-7 h-7">
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
          className="w-6 h-6"
        />
      );
    default:
      return <div className="w-7 h-7 bg-gray-400 rounded" />;
  }
};

interface ProviderRankingsTabsProps {
  providerRankings: ProviderSpecificRanking[];
  brandName: string;
  shareOfVoice?: number;
  averagePosition?: number;
  sentimentScore?: number;
  weeklyChange?: number;
}

// Company cell component with favicon support
const CompanyCell = ({ 
  name, 
  isOwn, 
  url 
}: { 
  name: string; 
  isOwn?: boolean; 
  url?: string;
}) => {
  const [faviconError, setFaviconError] = useState(false);
  
  // Generate favicon URL using Google's favicon service
  const faviconUrl = url ? `https://www.google.com/s2/favicons?domain=${url}&sz=64` : null;
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 flex items-center justify-center rounded overflow-hidden flex-shrink-0">
        {faviconUrl && !faviconError ? (
          <Image
            src={faviconUrl}
            alt={`${name} logo`}
            width={20}
            height={20}
            className="object-contain"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <div className="w-5 h-5 bg-gray-200 rounded flex items-center justify-center">
            <span className="text-gray-600 font-semibold text-[10px]">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <span className={`text-sm ${
        isOwn ? 'font-semibold text-black' : 'text-black'
      }`}>
        {name}
      </span>
    </div>
  );
};

// Generate a fallback URL from competitor name using smart logic
const generateFallbackUrl = (competitorName: string): string | undefined => {
  return assignUrlToCompetitor(competitorName);
};

export function ProviderRankingsTabs({ 
  providerRankings, 
  brandName,
  shareOfVoice,
  averagePosition,
  sentimentScore,
  weeklyChange
}: ProviderRankingsTabsProps) {
  const [selectedProvider, setSelectedProvider] = useState(
    providerRankings?.[0]?.provider || 'OpenAI'
  );

  if (!providerRankings || providerRankings.length === 0) return null;

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <Badge variant="secondary" className="bg-green-50 text-black text-xs">Positive</Badge>;
      case 'negative':
        return <Badge variant="secondary" className="bg-red-50 text-black text-xs">Negative</Badge>;
      default:
        return <Badge variant="secondary" className="bg-gray-50 text-black text-xs">Neutral</Badge>;
    }
  };

  const getChangeIcon = (change: number | undefined) => {
    if (!change) return <Minus className="h-3 w-3 text-gray-400" />;
    if (change > 0) return <TrendingUp className="h-3 w-3 text-black" />;
    return <TrendingDown className="h-3 w-3 text-black" />;
  };

  // Get the selected provider's data
  const selectedProviderData = providerRankings.find(p => p.provider === selectedProvider);
  const competitors = selectedProviderData?.competitors || [];
  const brandRank = competitors.findIndex(c => c.isOwn) + 1;
  const brandVisibility = competitors.find(c => c.isOwn)?.visibilityScore || 0;

  return (
    <Card className="p-2 bg-card text-card-foreground gap-6 rounded-xl border py-6 shadow-sm border-gray-200 h-full flex flex-col">
      <CardHeader className="border-b">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl font-semibold">Provider Rankings</CardTitle>
            <CardDescription className="text-sm text-gray-600 mt-1">
              Your brand performance by AI provider
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-orange-600">#{brandRank}</p>
            <p className="text-xs text-gray-500 mt-1">Average Rank</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 pb-2 flex-1 flex flex-col">
        <Tabs value={selectedProvider} onValueChange={setSelectedProvider} className="flex-1 flex flex-col">
          <TabsList className={`grid w-full mb-2 h-14 ${providerRankings.length === 2 ? 'grid-cols-2' : providerRankings.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
            {providerRankings.map(({ provider }) => {
              // Provider info is now handled by icon mapping directly
              return (
                <TabsTrigger 
                  key={provider} 
                  value={provider} 
                  className="text-sm flex items-center justify-center h-full"
                  title={provider}
                >
                  {getProviderIcon(provider)}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {providerRankings.map(({ provider, competitors }) => (
            <TabsContent key={provider} value={provider} className="mt-0">
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-gray-50 border-b border-r border-gray-200 text-left p-3 text-xs font-medium text-gray-900 w-8">#</th>
                      <th className="bg-gray-50 border-b border-r border-gray-200 text-left p-3 text-xs font-medium text-gray-900 w-[200px]">Company</th>
                      <th className="bg-gray-50 border-b border-r border-gray-200 text-right p-3 text-xs font-medium text-gray-900">Visibility</th>
                      <th className="bg-gray-50 border-b border-r border-gray-200 text-right p-3 text-xs font-medium text-gray-900">Share of Voice</th>
                      <th className="bg-gray-50 border-b border-gray-200 text-right p-3 text-xs font-medium text-gray-900">Sentiment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((competitor, idx) => {
                      const competitorUrl = generateFallbackUrl(competitor.name);
                      
                      return (
                        <tr 
                          key={idx} 
                          className={`
                            ${idx > 0 ? 'border-t border-gray-200' : ''}
                            ${competitor.isOwn 
                              ? 'bg-orange-50' 
                              : 'hover:bg-gray-50 transition-colors'
                            }
                          `}
                        >
                          <td className="border-r border-gray-200 p-3 text-xs text-black">
                            {idx + 1}
                          </td>
                          <td className="border-r border-gray-200 p-3">
                            <CompanyCell 
                              name={competitor.name}
                              isOwn={competitor.isOwn}
                              url={competitorUrl}
                            />
                          </td>
                          <td className="border-r border-gray-200 p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-sm font-medium text-black">
                                {competitor.visibilityScore}%
                              </span>
                              {competitor.weeklyChange !== undefined && competitor.weeklyChange !== 0 && (
                                getChangeIcon(competitor.weeklyChange)
                              )}
                            </div>
                          </td>
                          <td className="border-r border-gray-200 p-3 text-right">
                            <span className="text-sm text-black">
                              {competitor.shareOfVoice}%
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {getSentimentBadge(competitor.sentiment)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        
        {/* Metrics Row at Bottom */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Competitors</p>
            <p className="text-lg font-semibold text-black">{competitors.length}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">{brandName} Rank</p>
            <p className="text-lg font-semibold text-black">
              #{brandRank}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">{brandName} Visibility</p>
            <p className="text-lg font-semibold text-black">
              {brandVisibility}%
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Share of Voice</p>
            <p className="text-lg font-semibold text-black">{shareOfVoice}%</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Average Position</p>
            <p className="text-lg font-semibold text-black">#{averagePosition}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Sentiment Score</p>
            <p className="text-lg font-semibold text-black">{sentimentScore}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
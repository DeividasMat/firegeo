import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CompetitorRanking } from '@/lib/types';
import { IdentifiedCompetitor } from '@/lib/brand-monitor-reducer';

interface VisibilityScoreTabProps {
  competitors: CompetitorRanking[];
  brandData: CompetitorRanking;
  identifiedCompetitors: IdentifiedCompetitor[];
}

export function VisibilityScoreTab({
  competitors,
  brandData,
  identifiedCompetitors
}: VisibilityScoreTabProps) {
  const topCompetitor = competitors.filter(c => !c.isOwn)[0];
  const brandRank = competitors.findIndex(c => c.isOwn) + 1;
  const difference = topCompetitor ? brandData.visibilityScore - topCompetitor.visibilityScore : 0;
  
  return (
    <div className="flex flex-col h-full">
      {/* Main Content Card */}
      <Card className="p-2 bg-card text-card-foreground gap-6 rounded-xl border py-6 shadow-sm border-gray-200 h-full flex flex-col">
        <CardHeader className="border-b">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl font-semibold">Visibility Score</CardTitle>
              <CardDescription className="text-sm text-gray-600 mt-1">
                Your brand visibility across AI providers
              </CardDescription>
            </div>
            {/* Visibility Score in top right */}
            <div className="text-right">
              <p className="text-3xl font-bold text-orange-600">{brandData.visibilityScore}%</p>
              <p className="text-xs text-gray-500 mt-1">Visibility Score</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 flex-1">
          <div className="flex gap-8">
            {/* Left side - Pie Chart */}
            <div className="flex-1">
              <div className="h-80 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      <linearGradient id="orangeGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#fb923c" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                        <feOffset dx="0" dy="2" result="offsetblur"/>
                        <feFlood floodColor="#000000" floodOpacity="0.1"/>
                        <feComposite in2="offsetblur" operator="in"/>
                        <feMerge>
                          <feMergeNode/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <Pie
                      data={competitors.slice(0, 8).map((competitor) => ({
                        name: competitor.name,
                        value: competitor.visibilityScore,
                        isOwn: competitor.isOwn
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={1}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      animationBegin={0}
                      animationDuration={800}
                      filter="url(#shadow)"
                    >
                      {competitors.slice(0, 8).map((competitor, idx) => (
                        <Cell 
                          key={`cell-${idx}`} 
                          fill={competitor.isOwn ? 'url(#orangeGradient)' : 
                            ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#6366f1', '#14b8a6', '#f43f5e'][idx % 8]}
                          stroke={competitor.isOwn ? '#ea580c' : 'none'}
                          strokeWidth={competitor.isOwn ? 2 : 0}
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        padding: '8px 12px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                      formatter={(value: number, name: string) => [`${value}% visibility`, name]}
                      labelStyle={{ fontWeight: 600 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Center text showing relative performance */}
                <div className="absolute top-[50%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                  <p className="text-3xl font-bold text-gray-900">#{brandRank}</p>
                  <p className="text-sm text-gray-500 mt-1">Rank</p>
                  {difference !== 0 && (
                    <p className={`text-xs mt-2 font-medium ${difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {difference > 0 ? '+' : ''}{Math.abs(difference).toFixed(1)}% vs #1
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Right side - Legend */}
            <div className="w-80 space-y-2">
              {competitors.slice(0, 8).map((competitor, idx) => {
                const competitorData = identifiedCompetitors.find(c => 
                  c.name === competitor.name || 
                  c.name.toLowerCase() === competitor.name.toLowerCase()
                );
                const faviconUrl = competitorData?.url ? 
                  `https://www.google.com/s2/favicons?domain=${competitorData.url}&sz=64` : null;
                
                const color = competitor.isOwn ? '#ea580c' : 
                  ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#6366f1', '#14b8a6', '#f43f5e'][idx % 8];
                
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded flex items-center justify-center bg-gray-100 flex-shrink-0">
                        {faviconUrl ? (
                          <img 
                            src={faviconUrl}
                            alt={competitor.name}
                            className="w-4 h-4 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextSibling as HTMLDivElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full ${
                          competitor.isOwn ? 'bg-orange-500' : 'bg-gray-300'
                        } flex items-center justify-center text-white text-[8px] font-bold rounded`} 
                        style={{ display: faviconUrl ? 'none' : 'flex' }}>
                          {competitor.name.charAt(0)}
                        </div>
                      </div>
                      <span className={`text-sm truncate ${
                        competitor.isOwn ? 'font-semibold text-orange-600' : 'text-gray-700'
                      }`}>
                        {competitor.name}
                      </span>
                      <span className="text-sm font-medium text-gray-900 ml-auto">
                        {competitor.visibilityScore}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
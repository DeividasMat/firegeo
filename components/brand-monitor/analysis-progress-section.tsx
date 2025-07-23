import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, CheckIcon } from 'lucide-react';
import { Company, AnalysisStage } from '@/lib/types';
import { IdentifiedCompetitor, PromptCompletionStatus } from '@/lib/brand-monitor-reducer';
import { getEnabledProviders } from '@/lib/provider-config';

interface AnalysisProgressSectionProps {
  company: Company;
  analyzing: boolean;
  identifiedCompetitors: IdentifiedCompetitor[];
  scrapingCompetitors: boolean;
  analysisProgress: {
    stage: AnalysisStage;
    progress: number;
    message: string;
  };
  prompts: string[];
  customPrompts: string[];
  removedDefaultPrompts: number[];
  promptCompletionStatus: PromptCompletionStatus;
  onRemoveDefaultPrompt: (index: number) => void;
  onRemoveCustomPrompt: (prompt: string) => void;
  onAddPromptClick: () => void;
  onStartAnalysis: () => void;
  detectServiceType: (company: Company) => string;
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

export function AnalysisProgressSection({
  company,
  analyzing,
  identifiedCompetitors,
  scrapingCompetitors,
  analysisProgress,
  prompts,
  customPrompts,
  removedDefaultPrompts,
  promptCompletionStatus,
  onRemoveDefaultPrompt,
  onRemoveCustomPrompt,
  onAddPromptClick,
  onStartAnalysis,
  detectServiceType
}: AnalysisProgressSectionProps) {
  // Use AI-generated prompts only - no hardcoded fallbacks
  const displayPrompts = prompts.length > 0 ? prompts : customPrompts;
  
  return (
    <div className="flex items-center justify-center animate-panel-in">
      <div className="max-w-4xl w-full">
        <div className="transition-all duration-400 opacity-100 translate-y-0">
          <Card className="p-2 bg-card text-card-foreground gap-6 rounded-xl border py-6 shadow-sm border-gray-200 h-full flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-semibold">
                  {analyzing ? 'Analysis Progress' : 'Prompts'}
                </CardTitle>
                {/* Competitors list on the right */}
                {!analyzing && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Competitors:</span>
                    <div className="flex -space-x-2">
                      {identifiedCompetitors.slice(0, 6).map((comp, idx) => (
                        <div key={idx} className="w-8 h-8 rounded-full bg-white border-2 border-white shadow-sm overflow-hidden" title={comp.name}>
                          {comp.url ? (
                            <img 
                              src={`https://www.google.com/s2/favicons?domain=${comp.url}&sz=64`}
                              alt={comp.name}
                              className="w-full h-full object-contain p-0.5"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextSibling as HTMLDivElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600" style={{ display: comp.url ? 'none' : 'flex' }}>
                            {comp.name.charAt(0)}
                          </div>
                        </div>
                      ))}
                      {identifiedCompetitors.length > 6 && (
                        <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center">
                          <span className="text-xs text-gray-600 font-medium">+{identifiedCompetitors.length - 6}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {scrapingCompetitors && !analyzing && (
                <CardDescription className="mt-2 flex items-center justify-center gap-2 text-orange-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validating competitor data in background...</span>
                </CardDescription>
              )}
              {analyzing && analysisProgress && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <CardDescription className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                      <span>{analysisProgress.message}</span>
                    </CardDescription>
                    <span className="text-sm text-gray-500">{analysisProgress.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-orange-500 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${analysisProgress.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Prompts tiles */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displayPrompts.map((prompt, index) => {
                    const isCustom = customPrompts.includes(prompt);
                    return (
                      <div key={`${prompt}-${index}`} className="group relative bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-base font-medium text-gray-900 flex-1">
                            {prompt}
                          </p>
                          {!analyzing && !isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Since we removed defaultPrompts, remove prompt by finding its display index
                                const displayIndex = displayPrompts.findIndex(p => p === prompt);
                                if (displayIndex !== -1) {
                                  onRemoveDefaultPrompt(displayIndex);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          )}
                          {!analyzing && isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveCustomPrompt(prompt);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          )}
                        </div>
                        
                        {/* Provider icons and status */}
                        <div className="mt-4 flex items-center gap-3 justify-end">
                          {getEnabledProviders().map(config => {
                            const provider = config.name;
                            const normalizedPrompt = prompt.trim();
                            const status = analyzing ? (promptCompletionStatus[normalizedPrompt]?.[provider] || 'pending') : null;
                            
                            return (
                              <div key={`${prompt}-${provider}`} className="flex items-center gap-1">
                                {getProviderIcon(provider)}
                                {analyzing && (
                                  <>
                                    {status === 'pending' && (
                                      <div className="w-4 h-4 rounded-full border border-gray-300" />
                                    )}
                                    {status === 'running' && (
                                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                                    )}
                                    {status === 'completed' && (
                                      <CheckIcon className="w-4 h-4 text-green-500" />
                                    )}
                                    {status === 'failed' && (
                                      <div className="w-4 h-4 rounded-full bg-red-500" />
                                    )}
                                    {status === 'skipped' && (
                                      <div className="w-4 h-4 rounded-full bg-gray-400" />
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {isCustom && <Badge variant="outline" className="text-xs mt-2">Custom</Badge>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Prompt Button */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={onAddPromptClick}
                  disabled={analyzing}
                  className="h-9 rounded-[10px] text-sm font-medium flex items-center transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 bg-[#36322F] text-[#fff] hover:bg-[#4a4542] disabled:bg-[#8c8885] disabled:hover:bg-[#8c8885] [box-shadow:inset_0px_-2.108433723449707px_0px_0px_#171310,_0px_1.2048193216323853px_6.325301647186279px_0px_rgba(58,_33,_8,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#171310,_0px_1px_3px_0px_rgba(58,_33,_8,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#171310,_0px_1px_2px_0px_rgba(58,_33,_8,_30%)] disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:scale-100 px-4 py-1 gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Prompt
                </button>
              </div>

              {/* Start Analysis Button */}
              <div className="flex justify-center pt-4">
                <button
                  onClick={onStartAnalysis}
                  disabled={analyzing}
                  className="h-10 px-6 rounded-[10px] text-sm font-medium flex items-center transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 bg-orange-500 text-white hover:bg-orange-600 [box-shadow:inset_0px_-2.108433723449707px_0px_0px_#c2410c,_0px_1.2048193216323853px_6.325301647186279px_0px_rgba(234,_88,_12,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#c2410c,_0px_1px_3px_0px_rgba(234,_88,_12,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#c2410c,_0px_1px_2px_0px_rgba(234,_88,_12,_30%)] disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:scale-100"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    'Start Analysis'
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
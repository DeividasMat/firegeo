'use client';

import React, { useReducer, useCallback, useState, useEffect, useRef } from 'react';
import { Company } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

import { ClientApiError } from '@/lib/client-errors';
import { 
  brandMonitorReducer, 
  initialBrandMonitorState,
  BrandMonitorAction,
  IdentifiedCompetitor
} from '@/lib/brand-monitor-reducer';
import {
  validateUrl,
  validateCompetitorUrl,
  normalizeCompetitorName,
  assignUrlToCompetitor,
  detectServiceType,
  getIndustryCompetitors
} from '@/lib/brand-monitor-utils';
import { getEnabledProviders } from '@/lib/provider-config';
import { useSaveBrandAnalysis } from '@/hooks/useBrandAnalyses';

// Components
import { UrlInputSection } from './url-input-section';
import { CompanyCard } from './company-card';
import { AnalysisProgressSection } from './analysis-progress-section';
import { ResultsNavigation } from './results-navigation';
import { PromptsResponsesTab } from './prompts-responses-tab';
import { VisibilityScoreTab } from './visibility-score-tab';
import { ErrorMessage } from './error-message';
import { AddPromptModal } from './modals/add-prompt-modal';
import { AddCompetitorModal } from './modals/add-competitor-modal';
import { ProviderComparisonMatrix } from './provider-comparison-matrix';
import { ProviderRankingsTabs } from './provider-rankings-tabs';

// Hooks
import { useSSEHandler } from './hooks/use-sse-handler';

interface BrandMonitorProps {
  selectedAnalysis?: any;
  onSaveAnalysis?: (analysis: any) => void;
}

export function BrandMonitor({ 
  selectedAnalysis,
  onSaveAnalysis 
}: BrandMonitorProps = {}) {
  const [state, dispatch] = useReducer(brandMonitorReducer, initialBrandMonitorState);
  const [demoUrl] = useState('example.com');
  const saveAnalysis = useSaveBrandAnalysis();
  const [isLoadingExistingAnalysis, setIsLoadingExistingAnalysis] = useState(false);
  const hasSavedRef = useRef(false);
  
  const { startSSEConnection } = useSSEHandler({ 
    state, 
    dispatch,
    onAnalysisComplete: (completedAnalysis) => {
      // Only save if this is a new analysis (not loaded from existing)
      if (!selectedAnalysis && !hasSavedRef.current) {
        hasSavedRef.current = true;
        
        const analysisData = {
          url: company?.url || url,
          companyName: company?.name,
          industry: company?.industry,
          analysisData: completedAnalysis,
          competitors: identifiedCompetitors,
          prompts: analyzingPrompts,
          creditsUsed: 0
        };
        
        // Try to save analysis, but don't fail if database is unavailable
        try {
          saveAnalysis.mutate(analysisData, {
            onSuccess: (savedAnalysis) => {
              console.log('Analysis saved successfully:', savedAnalysis);
              if (onSaveAnalysis) {
                onSaveAnalysis(savedAnalysis);
              }
            },
            onError: (error) => {
              console.warn('Failed to save analysis (continuing in free mode):', error);
              hasSavedRef.current = false;
              // Don't show error to user - just log it
            }
          });
        } catch (saveError) {
          console.warn('Analysis save unavailable in free mode:', saveError);
          hasSavedRef.current = false;
        }
      }
    }
  });
  
  // Extract state for easier access
  const {
    url,
    urlValid,
    error,
    loading,
    analyzing,
    preparingAnalysis,
    company,
    showInput,
    showCompanyCard,
    showPromptsList,
    showCompetitors,
    customPrompts,
    removedDefaultPrompts,
    identifiedCompetitors,
    availableProviders,
    analysisProgress,
    promptCompletionStatus,
    analyzingPrompts,
    analysis,
    activeResultsTab,
    expandedPromptIndex,
    showAddPromptModal,
    showAddCompetitorModal,
    newPromptText,
    newCompetitorName,
    newCompetitorUrl,
    scrapingCompetitors
  } = state;
  
  // Remove the auto-save effect entirely - we'll save manually when analysis completes
  
  // Load selected analysis if provided or reset when null
  useEffect(() => {
    if (selectedAnalysis && selectedAnalysis.analysisData) {
      setIsLoadingExistingAnalysis(true);
      // Restore the analysis state from saved data
      dispatch({ type: 'SET_ANALYSIS', payload: selectedAnalysis.analysisData });
      if (selectedAnalysis.companyName) {
        dispatch({ type: 'SCRAPE_SUCCESS', payload: {
          name: selectedAnalysis.companyName,
          url: selectedAnalysis.url,
          industry: selectedAnalysis.industry
        } as Company });
      }
      // Reset the flag after a short delay to ensure the save effect doesn't trigger
      setTimeout(() => setIsLoadingExistingAnalysis(false), 100);
    } else if (selectedAnalysis === null) {
      // Reset state when explicitly set to null (New Analysis clicked)
      dispatch({ type: 'RESET_STATE' });
      hasSavedRef.current = false;
      setIsLoadingExistingAnalysis(false);
    }
  }, [selectedAnalysis]);
  
  // Handlers
  const handleUrlChange = useCallback((newUrl: string) => {
    dispatch({ type: 'SET_URL', payload: newUrl });
    
    // Clear any existing error when user starts typing
    if (error) {
      dispatch({ type: 'SET_ERROR', payload: null });
    }
    
    // Validate URL on change
    if (newUrl.length > 0) {
      const isValid = validateUrl(newUrl);
      dispatch({ type: 'SET_URL_VALID', payload: isValid });
    } else {
      dispatch({ type: 'SET_URL_VALID', payload: null });
    }
  }, [error]);
  
  const handleScrape = useCallback(async () => {
    if (!url) {
      dispatch({ type: 'SET_ERROR', payload: 'Please enter a URL' });
      return;
    }

    // Validate URL
    if (!validateUrl(url)) {
      dispatch({ type: 'SET_ERROR', payload: 'Please enter a valid URL (e.g., example.com or https://example.com)' });
      dispatch({ type: 'SET_URL_VALID', payload: false });
      return;
    }

    // No credit checks needed - completely free platform

    console.log('Starting scrape for URL:', url);
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_URL_VALID', payload: true });
    
    try {
      const response = await fetch('/api/brand-monitor/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url,
          maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week in milliseconds
        }),
      });

      console.log('Scrape response status:', response.status);

      if (!response.ok) {
        try {
          const errorData = await response.json();
          console.warn('Scrape API returned error, but continuing in free mode:', errorData);
          
          // For auth errors, just continue - we're in free mode
          if (response.status === 401 || errorData.error?.includes('session')) {
            console.log('Authentication failed, but scraping may still work in free mode');
            // Don't throw error for auth issues - let the API handle it
          } else {
            throw new Error(errorData.error || 'Failed to scrape');
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'Failed to scrape') {
            console.warn('Error parsing response, continuing anyway');
          } else {
            throw e;
          }
        }
      }

      const data = await response.json();
      console.log('Scrape data received:', data);
      
      if (!data.company) {
        throw new Error('No company data received');
      }
      
      // Scrape was successful - no credit system needed
      
      // Start fade out transition
      dispatch({ type: 'SET_SHOW_INPUT', payload: false });
      
      // After fade out completes, set company and show card with fade in
      setTimeout(() => {
        dispatch({ type: 'SCRAPE_SUCCESS', payload: data.company });
        // Small delay to ensure DOM updates before fade in
        setTimeout(() => {
          dispatch({ type: 'SET_SHOW_COMPANY_CARD', payload: true });
          console.log('Showing company card');
        }, 50);
      }, 500);
    } catch (error: any) {
      let errorMessage = 'Failed to extract company information';
      if (error instanceof ClientApiError) {
        errorMessage = error.getUserMessage();
      } else if (error.message) {
        errorMessage = `Failed to extract company information: ${error.message}`;
      }
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      console.error('HandleScrape error:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [url]);
  
  const handlePrepareAnalysis = useCallback(async () => {
    if (!company) return;
    
    dispatch({ type: 'SET_PREPARING_ANALYSIS', payload: true });
    
    // Check which providers are available
    try {
      const response = await fetch('/api/brand-monitor/check-providers', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        dispatch({ type: 'SET_AVAILABLE_PROVIDERS', payload: data.providers || ['OpenAI', 'Anthropic', 'Google'] });
      }
    } catch (e) {
      // Default to providers with API keys if check fails
      const defaultProviders = [];
      if (process.env.NEXT_PUBLIC_HAS_OPENAI_KEY) defaultProviders.push('OpenAI');
      if (process.env.NEXT_PUBLIC_HAS_ANTHROPIC_KEY) defaultProviders.push('Anthropic');
      dispatch({ type: 'SET_AVAILABLE_PROVIDERS', payload: defaultProviders.length > 0 ? defaultProviders : ['OpenAI', 'Anthropic'] });
    }
    
    // Use AI to discover real competitors dynamically
    let competitors: IdentifiedCompetitor[] = [];
    
    try {
      console.log('🤖 Using AI to discover competitors for:', company.name);
      
      // Use basic AI competitor discovery (no enhanced system to avoid type errors)
      const response = await fetch('/api/brand-monitor/basic-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ AI discovered competitors:', data.competitors);
        
                 // Convert AI-discovered competitors to the expected format (allow more competitors)
         competitors = data.competitors.slice(0, 12).map((name: string) => ({
           name,
           url: assignUrlToCompetitor(name)
         }));
      } else {
        console.warn('AI competitor discovery failed, using scraped data');
        throw new Error('AI discovery failed');
      }
    } catch (error) {
      console.error('Error with AI competitor discovery:', error);
      
             // Fallback: Use only scraped competitors (no hardcoded industry defaults)  
       const extractedCompetitors = company.scrapedData?.competitors || [];
       if (extractedCompetitors.length > 0) {
         competitors = extractedCompetitors.slice(0, 10).map(name => ({
           name,
           url: assignUrlToCompetitor(name)
         }));
      } else {
        // Last resort: Show that no competitors were found
        competitors = [
          { name: `No specific competitors found for ${company.name}`, url: undefined }
        ];
      }
    }
    
    console.log('Identified competitors:', competitors);
    dispatch({ type: 'SET_IDENTIFIED_COMPETITORS', payload: competitors });
    
    // Show competitors on the same page with animation
    dispatch({ type: 'SET_SHOW_COMPETITORS', payload: true });
    dispatch({ type: 'SET_PREPARING_ANALYSIS', payload: false });
  }, [company]);
  
  const handleProceedToPrompts = useCallback(async () => {
    // Generate AI prompts FIRST, before navigation
    if (company && analyzingPrompts.length === 0) {
      console.log('🎯 Generating AI prompts BEFORE showing prompts screen...');
      
      try {
        const response = await fetch('/api/brand-monitor/generate-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            company,
            competitors: identifiedCompetitors.map(c => c.name)
          })
        });
        
        const responseData = await response.json();
        
        if (response.ok && responseData.success && responseData.prompts) {
          console.log(`✅ Pre-generated ${responseData.prompts.length} prompts BEFORE navigation`);
          dispatch({ type: 'SET_ANALYZING_PROMPTS', payload: responseData.prompts });
        } else {
          console.error('❌ Failed to pre-generate prompts:', responseData.details || responseData.error);
          dispatch({ type: 'SET_ERROR', payload: `Failed to generate analysis prompts: ${responseData.details || responseData.error}. Please try refreshing or contact support.` });
          return; // Don't proceed if prompt generation failed
        }
      } catch (error) {
        console.error('❌ Network error pre-generating prompts:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to connect to AI services for prompt generation. Please check your internet connection and try again.' });
        return; // Don't proceed if prompt generation failed
      }
    }
    
    // THEN navigate to prompts screen (prompts are already generated)
    // Add a fade-out class to the current view
    const currentView = document.querySelector('.animate-panel-in');
    if (currentView) {
      currentView.classList.add('opacity-0');
    }
    
    setTimeout(() => {
      dispatch({ type: 'SET_SHOW_COMPETITORS', payload: false });
      dispatch({ type: 'SET_SHOW_PROMPTS_LIST', payload: true });
    }, 300);
  }, [company, identifiedCompetitors, analyzingPrompts.length]);
  
  const handleAnalyze = useCallback(async () => {
    if (!company) return;

    // Reset saved flag for new analysis
    hasSavedRef.current = false;

    // No credit checks needed - completely free platform

    // Determine which prompts to use based on user's choices
    let allPrompts: string[] = [];
    
    // Priority 1: Use existing prompts (both generated and custom) if available
    if (analyzingPrompts.length > 0 || customPrompts.length > 0) {
      // Combine remaining generated prompts with custom prompts
      allPrompts = [...analyzingPrompts, ...customPrompts];
      console.log(`✅ Using ${analyzingPrompts.length} generated + ${customPrompts.length} custom prompts`);
    } else {
      // Priority 2: Only generate new prompts if user has NO prompts at all
      console.log('🎯 No prompts available, generating AI prompts as fallback...');
      
      try {
        const response = await fetch('/api/brand-monitor/generate-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            company,
            competitors: identifiedCompetitors.map(c => c.name)
          })
        });
        
        const responseData = await response.json();
        
        if (response.ok && responseData.success && responseData.prompts) {
          console.log(`✅ Generated ${responseData.prompts.length} fallback prompts`);
          allPrompts = responseData.prompts;
        } else {
          const errorMessage = responseData.details || responseData.error || 'Unknown error';
          console.error('❌ AI prompt generation failed:', errorMessage);
          dispatch({ type: 'SET_ERROR', payload: `AI prompt generation failed: ${errorMessage}. Please try again or contact support.` });
          return;
        }
      } catch (error) {
        console.error('❌ Network error during AI prompt generation:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to connect to AI services. Please check your internet connection and try again.' });
        return;
      }
    }
    
    // Ensure we have at least some prompts to analyze
    if (allPrompts.length === 0) {
      dispatch({ type: 'SET_ERROR', payload: 'No prompts available for analysis. Please add custom prompts or generate AI prompts.' });
      return;
    }
    
    // Store the prompts for UI display - make sure they're normalized
    const normalizedPrompts = allPrompts.map(p => p.trim());
    dispatch({ type: 'SET_ANALYZING_PROMPTS', payload: normalizedPrompts });

    console.log('Starting analysis...');
    
    dispatch({ type: 'SET_ANALYZING', payload: true });
    dispatch({ type: 'SET_ANALYSIS_PROGRESS', payload: {
      stage: 'initializing',
      progress: 0,
      message: 'Starting analysis...',
      competitors: [],
      prompts: [],
      partialResults: []
    }});
    dispatch({ type: 'SET_ANALYSIS_TILES', payload: [] });
    
    // Initialize prompt completion status
    const initialStatus: any = {};
    const expectedProviders = getEnabledProviders().map(config => config.name);
    
    normalizedPrompts.forEach(prompt => {
      initialStatus[prompt] = {};
      expectedProviders.forEach(provider => {
        initialStatus[prompt][provider] = 'pending';
      });
    });
    dispatch({ type: 'SET_PROMPT_COMPLETION_STATUS', payload: initialStatus });

    try {
      await startSSEConnection('/api/brand-monitor/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          company, 
          prompts: normalizedPrompts,
          competitors: identifiedCompetitors 
        }),
      });
    } finally {
      dispatch({ type: 'SET_ANALYZING', payload: false });
    }
  }, [company, removedDefaultPrompts, customPrompts, identifiedCompetitors, startSSEConnection]);
  
  const handleRestart = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
    hasSavedRef.current = false;
    setIsLoadingExistingAnalysis(false);
  }, []);

  const handleGenerateReport = useCallback(async () => {
    if (!analysis || !company) {
      console.error('No analysis data available for report generation');
      return;
    }

    try {
      console.log('🎯 Generating comprehensive report...');
      
      const response = await fetch('/api/brand-monitor/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          company,
          competitors: identifiedCompetitors
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      // Get the HTML content
      const reportHtml = await response.text();
      
      // Open in new window for PDF generation
      const reportWindow = window.open('', '_blank');
      if (reportWindow) {
        reportWindow.document.write(reportHtml);
        reportWindow.document.close();
        
        // Add print styles and trigger print dialog
        reportWindow.addEventListener('load', () => {
          // Add CSS for better printing
          const printCSS = reportWindow.document.createElement('style');
          printCSS.textContent = `
            @media print {
              body { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
              .section { page-break-before: always !important; }
              * { -webkit-print-color-adjust: exact !important; }
            }
          `;
          reportWindow.document.head.appendChild(printCSS);
          
          // Auto-trigger print dialog after a short delay
          setTimeout(() => {
            reportWindow.print();
          }, 1000);
        });
      } else {
        // Fallback: create downloadable HTML file
        const blob = new Blob([reportHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${company.name}-Brand-Analysis-Report.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

    } catch (error) {
      console.error('Error generating report:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: `Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    }
  }, [analysis, company, identifiedCompetitors]);
  
  const batchScrapeAndValidateCompetitors = useCallback(async (competitors: IdentifiedCompetitor[]) => {
    const validatedCompetitors = competitors.map(comp => ({
      ...comp,
      url: comp.url ? validateCompetitorUrl(comp.url) : undefined
    })).filter(comp => comp.url);
    
    if (validatedCompetitors.length === 0) return;
    
    // Implementation for batch scraping - you can move the full implementation here
    // For now, just logging
    console.log('Batch scraping validated competitors:', validatedCompetitors);
  }, []);
  
  
  // Find brand data
  const brandData = analysis?.competitors?.find(c => c.isOwn);
  
  return (
    <div className="flex flex-col">

      {/* URL Input Section */}
      {showInput && (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            <UrlInputSection
            url={url}
            urlValid={urlValid}
            loading={loading}
            analyzing={analyzing}
            onUrlChange={handleUrlChange}
            onSubmit={handleScrape}
          />
          </div>
        </div>
      )}

      {/* Company Card Section with Competitors */}
      {!showInput && company && !showPromptsList && !analyzing && !analysis && (
        <div className="flex items-center justify-center animate-panel-in">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            <div className="w-full space-y-6">
            <div className={`transition-all duration-500 ${showCompanyCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <CompanyCard 
                company={company}
                onAnalyze={handlePrepareAnalysis}
                analyzing={preparingAnalysis}
                showCompetitors={showCompetitors}
                identifiedCompetitors={identifiedCompetitors}
                onRemoveCompetitor={(idx) => dispatch({ type: 'REMOVE_COMPETITOR', payload: idx })}
                onAddCompetitor={() => {
                  dispatch({ type: 'TOGGLE_MODAL', payload: { modal: 'addCompetitor', show: true } });
                  dispatch({ type: 'SET_NEW_COMPETITOR', payload: { name: '', url: '' } });
                }}
                onContinueToAnalysis={handleProceedToPrompts}
              />
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompts List Section */}
      {showPromptsList && company && !analysis && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          <AnalysisProgressSection
          company={company}
          analyzing={analyzing}
          identifiedCompetitors={identifiedCompetitors}
          scrapingCompetitors={scrapingCompetitors}
          analysisProgress={analysisProgress}
          prompts={analyzingPrompts}
          customPrompts={customPrompts}
          removedDefaultPrompts={removedDefaultPrompts}
          promptCompletionStatus={promptCompletionStatus}
          onRemoveDefaultPrompt={(index) => dispatch({ type: 'REMOVE_DEFAULT_PROMPT', payload: index })}
          onRemoveCustomPrompt={(prompt) => {
            dispatch({ type: 'SET_CUSTOM_PROMPTS', payload: customPrompts.filter(p => p !== prompt) });
          }}
          onRemovePrompt={(prompt) => {
            dispatch({ type: 'SET_ANALYZING_PROMPTS', payload: analyzingPrompts.filter(p => p !== prompt) });
          }}
          onAddPromptClick={() => {
            dispatch({ type: 'TOGGLE_MODAL', payload: { modal: 'addPrompt', show: true } });
            dispatch({ type: 'SET_NEW_PROMPT_TEXT', payload: '' });
          }}
          onStartAnalysis={handleAnalyze}
          detectServiceType={detectServiceType}
        />
        </div>
      )}

      {/* Analysis Results */}
      {analysis && brandData && (
        <div className="flex-1 flex justify-center animate-panel-in pt-8">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            <div className="flex gap-6 relative">
            {/* Sidebar Navigation */}
            <ResultsNavigation
              activeTab={activeResultsTab}
              onTabChange={(tab) => {
                dispatch({ type: 'SET_ACTIVE_RESULTS_TAB', payload: tab });
              }}
              onRestart={handleRestart}
            />
            
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col">
              <div className="w-full flex-1 flex flex-col">
                {/* Tab Content */}
                {activeResultsTab === 'visibility' && (
                  <VisibilityScoreTab
                    competitors={analysis.competitors}
                    brandData={brandData}
                    identifiedCompetitors={identifiedCompetitors}
                  />
                )}

                {activeResultsTab === 'matrix' && (
                  <Card className="p-2 bg-card text-card-foreground gap-6 rounded-xl border py-6 shadow-sm border-gray-200 h-full flex flex-col">
                    <CardHeader className="border-b">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-xl font-semibold">Comparison Matrix</CardTitle>
                          <CardDescription className="text-sm text-gray-600 mt-1">
                            Compare visibility scores across different AI providers
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-orange-600">
                            {(() => {
                              // Calculate actual average across AI providers
                              const brandComparison = analysis.providerComparison?.find(comp => comp.isOwn);
                              if (brandComparison?.providers) {
                                const providerScores = Object.values(brandComparison.providers)
                                  .map((p: any) => p.visibilityScore || 0)
                                  .filter(score => score > 0);
                                const average = providerScores.length > 0 
                                  ? Math.round(providerScores.reduce((sum, score) => sum + score, 0) / providerScores.length)
                                  : brandData.visibilityScore;
                                return `${average}%`;
                              }
                              return `${brandData.visibilityScore}%`;
                            })()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Provider Average</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 flex-1 overflow-auto">
                      {analysis.providerComparison ? (
                        <ProviderComparisonMatrix 
                          data={analysis.providerComparison} 
                          brandName={company?.name || ''} 
                          competitors={identifiedCompetitors}
                        />
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <p>No comparison data available</p>
                          <p className="text-sm mt-2">Please ensure AI providers are configured and the analysis has completed.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {activeResultsTab === 'rankings' && analysis.providerRankings && (
                  <div id="provider-rankings" className="h-full">
                    <ProviderRankingsTabs 
                      providerRankings={analysis.providerRankings} 
                      brandName={company?.name || 'Your Brand'}
                      shareOfVoice={brandData.shareOfVoice}
                      averagePosition={Math.round(brandData.averagePosition)}
                      sentimentScore={brandData.sentimentScore}
                      weeklyChange={brandData.weeklyChange}
                    />
                  </div>
                )}

                {activeResultsTab === 'prompts' && analysis.prompts && (
                  <Card className="p-2 bg-card text-card-foreground gap-6 rounded-xl border py-6 shadow-sm border-gray-200 h-full flex flex-col">
                    <CardHeader className="border-b">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-xl font-semibold">Prompts & Responses</CardTitle>
                          <CardDescription className="text-sm text-gray-600 mt-1">
                            AI responses to your brand queries
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-orange-600">{analysis.prompts.length}</p>
                          <p className="text-xs text-gray-500 mt-1">Total Prompts</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 flex-1 overflow-auto">
                      <PromptsResponsesTab
                        prompts={analysis.prompts}
                        responses={analysis.responses}
                        expandedPromptIndex={expandedPromptIndex}
                        onToggleExpand={(index) => dispatch({ type: 'SET_EXPANDED_PROMPT_INDEX', payload: index })}
                        brandName={analysis.company?.name || ''}
                        competitors={analysis.competitors?.map(c => c.name) || []}
                      />
                    </CardContent>
                  </Card>
                )}

                {activeResultsTab === 'report' && (
                  <Card className="p-2 bg-card text-card-foreground gap-6 rounded-xl border py-6 shadow-sm border-gray-200 h-full flex flex-col">
                    <CardHeader className="border-b">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-xl font-semibold flex items-center gap-2">
                            📊 PDF Report
                          </CardTitle>
                          <CardDescription className="text-sm text-gray-600 mt-1">
                            Generate comprehensive analysis report with AI insights
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">PDF</p>
                          <p className="text-xs text-gray-500 mt-1">Download Ready</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 flex-1 flex flex-col justify-center items-center">
                      <div className="text-center max-w-md">
                        <div className="mb-8">
                          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">Professional Analysis Report</h3>
                          <p className="text-gray-600 mb-6">
                            Generate a comprehensive PDF report with AI-powered insights, executive summary, competitive analysis, and strategic recommendations.
                          </p>
                        </div>
                        
                        <div className="bg-gray-50 rounded-lg p-4 mb-6">
                          <h4 className="font-medium text-gray-900 mb-3">Report Includes:</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Executive Summary
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Competitive Analysis
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Search Performance
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Strategic Recommendations
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Market Positioning
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Methodology
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={handleGenerateReport}
                          className="w-full bg-blue-600 text-white font-medium py-4 px-6 rounded-[10px] hover:bg-blue-700 transition-all duration-200 [box-shadow:inset_0px_-2.108433723449707px_0px_0px_#1e40af,_0px_1.2048193216323853px_6.325301647186279px_0px_rgba(59,_130,_246,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#1e40af,_0px_1px_3px_0px_rgba(59,_130,_246,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#1e40af,_0px_1px_2px_0px_rgba(59,_130,_246,_30%)] flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Generate & Download PDF Report
                        </button>
                        
                        <p className="text-xs text-gray-500 mt-3">
                          Report will open in a new window with print-to-PDF option
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <ErrorMessage
          error={error}
          onDismiss={() => dispatch({ type: 'SET_ERROR', payload: null })}
        />
      )}
      
      {/* Modals */}
      <AddPromptModal
        isOpen={showAddPromptModal}
        promptText={newPromptText}
        onPromptTextChange={(text) => dispatch({ type: 'SET_NEW_PROMPT_TEXT', payload: text })}
        onAdd={() => {
          if (newPromptText.trim()) {
            dispatch({ type: 'ADD_CUSTOM_PROMPT', payload: newPromptText.trim() });
            dispatch({ type: 'TOGGLE_MODAL', payload: { modal: 'addPrompt', show: false } });
            dispatch({ type: 'SET_NEW_PROMPT_TEXT', payload: '' });
          }
        }}
        onClose={() => {
          dispatch({ type: 'TOGGLE_MODAL', payload: { modal: 'addPrompt', show: false } });
          dispatch({ type: 'SET_NEW_PROMPT_TEXT', payload: '' });
        }}
      />

      <AddCompetitorModal
        isOpen={showAddCompetitorModal}
        competitorName={newCompetitorName}
        competitorUrl={newCompetitorUrl}
        onNameChange={(name) => dispatch({ type: 'SET_NEW_COMPETITOR', payload: { name } })}
        onUrlChange={(url) => dispatch({ type: 'SET_NEW_COMPETITOR', payload: { url } })}
        onAdd={async () => {
          if (newCompetitorName.trim()) {
            const rawUrl = newCompetitorUrl.trim();
            const validatedUrl = rawUrl ? validateCompetitorUrl(rawUrl) : undefined;
            
            const newCompetitor: IdentifiedCompetitor = {
              name: newCompetitorName.trim(),
              url: validatedUrl
            };
            
            dispatch({ type: 'ADD_COMPETITOR', payload: newCompetitor });
            dispatch({ type: 'TOGGLE_MODAL', payload: { modal: 'addCompetitor', show: false } });
            dispatch({ type: 'SET_NEW_COMPETITOR', payload: { name: '', url: '' } });
            
            // Batch scrape and validate the new competitor if it has a URL
            if (newCompetitor.url) {
              await batchScrapeAndValidateCompetitors([newCompetitor]);
            }
          }
        }}
        onClose={() => {
          dispatch({ type: 'TOGGLE_MODAL', payload: { modal: 'addCompetitor', show: false } });
          dispatch({ type: 'SET_NEW_COMPETITOR', payload: { name: '', url: '' } });
        }}
      />
    </div>
  );
}
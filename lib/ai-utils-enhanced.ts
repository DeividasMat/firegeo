import { generateObject, generateText } from 'ai';
import { Company, BrandPrompt, AIResponse, CompanyRanking, CompetitorRanking, ProviderSpecificRanking, ProviderComparisonData, ProgressCallback, CompetitorFoundData } from './types';
import { z } from 'zod';
import { analyzePromptWithProvider } from './ai-utils';
import { getConfiguredProviders, getProviderModel } from './provider-config';

// Enhanced schemas for AI responses
const EnhancedCompetitorSchema = z.object({
  competitors: z.array(z.object({
    name: z.string().describe('Full company name'),
    industry: z.string().describe('Primary industry/sector'),
    description: z.string().describe('Brief description of what they do'),
    competitorType: z.enum(['direct', 'indirect']).describe('direct = exact same products/services, indirect = adjacent/related products'),
    marketOverlap: z.enum(['high', 'medium', 'low']).describe('how much market overlap with the main company'),
    reasoning: z.string().describe('Why this is considered a competitor'),
    targetMarket: z.string().describe('Their target customer segment'),
    businessModel: z.string().describe('Their business model (B2B, B2C, DTC, etc.)'),
    keyStrengths: z.array(z.string()).describe('Their main competitive advantages'),
    marketShare: z.enum(['large', 'medium', 'small', 'niche']).describe('Estimated market position'),
    geography: z.string().describe('Geographic focus (global, US, Europe, etc.)'),
    isPublicCompany: z.boolean().describe('Whether it is a publicly traded company'),
    estimatedRevenue: z.string().describe('Estimated revenue range if known'),
    websiteUrl: z.string().optional().describe('Company website if known')
  }))
});

const IndustryAnalysisSchema = z.object({
  industry: z.string().describe('Refined industry classification'),
  marketSize: z.string().describe('Estimated market size'),
  keyTrends: z.array(z.string()).describe('Current industry trends'),
  competitiveFactors: z.array(z.string()).describe('Key factors that determine competitiveness'),
  customerSegments: z.array(z.string()).describe('Main customer segments in this industry'),
  distributionChannels: z.array(z.string()).describe('Common distribution channels'),
  pricingModels: z.array(z.string()).describe('Common pricing strategies'),
  keyMetrics: z.array(z.string()).describe('Important KPIs/metrics in this industry'),
  marketChallenges: z.array(z.string()).describe('Current market challenges'),
  futureOpportunities: z.array(z.string()).describe('Emerging opportunities')
});

const PromptGenerationSchema = z.object({
  prompts: z.array(z.object({
    prompt: z.string().describe('The actual prompt text to ask AI models'),
    category: z.string().describe('Category like Brand Recognition, Product Quality, etc.'),
    reasoning: z.string().describe('Why this prompt is important for this industry'),
    expectedInsights: z.array(z.string()).describe('What insights this prompt should reveal'),
    competitorRelevance: z.string().describe('How this applies to competitor analysis')
  }))
});

// Enhanced competitor discovery using multiple AI providers
export async function discoverCompetitorsEnhanced(
  company: Company, 
  progressCallback?: ProgressCallback
): Promise<{competitors: any[], industryAnalysis: any}> {
  
  console.log('🔍 Starting enhanced competitor discovery for:', company.name);
  
  const configuredProviders = getConfiguredProviders();
  if (configuredProviders.length === 0) {
    throw new Error('No AI providers configured and enabled');
  }

  // Stage 1: Industry Analysis
  progressCallback?.({ 
    type: 'progress', 
    stage: 'identifying-competitors',
    data: { 
      stage: 'identifying-competitors', 
      progress: 10, 
      message: 'Analyzing industry landscape...' 
    },
    timestamp: new Date()
  });

  const industryAnalysisPrompt = `Analyze the industry for ${company.name}:

Company: ${company.name}
Industry: ${company.industry || 'Unknown'}
Description: ${company.description || 'No description provided'}
${company.scrapedData?.keywords ? `Keywords: ${company.scrapedData.keywords.join(', ')}` : ''}
${company.scrapedData?.mainProducts ? `Products: ${company.scrapedData.mainProducts.join(', ')}` : ''}

Provide a comprehensive industry analysis including market size, trends, competitive factors, and customer segments.`;

  let industryAnalysis;
  try {
    const provider = configuredProviders[0];
    const model = getProviderModel(provider.id, provider.defaultModel);
    if (!model) {
      throw new Error(`Model not available for ${provider.name}`);
    }
    
    const { object } = await generateObject({
      model,
      schema: IndustryAnalysisSchema,
      prompt: industryAnalysisPrompt,
      temperature: 0.2,
    });
    
    industryAnalysis = object;
    console.log('📊 Industry analysis completed:', industryAnalysis.industry);
  } catch (error) {
    console.error('Error analyzing industry:', error);
    industryAnalysis = {
      industry: company.industry || 'Technology',
      marketSize: 'Unknown',
      keyTrends: [],
      competitiveFactors: ['Product quality', 'Price', 'Brand recognition'],
      customerSegments: ['Business users', 'Individual consumers'],
      distributionChannels: ['Online', 'Direct sales'],
      pricingModels: ['Subscription', 'One-time purchase'],
      keyMetrics: ['Market share', 'Customer satisfaction'],
      marketChallenges: ['Competition', 'Market saturation'],
      futureOpportunities: ['Digital transformation', 'Global expansion']
    };
  }

  // Stage 2: Multi-provider competitor discovery
  progressCallback?.({ 
    type: 'progress', 
    stage: 'identifying-competitors',
    data: { 
      stage: 'identifying-competitors', 
      progress: 30, 
      message: 'Discovering competitors using multiple AI providers...' 
    },
    timestamp: new Date()
  });

  const allCompetitors = new Map();
  
  // Use multiple providers for more comprehensive results
  const providersToUse = configuredProviders.slice(0, Math.min(3, configuredProviders.length));
  
  for (let i = 0; i < providersToUse.length; i++) {
    const provider = providersToUse[i];
    
    try {
      progressCallback?.({ 
        type: 'progress', 
        stage: 'identifying-competitors',
        data: { 
          stage: 'identifying-competitors', 
          progress: 30 + (i * 20), 
          message: `Using ${provider.name} to find competitors...` 
        },
        timestamp: new Date()
      });

      const model = getProviderModel(provider.id, provider.defaultModel);
      if (!model) continue;

      const competitorPrompt = `You are a market research expert. Identify the top 8-12 competitors for ${company.name}.

Company Details:
- Name: ${company.name}
- Industry: ${industryAnalysis.industry}
- Description: ${company.description || 'No description provided'}
- Products/Services: ${company.scrapedData?.mainProducts?.join(', ') || 'Unknown'}
- Target Market: ${industryAnalysis.customerSegments.join(', ')}

Industry Context:
- Market Size: ${industryAnalysis.marketSize}
- Key Competitive Factors: ${industryAnalysis.competitiveFactors.join(', ')}
- Distribution Channels: ${industryAnalysis.distributionChannels.join(', ')}

Find competitors that:
1. Offer SIMILAR products/services (not just distributors/retailers)
2. Target SIMILAR customer segments  
3. Have SIMILAR business models
4. Actually compete for the same market share
5. Are established companies (not startups unless they're significant)

For each competitor, provide detailed analysis including their market position, key strengths, and why they compete with ${company.name}.

Focus on REAL, VERIFIABLE companies that actually exist and compete in this space.`;

      const { object } = await generateObject({
        model,
        schema: EnhancedCompetitorSchema,
        prompt: competitorPrompt,
        temperature: 0.3,
      });

      // Merge competitors from different providers
      object.competitors.forEach(competitor => {
        if (!allCompetitors.has(competitor.name.toLowerCase())) {
          allCompetitors.set(competitor.name.toLowerCase(), {
            ...competitor,
            sources: [provider.name],
            confidence: 1
          });
        } else {
          // Increase confidence if multiple providers suggest same competitor
          const existing = allCompetitors.get(competitor.name.toLowerCase());
          existing.sources.push(provider.name);
          existing.confidence += 1;
        }
      });

    } catch (error) {
      console.error(`Error with ${provider.name}:`, error);
    }
  }

  // Sort competitors by confidence and filter for quality 
  const competitors = Array.from(allCompetitors.values())
    .filter(comp => comp.competitorType === 'direct' || comp.marketOverlap === 'high')
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10); // Keep top 10 competitors

  console.log(`🎯 Found ${competitors.length} high-quality competitors`);

  // Send progress events for each competitor found
  for (let i = 0; i < competitors.length; i++) {
    progressCallback?.({
      type: 'competitor-found', 
      stage: 'identifying-competitors',
      data: { competitor: competitors[i].name },
      timestamp: new Date()
    });
  }

  progressCallback?.({ 
    type: 'progress', 
    stage: 'identifying-competitors',
    data: { 
      stage: 'identifying-competitors', 
      progress: 90, 
      message: `✅ Found ${competitors.length} competitors` 
    },
    timestamp: new Date()
  });

  return { competitors, industryAnalysis };
}

// Enhanced prompt generation based on industry analysis and competitors
export async function generateIndustrySpecificPrompts(
  company: Company, 
  competitors: any[], 
  industryAnalysis: any,
  progressCallback?: ProgressCallback
): Promise<BrandPrompt[]> {
  
  console.log('📝 Generating industry-specific prompts...');
  
  progressCallback?.({ 
    type: 'progress', 
    stage: 'generating-prompts',
    data: { 
      stage: 'generating-prompts', 
      progress: 20, 
      message: 'Creating industry-specific analysis prompts...' 
    },
    timestamp: new Date()
  });

  const configuredProviders = getConfiguredProviders();
  if (configuredProviders.length === 0) {
    throw new Error('No AI providers configured');
  }

  const provider = configuredProviders[0];
  const model = getProviderModel(provider.id, provider.defaultModel);
  if (!model) {
    throw new Error(`Model not available for ${provider.name}`);
  }
  
  const competitorNames = competitors.map(c => c.name).join(', ');
  
  const promptGenerationRequest = `Create 6-8 highly specific analysis prompts for evaluating ${company.name} and its competitors in the ${industryAnalysis.industry} industry.

Company: ${company.name}
Industry: ${industryAnalysis.industry}
Key Competitors: ${competitorNames}

Industry Context:
- Competitive Factors: ${industryAnalysis.competitiveFactors.join(', ')}
- Customer Segments: ${industryAnalysis.customerSegments.join(', ')}
- Key Metrics: ${industryAnalysis.keyMetrics.join(', ')}
- Market Challenges: ${industryAnalysis.marketChallenges.join(', ')}
- Pricing Models: ${industryAnalysis.pricingModels.join(', ')}

Create prompts that will help analyze and compare these companies across the most important dimensions for this industry. Each prompt should:

1. Be specific to ${industryAnalysis.industry} industry dynamics
2. Focus on key competitive factors that matter most
3. Be designed to compare ${company.name} against these specific competitors
4. Help understand market positioning and competitive advantages
5. Reveal insights about customer preferences and market trends

Make the prompts actionable and focused on real competitive intelligence that would be valuable for business strategy.

Examples of good prompts for different industries:
- SaaS: "Which project management tool offers the best integrations with enterprise software?"
- E-commerce: "Which fashion brand has the most sustainable and ethical manufacturing practices?"
- Fintech: "Which digital payment platform provides the most secure transactions for small businesses?"

Generate prompts that are similarly specific and strategic for the ${industryAnalysis.industry} industry.`;

  try {
    const { object } = await generateObject({
      model,
      schema: PromptGenerationSchema,
      prompt: promptGenerationRequest,
      temperature: 0.4,
    });

    const prompts: BrandPrompt[] = object.prompts.map((p, index) => ({
      id: `enhanced-${index + 1}`,
      prompt: p.prompt,
      category: (p.category as any) || 'analysis'
    }));

    console.log(`✅ Generated ${prompts.length} industry-specific prompts`);
    
    progressCallback?.({ 
      type: 'progress', 
      stage: 'generating-prompts',
      data: { 
        stage: 'generating-prompts', 
        progress: 90, 
        message: `✅ Created ${prompts.length} strategic analysis prompts` 
      },
      timestamp: new Date()
    });

    return prompts;

    } catch (error) {
    console.error('❌ AI prompt generation failed completely:', error);
    throw new Error(`AI prompt generation failed: ${(error as Error).message}. No fallback available - all prompts must be AI-generated.`);
  }
}

// Enhanced analysis function that analyzes both company and competitors
export async function analyzeCompanyAndCompetitors(
  company: Company,
  competitors: any[],
  prompts: BrandPrompt[],
  progressCallback?: ProgressCallback
): Promise<{companyResults: any[], competitorResults: Map<string, any[]>}> {
  
  console.log('🔬 Starting comprehensive analysis...');
  
  const configuredProviders = getConfiguredProviders();
  const companyResults: any[] = [];
  const competitorResults = new Map<string, any[]>();
  
  // Initialize competitor results
  competitors.forEach(comp => {
    competitorResults.set(comp.name, []);
  });
  
  const totalAnalyses = prompts.length * configuredProviders.length * (1 + competitors.length);
  let completedAnalyses = 0;
  
  // Analyze main company
  for (const prompt of prompts) {
    for (const provider of configuredProviders) {
      try {
        progressCallback?.({
          type: 'progress',
          stage: 'analyzing-prompts', 
          message: `Analyzing ${company.name} with ${provider.name}...`,
          progress: Math.round((completedAnalyses / totalAnalyses) * 100)
        });
        
        const result = await analyzePromptWithProvider(
          prompt.prompt, 
          provider.id, 
          company.name, 
          competitors.map(c => c.name)
        );
        
        companyResults.push({
          prompt: prompt.prompt,
          category: prompt.category,
          provider: provider.id,
          result,
          target: company.name
        });
        
        completedAnalyses++;
      } catch (error) {
        console.error(`Error analyzing ${company.name} with ${provider.name}:`, error);
        completedAnalyses++;
      }
    }
  }
  
  // Analyze each competitor  
  for (const competitor of competitors) {
    for (const prompt of prompts) {
      for (const provider of configuredProviders) {
        try {
          progressCallback?.({
            type: 'progress',
            stage: 'analyzing-prompts',
            message: `Analyzing ${competitor.name} with ${provider.name}...`,
            progress: Math.round((completedAnalyses / totalAnalyses) * 100)
          });
          
          // Modify prompt to focus on the competitor
          const competitorPrompt = prompt.prompt.replace(company.name, competitor.name);
          
          const result = await analyzePromptWithProvider(
            competitorPrompt,
            provider.id,
            competitor.name,
            [company.name, ...competitors.filter(c => c.name !== competitor.name).map(c => c.name)]
          );
          
          const competitorResultList = competitorResults.get(competitor.name) || [];
          competitorResultList.push({
            prompt: competitorPrompt,
            category: prompt.category,
            provider: provider.id,
            result,
            target: competitor.name
          });
          
          completedAnalyses++;
        } catch (error) {
          console.error(`Error analyzing ${competitor.name} with ${provider.name}:`, error);
          completedAnalyses++;
        }
      }
    }
  }
  
  console.log(`✅ Completed analysis for ${company.name} and ${competitors.length} competitors`);
  
  return { companyResults, competitorResults };
}

// Enhanced comprehensive workflow
export async function runEnhancedBrandAnalysis(
  company: Company,
  customPrompts?: string[],
  progressCallback?: ProgressCallback
) {
  console.log('🚀 Starting enhanced brand analysis for:', company.name);
  
  try {
    // Stage 1: Enhanced competitor discovery
    const { competitors, industryAnalysis } = await discoverCompetitorsEnhanced(company, progressCallback);
    
    // Stage 2: Generate industry-specific prompts
    let analysisPrompts: BrandPrompt[];
    if (customPrompts && customPrompts.length > 0) {
      analysisPrompts = customPrompts.map((prompt, index) => ({
        id: index + 1,
        prompt,
        category: 'Custom'
      }));
    } else {
      analysisPrompts = await generateIndustrySpecificPrompts(company, competitors, industryAnalysis, progressCallback);
    }
    
    // Stage 3: Comprehensive analysis of company and competitors
    const { companyResults, competitorResults } = await analyzeCompanyAndCompetitors(
      company, 
      competitors, 
      analysisPrompts, 
      progressCallback
    );
    
    // Stage 4: Generate insights and recommendations
    progressCallback?.({
      type: 'progress',
      stage: 'analyzing-prompts',
      message: 'Generating competitive insights...',
      progress: 95
    });
    
    return {
      company,
      competitors,
      industryAnalysis,
      prompts: analysisPrompts,
      companyResults,
      competitorResults,
      summary: {
        totalCompetitors: competitors.length,
        totalAnalyses: companyResults.length + Array.from(competitorResults.values()).flat().length,
        industryInsights: industryAnalysis
      }
    };
    
  } catch (error) {
    console.error('Enhanced analysis error:', error);
    throw error;
  }
}
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { Company, BrandPrompt, AIResponse, CompanyRanking, CompetitorRanking, ProviderSpecificRanking, ProviderComparisonData, ProgressCallback, CompetitorFoundData } from './types';
import { getProviderModel, normalizeProviderName, isProviderConfigured, getConfiguredProviders, PROVIDER_CONFIGS } from './provider-config';
import { detectBrandMention, detectMultipleBrands, BrandDetectionOptions } from './brand-detection-utils';
import { getBrandDetectionOptions } from './brand-detection-config';

const RankingSchema = z.object({
  rankings: z.array(z.object({
    position: z.number(),
    company: z.string(),
    reason: z.string().optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  })),
  analysis: z.object({
    brandMentioned: z.boolean(),
    brandPosition: z.number().optional(),
    competitors: z.array(z.string()),
    overallSentiment: z.enum(['positive', 'neutral', 'negative']),
    confidence: z.number().min(0).max(1),
  }),
});

const CompetitorSchema = z.object({
  competitors: z.array(z.object({
    name: z.string(),
    description: z.string(),
    isDirectCompetitor: z.boolean(),
    marketOverlap: z.enum(['high', 'medium', 'low']),
    businessModel: z.string().describe('e.g., DTC brand, SaaS, API service, marketplace'),
    competitorType: z.enum(['direct', 'indirect', 'retailer', 'platform']).describe('direct = same products, indirect = adjacent products, retailer = sells products, platform = aggregates'),
  })),
});

export async function identifyCompetitors(company: Company, progressCallback?: ProgressCallback): Promise<string[]> {
  try {
    // Use AI to identify real competitors - find first available provider
    const configuredProviders = getConfiguredProviders();
    if (configuredProviders.length === 0) {
      throw new Error('No AI providers configured and enabled');
    }
    
    // Use the first available provider
    const provider = configuredProviders[0];
    const model = getProviderModel(provider.id, provider.defaultModel);
    if (!model) {
      throw new Error(`${provider.name} model not available`);
    }
    
    // Use AI to detect actual market presence for competitor discovery
    let location = 'Unknown';
    let markets: string[] = [];
    
    try {
      console.log('🌍 Analyzing company market presence for competitor discovery...');
      
      const description = company.scrapedData?.description || company.description || '';
      const keywords = company.scrapedData?.keywords || [];
      const mainProducts = company.scrapedData?.mainProducts || [];
      
      const marketAnalysisPrompt = `Analyze this company's actual market presence and geographic focus for competitor research:

Company: ${company.name}
Industry: ${company.industry}
URL: ${company.url}
Description: ${description}
Products/Services: ${mainProducts.join(', ')}
Keywords: ${keywords.join(', ')}

Determine where this company operates and serves customers:
1. PRIMARY MARKET: Main country/region where they operate
2. SECONDARY MARKETS: Other regions they serve  
3. MARKET SCOPE: Local, regional, national, or global

Look for clues like:
- Language/location mentions in description
- Domain extension hints (.lt = Lithuania focus)
- Service area mentions
- Target customer geography

Return ONLY a JSON object:
{
  "primaryMarket": "Country/Region name", 
  "secondaryMarkets": ["Country1", "Country2"],
  "marketScope": "local|regional|national|global"
}`;

      const { text } = await generateText({
        model,
        prompt: marketAnalysisPrompt,
        temperature: 0.3,
        maxTokens: 300,
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const marketData = JSON.parse(jsonMatch[0]);
        location = marketData.primaryMarket || 'Unknown';
        markets = [location, ...(marketData.secondaryMarkets || [])].filter(m => m !== 'Unknown');
        
        console.log('🌍 Detected operating markets:', { primary: location, secondary: marketData.secondaryMarkets });
      } else {
        throw new Error('No JSON found in market analysis response');
      }
    } catch (error) {
      console.error('Failed to analyze market presence, using fallback detection:', error);
      
      // Fallback to domain-based detection
      const companyUrl = company.url || '';
      if (companyUrl.includes('.lt')) location = 'Lithuania';
      else if (companyUrl.includes('.lv')) location = 'Latvia';
      else if (companyUrl.includes('.ee')) location = 'Estonia';
      else if (companyUrl.includes('.de')) location = 'Germany';
      else if (companyUrl.includes('.uk')) location = 'United Kingdom';
      else if (companyUrl.includes('.com')) location = 'Global';
      
      // Check description for location mentions
      const contextText = `${company.description || ''} ${company.scrapedData?.keywords?.join(' ') || ''}`.toLowerCase();
      if (contextText.includes('lithuania')) location = 'Lithuania';
      else if (contextText.includes('latvia')) location = 'Latvia';
      else if (contextText.includes('estonia')) location = 'Estonia';
      else if (contextText.includes('global') || contextText.includes('worldwide')) location = 'Global';
      
      markets = [location];
    }

    const prompt = `You are a market research expert. Find 8-12 direct competitors of this company, focusing on companies that operate in the SAME MARKETS where this company serves customers.

Company Profile:
- Industry: ${company.industry || 'Unknown'}
- Primary Market: ${location}
- Operating Markets: ${markets.join(', ')}
- Description: ${company.description || 'No description provided'}
${company.scrapedData?.keywords ? `- Key Areas: ${company.scrapedData.keywords.join(', ')}` : ''}
${company.scrapedData?.mainProducts ? `- Services/Products: ${company.scrapedData.mainProducts.join(', ')}` : ''}

MARKET-BASED COMPETITOR PRIORITY:
1. **PRIMARY FOCUS**: Find competitors that serve the same markets: ${markets.join(', ')}
2. **INDUSTRY MATCH**: Must be in ${company.industry || 'same industry'} with similar products/services
3. **CUSTOMER OVERLAP**: Target the same customer segments and geographic regions
4. **REAL COMPETITION**: Actually compete for the same customers, not just same industry

GEOGRAPHIC STRATEGY:
${location === 'Global' || location === 'United States' ? 
  `- Global company: Include major international competitors + regional leaders
  - Focus on companies with strong presence in key markets
  - Include both established players and emerging competitors` :
  `- Regional company: Prioritize competitors in ${location} and nearby regions
  - Include local/regional leaders first, then major international players with local presence
  - Focus on companies that actually serve ${location} market`
}

REQUIREMENTS:
- Find competitors that serve customers in: ${markets.join(', ')}
- Same industry (${company.industry || 'similar business model'})
- Similar target customers and business model
- Actually compete for market share (not just similar companies)
- Mix of local, regional, and international competitors based on company's market scope
- Verify companies exist and are active competitors

Focus on finding REAL COMPETITORS that this company would encounter when trying to win customers in their operating markets: ${markets.join(', ')}.`;

    const { object } = await generateObject({
      model,
      schema: CompetitorSchema,
      prompt,
      temperature: 0.3,
    });

    // Extract competitor names and filter for direct competitors
    // Exclude retailers and platforms unless the company itself is one
    const isRetailOrPlatform = company.industry?.toLowerCase().includes('marketplace') || 
                              company.industry?.toLowerCase().includes('platform') ||
                              company.industry?.toLowerCase().includes('retailer');
    
    const competitors = object.competitors
      .filter(c => {
        // Always include direct competitors with high market overlap
        if (c.isDirectCompetitor && c.marketOverlap === 'high') return true;
        
        // Exclude retailers/platforms for product companies
        if (!isRetailOrPlatform && (c.competitorType === 'retailer' || c.competitorType === 'platform')) {
          return false;
        }
        
        // Include other direct competitors and high-overlap indirect competitors
        return c.competitorType === 'direct' || (c.competitorType === 'indirect' && c.marketOverlap === 'high');
      })
      .map(c => c.name)
      .slice(0, 12); // Allow up to 12 competitors for better local coverage

    // Add any competitors found during scraping
    if (company.scrapedData?.competitors) {
      company.scrapedData.competitors.forEach(comp => {
        if (!competitors.includes(comp)) {
          competitors.push(comp);
        }
      });
    }

    // Send progress events for each competitor found
    if (progressCallback) {
      for (let i = 0; i < competitors.length; i++) {
        progressCallback({
          type: 'competitor-found',
          stage: 'identifying-competitors',
          data: {
            competitor: competitors[i],
            index: i + 1,
            total: competitors.length
          } as CompetitorFoundData,
          timestamp: new Date()
        });
      }
    }

    return competitors;
  } catch (error) {
    console.error('Error identifying competitors:', error);
    return company.scrapedData?.competitors || [];
  }
}

// Enhanced industry detection function
async function detectIndustryFromContent(company: Company): Promise<string> {
  // Start with explicit industry if set
  if (company.industry) {
    return company.industry;
  }

  // Analyze scraped content for better industry detection
  if (company.scrapedData) {
    const { title, description, mainContent, keywords } = company.scrapedData;
    
    // Combine all text content for analysis
    const allContent = [title, description, mainContent, ...(keywords || [])].join(' ').toLowerCase();
    
    // Enhanced keyword detection with context
    if (allContent.includes('web scraping') ||
        allContent.includes('scraping') ||
        allContent.includes('crawling') ||
        allContent.includes('web crawler') ||
        allContent.includes('data extraction') ||
        allContent.includes('html parsing')) {
      return 'web scraping';
    }
    
    if (allContent.includes('artificial intelligence') ||
        allContent.includes('machine learning') ||
        allContent.includes('ai model') ||
        allContent.includes('llm') ||
        allContent.includes('natural language')) {
      return 'artificial intelligence';
    }
    
    if (allContent.includes('deployment') ||
        allContent.includes('hosting') ||
        allContent.includes('cloud platform') ||
        allContent.includes('server') ||
        allContent.includes('infrastructure')) {
      return 'deployment platform';
    }
    
    if (allContent.includes('e-commerce') ||
        allContent.includes('ecommerce') ||
        allContent.includes('online store') ||
        allContent.includes('shopping cart')) {
      return 'e-commerce';
    }
    
    // Use first keyword as fallback
    if (keywords && keywords.length > 0) {
      return keywords[0];
    }
  }
  
  return 'technology';
}

export async function generatePromptsForCompany(company: Company, competitors: string[]): Promise<BrandPrompt[]> {
  console.log('🤖 Starting AI-powered prompt generation for:', company.name);
  
  // Get AI provider for prompt generation
  const configuredProviders = getConfiguredProviders();
  if (configuredProviders.length === 0) {
    throw new Error('No AI providers configured for prompt generation');
  }

  const provider = configuredProviders[0];
  const model = getProviderModel(provider.id, provider.defaultModel);
  if (!model) {
    throw new Error(`AI model not available for ${provider.name}`);
  }

  // Extract context from scraped data
  const scrapedData = company.scrapedData;
  const keywords = scrapedData?.keywords || [];
  const mainProducts = scrapedData?.mainProducts || [];
  const description = scrapedData?.description || company.description || '';
  
  // Use AI to detect actual market presence and operating regions
  let location = 'Unknown';
  let markets: string[] = [];
  
  try {
    console.log('🌍 Analyzing company market presence with AI...');
    
    const marketAnalysisPrompt = `Analyze this company's actual market presence and geographic focus:

Company: ${company.name}
Industry: ${company.industry}
URL: ${company.url}
Description: ${description}
Products/Services: ${mainProducts.join(', ')}
Keywords: ${keywords.join(', ')}

Determine:
1. PRIMARY MARKET: Where does this company primarily operate/serve customers?
2. SECONDARY MARKETS: What other regions do they serve?
3. TARGET GEOGRAPHY: Local, regional, national, or global focus?

Look for clues like:
- Mentions of countries, cities, regions in description
- Language used on website (Lithuanian content = serves Lithuania)
- Domain (.lt = likely Lithuania focus, .com = could be global)
- Product focus (local services vs global software)
- Keywords mentioning locations

Return ONLY a JSON object:
{
  "primaryMarket": "Country/Region name",
  "secondaryMarkets": ["Country1", "Country2"],
  "marketScope": "local|regional|national|global",
  "confidence": 0.8
}

Example outputs:
- Lithuanian company: {"primaryMarket": "Lithuania", "secondaryMarkets": ["Latvia", "Estonia"], "marketScope": "regional", "confidence": 0.9}
- US SaaS: {"primaryMarket": "United States", "secondaryMarkets": ["Canada", "Europe"], "marketScope": "global", "confidence": 0.8}
- Global service: {"primaryMarket": "Global", "secondaryMarkets": [], "marketScope": "global", "confidence": 0.7}`;

    const { text } = await generateText({
      model,
      prompt: marketAnalysisPrompt,
      temperature: 0.3,
      maxTokens: 300,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const marketData = JSON.parse(jsonMatch[0]);
      location = marketData.primaryMarket || 'Unknown';
      markets = [location, ...(marketData.secondaryMarkets || [])].filter(m => m !== 'Unknown');
      
      console.log('🌍 AI detected markets:', {
        primary: location,
        secondary: marketData.secondaryMarkets,
        scope: marketData.marketScope,
        confidence: marketData.confidence
      });
    }
  } catch (error) {
    console.error('Failed to analyze market presence with AI, falling back to domain detection:', error);
    
    // Fallback to domain + content analysis
    const companyUrl = company.url || '';
    if (companyUrl.includes('.lt')) location = 'Lithuania';
    else if (companyUrl.includes('.lv')) location = 'Latvia';
    else if (companyUrl.includes('.ee')) location = 'Estonia';
    else if (companyUrl.includes('.fi')) location = 'Finland';
    else if (companyUrl.includes('.se')) location = 'Sweden';
    else if (companyUrl.includes('.de')) location = 'Germany';
    else if (companyUrl.includes('.fr')) location = 'France';
    else if (companyUrl.includes('.uk') || companyUrl.includes('.co.uk')) location = 'United Kingdom';
    else if (companyUrl.includes('.au')) location = 'Australia';
    else if (companyUrl.includes('.ca')) location = 'Canada';
    else if (companyUrl.includes('.com') || companyUrl.includes('.org') || companyUrl.includes('.net')) location = 'United States';
    
    // Check description for location mentions
    const contextText = `${description} ${keywords.join(' ')}`.toLowerCase();
    if (contextText.includes('lithuania') || contextText.includes('vilnius') || contextText.includes('kaunas')) location = 'Lithuania';
    else if (contextText.includes('latvia') || contextText.includes('riga')) location = 'Latvia';
    else if (contextText.includes('estonia') || contextText.includes('tallinn')) location = 'Estonia';
    else if (contextText.includes('europe') || contextText.includes('european')) location = 'Europe';
    else if (contextText.includes('global') || contextText.includes('worldwide') || contextText.includes('international')) location = 'Global';
    
    markets = [location];
  }

  console.log('🔍 Company context for AI prompt generation:', {
    name: company.name,
    industry: company.industry,
    location,
    mainProducts,
    keywords: keywords.slice(0, 5),
    competitors: competitors.slice(0, 5)
  });

  // Create comprehensive AI prompt for generating analysis prompts
  const primaryMarket = location;
  const isGlobal = location === 'Global' || location === 'United States' || markets.some(m => m === 'Global');
  
  const aiPromptRequest = `You are an expert at creating search queries that real people would use. Generate 30 analysis prompts for ${company.industry} companies: 27 SIMPLE popular searches + 3 ADVANCED analysis prompts.

Company Profile:
- Name: ${company.name}
- Industry: ${company.industry}
- Primary Market: ${primaryMarket}
- Market Scope: ${isGlobal ? 'Global/International' : 'Local/Regional'}
- Products/Services: ${mainProducts.join(', ') || 'Not specified'}
- Description: ${description}
- Keywords: ${keywords.join(', ')}

Key Competitors: ${competitors.join(', ')}

MARKET-AWARE PROMPT GENERATION:
${isGlobal ? 
  `- This is a GLOBAL/INTERNATIONAL company - create prompts that reflect international scope
  - Use broader geographic terms: "best globally", "worldwide leaders", "top international"
  - Focus on global market leadership and international presence` :
  `- This is a LOCAL/REGIONAL company with primary market: ${primaryMarket}
  - Make prompts location-specific to their PRIMARY MARKET ONLY
  - Use specific geographic terms: "in ${primaryMarket}", "best in ${primaryMarket}"
  - DO NOT use multiple countries - focus on ${primaryMarket} only`
}

REQUIREMENTS:
Generate EXACTLY 30 prompts in this structure:

**27 SIMPLE PROMPTS (what people actually search for):**
- Use simple, common language that real people search on Google
- Focus on "best", "top", "most trusted", "cheapest", "fastest", "affordable", "reliable", etc.
- Make them market-specific to PRIMARY MARKET: ${primaryMarket}
- Include variety: price-focused, quality-focused, speed-focused, trust-focused, feature-focused
- Examples: "best business credit companies${isGlobal ? ' globally' : ' in ' + primaryMarket}", "most trusted ${company.industry} providers", "cheapest ${company.industry} options"

**3 ADVANCED PROMPTS (detailed analysis):**
- More sophisticated comparative analysis  
- Focus on specific business factors, innovation, market positioning, strategic advantages
- Still no company names mentioned
- Examples: "Which ${company.industry} providers offer the most innovative solutions?", "How do leading companies differentiate their services?"

DO NOT mention specific company names in any prompts - use generic terms.

Examples for ${company.industry}:
SIMPLE: "best ${company.industry} companies${isGlobal ? ' worldwide' : ' in ' + primaryMarket}"
SIMPLE: "most trusted ${company.industry} providers${isGlobal ? '' : ' in ' + primaryMarket}" 
SIMPLE: "cheapest ${company.industry} options"
SIMPLE: "fastest ${company.industry} services"
SIMPLE: "most reliable ${company.industry} companies"
SIMPLE: "affordable ${company.industry} solutions"
ADVANCED: "Which ${company.industry} providers demonstrate the strongest competitive advantages in emerging market segments?"
ADVANCED: "How do leading ${company.industry} companies differentiate their value proposition?"
ADVANCED: "What are the key innovation trends among top ${company.industry} providers?"

Return ONLY a JSON array with this exact format:
[
  {"prompt": "best ${company.industry} companies${isGlobal ? ' worldwide' : ' in ' + primaryMarket}", "category": "simple"},
  {"prompt": "most trusted ${company.industry} providers", "category": "simple"},
  {"prompt": "top rated ${company.industry} companies", "category": "simple"},
  ...27 simple prompts total...
  {"prompt": "Which ${company.industry} providers demonstrate the strongest competitive advantages in emerging market segments?", "category": "advanced"},
  {"prompt": "How do leading ${company.industry} companies differentiate their value proposition?", "category": "advanced"},
  {"prompt": "What are the key innovation trends among top ${company.industry} providers?", "category": "advanced"}
]

Generate exactly 30 prompts: 27 simple + 3 advanced.`;

  console.log('🤖 Sending AI request for dynamic prompt generation...');

  try {
    // Use AI to generate prompts dynamically
    const { text } = await generateText({
      model,
      prompt: aiPromptRequest,
      temperature: 0.4,
      maxTokens: 2000,
    });

    console.log('🤖 AI response received:', text.substring(0, 200) + '...');

    // Parse the AI response
    let aiGeneratedPrompts;
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiGeneratedPrompts = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON array found in AI response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      throw new Error('AI generated invalid prompt format');
    }

    // Validate and convert to BrandPrompt format
    const prompts: BrandPrompt[] = aiGeneratedPrompts
      .filter((p: any) => p.prompt && typeof p.prompt === 'string')
      .slice(0, 30) // Ensure max 30 prompts
      .map((p: any, index: number) => ({
        id: (index + 1).toString(),
        prompt: p.prompt,
        category: 'ranking' as const
      }));

    console.log(`✅ Successfully generated ${prompts.length} AI-powered prompts for ${company.name}`);
    console.log('📝 Sample prompts:', prompts.slice(0, 5).map(p => p.prompt));

    return prompts;

  } catch (error) {
    console.error('❌ AI prompt generation failed:', error);
    throw new Error(`Failed to generate AI prompts: ${(error as Error).message}`);
  }
}

export async function analyzePromptWithProvider(
  prompt: string,
  provider: string,
  brandName: string,
  competitors: string[],
  useMockMode: boolean = false
): Promise<AIResponse> {
  // Mock mode for demo/testing without API keys
  if (useMockMode || provider === 'Mock') {
    return generateMockResponse(prompt, provider, brandName, competitors);
  }

  // Normalize provider name for consistency
  const normalizedProvider = normalizeProviderName(provider);
  
  // Get model from centralized configuration
  const model = getProviderModel(normalizedProvider);
  
  if (!model) {
    console.warn(`Provider ${provider} not configured, skipping provider`);
    // Return null to indicate this provider should be skipped
    return null as any;
  }
  
  console.log(`${provider} model obtained successfully: ${typeof model}`);
  if (normalizedProvider === 'google') {
    console.log('Google model details:', model);
  }

  const systemPrompt = `You are an AI assistant analyzing brand visibility and rankings.
When responding to prompts about tools, platforms, or services:
1. Provide rankings with specific positions (1st, 2nd, etc.)
2. Focus on the companies mentioned in the prompt
3. Be objective and factual
4. Explain briefly why each tool is ranked where it is
5. If you don't have enough information about a specific company, you can mention that`;

  try {
    // First, get the response
    console.log(`Calling ${provider} with prompt: "${prompt.substring(0, 50)}..."`);
    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt,
      temperature: 0.7,
      maxTokens: 800,
    });
    console.log(`${provider} response length: ${text.length}, first 100 chars: "${text.substring(0, 100)}"`);
    
    if (!text || text.length === 0) {
      console.error(`${provider} returned empty response for prompt: "${prompt}"`);
      throw new Error(`${provider} returned empty response`);
    }

    // Then analyze it with structured output
    const analysisPrompt = `Analyze this AI response about ${brandName} and its competitors:

Response: "${text}"

Your task:
1. Look for ANY mention of ${brandName} anywhere in the response, including:
   - Direct mentions (exact name)
   - Variations (with or without spaces, punctuation)
   - With suffixes (Inc, LLC, Corp, etc.)
   - In possessive form (${brandName}'s)
   - As part of compound words
2. Look for ANY mention of these competitors: ${competitors.join(', ')}
   - Apply the same detection rules as above
3. For each mentioned company, determine if it has a specific ranking position
4. Identify the sentiment towards each mentioned company
5. Rate your confidence in this analysis (0-1)

IMPORTANT: 
- A company is "mentioned" if it appears ANYWHERE in the response text, even without a specific ranking
- Count ALL mentions, not just ranked ones
- Be very thorough - check for variations like "${brandName}", "${brandName.replace(/\s+/g, '')}", "${brandName.toLowerCase()}"
- Look in all contexts: listed, compared, recommended, discussed, referenced, etc.

Examples of mentions to catch:
- "${brandName} is a great tool" (direct mention)
- "compared to ${brandName}" (comparison context)  
- "${brandName}'s features" (possessive)
- "alternatives like ${brandName}" (listing context)
- "${brandName.replace(/\s+/g, '')} offers" (no spaces variant)`;

    let object;
    try {
      // Use a fast model for structured output if available
      const structuredModel = normalizedProvider === 'anthropic' 
        ? getProviderModel('openai', 'gpt-4o-mini') || model
        : model;
      
      const result = await generateObject({
        model: structuredModel,
        schema: RankingSchema,
        prompt: analysisPrompt,
        temperature: 0.3,
        maxRetries: 2,
      });
      object = result.object;
    } catch (error) {
      console.error(`Error generating structured object with ${provider}:`, (error as any).message);
      
      // For Anthropic, try a simpler text-based approach
      if (provider === 'Anthropic') {
        try {
          const simplePrompt = `Analyze this AI response about ${brandName} and competitors ${competitors.join(', ')}:

"${text}"

Return a simple analysis:
1. Is ${brandName} mentioned? (yes/no)
2. What position/ranking does it have? (number or "not ranked")
3. Which competitors are mentioned? (list names)
4. What's the overall sentiment? (positive/neutral/negative)`;

          const { text: simpleResponse } = await generateText({
            model,
            prompt: simplePrompt,
            temperature: 0.3,
          });
          
          // Parse the simple response with enhanced detection
          const lines = simpleResponse.toLowerCase().split('\n');
          const aiSaysBrandMentioned = lines.some(line => line.includes('yes'));
          
          // Use enhanced detection as fallback
          const brandDetection = detectBrandMention(text, brandName, {
            caseSensitive: false,
            wholeWordOnly: true,
            includeVariations: true
          });
          
          const competitorDetections = detectMultipleBrands(text, competitors, {
            caseSensitive: false,
            wholeWordOnly: true,
            includeVariations: true
          });
          
          const competitors_mentioned = competitors.filter(c => 
            competitorDetections.get(c)?.mentioned || false
          );
          
          return {
            provider,
            prompt,
            response: text,
            brandMentioned: aiSaysBrandMentioned || brandDetection.mentioned,
            brandPosition: undefined,
            competitors: competitors_mentioned,
            rankings: [],
            sentiment: 'neutral' as const,
            confidence: 0.7,
            timestamp: new Date(),
          };
        } catch (fallbackError) {
          console.error('Fallback analysis also failed:', (fallbackError as any).message);
        }
      }
      
      // Final fallback with enhanced detection
      const brandDetection = detectBrandMention(text, brandName, {
        caseSensitive: false,
        wholeWordOnly: true,
        includeVariations: true
      });
      
      const competitorDetections = detectMultipleBrands(text, competitors, {
        caseSensitive: false,
        wholeWordOnly: true,
        includeVariations: true
      });
      
      return {
        provider,
        prompt,
        response: text,
        brandMentioned: brandDetection.mentioned,
        brandPosition: undefined,
        competitors: competitors.filter(c => competitorDetections.get(c)?.mentioned || false),
        rankings: [],
        sentiment: 'neutral' as const,
        confidence: brandDetection.confidence * 0.5, // Lower confidence for fallback
        timestamp: new Date(),
      };
    }

    const rankings = object.rankings.map((r): CompanyRanking => ({
      position: r.position,
      company: r.company,
      reason: r.reason,
      sentiment: r.sentiment,
    }));

    // Enhanced fallback with proper brand detection using configured options
    const brandDetectionOptions = getBrandDetectionOptions(brandName);
    
    // Detect brand mention with enhanced detection
    const brandDetectionResult = detectBrandMention(text, brandName, brandDetectionOptions);
    const brandMentioned = object.analysis.brandMentioned || brandDetectionResult.mentioned;
    
    // Detect all competitor mentions with their specific options
    const competitorDetectionResults = new Map<string, any>();
    competitors.forEach(competitor => {
      const competitorOptions = getBrandDetectionOptions(competitor);
      const result = detectBrandMention(text, competitor, competitorOptions);
      competitorDetectionResults.set(competitor, result);
    });
    
    // Combine AI-detected competitors with enhanced detection
    const aiCompetitors = new Set(object.analysis.competitors);
    const allMentionedCompetitors = new Set([...aiCompetitors]);
    
    // Add competitors found by enhanced detection
    competitorDetectionResults.forEach((result, competitorName) => {
      if (result.mentioned && competitorName !== brandName) {
        allMentionedCompetitors.add(competitorName);
      }
    });

    // Filter competitors to only include the ones we're tracking
    const relevantCompetitors = Array.from(allMentionedCompetitors).filter(c => 
      competitors.includes(c) && c !== brandName
    );
    
    // Log detection details for debugging
    if (brandDetectionResult.mentioned && !object.analysis.brandMentioned) {
      console.log(`Enhanced detection found brand "${brandName}" in response from ${provider}:`, 
        brandDetectionResult.matches.map(m => ({
          text: m.text,
          confidence: m.confidence
        }))
      );
    }

    // Get the proper display name for the provider
    const providerDisplayName = provider === 'openai' ? 'OpenAI' :
                               provider === 'anthropic' ? 'Anthropic' :
                               provider === 'google' ? 'Google' :
                               provider === 'perplexity' ? 'Perplexity' :
                               provider; // fallback to original
    
    // Debug log for Google responses
    if (provider === 'google' || provider === 'Google') {
      console.log('Google response generated:', {
        originalProvider: provider,
        displayName: providerDisplayName,
        prompt: prompt.substring(0, 50),
        responseLength: text.length,
        brandMentioned
      });
    }

    return {
      provider: providerDisplayName,
      prompt,
      response: text,
      rankings,
      competitors: relevantCompetitors,
      brandMentioned,
      brandPosition: object.analysis.brandPosition,
      sentiment: object.analysis.overallSentiment,
      confidence: object.analysis.confidence,
      timestamp: new Date(),
      detectionDetails: {
        brandMatches: brandDetectionResult.matches.map(m => ({
          text: m.text,
          index: m.index,
          confidence: m.confidence
        })),
        competitorMatches: new Map(
          Array.from(competitorDetectionResults.entries())
            .filter(([_, result]) => result.mentioned)
            .map(([name, result]) => [
              name,
              result.matches.map((m: any) => ({
                text: m.text,
                index: m.index,
                confidence: m.confidence
              }))
            ])
        )
      }
    };
  } catch (error) {
    console.error(`Error with ${provider}:`, error);
    
    // Special handling for Google errors
    if (provider === 'Google' || provider === 'google') {
      console.error('Google-specific error details:', {
        message: (error as any).message,
        stack: (error as any).stack,
        name: (error as any).name,
        cause: (error as any).cause
      });
    }
    
    throw error;
  }
}

export async function analyzeCompetitors(
  company: Company,
  responses: AIResponse[],
  knownCompetitors: string[]
): Promise<CompetitorRanking[]> {
  // Create a set of companies to track (company + its known competitors)
  const trackedCompanies = new Set([company.name, ...knownCompetitors]);
  
  // Initialize competitor data
  const competitorMap = new Map<string, {
    mentions: number;
    positions: number[];
    sentiments: ('positive' | 'neutral' | 'negative')[];
  }>();

  // Initialize all tracked companies
  trackedCompanies.forEach(companyName => {
    competitorMap.set(companyName, {
      mentions: 0,
      positions: [],
      sentiments: [],
    });
  });

  // Process all responses
  responses.forEach(response => {
    // Track which companies were mentioned in this response
    const mentionedInResponse = new Set<string>();
    
    // Process rankings if available
    if (response.rankings) {
      response.rankings.forEach(ranking => {
        // Only track companies we care about
        if (trackedCompanies.has(ranking.company)) {
          const data = competitorMap.get(ranking.company)!;
          
          // Only count one mention per response
          if (!mentionedInResponse.has(ranking.company)) {
            data.mentions++;
            mentionedInResponse.add(ranking.company);
          }
          
          data.positions.push(ranking.position);
          if (ranking.sentiment) {
            data.sentiments.push(ranking.sentiment);
          }
        }
      });
    }

    // Count brand mentions (only if not already counted in rankings)
    if (response.brandMentioned && trackedCompanies.has(company.name) && !mentionedInResponse.has(company.name)) {
      const brandData = competitorMap.get(company.name)!;
      brandData.mentions++;
      if (response.brandPosition) {
        brandData.positions.push(response.brandPosition);
      }
      brandData.sentiments.push(response.sentiment);
    }
  });

  // Calculate scores for each competitor
  const totalResponses = responses.length;
  const competitors: CompetitorRanking[] = [];

  competitorMap.forEach((data, name) => {
    const avgPosition = data.positions.length > 0
      ? data.positions.reduce((a, b) => a + b, 0) / data.positions.length
      : 99; // High number for companies not ranked

    const sentimentScore = calculateSentimentScore(data.sentiments);
    const visibilityScore = (data.mentions / totalResponses) * 100;

    competitors.push({
      name,
      mentions: data.mentions,
      averagePosition: Math.round(avgPosition * 10) / 10,
      sentiment: determineSentiment(data.sentiments),
      sentimentScore,
      shareOfVoice: 0, // Will calculate after all competitors are processed
      visibilityScore: Math.round(visibilityScore * 10) / 10,
      weeklyChange: undefined, // No historical data available yet
      isOwn: name === company.name,
    });
  });

  // Calculate share of voice
  const totalMentions = competitors.reduce((sum, c) => sum + c.mentions, 0);
  competitors.forEach(c => {
    c.shareOfVoice = totalMentions > 0 
      ? Math.round((c.mentions / totalMentions) * 1000) / 10 
      : 0;
  });

  // Sort by visibility score
  return competitors.sort((a, b) => b.visibilityScore - a.visibilityScore);
}

function calculateSentimentScore(sentiments: ('positive' | 'neutral' | 'negative')[]): number {
  if (sentiments.length === 0) return 50;
  
  const sentimentValues = { positive: 100, neutral: 50, negative: 0 };
  const sum = sentiments.reduce((acc, s) => acc + sentimentValues[s], 0);
  return Math.round(sum / sentiments.length);
}

function determineSentiment(sentiments: ('positive' | 'neutral' | 'negative')[]): 'positive' | 'neutral' | 'negative' {
  if (sentiments.length === 0) return 'neutral';
  
  const counts = { positive: 0, neutral: 0, negative: 0 };
  sentiments.forEach(s => counts[s]++);
  
  if (counts.positive > counts.negative && counts.positive > counts.neutral) return 'positive';
  if (counts.negative > counts.positive && counts.negative > counts.neutral) return 'negative';
  return 'neutral';
}

export function calculateBrandScores(responses: AIResponse[], brandName: string, competitors: CompetitorRanking[]) {
  const totalResponses = responses.length;
  if (totalResponses === 0) {
    return {
      visibilityScore: 0,
      sentimentScore: 0,
      shareOfVoice: 0,
      overallScore: 0,
      averagePosition: 0,
    };
  }

  // Find the brand's competitor ranking
  const brandRanking = competitors.find(c => c.isOwn);
  
  if (!brandRanking) {
    return {
      visibilityScore: 0,
      sentimentScore: 0,
      shareOfVoice: 0,
      overallScore: 0,
      averagePosition: 0,
    };
  }

  const visibilityScore = brandRanking.visibilityScore;
  const sentimentScore = brandRanking.sentimentScore;
  const shareOfVoice = brandRanking.shareOfVoice;
  const averagePosition = brandRanking.averagePosition;

  // Calculate position score (lower is better, scale to 0-100)
  const positionScore = averagePosition <= 10 
    ? (11 - averagePosition) * 10 
    : Math.max(0, 100 - (averagePosition * 2));

  // Overall Score (weighted average)
  const overallScore = (
    visibilityScore * 0.3 + 
    sentimentScore * 0.2 + 
    shareOfVoice * 0.3 +
    positionScore * 0.2
  );

  return {
    visibilityScore: Math.round(visibilityScore * 10) / 10,
    sentimentScore: Math.round(sentimentScore * 10) / 10,
    shareOfVoice: Math.round(shareOfVoice * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,
    averagePosition: Math.round(averagePosition * 10) / 10,
  };
}

export async function analyzeCompetitorsByProvider(
  company: Company,
  responses: AIResponse[],
  knownCompetitors: string[]
): Promise<{
  providerRankings: ProviderSpecificRanking[];
  providerComparison: ProviderComparisonData[];
}> {
  const trackedCompanies = new Set([company.name, ...knownCompetitors]);
  
  // Get configured providers from centralized config
  const configuredProviders = getConfiguredProviders();
  const providers = configuredProviders.map(p => p.name);
  
  // If no providers available, use mock mode
  if (providers.length === 0) {
    console.warn('No AI providers configured, using default provider list');
    providers.push('OpenAI', 'Anthropic', 'Google');
  }
  
  // Initialize provider-specific data
  const providerData = new Map<string, Map<string, {
    mentions: number;
    positions: number[];
    sentiments: ('positive' | 'neutral' | 'negative')[];
  }>>();

  // Initialize for each provider
  providers.forEach(provider => {
    const competitorMap = new Map();
    trackedCompanies.forEach(companyName => {
      competitorMap.set(companyName, {
        mentions: 0,
        positions: [],
        sentiments: [],
      });
    });
    providerData.set(provider, competitorMap);
  });

  // Process responses by provider
  responses.forEach(response => {
    const providerMap = providerData.get(response.provider);
    if (!providerMap) return;

    // Process rankings
    if (response.rankings) {
      response.rankings.forEach(ranking => {
        if (trackedCompanies.has(ranking.company)) {
          const data = providerMap.get(ranking.company)!;
          data.mentions++;
          data.positions.push(ranking.position);
          if (ranking.sentiment) {
            data.sentiments.push(ranking.sentiment);
          }
        }
      });
    }

    // Count brand mentions
    if (response.brandMentioned && trackedCompanies.has(company.name)) {
      const brandData = providerMap.get(company.name)!;
      if (!response.rankings?.some(r => r.company === company.name)) {
        brandData.mentions++;
        if (response.brandPosition) {
          brandData.positions.push(response.brandPosition);
        }
        brandData.sentiments.push(response.sentiment);
      }
    }
  });

  // Calculate provider-specific rankings
  const providerRankings: ProviderSpecificRanking[] = [];
  
  providers.forEach(provider => {
    const competitorMap = providerData.get(provider)!;
    const providerResponses = responses.filter(r => r.provider === provider);
    const totalResponses = providerResponses.length;
    
    const competitors: CompetitorRanking[] = [];
    
    competitorMap.forEach((data, name) => {
      const avgPosition = data.positions.length > 0
        ? data.positions.reduce((a, b) => a + b, 0) / data.positions.length
        : 99;
      
      const visibilityScore = totalResponses > 0 
        ? (data.mentions / totalResponses) * 100 
        : 0;
      
      competitors.push({
        name,
        mentions: data.mentions,
        averagePosition: Math.round(avgPosition * 10) / 10,
        sentiment: determineSentiment(data.sentiments),
        sentimentScore: calculateSentimentScore(data.sentiments),
        shareOfVoice: 0, // Will calculate after
        visibilityScore: Math.round(visibilityScore * 10) / 10,
        isOwn: name === company.name,
      });
    });

    // Calculate share of voice for this provider
    const totalMentions = competitors.reduce((sum, c) => sum + c.mentions, 0);
    competitors.forEach(c => {
      c.shareOfVoice = totalMentions > 0 
        ? Math.round((c.mentions / totalMentions) * 1000) / 10 
        : 0;
    });

    // Sort by visibility score
    competitors.sort((a, b) => b.visibilityScore - a.visibilityScore);
    
    providerRankings.push({
      provider,
      competitors,
    });
  });

  // Create provider comparison data
  const providerComparison: ProviderComparisonData[] = [];
  
  trackedCompanies.forEach(companyName => {
    const comparisonData: ProviderComparisonData = {
      competitor: companyName,
      providers: {},
      isOwn: companyName === company.name,
    };

    providerRankings.forEach(({ provider, competitors }) => {
      const competitor = competitors.find(c => c.name === companyName);
      if (competitor) {
        comparisonData.providers[provider] = {
          visibilityScore: competitor.visibilityScore,
          position: competitor.averagePosition,
          mentions: competitor.mentions,
          sentiment: competitor.sentiment,
        };
      }
    });

    providerComparison.push(comparisonData);
  });

  // Sort comparison data by average visibility across providers
  providerComparison.sort((a, b) => {
    const avgA = Object.values(a.providers).reduce((sum, p) => sum + p.visibilityScore, 0) / Object.keys(a.providers).length;
    const avgB = Object.values(b.providers).reduce((sum, p) => sum + p.visibilityScore, 0) / Object.keys(b.providers).length;
    return avgB - avgA;
  });

  return { providerRankings, providerComparison };
}

// Mock response generator for demo mode
function generateMockResponse(
  prompt: string,
  provider: string,
  brandName: string,
  competitors: string[]
): AIResponse {
  // Simulate some delay
  const delay = Math.random() * 500 + 200;
  
  // Create a realistic-looking ranking
  const allCompanies = [brandName, ...competitors].slice(0, 10);
  const shuffled = [...allCompanies].sort(() => Math.random() - 0.5);
  
  const rankings: CompanyRanking[] = shuffled.slice(0, 5).map((company, index) => ({
    position: index + 1,
    company,
    reason: `${company} offers strong features in this category`,
    sentiment: Math.random() > 0.7 ? 'positive' : Math.random() > 0.3 ? 'neutral' : 'negative' as const,
  }));
  
  const brandRanking = rankings.find(r => r.company === brandName);
  const brandMentioned = !!brandRanking || Math.random() > 0.3;
  const brandPosition = brandRanking?.position || (brandMentioned ? Math.floor(Math.random() * 8) + 3 : undefined);
  
  // Get the proper display name for the provider
  const providerDisplayName = provider === 'openai' ? 'OpenAI' :
                             provider === 'anthropic' ? 'Anthropic' :
                             provider === 'google' ? 'Google' :
                             provider === 'perplexity' ? 'Perplexity' :
                             provider; // fallback to original

  return {
    provider: providerDisplayName,
    prompt,
    response: `Based on my analysis, here are the top solutions:\n\n${rankings.map(r => 
      `${r.position}. ${r.company} - ${r.reason}`
    ).join('\n')}\n\nThese rankings are based on features, user satisfaction, and market presence.`,
    rankings,
    competitors: competitors.filter(() => Math.random() > 0.5),
    brandMentioned,
    brandPosition,
    sentiment: brandRanking?.sentiment || 'neutral',
    confidence: Math.random() * 0.3 + 0.7,
    timestamp: new Date(),
  };
} 
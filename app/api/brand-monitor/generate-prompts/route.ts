import { NextRequest, NextResponse } from 'next/server';
import { generatePromptsForCompany } from '@/lib/ai-utils';
import { Company } from '@/lib/types';

export async function POST(request: NextRequest) {
  let company: Company | null = null;
  let competitors: string[] = [];
  
  try {
    const requestBody = await request.json();
    company = requestBody.company;
    competitors = requestBody.competitors || [];
    
    if (!company || !company.name) {
      return NextResponse.json({ error: 'Company information is required' }, { status: 400 });
    }

    console.log('🎯 Generating industry-specific prompts for:', company.name);
    console.log('📊 Company details:', {
      industry: company.industry,
      description: company.description?.slice(0, 100),
      mainProducts: company.scrapedData?.mainProducts,
      competitors: competitors?.slice(0, 3)
    });

    // Use the existing generatePromptsForCompany function which creates contextual prompts
    const prompts = await generatePromptsForCompany(company, competitors);

    // Take 10-12 prompts for comprehensive analysis
    const selectedPrompts = prompts.slice(0, 12).map(p => p.prompt);

    console.log(`✅ Generated ${selectedPrompts.length} industry-specific prompts:`, selectedPrompts);

    return NextResponse.json({
      prompts: selectedPrompts,
      success: true
    });

  } catch (error) {
    console.error('❌ AI prompt generation failed in API:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      companyName: company?.name,
      hasCompetitors: competitors?.length > 0
    });
    
    return NextResponse.json({
      error: 'AI prompt generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }, { status: 500 });
  }
} 
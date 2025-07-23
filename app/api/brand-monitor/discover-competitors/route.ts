import { NextRequest, NextResponse } from 'next/server';
import { discoverCompetitorsEnhanced } from '@/lib/ai-utils-enhanced';
import { Company } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { company }: { company: Company } = await request.json();
    
    if (!company || !company.name) {
      return NextResponse.json({ error: 'Company information is required' }, { status: 400 });
    }

    console.log('🔍 Starting AI competitor discovery for:', company.name);

    // Use the enhanced AI competitor discovery
    const { competitors, industryAnalysis } = await discoverCompetitorsEnhanced(company);

    console.log(`✅ Found ${competitors.length} competitors for ${company.name}`);

    return NextResponse.json({
      competitors,
      industryAnalysis,
      success: true
    });

  } catch (error) {
    console.error('Competitor discovery error:', error);
    
    return NextResponse.json({
      error: 'Failed to discover competitors',
      details: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }, { status: 500 });
  }
} 
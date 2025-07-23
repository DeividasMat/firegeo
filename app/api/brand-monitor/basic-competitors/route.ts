import { NextRequest, NextResponse } from 'next/server';
import { identifyCompetitors } from '@/lib/ai-utils';
import { Company } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { company }: { company: Company } = await request.json();
    
    if (!company || !company.name) {
      return NextResponse.json({ error: 'Company information is required' }, { status: 400 });
    }

    console.log('🔍 Starting basic AI competitor discovery for:', company.name);

    // Use the existing identifyCompetitors function 
    const competitors = await identifyCompetitors(company);

    console.log(`✅ Found ${competitors.length} competitors for ${company.name}:`, competitors);

    return NextResponse.json({
      competitors,
      success: true
    });

  } catch (error) {
    console.error('Basic competitor discovery error:', error);
    
    return NextResponse.json({
      error: 'Failed to discover competitors',
      details: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }, { status: 500 });
  }
} 
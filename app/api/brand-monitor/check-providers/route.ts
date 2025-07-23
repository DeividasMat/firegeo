import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getConfiguredProviders } from '@/lib/provider-config';
import { handleApiError, AuthenticationError } from '@/lib/api-errors';

export async function POST(request: NextRequest) {
  try {
    // Try to get the session, but don't require it for free platform
    let user = null;
    try {
      const sessionResponse = await auth.api.getSession({
        headers: request.headers,
      });
      user = sessionResponse?.user || null;
    } catch (authError) {
      console.warn('Authentication failed, running in free mode:', authError);
      // Continue without authentication for free platform
    }

    const configuredProviders = getConfiguredProviders();
    const providers = configuredProviders.map(p => p.name);
    
    if (providers.length === 0) {
      return NextResponse.json({ 
        providers: [], 
        error: 'No AI providers configured. Please set at least one API key.' 
      });
    }
    
    return NextResponse.json({ providers });

  } catch (error) {
    return handleApiError(error);
  }
}
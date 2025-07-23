import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { Autumn } from 'autumn-js';
import { scrapeCompanyInfo } from '@/lib/scrape-utils';
import { 
  handleApiError, 
  AuthenticationError, 
  ValidationError,
  InsufficientCreditsError,
  ExternalServiceError 
} from '@/lib/api-errors';
import { FEATURE_ID_MESSAGES } from '@/config/constants';

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY!,
});

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

    // No credit checks needed - completely free platform

    const { url, maxAge } = await request.json();

    if (!url) {
      throw new ValidationError('Invalid request', {
        url: 'URL is required'
      });
    }
    
    // Ensure URL has protocol
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // Track usage (1 credit for scraping) - only if user is authenticated
    if (user?.id) {
      try {
        await autumn.track({
          customer_id: user.id,
          feature_id: FEATURE_ID_MESSAGES,
          value: 1,
        });
      } catch (err) {
        console.error('[Brand Monitor Scrape] Error tracking usage:', err);
        // Continue even if tracking fails - we don't want to block the user
      }
    }

    const company = await scrapeCompanyInfo(normalizedUrl, maxAge);

    return NextResponse.json({ company });
  } catch (error) {
    return handleApiError(error);
  }
}
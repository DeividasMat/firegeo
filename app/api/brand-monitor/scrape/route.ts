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
  apiKey: process.env.AUTUMN_SECRET_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    // Get the session
    const sessionResponse = await auth.api.getSession({
      headers: request.headers,
    });

    if (!sessionResponse?.user) {
      throw new AuthenticationError('Please log in to use this feature');
    }

    // Check if user has enough credits (1 credit for URL scraping)
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

    // Track usage (1 credit for scraping)
    try {
      await autumn.track({
        customer_id: sessionResponse.user.id,
        feature_id: FEATURE_ID_MESSAGES,
        count: 1,
      });
    } catch (err) {
      console.error('[Brand Monitor Scrape] Error tracking usage:', err);
      // Continue even if tracking fails - we don't want to block the user
    }

    const company = await scrapeCompanyInfo(normalizedUrl, maxAge);

    return NextResponse.json({ company });
  } catch (error) {
    return handleApiError(error);
  }
}
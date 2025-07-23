import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { Autumn } from 'autumn-js';
import { performAnalysis, createSSEMessage } from '@/lib/analyze-common';
import { SSEEvent } from '@/lib/types';
import { 
  AuthenticationError, 
  InsufficientCreditsError, 
  ValidationError, 
  ExternalServiceError, 
  handleApiError 
} from '@/lib/api-errors';
import { 
  FEATURE_ID_MESSAGES, 
  CREDITS_PER_BRAND_ANALYSIS,
  ERROR_MESSAGES,
  SSE_MAX_DURATION
} from '@/config/constants';

const autumn = new Autumn({
  apiKey: process.env.AUTUMN_SECRET_KEY!,
});

export const runtime = 'nodejs'; // Use Node.js runtime for streaming
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    // Get the session
    const sessionResponse = await auth.api.getSession({
      headers: request.headers,
    });

    if (!sessionResponse?.user) {
      throw new AuthenticationError('Please log in to use brand monitor');
    }

    // No credit checks or usage tracking needed - completely free platform

    const { company, prompts: customPrompts, competitors: userSelectedCompetitors, useWebSearch = false } = await request.json();

    if (!company || !company.name) {
      throw new ValidationError(ERROR_MESSAGES.COMPANY_INFO_REQUIRED, {
        company: 'Company name is required'
      });
    }

    // Track usage with Autumn (deduct credits)
    try {
      console.log('[Brand Monitor] Recording usage - Customer ID:', sessionResponse.user.id);
      await autumn.track({
        customer_id: sessionResponse.user.id,
        feature_id: FEATURE_ID_MESSAGES,
        count: CREDITS_PER_BRAND_ANALYSIS,
      });
      console.log('[Brand Monitor] Usage recorded successfully');
    } catch (err) {
      console.error('Failed to track usage:', err);
      throw new ExternalServiceError('Unable to process credit deduction. Please try again', 'autumn');
    }

    // Get remaining credits after deduction
    // No credit tracking needed - completely free platform
    let remainingCredits = 999999; // Show unlimited credits

    // Create a TransformStream for SSE
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Function to send SSE events
    const sendEvent = async (event: SSEEvent) => {
      await writer.write(encoder.encode(createSSEMessage(event)));
    };

    // Start the async processing
    (async () => {
      try {
        // Send initial credit info
        await sendEvent({
          type: 'credits',
          stage: 'credits',
          data: {
            remainingCredits,
            creditsUsed: CREDITS_PER_BRAND_ANALYSIS
          },
          timestamp: new Date()
        });

        // Perform the analysis using common logic
        const analysisResult = await performAnalysis({
          company,
          customPrompts,
          userSelectedCompetitors,
          useWebSearch,
          sendEvent
        });

        // Send final complete event with all data
        await sendEvent({
          type: 'complete',
          stage: 'finalizing',
          data: {
            analysis: analysisResult
          },
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Analysis error:', error);
        await sendEvent({
          type: 'error',
          stage: 'error',
          data: {
            message: error instanceof Error ? error.message : 'Analysis failed'
          },
          timestamp: new Date()
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    // For SSE endpoints, we need to return a proper error response
    // instead of using handleApiError which returns NextResponse
    console.error('Brand monitor analyze API error:', error);
    
    if (error instanceof AuthenticationError ||
        error instanceof InsufficientCreditsError ||
        error instanceof ValidationError ||
        error instanceof ExternalServiceError) {
      return new Response(
        JSON.stringify({
          error: {
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            timestamp: new Date().toISOString(),
            metadata: error instanceof InsufficientCreditsError ? {
              creditsRequired: error.creditsRequired,
              creditsAvailable: error.creditsAvailable
            } : undefined
          }
        }),
        { 
          status: error.statusCode, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    
    return new Response(
      JSON.stringify({
        error: {
          message: 'An unexpected error occurred',
          code: 'INTERNAL_ERROR',
          statusCode: 500,
          timestamp: new Date().toISOString()
        }
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getProviderModel } from '@/lib/provider-config';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Try to check authentication, but allow access for free platform
    let user = null;
    try {
      const sessionResponse = await auth.api.getSession({
        headers: request.headers,
      });
      user = sessionResponse?.user || null;
    } catch (authError) {
      console.warn('Authentication failed, allowing report generation in free mode:', authError);
      // Continue without authentication for free platform
    }

    const { analysis, company, competitors } = await request.json();

    if (!analysis || !company) {
      return NextResponse.json({ error: 'Missing analysis data' }, { status: 400 });
    }

    console.log('🎯 Generating comprehensive PDF report for:', company.name);

    // Generate executive summary and insights using OpenAI
    const model = getProviderModel('openai');
    if (!model) {
      return NextResponse.json({ error: 'OpenAI not available for report generation' }, { status: 500 });
    }

    // Generate concise insights for each section
    const sectionInsights = await generateSectionInsights(model, analysis, company, competitors);

    // Process actual analysis data for display
    const reportData = processReportData(analysis, company, competitors);

    // Generate the HTML report
    const reportHtml = generateGeoAnalysisReport({
      company,
      competitors,
      analysis,
      sectionInsights,
      reportData
    });

    return new NextResponse(reportHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="${company.name}-GEO-Analysis-Report.html"`,
      },
    });

  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function generateSectionInsights(model: any, analysis: any, company: any, competitors: any[]) {
  const insights = {
    comparisonMatrix: '',
    promptsResponses: '',
    providerRankings: '',
    visibilityScore: ''
  };

  try {
    // Comparison Matrix Analysis (3-4 sentences)
    const matrixPrompt = `Analyze the comparison matrix results for ${company.name}. Based on visibility scores across different AI providers (OpenAI, Anthropic, Perplexity), write exactly 3-4 sentences covering: cross-provider performance patterns, strongest/weakest provider channels, and key competitive gaps. Be specific about scores and actionable.`;

    const { text: matrixInsight } = await generateText({
      model,
      prompt: matrixPrompt,
      temperature: 0.2,
      maxTokens: 200,
    });

    // Prompts & Responses Analysis (3-4 sentences)
    const promptsPrompt = `Analyze the prompts and responses data for ${company.name}. Based on ${analysis.responses?.length || 0} queries analyzed, write exactly 3-4 sentences covering: brand mention frequency, response quality patterns, and top-performing query types. Focus on concrete findings and opportunities.`;

    const { text: promptsInsight } = await generateText({
      model,
      prompt: promptsPrompt,
      temperature: 0.2,
      maxTokens: 200,
    });

    // Provider Rankings Analysis (3-4 sentences)
    const rankingsPrompt = `Analyze the provider rankings for ${company.name} versus competitors. Write exactly 3-4 sentences covering: average ranking position, best-performing providers, competitive positioning gaps, and ranking improvement opportunities. Be specific about positions and competitors.`;

    const { text: rankingsInsight } = await generateText({
      model,
      prompt: rankingsPrompt,
      temperature: 0.2,
      maxTokens: 200,
    });

    // Visibility Score Analysis (3-4 sentences)
    const visibilityPrompt = `Analyze the visibility score results for ${company.name}. Write exactly 3-4 sentences covering: overall visibility performance, competitive position versus top performers, score distribution patterns, and key improvement areas. Include specific percentages and actionable insights.`;

    const { text: visibilityInsight } = await generateText({
      model,
      prompt: visibilityPrompt,
      temperature: 0.2,
      maxTokens: 200,
    });

    insights.comparisonMatrix = matrixInsight.trim();
    insights.promptsResponses = promptsInsight.trim();
    insights.providerRankings = rankingsInsight.trim();
    insights.visibilityScore = visibilityInsight.trim();

  } catch (error) {
    console.error('Error generating section insights:', error);
  }

  return insights;
}

function processReportData(analysis: any, company: any, competitors: any[]) {
  const responses = analysis.responses || [];
  const prompts = analysis.prompts || [];
  const providerComparison = analysis.providerComparison || [];
  const providerRankings = analysis.providerRankings || [];
  
  // Process comparison matrix data
  const matrixData = providerComparison.map((comp: any) => ({
    competitor: comp.competitor,
    isOwn: comp.isOwn,
    providers: comp.providers
  }));

  // Process prompts and responses
  const promptsData = prompts.map((prompt: any, index: number) => {
    const promptResponses = responses.filter((r: any) => r.prompt === prompt.prompt);
    const brandMentions = promptResponses.filter((r: any) => r.brandMentioned).length;
    return {
      prompt: prompt.prompt,
      totalResponses: promptResponses.length,
      brandMentions,
      mentionRate: promptResponses.length > 0 ? Math.round((brandMentions / promptResponses.length) * 100) : 0,
      responses: promptResponses
    };
  });

  // Process provider rankings data
  const rankingsData = providerRankings.map((ranking: any) => ({
    provider: ranking.provider,
    competitors: ranking.competitors.map((comp: any, index: number) => ({
      rank: index + 1,
      name: comp.name,
      isOwn: comp.isOwn,
      visibilityScore: comp.visibilityScore,
      shareOfVoice: comp.shareOfVoice,
      sentiment: comp.sentiment
    }))
  }));

  // Calculate overall visibility metrics
  const totalQueries = responses.length;
  const companyMentions = responses.filter((r: any) => 
    r.response?.toLowerCase().includes(company.name.toLowerCase())
  ).length;
  const visibilityScore = totalQueries > 0 ? Math.round((companyMentions / totalQueries) * 100) : 0;

  return {
    matrixData,
    promptsData,
    rankingsData,
    totalQueries,
    companyMentions,
    visibilityScore
  };
}

function generateGeoAnalysisReport({ company, competitors, analysis, sectionInsights, reportData }: any) {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Extract actual company data from analysis - use real detected data
  const actualCompany = analysis.company || company;
  const companyName = actualCompany.name || company.name || 'Unknown Company';
  
  // Get the actual detected industry from the analysis/scraping
  let companyIndustry = 'Technology'; // fallback only
  
  // Priority 1: Use industry from analysis.company (AI-detected)
  if (actualCompany.industry) {
    companyIndustry = actualCompany.industry;
  }
  // Priority 2: Use industry from scraped data
  else if (actualCompany.scrapedData?.keywords?.length > 0) {
    // Use first keyword as industry indicator
    companyIndustry = actualCompany.scrapedData.keywords[0];
  }
  // Priority 3: Try to detect from scraped content
  else if (actualCompany.scrapedData) {
    const content = `${actualCompany.scrapedData.title || ''} ${actualCompany.scrapedData.description || ''}`.toLowerCase();
    
    // Marketing/Writing SaaS detection
    if (content.includes('marketing') && (content.includes('writing') || content.includes('content'))) {
      companyIndustry = 'Marketing Writing SaaS';
    }
    else if (content.includes('saas') || content.includes('software as a service')) {
      companyIndustry = 'SaaS';
    }
    else if (content.includes('marketing')) {
      companyIndustry = 'Marketing Technology';
    }
    else if (content.includes('writing') || content.includes('content creation')) {
      companyIndustry = 'Content Creation';
    }
    else if (content.includes('ai') && content.includes('writing')) {
      companyIndustry = 'AI Writing Tools';
    }
    else if (content.includes('web scraping') || content.includes('scraping')) {
      companyIndustry = 'Web Scraping';
    }
    else if (content.includes('artificial intelligence') || content.includes('machine learning')) {
      companyIndustry = 'Artificial Intelligence';
    }
    else if (content.includes('e-commerce') || content.includes('online store')) {
      companyIndustry = 'E-commerce';
    }
    else if (content.includes('financial') || content.includes('fintech')) {
      companyIndustry = 'Financial Services';
    }
    else if (content.includes('education') || content.includes('learning')) {
      companyIndustry = 'Education Technology';
    }
    else if (content.includes('healthcare') || content.includes('medical')) {
      companyIndustry = 'Healthcare';
    }
  }
  
  console.log('🏢 Using company data:', {
    name: companyName,
    industry: companyIndustry,
    source: actualCompany.industry ? 'AI-detected' : actualCompany.scrapedData?.keywords ? 'keywords' : 'content-analyzed'
  });

  const companyUrl = actualCompany.url || company.url || '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${companyName} - GEO Analysis Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.5;
            color: #1a202c;
            background: white;
            font-weight: 400;
        }
        
        /* Page structure for proper breaks */
        .page { 
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: white;
            padding: 20mm;
            page-break-after: always;
            page-break-inside: avoid;
            display: flex;
            flex-direction: column;
        }
        
        .page:last-child {
            page-break-after: auto;
        }
        
        /* Content grouping - keep headers with content */
        .content-section {
            margin-bottom: 25px;
        }
        
        /* Only avoid breaks after small sections */
        .avoid-break-after {
            page-break-after: avoid;
            break-after: avoid;
        }
        
        /* Ensure immediate content stays with headers */
        .section-header-group {
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: 15px;
        }
        
        /* Company info section */
        .company-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 0;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 30px;
        }
        
        .company-logo {
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        
        .company-details h1 {
            font-size: 22px;
            font-weight: 600;
            color: #1a202c;
            margin-bottom: 2px;
            letter-spacing: -0.025em;
        }
        
        .company-details p {
            font-size: 13px;
            color: #64748b;
            font-weight: 500;
        }
        
        .report-info {
            text-align: right;
            font-size: 11px;
            color: #64748b;
            font-weight: 500;
        }
        
        /* Cover page specific */
        .cover {
            justify-content: center;
            text-align: center;
            background: white;
            color: #1a202c;
        }
        
        .cover h1 {
            font-size: 42px;
            font-weight: 300;
            margin-bottom: 15px;
            letter-spacing: -0.05em;
            color: #1a202c;
        }
        
        .cover .subtitle {
            font-size: 20px;
            font-weight: 400;
            margin-bottom: 50px;
            color: #64748b;
        }
        
        .cover .company-box {
            background: #f8fafc;
            padding: 35px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            margin: 35px 0;
        }
        
        .cover .company-name {
            font-size: 32px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #1a202c;
            letter-spacing: -0.025em;
        }
        
        .cover .meta {
            font-size: 15px;
            color: #64748b;
            font-weight: 500;
        }
        
        /* Section styling */
        .section-title {
            font-size: 24px;
            font-weight: 600;
            color: #1a202c;
            margin: 30px 0 20px 0;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 10px;
            letter-spacing: -0.025em;
        }
        
        /* Only avoid breaks when necessary */
        .section-title.avoid-break {
            page-break-after: avoid;
            break-after: avoid;
        }
        
        .insight-box {
            background: #f8fafc;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 20px 0;
            font-size: 14px;
            line-height: 1.6;
            font-weight: 400;
        }
        
        /* Metrics grid */
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin: 20px 0;
        }
        
        .metric-card {
            text-align: center;
            padding: 18px 12px;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .metric-number {
            font-size: 20px;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 4px;
        }
        
        .metric-label {
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
        }
        
        /* Tables */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0 25px 0;
            font-size: 12px;
            font-weight: 400;
        }
        
        /* Small tables can avoid breaks */
        .data-table.small-table {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        
        .data-table th {
            background: #1a202c;
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.05em;
        }
        
        .data-table td {
            padding: 10px 8px;
            border-bottom: 1px solid #e2e8f0;
            font-weight: 400;
        }
        
        .data-table tr:hover {
            background: #f8fafc;
        }
        
        .company-row {
            background: #fef3e2 !important;
            font-weight: 500;
        }
        
        .provider-section {
            margin-bottom: 25px;
        }
        
        .provider-title {
            font-size: 14px;
            color: #1a202c;
            margin: 20px 0 10px 0;
            font-weight: 600;
        }
        
        /* Next Steps Section */
        .next-steps {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 12px;
            margin: 25px 0;
        }
        
        .next-steps h3 {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: white;
        }
        
        .next-steps .recommendation {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 12px;
            border-left: 4px solid rgba(255, 255, 255, 0.3);
        }
        
        .next-steps .recommendation h4 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            color: white;
        }
        
        .next-steps .recommendation p {
            font-size: 13px;
            line-height: 1.5;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 400;
        }
        
        .full-version-cta {
            background: #f8fafc;
            border: 2px solid #667eea;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            margin: 20px 0;
        }
        
        .full-version-cta h4 {
            font-size: 16px;
            font-weight: 600;
            color: #1a202c;
            margin-bottom: 8px;
        }
        
        .full-version-cta p {
            font-size: 13px;
            color: #64748b;
            font-weight: 400;
        }
        
        /* Print optimizations */
        @media print {
            body { -webkit-print-color-adjust: exact; }
            .page { 
                page-break-after: always;
                page-break-inside: avoid;
            }
            .page:last-child {
                page-break-after: auto;
            }
            .avoid-break-after {
                page-break-after: avoid !important;
                break-after: avoid !important;
            }
            .section-header-group {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            .data-table.small-table {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
        }
        
        @page {
            margin: 0;
            size: A4;
        }
    </style>
</head>
<body>
    <!-- Cover Page -->
    <div class="page cover">
        <div style="display: flex; flex-direction: column; height: 100%; padding: 0;">
            
            <!-- Top Section - Minimal Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 80px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="company-logo">
                        ${companyName.charAt(0).toUpperCase()}${companyName.split(' ')[1] ? companyName.split(' ')[1].charAt(0).toUpperCase() : ''}
                    </div>
                    <div>
                        <div style="font-size: 14px; font-weight: 600; color: #1a202c; margin-bottom: 2px;">${companyName}</div>
                        <div style="font-size: 11px; color: #64748b; font-weight: 500;">${companyIndustry}</div>
                    </div>
                </div>
                <div style="text-align: right; font-size: 10px; color: #64748b; font-weight: 500;">
                    <div style="font-weight: 600; color: #1a202c;">GEO ANALYSIS</div>
                    <div style="margin-top: 2px;">${currentDate}</div>
                </div>
            </div>
            
            <!-- Center Section - Main Content -->
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; text-align: center; max-width: 600px; margin: 0 auto;">
                
                <!-- Main Title -->
                <div style="margin-bottom: 60px;">
                    <h1 style="font-size: 48px; font-weight: 200; color: #1a202c; margin-bottom: 16px; letter-spacing: -0.02em; line-height: 1.1;">
                        Competitive Intelligence
                    </h1>
                    <div style="width: 60px; height: 2px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0 auto 24px;"></div>
                    <p style="font-size: 16px; color: #64748b; font-weight: 400; letter-spacing: 0.5px; text-transform: uppercase;">
                        Strategic Brand Analysis Report
                    </p>
                </div>
                
                <!-- Company Info Card -->
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); margin-bottom: 40px;">
                    <div style="font-size: 28px; font-weight: 600; color: #1a202c; margin-bottom: 20px; letter-spacing: -0.01em;">
                        ${companyName}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 32px;">
                        <div style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 24px; font-weight: 700; color: #667eea; margin-bottom: 4px;">
                                ${reportData.totalQueries}
                            </div>
                            <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                Queries Analyzed
                            </div>
                        </div>
                        <div style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 24px; font-weight: 700; color: #667eea; margin-bottom: 4px;">
                                ${competitors?.length || 0}
                            </div>
                            <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                Competitors Assessed
                            </div>
                        </div>
                    </div>
                </div>
                
            </div>
            
            <!-- Bottom Section - Footer -->
            <div style="margin-top: auto; padding-top: 40px; border-top: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-bottom: 8px;">
                    Powered by GEO Linkedist Intelligence Platform
                </div>
                <div style="font-size: 10px; color: #94a3b8; font-weight: 400;">
                    Advanced AI-Powered Brand Intelligence • ${currentDate}
                </div>
            </div>
            
        </div>
    </div>

    <!-- Comparison Matrix Section -->
    <div class="page">
        <!-- Company Header -->
        <div class="company-header">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="company-logo">
                    ${companyName.charAt(0).toUpperCase()}${companyName.split(' ')[1] ? companyName.split(' ')[1].charAt(0).toUpperCase() : ''}
                </div>
                <div class="company-details">
                    <h1>${companyName}</h1>
                    <p>${companyIndustry}</p>
                </div>
            </div>
            <div class="report-info">
                <p><strong>GEO Analysis</strong></p>
                <p>${currentDate}</p>
            </div>
        </div>
        
        <div class="section-header-group">
            <h2 class="section-title">Comparison Matrix</h2>
            <div class="insight-box">
                ${sectionInsights.comparisonMatrix}
            </div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-number">${reportData.matrixData.length}</div>
                <div class="metric-label">Competitors</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">3</div>
                <div class="metric-label">AI Providers</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">${reportData.visibilityScore}%</div>
                <div class="metric-label">Your Avg Score</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">${Math.max(...reportData.matrixData.map((c: any) => 
                  Math.max(...Object.values(c.providers).map((p: any) => p.visibilityScore || 0))
                ))}%</div>
                <div class="metric-label">Top Score</div>
            </div>
        </div>
        
        <table class="data-table small-table">
            <thead>
                <tr>
                    <th>Company</th>
                    <th>OpenAI</th>
                    <th>Anthropic</th>
                    <th>Perplexity</th>
                    <th>Average</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.matrixData.map((comp: any) => {
                  const openaiScore = comp.providers.OpenAI?.visibilityScore || 0;
                  const anthropicScore = comp.providers.Anthropic?.visibilityScore || 0;
                  const perplexityScore = comp.providers.Perplexity?.visibilityScore || 0;
                  const average = Math.round((openaiScore + anthropicScore + perplexityScore) / 3);
                  
                  return `
                    <tr ${comp.isOwn ? 'class="company-row"' : ''}>
                        <td><strong>${comp.competitor}</strong>${comp.isOwn ? ' (Your Brand)' : ''}</td>
                        <td>${openaiScore}%</td>
                        <td>${anthropicScore}%</td>
                        <td>${perplexityScore}%</td>
                        <td><strong>${average}%</strong></td>
                    </tr>
                  `;
                }).join('')}
            </tbody>
        </table>
    </div>

    <!-- Prompts & Responses Section -->
    <div class="page">
        <!-- Company Header -->
        <div class="company-header">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="company-logo">
                    ${companyName.charAt(0).toUpperCase()}${companyName.split(' ')[1] ? companyName.split(' ')[1].charAt(0).toUpperCase() : ''}
                </div>
                <div class="company-details">
                    <h1>${companyName}</h1>
                    <p>${companyIndustry}</p>
                </div>
            </div>
            <div class="report-info">
                <p><strong>GEO Analysis</strong></p>
                <p>${currentDate}</p>
            </div>
        </div>
        
        <div class="section-header-group">
            <h2 class="section-title">Prompts & Responses</h2>
            <div class="insight-box">
                ${sectionInsights.promptsResponses}
            </div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-number">${reportData.promptsData.length}</div>
                <div class="metric-label">Total Prompts</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">${reportData.totalQueries}</div>
                <div class="metric-label">Total Responses</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">${reportData.companyMentions}</div>
                <div class="metric-label">Brand Mentions</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">${reportData.visibilityScore}%</div>
                <div class="metric-label">Mention Rate</div>
            </div>
        </div>
        
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 50%;">Query</th>
                    <th>Responses</th>
                    <th>Brand Mentions</th>
                    <th>Mention Rate</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.promptsData.slice(0, 12).map((prompt: any) => `
                    <tr>
                        <td>${prompt.prompt}</td>
                        <td>${prompt.totalResponses}</td>
                        <td>${prompt.brandMentions}</td>
                        <td><strong>${prompt.mentionRate}%</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        ${reportData.promptsData.length > 12 ? `
            <p style="font-style: italic; color: #64748b; text-align: center; margin-top: 15px; font-size: 12px;">
                Showing top 12 prompts. Total analyzed: ${reportData.promptsData.length}
            </p>
        ` : ''}
    </div>

    <!-- Provider Rankings Section -->
    <div class="page">
        <!-- Company Header -->
        <div class="company-header">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="company-logo">
                    ${companyName.charAt(0).toUpperCase()}${companyName.split(' ')[1] ? companyName.split(' ')[1].charAt(0).toUpperCase() : ''}
                </div>
                <div class="company-details">
                    <h1>${companyName}</h1>
                    <p>${companyIndustry}</p>
                </div>
            </div>
            <div class="report-info">
                <p><strong>GEO Analysis</strong></p>
                <p>${currentDate}</p>
            </div>
        </div>
        
        <div class="section-header-group">
            <h2 class="section-title">Provider Rankings</h2>
            <div class="insight-box">
                ${sectionInsights.providerRankings}
            </div>
        </div>
        
        ${reportData.rankingsData.slice(0, 2).map((ranking: any) => `
            <div class="provider-section">
                <h3 class="provider-title">${ranking.provider} Rankings</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Company</th>
                            <th>Visibility Score</th>
                            <th>Share of Voice</th>
                            <th>Sentiment</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ranking.competitors.slice(0, 8).map((comp: any) => `
                            <tr ${comp.isOwn ? 'class="company-row"' : ''}>
                                <td><strong>#${comp.rank}</strong></td>
                                <td>${comp.name}${comp.isOwn ? ' (Your Brand)' : ''}</td>
                                <td>${comp.visibilityScore}%</td>
                                <td>${comp.shareOfVoice}%</td>
                                <td>
                                    <span style="
                                        padding: 3px 6px; 
                                        border-radius: 4px; 
                                        font-size: 9px; 
                                        font-weight: 600;
                                        background: ${comp.sentiment === 'positive' ? '#d4edda' : comp.sentiment === 'negative' ? '#f8d7da' : '#e2e3e5'};
                                        color: ${comp.sentiment === 'positive' ? '#155724' : comp.sentiment === 'negative' ? '#721c24' : '#383d41'};
                                    ">
                                        ${comp.sentiment.charAt(0).toUpperCase() + comp.sentiment.slice(1)}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `).join('')}
    </div>

    <!-- Visibility Score & Next Steps Section -->
    <div class="page">
        <!-- Company Header -->
        <div class="company-header">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="company-logo">
                    ${companyName.charAt(0).toUpperCase()}${companyName.split(' ')[1] ? companyName.split(' ')[1].charAt(0).toUpperCase() : ''}
                </div>
                <div class="company-details">
                    <h1>${companyName}</h1>
                    <p>${companyIndustry}</p>
                </div>
            </div>
            <div class="report-info">
                <p><strong>GEO Analysis</strong></p>
                <p>${currentDate}</p>
            </div>
        </div>
        
        <div class="section-header-group">
            <h2 class="section-title">Visibility Score</h2>
            <div class="insight-box">
                ${sectionInsights.visibilityScore}
            </div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-number">${reportData.visibilityScore}%</div>
                <div class="metric-label">Overall Score</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">${reportData.companyMentions}</div>
                <div class="metric-label">Total Mentions</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">${reportData.totalQueries}</div>
                <div class="metric-label">Queries Analyzed</div>
            </div>
            <div class="metric-card">
                <div class="metric-number">${Math.round((reportData.companyMentions / Math.max(reportData.totalQueries, 1)) * 100)}%</div>
                <div class="metric-label">Response Rate</div>
            </div>
        </div>
        
        <h3 class="provider-title">Competitive Visibility Comparison</h3>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Company</th>
                    <th>Visibility Score</th>
                    <th>Market Position</th>
                    <th>Performance Gap</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.matrixData.sort((a: any, b: any) => {
                  const aAvg = Object.values(a.providers).reduce((sum: number, p: any) => sum + (p.visibilityScore || 0), 0) / 3;
                  const bAvg = Object.values(b.providers).reduce((sum: number, p: any) => sum + (p.visibilityScore || 0), 0) / 3;
                  return bAvg - aAvg;
                }).slice(0, 8).map((comp: any, index: number) => {
                  const avgScore = Math.round(Object.values(comp.providers).reduce((sum: number, p: any) => sum + (p.visibilityScore || 0), 0) / 3);
                  const topScore = Math.max(...reportData.matrixData.map((c: any) => 
                    Math.round(Object.values(c.providers).reduce((sum: number, p: any) => sum + (p.visibilityScore || 0), 0) / 3)
                  ));
                  const gap = topScore - avgScore;
                  
                  return `
                    <tr ${comp.isOwn ? 'class="company-row"' : ''}>
                        <td><strong>${comp.competitor}</strong>${comp.isOwn ? ' (Your Brand)' : ''}</td>
                        <td>${avgScore}%</td>
                        <td>#${index + 1}</td>
                        <td>${gap > 0 ? `-${gap}%` : 'Leader'}</td>
                    </tr>
                  `;
                }).join('')}
            </tbody>
        </table>
    </div>

    <!-- Final Page - Recommendations & Next Steps -->
    <div class="page">
        <!-- Company Header -->
        <div class="company-header">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="company-logo">
                    ${companyName.charAt(0).toUpperCase()}${companyName.split(' ')[1] ? companyName.split(' ')[1].charAt(0).toUpperCase() : ''}
                </div>
                <div class="company-details">
                    <h1>${companyName}</h1>
                    <p>${companyIndustry}</p>
                </div>
            </div>
            <div class="report-info">
                <p><strong>GEO Analysis</strong></p>
                <p>${currentDate}</p>
            </div>
        </div>
        
        <div class="section-header-group">
            <h2 class="section-title">Strategic Recommendations</h2>
        </div>
        
        <!-- Next Steps Section -->
        <div class="next-steps">
            <h3>🎯 Next Steps to Improve GEO Visibility</h3>
            
            <div class="recommendation">
                <h4>1. Optimize Content for AI-First Search</h4>
                <p>Focus on creating authoritative, structured content that answers specific questions in your industry. AI models favor comprehensive, factual content that directly addresses user queries.</p>
            </div>
            
            <div class="recommendation">
                <h4>2. Build Strategic Industry Partnerships</h4>
                <p>Collaborate with recognized industry leaders and publications to increase your brand's credibility signals. Co-authored content and expert quotes significantly boost AI model recognition.</p>
            </div>
        </div>
            
        <div class="full-version-cta">
            <h4>🚀 Unlock Complete GEO Strategy</h4>
            <p>Get detailed competitor analysis, 50+ actionable recommendations, monthly tracking, and personalized optimization roadmap with our full version.</p>
        </div>
        
        <div style="margin-top: auto;">
            <div style="margin-top: 60px; padding-top: 30px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #64748b; text-align: center; font-weight: 500;">
                <p>Analysis based on ${reportData.totalQueries} queries across multiple AI providers</p>
                <p style="margin-top: 8px;">Generated by GEO Linkedist Platform • ${currentDate}</p>
            </div>
        </div>
    </div>
</body>
</html>`;
} 
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
        
        /* Clean page structure - strict footer positioning */
        .page { 
            width: 210mm;
            height: 297mm;
            margin: 0 auto;
            background: white;
            padding: 0;
            page-break-after: always;
            page-break-inside: avoid;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        
        .page:last-child {
            page-break-after: auto;
        }
        
        /* Header area - fixed height */
        .page-header {
            height: 70px;
            padding: 15px 30px;
            border-bottom: 1px solid #e2e8f0;
            background: #f8fafc;
            flex-shrink: 0;
        }
        
        /* Content area - flexible with no footer constraint */
        .page-content {
            flex: 1;
            padding: 25px 30px 30px 30px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        

        
        /* Simple table container */
        .table-container {
            margin: 10px 0 16px 0;
            max-width: 100%;
            overflow-x: auto;
        }
        
        /* Ensure content doesn't overflow into footer */
        .page-content > *:last-child {
            margin-bottom: 0;
        }
        
        /* Content wrapper for better flow */
        .content-wrapper {
            flex: 1;
            overflow-y: auto;
            padding-bottom: 10px;
        }
        
        /* Large table handling */
        .large-table-warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 10px;
            font-size: 11px;
            color: #856404;
        }
        
        /* Smart table placement */
        .table-section {
            margin: 15px 0;
        }
        
        .table-section.force-new-page {
            page-break-before: always;
            margin-top: 0;
            padding-top: 20px;
        }
        
        /* Provider section with intelligent breaks */
        .provider-section.break-before {
            page-break-before: always;
            margin-top: 0;
            padding-top: 20px;
        }
        
        /* Enhanced visual separation */
        .provider-section:not(:first-child) {
            margin-top: 40px;
            border-top: 1px solid #e2e8f0;
            padding-top: 25px;
        }
        
        .provider-section.break-before {
            border-top: none; /* Remove border when on new page */
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
        
        /* Company info section - simplified */
        .company-info {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 100%;
            max-width: 100%;
        }
        
        .company-logo {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
            font-weight: 700;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .company-details h1 {
            font-size: 18px;
            font-weight: 700;
            color: #1a202c;
            margin-bottom: 2px;
            letter-spacing: -0.025em;
        }
        
        .company-details p {
            font-size: 12px;
            color: #6b7280;
            font-weight: 500;
            text-transform: capitalize;
        }
        
        .report-info {
            text-align: right;
            font-size: 10px;
            color: #6b7280;
            font-weight: 500;
        }
        
        .report-info p {
            margin: 0;
            line-height: 1.3;
        }
        
        .report-info strong {
            color: #374151;
            font-weight: 600;
        }
        
        /* Metric definitions - simplified */
        .metric-definitions {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 12px;
            margin: 12px 0;
            font-size: 11px;
            line-height: 1.4;
        }
        
        .metric-definitions h4 {
            font-size: 12px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 8px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 4px;
        }
        
        .metric-definitions dt {
            font-weight: 600;
            color: #1f2937;
            margin-top: 6px;
        }
        
        .metric-definitions dd {
            color: #6b7280;
            margin-left: 0;
            margin-bottom: 6px;
        }
        
        /* Cover page specific */
        .cover .page-content {
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
        
        /* Clear Visual Hierarchy */
        
        /* H1 - Main page titles */
        .page-title {
            font-size: 32px;
            font-weight: 800;
            color: #1a202c;
            margin: 0 0 30px 0;
            padding: 0 0 15px 0;
            border-bottom: 3px solid #667eea;
            letter-spacing: -0.03em;
            text-transform: uppercase;
        }
        
        /* H2 - Section headers */
        .section-title {
            font-size: 24px;
            font-weight: 700;
            color: #1a202c;
            margin: 30px 0 20px 0;
            padding: 15px 0 15px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
            letter-spacing: -0.025em;
            text-transform: capitalize;
        }
        
        /* H3 - Subsection headers */
        .subsection-title {
            font-size: 18px;
            font-weight: 600;
            color: #374151;
            margin: 20px 0 12px 0;
            padding: 8px 0;
            border-bottom: 2px solid #e2e8f0;
            letter-spacing: -0.01em;
        }
        
        /* H4 - Provider titles */
        .provider-title {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 15px 0;
            padding: 10px 15px;
            background: #f9fafb;
            border-left: 3px solid #667eea;
            border-radius: 4px;
        }
        
        /* Body text styling */
        .body-text {
            font-size: 13px;
            font-weight: 400;
            color: #374151;
            line-height: 1.6;
            margin-bottom: 16px;
        }
        
        /* Emphasis text */
        .emphasis-text {
            font-size: 14px;
            font-weight: 500;
            color: #1f2937;
            line-height: 1.5;
        }
        
        /* Only avoid breaks when necessary */
        .section-title.avoid-break {
            page-break-after: avoid;
            break-after: avoid;
        }
        
        .insight-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-left: 3px solid #667eea;
            border-radius: 6px;
            padding: 16px;
            margin: 0 0 16px 0;
            font-size: 13px;
            line-height: 1.5;
            font-weight: 400;
            color: #374151;
        }
        
        /* Metrics grid - simplified */
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin: 0 0 20px 0;
        }
        
        .metric-card {
            text-align: center;
            padding: 12px 8px;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
        }
        
        .metric-number {
            font-size: 18px;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 4px;
            display: block;
        }
        
        .metric-label {
            font-size: 9px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
            line-height: 1.2;
        }
        
        /* Tables */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 0;
            font-size: 12px;
            font-weight: 400;
        }
        
        /* Small tables (< 10 rows) avoid breaks */
        .data-table.small-table {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        
        /* Medium tables (10-20 rows) allow breaks but prefer not to */
        .data-table.medium-table {
            page-break-inside: auto;
        }
        
        /* Large tables (> 20 rows) must break naturally */
        .data-table.large-table {
            page-break-inside: auto;
        }
        
        /* Table size indicators - hide from display */
        .table-size-indicator {
            display: none;
        }
        
        /* Professional Table Styling - optimized for page fit */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 0;
            font-size: 11px;
            table-layout: fixed;
        }
        
        .data-table th {
            background: linear-gradient(135deg, #1a202c 0%, #374151 100%);
            color: white;
            padding: 10px 8px;
            text-align: left;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 9px;
            letter-spacing: 0.05em;
            border-right: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }
        
        .data-table th:last-child {
            border-right: none;
        }
        
        .data-table td {
            padding: 8px 8px;
            border-bottom: 1px solid #e2e8f0;
            border-right: 1px solid #f1f5f9;
            font-weight: 400;
            vertical-align: middle;
            font-size: 10px;
            word-wrap: break-word;
        }
        
        .data-table td:last-child {
            border-right: none;
        }
        
        /* Alternating row colors for better readability */
        .data-table tbody tr:nth-child(odd) {
            background: #ffffff;
        }
        
        .data-table tbody tr:nth-child(even) {
            background: #f8fafc;
        }
        
        /* Hover effect for better interaction */
        .data-table tbody tr:hover {
            background: #e0e7ff;
            transition: background-color 0.2s ease;
        }
        

        
        /* Client Row - Highly Visible */
        .company-row {
            background: linear-gradient(135deg, #fef3e2 0%, #fed7aa 100%) !important;
            font-weight: 700;
            border-left: 6px solid #f59e0b;
            border-right: 6px solid #f59e0b;
            box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
            position: relative;
        }
        
        .company-row:hover {
            background: linear-gradient(135deg, #fef3e2 0%, #fcd34d 100%) !important;
        }
        
        .company-row td {
            color: #92400e;
            font-weight: 700;
            position: relative;
        }
        
        .company-row td:first-child::before {
            content: "👑 ";
            color: #f59e0b;
            font-size: 14px;
            margin-right: 4px;
        }
        
        .provider-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        
        .provider-section:first-child {
            margin-bottom: 15px;
        }
        
        .provider-title {
            font-size: 16px;
            color: #1a202c;
            margin: 0 0 15px 0;
            font-weight: 600;
            padding-bottom: 8px;
            border-bottom: 1px solid #e2e8f0;
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
        
                /* Print optimizations - no footer constraints */
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
            .data-table.medium-table {
                page-break-inside: auto !important;
            }
            .data-table.large-table {
                page-break-inside: auto !important;
            }
            .table-container.force-new-page {
                page-break-before: always !important;
                break-before: always !important;
            }
            .provider-section.break-before {
                page-break-before: always !important;
                break-before: always !important;
            }
            .table-section.force-new-page {
                page-break-before: always !important;
                break-before: always !important;
            }
            .provider-section {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
        }
        
        @page {
            margin: 0;
            size: A4;
        }
    </style>
    <script>
        // Helper functions for table sizing and page breaks
        function getTableSizeClass(rowCount) {
            if (rowCount <= 8) return 'small-table';
            if (rowCount <= 15) return 'medium-table';
            return 'large-table';
        }
        
        function shouldForceNewPage(rowCount, isAfterLargeContent = false) {
            // Force new page for large tables or after large content sections
            return rowCount > 15 || isAfterLargeContent;
        }
        
        function getTableWarning(rowCount) {
            if (rowCount > 20) {
                return '<div class="large-table-warning">⚠️ Large table: This table may span multiple pages for optimal readability.</div>';
            }
            return '';
        }
        
        // Estimate table height in mm (rough calculation)
        function estimateTableHeight(rowCount) {
            const headerHeight = 12; // mm
            const rowHeight = 8; // mm per row
            const margins = 10; // mm
            return headerHeight + (rowCount * rowHeight) + margins;
        }
        
        // Check if we should force a page break for a section
        function shouldBreakForSection(sectionIndex, tableRowCount, currentPageUsage = 150) {
            const estimatedHeight = estimateTableHeight(tableRowCount);
            const availableSpace = 297 - 60 - currentPageUsage; // A4 height - margins - current usage
            
            // Always break for second section if first section used significant space
            if (sectionIndex === 1) {
                return true; // Force second provider to new page
            }
            
            // Break if table won't fit in remaining space
            return estimatedHeight > availableSpace;
        }
        
        function getTableContainerClass(rowCount, isAfterLargeContent = false) {
            return shouldForceNewPage(rowCount, isAfterLargeContent) ? 
                'table-container force-new-page' : 'table-container';
        }
        
        // Generate page footer content

    </script>
</head>
<body>
    <!-- Cover Page -->
    <div class="page cover">
        <div class="page-content" style="display: flex; flex-direction: column; justify-content: space-between; text-align: center; padding: 40px 30px;">
            
            <!-- Top Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="company-logo">
                        ${companyName.charAt(0).toUpperCase()}${companyName.split(' ')[1] ? companyName.split(' ')[1].charAt(0).toUpperCase() : ''}
                    </div>
                    <div style="text-align: left;">
                        <div style="font-size: 14px; font-weight: 600; color: #1a202c;">${companyName}</div>
                        <div style="font-size: 11px; color: #64748b;">${companyIndustry}</div>
                    </div>
                </div>
                <div style="text-align: right; font-size: 10px; color: #64748b;">
                    <div style="font-weight: 600; color: #1a202c;">GEO ANALYSIS</div>
                    <div>${currentDate}</div>
                </div>
            </div>
            
            <!-- Center Content -->
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; max-width: 600px; margin: 0 auto;">
                
                <h1 style="font-size: 48px; font-weight: 200; color: #1a202c; margin-bottom: 16px; letter-spacing: -0.02em;">
                    GEO Analysis
                </h1>
                <div style="width: 60px; height: 2px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0 auto 24px;"></div>
                <p style="font-size: 16px; color: #64748b; margin-bottom: 40px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Generative Engine Optimization analysis
                </p>
                
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                    <div style="font-size: 28px; font-weight: 600; color: #1a202c; margin-bottom: 24px;">
                        ${companyName}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div style="text-align: center; padding: 16px; background: #f8fafc; border-radius: 8px;">
                            <div style="font-size: 20px; font-weight: 700; color: #667eea;">${reportData.totalQueries}</div>
                            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Queries Analyzed</div>
                        </div>
                        <div style="text-align: center; padding: 16px; background: #f8fafc; border-radius: 8px;">
                            <div style="font-size: 20px; font-weight: 700; color: #667eea;">${competitors?.length || 0}</div>
                            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Competitors Assessed</div>
                        </div>
                    </div>
                </div>
                
            </div>
            
            <!-- Bottom Text -->
            <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <div style="font-size: 11px; color: #64748b;">GEO Linkedist Intelligence Platform</div>
                <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">Advanced AI-Powered Brand Intelligence</div>
            </div>
            
        </div>
        

    </div>

    <!-- Table of Contents -->
    <div class="page">
        <div class="page-header">
            <div class="company-info">
                <div style="display: flex; align-items: center; gap: 12px;">
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
        </div>
        
        <div class="page-content">
            <div class="content-wrapper">
            
            <h1 class="page-title">Table of Contents</h1>
            
            <div style="margin-top: 80px;">
                <div style="display: flex; flex-direction: column; gap: 20px; max-width: 500px;">
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                        <div>
                            <div class="emphasis-text" style="color: #1f2937; margin-bottom: 4px;">Executive Summary</div>
                            <div style="font-size: 11px; color: #6b7280;">Key findings and strategic priorities</div>
                        </div>
                        <div style="font-weight: 600; color: #667eea; font-size: 16px;">3</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                        <div>
                            <div class="emphasis-text" style="color: #1f2937; margin-bottom: 4px;">1. Comparison Matrix</div>
                            <div style="font-size: 11px; color: #6b7280;">Cross-provider visibility performance</div>
                        </div>
                        <div style="font-weight: 600; color: #667eea; font-size: 16px;">4</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                        <div>
                            <div class="emphasis-text" style="color: #1f2937; margin-bottom: 4px;">2. Prompts & Responses</div>
                            <div style="font-size: 11px; color: #6b7280;">Query analysis and brand mention rates</div>
                        </div>
                        <div style="font-weight: 600; color: #667eea; font-size: 16px;">5</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                        <div>
                            <div class="emphasis-text" style="color: #1f2937; margin-bottom: 4px;">3. Provider Rankings</div>
                            <div style="font-size: 11px; color: #6b7280;">Competitive positioning by AI provider</div>
                        </div>
                        <div style="font-weight: 600; color: #667eea; font-size: 16px;">6-7</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                        <div>
                            <div class="emphasis-text" style="color: #1f2937; margin-bottom: 4px;">4. Visibility Analysis</div>
                            <div style="font-size: 11px; color: #6b7280;">Market position and performance gaps</div>
                        </div>
                        <div style="font-weight: 600; color: #667eea; font-size: 16px;">8</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                        <div>
                            <div class="emphasis-text" style="color: #1f2937; margin-bottom: 4px;">5. Strategic Recommendations</div>
                            <div style="font-size: 11px; color: #6b7280;">Actionable next steps and optimization</div>
                        </div>
                        <div style="font-weight: 600; color: #667eea; font-size: 16px;">9</div>
                    </div>
                    
                </div>
                
                <!-- Report Overview Stats -->
                <div style="margin-top: 50px; padding: 25px; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; border: 1px solid #cbd5e1;">
                    <div class="subsection-title" style="margin-top: 0; margin-bottom: 15px; border: none; color: #374151;">📋 Report Overview</div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div>
                            <div class="body-text" style="margin-bottom: 8px;"><strong>Analysis Scope:</strong></div>
                            <ul style="font-size: 12px; color: #4b5563; line-height: 1.6; margin: 0; padding-left: 20px;">
                                <li>${reportData.totalQueries} queries analyzed</li>
                                <li>${reportData.matrixData.length} competitors assessed</li>
                                <li>3 AI providers tested</li>
                                <li>${reportData.promptsData.length} prompts evaluated</li>
                            </ul>
                        </div>
                        <div>
                            <div class="body-text" style="margin-bottom: 8px;"><strong>Key Metrics:</strong></div>
                            <ul style="font-size: 12px; color: #4b5563; line-height: 1.6; margin: 0; padding-left: 20px;">
                                <li>Overall visibility: ${reportData.visibilityScore}%</li>
                                <li>Brand mentions: ${reportData.companyMentions}</li>
                                <li>Market ranking: #${reportData.matrixData.map((comp: any) => {
                                  const avgScore = Math.round(Object.values(comp.providers).reduce((sum: number, p: any) => sum + (p.visibilityScore || 0), 0) / 3);
                                  return { ...comp, avgScore };
                                }).sort((a: any, b: any) => b.avgScore - a.avgScore).findIndex((comp: any) => comp.isOwn) + 1}</li>
                                <li>Generated: ${currentDate}</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
            </div>
            
            </div>
        </div>
        

    </div>

    <!-- Executive Summary Page -->
    <div class="page">
        <div class="page-header">
            <div class="company-info">
                <div style="display: flex; align-items: center; gap: 12px;">
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
        </div>
        
        <div class="page-content">
            <div class="content-wrapper">
            
            <h1 class="page-title">Executive Summary</h1>
            
            <!-- Key Performance Indicators -->
            <div class="subsection-title">📊 Key Performance Indicators</div>
            
            <div class="metrics-grid" style="grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 30px;">
                <div class="metric-card" style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none;">
                    <div class="metric-number" style="color: white; font-size: 28px;">${reportData.visibilityScore}%</div>
                    <div class="metric-label" style="color: rgba(255,255,255,0.9); font-size: 11px;">Overall Visibility Score</div>
                </div>
                <div class="metric-card" style="padding: 20px;">
                    <div class="metric-number" style="font-size: 28px;">#${reportData.matrixData.map((comp: any, index: number) => {
                      const avgScore = Math.round(Object.values(comp.providers).reduce((sum: number, p: any) => sum + (p.visibilityScore || 0), 0) / 3);
                      return { ...comp, avgScore };
                    }).sort((a: any, b: any) => b.avgScore - a.avgScore).findIndex((comp: any) => comp.isOwn) + 1}</div>
                    <div class="metric-label">Market Ranking</div>
                </div>
                <div class="metric-card" style="padding: 20px;">
                    <div class="metric-number" style="font-size: 28px;">${reportData.matrixData.length}</div>
                    <div class="metric-label">Competitors Analyzed</div>
                </div>
            </div>
            
            <!-- Key Findings -->
            <div class="subsection-title">🎯 Key Findings</div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div class="insight-box" style="margin: 0;">
                    <div class="emphasis-text" style="margin-bottom: 8px; color: #667eea;">Brand Visibility Performance</div>
                    <div class="body-text" style="margin: 0;">
                        ${companyName} achieved a ${reportData.visibilityScore}% visibility score across AI providers, 
                        ${reportData.visibilityScore >= 50 ? 'indicating strong' : reportData.visibilityScore >= 25 ? 'showing moderate' : 'revealing limited'} 
                        brand recognition in AI-powered search results.
                    </div>
                </div>
                
                <div class="insight-box" style="margin: 0;">
                    <div class="emphasis-text" style="margin-bottom: 8px; color: #667eea;">Competitive Position</div>
                    <div class="body-text" style="margin: 0;">
                        Among ${reportData.matrixData.length} competitors analyzed, ${companyName} ranks 
                        #${reportData.matrixData.map((comp: any, index: number) => {
                          const avgScore = Math.round(Object.values(comp.providers).reduce((sum: number, p: any) => sum + (p.visibilityScore || 0), 0) / 3);
                          return { ...comp, avgScore };
                        }).sort((a: any, b: any) => b.avgScore - a.avgScore).findIndex((comp: any) => comp.isOwn) + 1} 
                        in overall AI visibility, with significant opportunities for improvement.
                    </div>
                </div>
            </div>
            
            <!-- Strategic Priorities -->
            <div class="subsection-title">🚀 Strategic Priorities</div>
            
            <div style="display: flex; flex-direction: column; gap: 16px;">
                ${reportData.visibilityScore < 25 ? `
                <div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px;">
                    <div style="color: #ef4444; font-size: 18px; margin-top: 2px;">🔥</div>
                    <div>
                        <div class="emphasis-text" style="color: #dc2626; margin-bottom: 4px;">Critical Priority: Build Foundation</div>
                        <div class="body-text" style="margin: 0; color: #7f1d1d;">
                            Low visibility requires immediate attention to content strategy and industry authority building.
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 6px;">
                    <div style="color: #3b82f6; font-size: 18px; margin-top: 2px;">📈</div>
                    <div>
                        <div class="emphasis-text" style="color: #1e40af; margin-bottom: 4px;">Optimize Provider Performance</div>
                        <div class="body-text" style="margin: 0; color: #1e3a8a;">
                            Focus on ${['OpenAI', 'Anthropic', 'Perplexity'].find((provider: string) => {
                              const scores = reportData.matrixData.find((comp: any) => comp.isOwn)?.providers || {};
                              return Math.min(...Object.entries(scores).map(([p, data]: [string, any]) => (data as any).visibilityScore || 0));
                            }) || 'underperforming'} channels for maximum impact improvement.
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 6px;">
                    <div style="color: #22c55e; font-size: 18px; margin-top: 2px;">🎯</div>
                    <div>
                        <div class="emphasis-text" style="color: #15803d; margin-bottom: 4px;">GEO Analysis</div>
                        <div class="body-text" style="margin: 0; color: #14532d;">
                            Analyze top-performing competitors' content strategies to identify successful visibility tactics.
                        </div>
                    </div>
                </div>
            </div>
            
            </div>
        </div>
        

    </div>

    <!-- Comparison Matrix Section -->
    <div class="page">
        <div class="page-header">
            <div class="company-info">
                <div style="display: flex; align-items: center; gap: 12px;">
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
        </div>
        
        <div class="page-content">
            <div class="content-wrapper">
            
            <div class="section-header-group">
                <h2 class="section-title">1. Comparison Matrix</h2>
                <div class="insight-box">
                    ${sectionInsights.comparisonMatrix}
                </div>
                
                <div class="metric-definitions">
                    <h4>📊 Metric Definitions</h4>
                    <dl>
                        <dt>Visibility Score:</dt>
                        <dd>Percentage of queries where the brand appears in AI responses (0-100%)</dd>
                        <dt>AI Providers:</dt>
                        <dd>Leading AI models tested - OpenAI GPT, Anthropic Claude, Perplexity</dd>
                        <dt>Average Score:</dt>
                        <dd>Mean visibility across all three AI providers</dd>
                    </dl>
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
            
            <div class="table-container">
                <div class="table-size-indicator">
                    Table: ${reportData.matrixData.length} competitors × 5 columns (${reportData.matrixData.length <= 8 ? 'Small' : reportData.matrixData.length <= 15 ? 'Medium' : 'Large'} size)
                </div>
                <table class="data-table ${reportData.matrixData.length <= 8 ? 'small-table' : reportData.matrixData.length <= 15 ? 'medium-table' : 'large-table'}">
            <thead>
                <tr>
                    <th style="width: 35%;">Company</th>
                    <th style="width: 16%;">OpenAI</th>
                    <th style="width: 16%;">Anthropic</th>
                    <th style="width: 16%;">Perplexity</th>
                    <th style="width: 17%;">Average</th>
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
        </div>
        
            </div>
        </div>
        

    </div>

    <!-- Prompts & Responses Section -->
    <div class="page">
        <div class="page-header">
            <div class="company-info">
                <div style="display: flex; align-items: center; gap: 12px;">
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
        </div>
        
        <div class="page-content">
            <div class="content-wrapper">
            
            <div class="section-header-group">
                <h2 class="section-title">2. Prompts & Responses</h2>
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
            
            <div class="table-container ${Math.min(reportData.promptsData.length, 12) > 15 ? 'force-new-page' : ''}">
                <div class="table-size-indicator">
                    Table: ${Math.min(reportData.promptsData.length, 12)} prompts × 4 columns (${Math.min(reportData.promptsData.length, 12) <= 8 ? 'Small' : Math.min(reportData.promptsData.length, 12) <= 15 ? 'Medium' : 'Large'} size)
                </div>
                <table class="data-table ${Math.min(reportData.promptsData.length, 12) <= 8 ? 'small-table' : Math.min(reportData.promptsData.length, 12) <= 15 ? 'medium-table' : 'large-table'}">
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
            </div>
            
            ${reportData.promptsData.length > 12 ? `
                <p style="font-style: italic; color: #64748b; text-align: center; margin-top: 15px; font-size: 12px;">
                    Showing top 12 prompts. Total analyzed: ${reportData.promptsData.length}
                </p>
            ` : ''}
        </div>
        
            </div>
        </div>
        

    </div>

    <!-- Provider Rankings Section -->
    <div class="page">
        <div class="page-header">
            <div class="company-info">
                <div style="display: flex; align-items: center; gap: 12px;">
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
        </div>
        
        <div class="page-content">
            <div class="content-wrapper">
            
            <div class="section-header-group">
                <h2 class="section-title">3. Provider Rankings</h2>
                <div class="insight-box">
                    ${sectionInsights.providerRankings}
                </div>
            </div>
            
            ${reportData.rankingsData.slice(0, 3).map((ranking: any, index: number) => `
                <div class="provider-section ${index >= 1 ? 'break-before' : ''}">
                    <h3 class="provider-title">${ranking.provider} Rankings</h3>
                    <div class="table-section">
                        <div class="table-size-indicator">
                            Table: ${ranking.competitors.slice(0, 8).length} competitors × 5 columns (${ranking.competitors.slice(0, 8).length <= 8 ? 'Small' : ranking.competitors.slice(0, 8).length <= 15 ? 'Medium' : 'Large'} size)
                        </div>
                        <table class="data-table small-table">
                    <thead>
                        <tr>
                            <th style="width: 10%;">Rank</th>
                            <th style="width: 35%;">Company</th>
                            <th style="width: 20%;">Visibility Score</th>
                            <th style="width: 20%;">Share of Voice</th>
                            <th style="width: 15%;">Sentiment</th>
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
                </div>
            `).join('')}
        </div>
        
            </div>
        </div>
        

    </div>

    <!-- Visibility Score & Next Steps Section -->
    <div class="page">
        <div class="page-header">
            <div class="company-info">
                <div style="display: flex; align-items: center; gap: 12px;">
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
        </div>
        
        <div class="page-content">
            <div class="content-wrapper">
            
            <div class="section-header-group">
                <h2 class="section-title">4. Visibility Analysis</h2>
                <div class="insight-box">
                    ${sectionInsights.visibilityScore}
                </div>
                
                <div class="metric-definitions">
                    <h4>🎯 Key Performance Indicators</h4>
                    <dl>
                        <dt>Overall Score:</dt>
                        <dd>Your brand's average visibility across all AI providers and queries</dd>
                        <dt>Total Mentions:</dt>
                        <dd>Number of AI responses that specifically mentioned your brand</dd>
                        <dt>Market Position:</dt>
                        <dd>Your ranking compared to identified competitors (#1 = highest visibility)</dd>
                        <dt>Performance Gap:</dt>
                        <dd>Percentage difference from the market leader (-X% = behind leader)</dd>
                    </dl>
                </div>
            </div>
            
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-number">${reportData.visibilityScore}%</div>
                    <div class="metric-label">Overall Score</div>
                </div>
                ${reportData.companyMentions > 0 ? `
                <div class="metric-card">
                    <div class="metric-number">${reportData.companyMentions}</div>
                    <div class="metric-label">Brand Mentions</div>
                </div>
                ` : `
                <div class="metric-card" style="background: linear-gradient(135deg, #fef2f2 0%, #ffffff 100%); border-color: #fecaca;">
                    <div class="metric-number" style="color: #dc2626;">0</div>
                    <div class="metric-label" style="color: #991b1b;">No Mentions</div>
                </div>
                `}
                <div class="metric-card">
                    <div class="metric-number">${reportData.totalQueries}</div>
                    <div class="metric-label">Queries Tested</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${reportData.matrixData.length}</div>
                    <div class="metric-label">Competitors Found</div>
                </div>
            </div>
            
            <h3 class="provider-title">Competitive Visibility Comparison</h3>
            <div class="table-container ${reportData.matrixData.slice(0, 8).length > 12 ? 'force-new-page' : ''}">
                <div class="table-size-indicator">
                    Table: ${reportData.matrixData.slice(0, 8).length} competitors × 4 columns (${reportData.matrixData.slice(0, 8).length <= 8 ? 'Small' : reportData.matrixData.slice(0, 8).length <= 15 ? 'Medium' : 'Large'} size)
                </div>
                <table class="data-table ${reportData.matrixData.slice(0, 8).length <= 8 ? 'small-table' : reportData.matrixData.slice(0, 8).length <= 15 ? 'medium-table' : 'large-table'}">
            <thead>
                <tr>
                    <th style="width: 40%;">Company</th>
                    <th style="width: 20%;">Visibility Score</th>
                    <th style="width: 20%;">Market Position</th>
                    <th style="width: 20%;">Performance Gap</th>
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
        </div>
        
            </div>
        </div>
        

    </div>

    <!-- Final Page - Recommendations & Next Steps -->
    <div class="page">
        <div class="page-header">
            <div class="company-info">
                <div style="display: flex; align-items: center; gap: 12px;">
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
        </div>
        
        <div class="page-content">
            <div class="content-wrapper">
            
            <div class="section-header-group">
                <h2 class="section-title">5. Strategic Recommendations</h2>
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
        
            </div>
        </div>
        </div>
    </div>
</body>
</html>`;
}
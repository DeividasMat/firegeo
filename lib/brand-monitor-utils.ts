import { Company } from './types';

export function validateUrl(url: string): boolean {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    
    // Basic domain validation - must have at least one dot and valid TLD
    const hostname = urlObj.hostname;
    const parts = hostname.split('.');
    
    // Must have at least domain.tld format
    if (parts.length < 2) return false;
    
    // Last part (TLD) must be at least 2 characters and contain only letters
    const tld = parts[parts.length - 1];
    if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;
    
    // Domain parts should contain valid characters (allow numbers and hyphens)
    for (const part of parts) {
      if (!/^[a-zA-Z0-9-]+$/.test(part) || part.startsWith('-') || part.endsWith('-')) {
        return false;
      }
    }
    
    return true;
  } catch (e) {
    console.error('URL validation error:', e);
    return false;
  }
}

export function validateCompetitorUrl(url: string): string | undefined {
  if (!url) return undefined;
  
  // Remove trailing slashes
  let cleanUrl = url.trim().replace(/\/$/, '');
  
  // Ensure the URL has a protocol
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  
  try {
    const urlObj = new URL(cleanUrl);
    const hostname = urlObj.hostname;
    
    // Return clean URL without protocol for display
    return hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
  } catch {
    return undefined;
  }
}

export function normalizeCompetitorName(name: string): string {
  const normalized = name.toLowerCase().trim();
  
  // Normalize common variations to canonical names
  const nameNormalizations: { [key: string]: string } = {
    'amazon web services': 'aws',
    'amazon web services (aws)': 'aws',
    'amazon aws': 'aws',
    'microsoft azure': 'azure',
    'google cloud platform': 'google cloud',
    'google cloud platform (gcp)': 'google cloud',
    'gcp': 'google cloud',
    'digital ocean': 'digitalocean',
    'beautiful soup': 'beautifulsoup',
    'bright data': 'brightdata',
  };
  
  return nameNormalizations[normalized] || normalized;
}

export function assignUrlToCompetitor(competitorName: string): string | undefined {
  // Pure dynamic URL generation - no hardcoded mappings
  return generateSmartUrl(competitorName);
}

function generateSmartUrl(competitorName: string): string | undefined {
  if (!competitorName || competitorName.trim().length === 0) {
    return undefined;
  }

  const originalName = competitorName.trim();
  
  // Handle special patterns first
  if (originalName.toLowerCase().includes('no specific competitors found')) {
    return undefined;
  }

  // Clean the name for URL generation
  let cleanName = originalName.toLowerCase()
    .replace(/\b(inc|llc|corp|ltd|limited|company|co|group|gmbh|ag|sa|spa|srl|plc|pvt|private|public|bank|bankas)\b/g, '') // Remove common suffixes
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '') // Remove spaces
    .trim();
  
  // Skip if name is too generic or short
  if (cleanName.length < 2 || ['the', 'and', 'for', 'with', 'inc', 'llc', 'corp', 'company', 'group', 'bank'].includes(cleanName)) {
    return undefined;
  }

  // Handle multi-word company names intelligently
  if (originalName.includes(' ')) {
    const words = originalName.toLowerCase().split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['inc', 'llc', 'corp', 'ltd', 'limited', 'company', 'co', 'group', 'the', 'and', 'for', 'with'].includes(word));
    
    if (words.length >= 2) {
      // Try combining first two meaningful words
      const combinedName = words.slice(0, 2).join('').replace(/[^a-z0-9]/g, '');
      if (combinedName.length >= 4 && combinedName.length <= 20) {
        cleanName = combinedName;
      }
    } else if (words.length === 1 && words[0].length >= 3) {
      cleanName = words[0].replace(/[^a-z0-9]/g, '');
    }
  }

  // Handle very long names by extracting the core brand
  if (cleanName.length > 20) {
    const words = originalName.toLowerCase().split(/\s+/);
    const mainWord = words.find(word => 
      word.length >= 4 && 
      word.length <= 12 &&
      !['the', 'and', 'for', 'with', 'inc', 'llc', 'corp', 'company', 'group', 'ltd', 'limited', 'bank', 'bankas'].includes(word)
    );
    if (mainWord) {
      cleanName = mainWord.replace(/[^a-z0-9]/g, '');
    } else {
      // Take first 12 characters if no good word found
      cleanName = cleanName.substring(0, 12);
    }
  }

  if (cleanName.length < 2) {
    return undefined;
  }

  // Determine most likely TLD based on company characteristics
  const lowerOriginal = originalName.toLowerCase();
  
  // European financial institutions
  if (lowerOriginal.includes('bank') || lowerOriginal.includes('bankas')) {
    if (lowerOriginal.includes('lithuania') || lowerOriginal.includes('lithuanian') || originalName.includes('Lt')) {
      return `${cleanName}.lt`;
    }
    if (lowerOriginal.includes('latvia') || lowerOriginal.includes('latvian')) {
      return `${cleanName}.lv`;
    }
    if (lowerOriginal.includes('estonia') || lowerOriginal.includes('estonian')) {
      return `${cleanName}.ee`;
    }
    if (lowerOriginal.includes('sweden') || lowerOriginal.includes('swedish')) {
      return `${cleanName}.se`;
    }
    // Default for banks
    return `${cleanName}.com`;
  }

  // Tech/AI companies
  if (lowerOriginal.includes('ai') || lowerOriginal.includes('tech') || lowerOriginal.includes('software')) {
    if (cleanName.length <= 8) {
      return `${cleanName}.ai`;
    }
    return `${cleanName}.com`;
  }

  // Startups/modern companies might use .io
  if (cleanName.length <= 8 && (lowerOriginal.includes('io') || 
      lowerOriginal.includes('app') || 
      lowerOriginal.includes('platform') ||
      lowerOriginal.includes('service'))) {
    return `${cleanName}.io`;
  }

  // European companies
  if (lowerOriginal.includes('eu') || lowerOriginal.includes('europe')) {
    return `${cleanName}.eu`;
  }

  // Default to .com for most companies
  return `${cleanName}.com`;
}

export function detectServiceType(company: Company): string {
  const desc = (company.description || '').toLowerCase();
  const content = (company.scrapedData?.mainContent || '').toLowerCase();
  const companyName = (company.name || '').toLowerCase();
  
  // Check for specific industries first
  if (desc.includes('beverage') || desc.includes('drink') || desc.includes('cola') || desc.includes('soda') ||
      content.includes('beverage') || content.includes('refreshment') || companyName.includes('coca') || companyName.includes('pepsi')) {
    return 'beverage brand';
  } else if (desc.includes('restaurant') || desc.includes('food') || desc.includes('dining') ||
      content.includes('menu') || content.includes('restaurant')) {
    return 'restaurant';
  } else if (desc.includes('retail') || desc.includes('store') || desc.includes('shopping') ||
      content.includes('retail') || content.includes('shopping')) {
    return 'retailer';
  } else if (desc.includes('bank') || desc.includes('financial') || desc.includes('finance') ||
      content.includes('banking') || content.includes('financial services')) {
    return 'financial service';
  } else if (desc.includes('scraping') || desc.includes('crawl') || desc.includes('extract') ||
      content.includes('web scraping') || content.includes('data extraction')) {
    return 'web scraper';
  } else if (desc.includes('ai') || desc.includes('artificial intelligence') || desc.includes('llm') ||
      content.includes('machine learning') || content.includes('ai-powered')) {
    return 'AI tool';
  } else if (desc.includes('hosting') || desc.includes('deploy') || desc.includes('cloud') ||
      content.includes('deployment') || content.includes('infrastructure')) {
    return 'hosting platform';
  } else if (desc.includes('e-commerce') || desc.includes('online store') || desc.includes('marketplace')) {
    return 'e-commerce platform';
  } else if (desc.includes('software') || desc.includes('saas') || desc.includes('platform')) {
    return 'software';
  }
  // More generic default
  return 'brand';
}

export function getIndustryCompetitors(industry: string): { name: string; url?: string }[] {
  // Default competitors based on industry with URLs
  const industryDefaults: { [key: string]: { name: string; url?: string }[] } = {
    'web scraping': [
      { name: 'Apify', url: 'apify.com' },
      { name: 'Scrapy', url: 'scrapy.org' },
      { name: 'Octoparse', url: 'octoparse.com' },
      { name: 'ParseHub', url: 'parsehub.com' },
      { name: 'Diffbot', url: 'diffbot.com' },
      { name: 'Import.io', url: 'import.io' },
      { name: 'Bright Data', url: 'brightdata.com' },
      { name: 'Zyte', url: 'zyte.com' }
    ],
    'AI': [
      { name: 'OpenAI', url: 'openai.com' },
      { name: 'Anthropic', url: 'anthropic.com' },
      { name: 'Google AI', url: 'ai.google' },
      { name: 'Microsoft Azure', url: 'azure.microsoft.com' },
      { name: 'IBM Watson', url: 'ibm.com/watson' },
      { name: 'Amazon AWS', url: 'aws.amazon.com' }
    ],
    'SaaS': [
      { name: 'Salesforce', url: 'salesforce.com' },
      { name: 'HubSpot', url: 'hubspot.com' },
      { name: 'Zendesk', url: 'zendesk.com' },
      { name: 'Slack', url: 'slack.com' },
      { name: 'Monday.com', url: 'monday.com' },
      { name: 'Asana', url: 'asana.com' }
    ],
    'E-commerce': [
      { name: 'Shopify', url: 'shopify.com' },
      { name: 'WooCommerce', url: 'woocommerce.com' },
      { name: 'BigCommerce', url: 'bigcommerce.com' },
      { name: 'Magento', url: 'magento.com' },
      { name: 'Squarespace', url: 'squarespace.com' },
      { name: 'Wix', url: 'wix.com' }
    ],
    'Cloud': [
      { name: 'AWS', url: 'aws.amazon.com' },
      { name: 'Google Cloud', url: 'cloud.google.com' },
      { name: 'Microsoft Azure', url: 'azure.microsoft.com' },
      { name: 'DigitalOcean', url: 'digitalocean.com' },
      { name: 'Linode', url: 'linode.com' },
      { name: 'Vultr', url: 'vultr.com' }
    ]
  };
  
  const lowerIndustry = industry.toLowerCase();
  
  // Check for partial matches
  for (const [key, competitors] of Object.entries(industryDefaults)) {
    if (lowerIndustry.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerIndustry)) {
      return competitors;
    }
  }
  
  // Generic default competitors
  return [
    { name: 'Competitor 1' },
    { name: 'Competitor 2' },
    { name: 'Competitor 3' },
    { name: 'Competitor 4' },
    { name: 'Competitor 5' }
  ];
}
import ogs from 'open-graph-scraper';
import { OgMetadata } from './types';
import { isValidHttpUrl } from './url';
import dns from 'dns/promises';
import { log } from './logger';

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

async function validateUrlNotPrivate(urlString: string): Promise<{ safe: boolean; error?: string }> {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname;
    
    // Check if hostname is already an IP
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
      if (isPrivateIp(hostname)) {
        return { safe: false, error: 'URL resolves to a private/internal IP range.' };
      }
    }
    
    // Resolve hostname to IP
    try {
      const addresses = await dns.resolve4(hostname);
      for (const addr of addresses) {
        if (isPrivateIp(addr)) {
          return { safe: false, error: 'URL resolves to a private/internal IP range.' };
        }
      }
    } catch {
      // DNS resolution failed - try IPv6
      try {
        const addresses = await dns.resolve6(hostname);
        for (const addr of addresses) {
          if (isPrivateIp(addr)) {
            return { safe: false, error: 'URL resolves to a private/internal IP range.' };
          }
        }
      } catch {
        // If DNS resolution fails entirely, let the request try and fail naturally
      }
    }
    
    return { safe: true };
  } catch {
    return { safe: false, error: 'Invalid URL.' };
  }
}

function sanitizeOgField(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value)
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .trim();
  return str.length > 0 ? str.slice(0, maxLength) : null;
}

export async function scrapeOgMetadata(url: string): Promise<OgMetadata> {
  const nullResult: OgMetadata = {
    url,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    ogSiteName: null,
  };

  if (!isValidHttpUrl(url)) {
    return nullResult;
  }

  // SSRF check
  const ssrfCheck = await validateUrlNotPrivate(url);
  if (!ssrfCheck.safe) {
    log({ level: 'warn', message: `SSRF blocked: ${url}`, service: 'og-scraper', data: { error: ssrfCheck.error } });
    return nullResult;
  }

  try {
    const { result } = await ogs({
      url,
      timeout: 5,
    });

    const ogImage = Array.isArray(result.ogImage) ? result.ogImage[0]?.url ?? null : null;

    return {
      url,
      ogTitle: sanitizeOgField(result.ogTitle, 200),
      ogDescription: sanitizeOgField(result.ogDescription, 500),
      ogImage: ogImage && isValidHttpUrl(ogImage) ? ogImage : null,
      ogSiteName: sanitizeOgField(result.ogSiteName, 100),
    };
  } catch (error) {
    log({
      level: 'warn',
      message: `OG scrape failed for ${url}`,
      service: 'og-scraper',
      data: { error: String(error) },
    });
    return nullResult;
  }
}

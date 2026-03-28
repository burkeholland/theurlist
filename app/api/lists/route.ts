import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth';
import {
  validateSlugFormat,
  generateSlug,
  generateListId,
  generateLinkId,
} from '@/lib/slug';
import { normalizeUrl, isValidHttpUrl } from '@/lib/url';
import { reserveSlug, createList } from '@/lib/rtdb';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';
import { log } from '@/lib/logger';

const LinkSchema = z.object({
  url: z.string().min(1),
  position: z.number().int().min(0),
  ogTitle: z.string().nullable().default(null),
  ogDescription: z.string().nullable().default(null),
  ogImage: z.string().nullable().default(null),
  ogSiteName: z.string().nullable().default(null),
});

const PublishSchema = z.object({
  slug: z.string().optional().default(''),
  description: z.string().optional().default(''),
  links: z
    .array(LinkSchema)
    .min(1, 'List must contain at least one link')
    .max(500, 'List exceeds the maximum of 500 links'),
});

function sanitizeString(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.replace(/<[^>]*>/g, '').trim().slice(0, maxLength) || null;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const authResult = await verifyAuth(request);

  // Rate limiting
  const rateConfig = authResult.authenticated
    ? RATE_LIMITS.publishAuthenticated
    : RATE_LIMITS.publishAnonymous;
  const rateCheck = await checkRateLimit(
    authResult.authenticated ? authResult.uid! : ip,
    rateConfig,
  );
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many publish requests. Try again later.',
          retryAfter: rateCheck.retryAfter,
        },
      },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    let code = 'INVALID_REQUEST';
    const message = firstError?.message || 'Invalid request body.';

    if (firstError?.path?.includes('links')) {
      if (firstError.message.includes('at least')) {
        code = 'NO_LINKS';
      } else if (firstError.message.includes('maximum')) {
        code = 'TOO_MANY_LINKS';
      }
    }

    return NextResponse.json({ error: { code, message } }, { status: 400 });
  }

  const { description, links } = parsed.data;
  let { slug } = parsed.data;

  // Validate description
  if (description.length > 280) {
    return NextResponse.json(
      {
        error: {
          code: 'DESCRIPTION_TOO_LONG',
          message: 'Description exceeds 280 characters.',
        },
      },
      { status: 400 },
    );
  }

  // Validate slug
  if (slug) {
    const slugValidation = validateSlugFormat(slug);
    if (!slugValidation.valid) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_SLUG_FORMAT',
            message: slugValidation.error || 'Invalid slug format.',
          },
        },
        { status: 400 },
      );
    }
  } else {
    slug = generateSlug();
  }

  // Validate all URLs
  for (const link of links) {
    const urlResult = normalizeUrl(link.url);
    if (!urlResult.valid) {
      return NextResponse.json(
        { error: { code: 'INVALID_URL', message: `Invalid URL: ${link.url}` } },
        { status: 400 },
      );
    }
    link.url = urlResult.url;
  }

  // Reserve slug atomically
  const listId = generateListId();
  let reserved = await reserveSlug(slug, listId);

  if (!reserved) {
    // If auto-generated slug collided, retry once
    if (!parsed.data.slug) {
      slug = generateSlug();
      reserved = await reserveSlug(slug, listId);
    }
    if (!reserved) {
      return NextResponse.json(
        {
          error: {
            code: 'SLUG_TAKEN',
            message: `The vanity URL '${slug}' is already in use. Please choose another.`,
          },
        },
        { status: 409 },
      );
    }
  }

  // Sanitize OG metadata and prepare links
  const sanitizedLinks = links.map((link) => ({
    id: generateLinkId(),
    url: link.url,
    position: link.position,
    ogTitle: sanitizeString(link.ogTitle, 200),
    ogDescription: sanitizeString(link.ogDescription, 500),
    ogImage: link.ogImage && isValidHttpUrl(link.ogImage) ? link.ogImage : null,
    ogSiteName: sanitizeString(link.ogSiteName, 100),
  }));

  // Write to database
  await createList({
    listId,
    slug,
    description: description.slice(0, 280),
    ownerId: authResult.uid,
    links: sanitizedLinks,
  });

  log({
    level: 'info',
    message: 'List published',
    service: 'api-lists',
    data: {
      listId,
      slug,
      linkCount: links.length,
      anonymous: !authResult.authenticated,
    },
  });

  return NextResponse.json(
    { listId, slug, publicUrl: `/${slug}`, createdAt: Date.now() },
    { status: 201 },
  );
}

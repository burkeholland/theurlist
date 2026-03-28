import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth, requireAuth, AuthError } from '@/lib/auth';
import { getList, getListWithLinks, updateList, deleteList } from '@/lib/rtdb';
import { normalizeUrl, isValidHttpUrl } from '@/lib/url';
import { generateLinkId } from '@/lib/slug';
import { log } from '@/lib/logger';

const UpdateLinkSchema = z.object({
  id: z.string().optional(),
  url: z.string().min(1),
  position: z.number().int().min(0),
  ogTitle: z.string().nullable().default(null),
  ogDescription: z.string().nullable().default(null),
  ogImage: z.string().nullable().default(null),
  ogSiteName: z.string().nullable().default(null),
});

const UpdateSchema = z.object({
  description: z.string().optional(),
  updatedAt: z.number(),
  links: z.array(UpdateLinkSchema).max(500).optional(),
});

function sanitizeString(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.replace(/<[^>]*>/g, '').trim().slice(0, maxLength) || null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;
  const listWithLinks = await getListWithLinks(listId);

  if (!listWithLinks) {
    return NextResponse.json(
      { error: { code: 'LIST_NOT_FOUND', message: 'No list exists with this ID.' } },
      { status: 404 },
    );
  }

  return NextResponse.json(listWithLinks);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;

  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    const list = await getList(listId);
    if (!list) {
      return NextResponse.json(
        { error: { code: 'LIST_NOT_FOUND', message: 'List does not exist.' } },
        { status: 404 },
      );
    }

    if (list.ownerId !== authResult.uid) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You are not the owner of this list.' } },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      const hasUpdatedAt = body && typeof body === 'object' && 'updatedAt' in body;
      if (!hasUpdatedAt) {
        return NextResponse.json(
          {
            error: {
              code: 'MISSING_UPDATED_AT',
              message: 'updatedAt field is required for optimistic concurrency.',
            },
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: parsed.error.issues[0]?.message || 'Invalid request.',
          },
        },
        { status: 400 },
      );
    }

    const { description, updatedAt, links } = parsed.data;

    // Optimistic concurrency check
    if (list.updatedAt !== updatedAt) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'List was modified since your last fetch. Re-fetch and retry.',
          },
        },
        { status: 409 },
      );
    }

    // Validate description
    if (description !== undefined && description.length > 280) {
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

    // Validate and sanitize links if provided
    let sanitizedLinks:
      | {
          id: string;
          url: string;
          position: number;
          ogTitle: string | null;
          ogDescription: string | null;
          ogImage: string | null;
          ogSiteName: string | null;
        }[]
      | undefined;

    if (links) {
      if (links.length === 0) {
        return NextResponse.json(
          { error: { code: 'NO_LINKS', message: 'List must contain at least one link.' } },
          { status: 400 },
        );
      }

      sanitizedLinks = [];
      for (const link of links) {
        const urlResult = normalizeUrl(link.url);
        if (!urlResult.valid) {
          return NextResponse.json(
            { error: { code: 'INVALID_URL', message: `Invalid URL: ${link.url}` } },
            { status: 400 },
          );
        }
        sanitizedLinks.push({
          id: link.id || generateLinkId(),
          url: urlResult.url,
          position: link.position,
          ogTitle: sanitizeString(link.ogTitle, 200),
          ogDescription: sanitizeString(link.ogDescription, 500),
          ogImage: link.ogImage && isValidHttpUrl(link.ogImage) ? link.ogImage : null,
          ogSiteName: sanitizeString(link.ogSiteName, 100),
        });
      }
    }

    const newUpdatedAt = await updateList({
      listId,
      description: description?.slice(0, 280),
      links: sanitizedLinks,
    });

    log({
      level: 'info',
      message: 'List updated',
      service: 'api-lists',
      data: {
        listId,
        hasDescriptionChange: description !== undefined,
        hasLinksChange: links !== undefined,
      },
    });

    return NextResponse.json({ listId, updatedAt: newUpdatedAt });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 401 },
      );
    }
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;

  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    const list = await getList(listId);
    if (!list) {
      return NextResponse.json(
        { error: { code: 'LIST_NOT_FOUND', message: 'List does not exist.' } },
        { status: 404 },
      );
    }

    if (list.ownerId !== authResult.uid) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You are not the owner of this list.' } },
        { status: 403 },
      );
    }

    await deleteList({ listId, slug: list.slug, ownerId: authResult.uid });

    log({
      level: 'info',
      message: 'List deleted',
      service: 'api-lists',
      data: { listId, slug: list.slug },
    });

    return NextResponse.json({ deleted: true, listId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 401 },
      );
    }
    throw error;
  }
}

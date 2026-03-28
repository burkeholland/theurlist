import { adminDb } from './firebase-admin';
import { ListRecord, LinkRecord, LinkWithId, ListWithLinks } from './types';
import { encodeSlugForKey } from './slug';
import { ServerValue } from 'firebase-admin/database';

// Read a list by listId
export async function getList(listId: string): Promise<ListRecord | null> {
  const snapshot = await adminDb.ref(`lists/${listId}`).once('value');
  return snapshot.exists() ? snapshot.val() as ListRecord : null;
}

// Read links for a list, sorted by position
export async function getLinks(listId: string): Promise<LinkWithId[]> {
  const snapshot = await adminDb.ref(`links/${listId}`).once('value');
  if (!snapshot.exists()) return [];
  
  const linksObj = snapshot.val() as Record<string, LinkRecord>;
  return Object.entries(linksObj)
    .map(([id, link]) => ({ id, ...link }))
    .sort((a, b) => a.position - b.position);
}

// Read a full list with links
export async function getListWithLinks(listId: string): Promise<ListWithLinks | null> {
  const list = await getList(listId);
  if (!list) return null;
  
  const links = await getLinks(listId);
  return { listId, ...list, links };
}

// Resolve slug to listId
export async function resolveSlug(slug: string): Promise<string | null> {
  const key = encodeSlugForKey(slug);
  const snapshot = await adminDb.ref(`slugs/${key}`).once('value');
  return snapshot.exists() ? snapshot.val() as string : null;
}

// Check if a slug is available
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const listId = await resolveSlug(slug);
  return listId === null;
}

// Reserve a slug atomically (returns true if successful, false if taken)
export async function reserveSlug(slug: string, listId: string): Promise<boolean> {
  const key = encodeSlugForKey(slug);
  const ref = adminDb.ref(`slugs/${key}`);
  
  const result = await ref.transaction((currentValue: string | null) => {
    if (currentValue !== null) {
      return; // Abort — slug already taken
    }
    return listId;
  });
  
  return result.committed;
}

// Publish a new list (atomic multi-path update)
export async function createList(params: {
  listId: string;
  slug: string;
  description: string;
  ownerId: string | null;
  links: { id: string; url: string; position: number; ogTitle: string | null; ogDescription: string | null; ogImage: string | null; ogSiteName: string | null }[];
}): Promise<void> {
  const { listId, slug, description, ownerId, links } = params;
  const encodedSlug = encodeSlugForKey(slug);
  
  const updates: Record<string, unknown> = {};
  
  // List record
  updates[`lists/${listId}`] = {
    slug,
    description,
    ownerId,
    createdAt: ServerValue.TIMESTAMP,
    updatedAt: ServerValue.TIMESTAMP,
  };
  
  // Slug index
  updates[`slugs/${encodedSlug}`] = listId;
  
  // Links
  for (const link of links) {
    updates[`links/${listId}/${link.id}`] = {
      url: link.url,
      position: link.position,
      ogTitle: link.ogTitle,
      ogDescription: link.ogDescription,
      ogImage: link.ogImage,
      ogSiteName: link.ogSiteName,
      createdAt: ServerValue.TIMESTAMP,
    };
  }
  
  // User-list index
  if (ownerId) {
    updates[`userLists/${ownerId}/${listId}`] = true;
  }
  
  await adminDb.ref().update(updates);
}

// Update a list
export async function updateList(params: {
  listId: string;
  description?: string;
  links?: { id: string; url: string; position: number; ogTitle: string | null; ogDescription: string | null; ogImage: string | null; ogSiteName: string | null }[];
}): Promise<number> {
  const { listId, description, links } = params;
  const updates: Record<string, unknown> = {};
  
  // Always update timestamp
  updates[`lists/${listId}/updatedAt`] = ServerValue.TIMESTAMP;
  
  if (description !== undefined) {
    updates[`lists/${listId}/description`] = description;
  }
  
  if (links !== undefined) {
    // Replace all links — first delete existing
    updates[`links/${listId}`] = null;
    
    // Then write new links
    for (const link of links) {
      updates[`links/${listId}/${link.id}`] = {
        url: link.url,
        position: link.position,
        ogTitle: link.ogTitle,
        ogDescription: link.ogDescription,
        ogImage: link.ogImage,
        ogSiteName: link.ogSiteName,
        createdAt: ServerValue.TIMESTAMP,
      };
    }
  }
  
  await adminDb.ref().update(updates);
  
  // Read back the updated timestamp
  const snapshot = await adminDb.ref(`lists/${listId}/updatedAt`).once('value');
  return snapshot.val() as number;
}

// Delete a list and all related data
export async function deleteList(params: {
  listId: string;
  slug: string;
  ownerId: string;
}): Promise<void> {
  const { listId, slug, ownerId } = params;
  const encodedSlug = encodeSlugForKey(slug);
  
  const updates: Record<string, null> = {};
  updates[`lists/${listId}`] = null;
  updates[`links/${listId}`] = null;
  updates[`slugs/${encodedSlug}`] = null;
  updates[`userLists/${ownerId}/${listId}`] = null;
  
  await adminDb.ref().update(updates);
}

// Get all list IDs for a user
export async function getUserListIds(uid: string): Promise<string[]> {
  const snapshot = await adminDb.ref(`userLists/${uid}`).once('value');
  if (!snapshot.exists()) return [];
  return Object.keys(snapshot.val());
}

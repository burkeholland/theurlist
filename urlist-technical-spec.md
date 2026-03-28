# Technical Specification: The Urlist

> **Generated: 2026-03-27**
> **Status:** Final Draft
> **Source PRD:** `urlist-prd.md`

---

## 1. Executive Summary

The Urlist is a link-sharing web application that lets users curate collections of URLs into named, shareable lists. Users paste links, the system scrapes OpenGraph metadata for rich previews, and they publish under a custom vanity URL or auto-generated slug. Lists are publicly viewable at the root namespace (e.g., `/burke/tools`) while all application pages live under `/app/*`.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Full-stack Next.js on Firebase** | SSR for public pages (SEO, social sharing), serverless API routes via Cloud Functions — zero server management, pay-per-use scaling |
| **Firebase Realtime Database** | Real-time sync for instant public page updates after edits; simpler data model fits a document-style key-value structure better than relational |
| **Firebase Authentication (Google + GitHub)** | Managed OAuth removes the burden of token management, session handling, and provider maintenance |
| **External thumbnail URLs (hotlinked)** | Eliminates storage costs and image processing pipeline; broken images are handled with a placeholder fallback |
| **localStorage draft persistence** | Simpler than server-side drafts; works for both anonymous and authenticated users without additional infrastructure |

### Major Components

| Component | Responsibility |
|-----------|---------------|
| **Next.js Frontend** | SSR public list pages, CSR app pages (compose, my-links), draft management |
| **API Route Handlers (Cloud Functions)** | List CRUD, vanity URL validation, OG scraping, publish workflow |
| **Firebase RTDB** | Persistent storage for lists, links, slug-to-list index |
| **Firebase Auth** | Identity management, OAuth flows, ID token verification |
| **Firebase Hosting** | CDN for static assets, routes traffic to Cloud Functions for SSR/API |

---

## 2. Scope & Constraints

### 2.1 In-Scope Features (v1)

| # | Feature | PRD Section | Spec Section |
|---|---------|-------------|--------------|
| F1 | Homepage with hero URL input and sign-in | §1 | §5.1, §7.5 |
| F2 | List Compose page (vanity URL, description, add links, reorder, publish) | §2 | §5.2, §5.3, §7.5 |
| F3 | OpenGraph metadata scraping at link-add time | §2 (Link Cards) | §5.4, §7.6 |
| F4 | Drag-and-drop reorder (vertical axis only) | §2 (Link Cards) | §7.5 |
| F5 | Public List page (SSR, read-only) | §3 | §7.5 |
| F6 | Firebase Authentication (Google + GitHub OAuth) | §4 | §5.5, §7.4 |
| F7 | Anonymous publishing (publish-once, no edit) | §5 | §5.3, §7.6 |
| F8 | Authenticated publishing (editable post-publish) | §6 | §5.3, §7.6 |
| F9 | My Links dashboard (list management, edit, delete) | §7 | §5.2, §7.5 |
| F10 | Global navigation header | §8 | §7.5 |
| F11 | Vanity URL real-time validation | §2 (Vanity URL) | §5.2, §7.6 |
| F12 | localStorage draft persistence | Validated Decision | §7.6 |
| F13 | Auth transition (anonymous → signed-in during compose) | Validated Decision | §7.6 |

### 2.2 Out of Scope (v1)

- Link click analytics
- List privacy settings (private/unlisted)
- Collaborative editing
- Live link preview re-fetching (OG scraped once at add-time only)
- Anonymous list claiming/transfer after publish
- GDPR/CCPA compliance workflows
- Email/password authentication
- Server-side draft persistence

### 2.3 Known Limitations

- **Hotlinked thumbnails** may break if the source site removes the image or blocks hotlinking. Mitigated with placeholder fallback.
- **OG metadata is point-in-time** — if a site updates its OG tags after a link is added, the stored metadata will be stale.
- **Vanity URL race condition** — real-time validation can pass but another user may claim the slug before publish. Mitigated by database-level uniqueness enforcement and a clear error message.
- **localStorage drafts are device-local** — drafts do not sync across devices or browsers.

---

## 3. System Architecture

### 3.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENTS (Browser)                          │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Homepage    │  │  /app/*      │  │  Public List Pages        │  │
│  │  (CSR)       │  │  (CSR)       │  │  (SSR)                    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬──────────────┘  │
│         │                 │                        │                 │
│         │     localStorage (draft persistence)     │                 │
│         │                 │                        │                 │
└─────────┼─────────────────┼────────────────────────┼─────────────────┘
          │                 │                        │
          ▼                 ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Firebase Hosting (CDN)                         │
│                                                                     │
│  Static assets served from CDN edge locations                       │
│  Dynamic requests proxied to Cloud Functions                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                Cloud Functions for Firebase                         │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Next.js Application                        │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │  │
│  │  │  SSR Pages   │  │  API Routes  │  │  React App (CSR)    │  │  │
│  │  │  /[...slug]  │  │  /api/*      │  │  /app/*             │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └─────────────────────┘  │  │
│  │         │                 │                                    │  │
│  └─────────┼─────────────────┼────────────────────────────────────┘  │
│            │                 │                                       │
└────────────┼─────────────────┼───────────────────────────────────────┘
             │                 │
             ▼                 ▼
┌────────────────────────┐  ┌──────────────────────┐
│  Firebase RTDB         │  │  Firebase Auth       │
│                        │  │                      │
│  • lists/{listId}      │  │  • Google OAuth      │
│  • links/{listId}      │  │  • GitHub OAuth      │
│  • slugs/{slug}        │  │  • ID Token verify   │
│  • userLists/{uid}     │  │                      │
└────────────────────────┘  └──────────────────────┘
             ▲
             │
     ┌───────┴────────┐
     │  OG Scraper     │
     │  (within API    │
     │   route handler)│
     └────────────────┘
          │
          ▼
   External Websites
   (fetch OG metadata)
```

### 3.2 Component Responsibilities

| Component | Responsibility | Boundary |
|-----------|---------------|----------|
| **Firebase Hosting** | Serves static assets from CDN; rewrites dynamic paths to Cloud Functions | Entry point for all HTTP traffic |
| **Cloud Functions (Next.js)** | Runs the full Next.js app — SSR for public pages, API route handlers for business logic, CSR bundle serving for `/app/*` | All server-side logic lives here |
| **API Route Handlers** | List CRUD, slug validation, OG scraping, publish, auth verification | Only interface between frontend and database |
| **Firebase RTDB** | Persistent storage, real-time subscriptions, uniqueness constraints via security rules | Source of truth for all application data |
| **Firebase Auth** | User identity, OAuth flows, ID token generation/verification | Issues and validates tokens; no business logic |
| **Client-side (React)** | Compose UI, drag-and-drop, draft persistence, real-time validation | All interactive UX; communicates only via API routes |

### 3.3 Data Flow: Publish a List

```
1. User composes list in browser (localStorage draft)
2. User clicks Publish
3. Client POST /api/lists
   → Firebase ID token in Authorization header (if authenticated)
   → Body: { slug?, description, links[] }
4. API route handler:
   a. Verify auth token (if present)
   b. Generate nanoid slug if none provided
   c. Validate slug format + uniqueness (transactional write to slugs/{slug})
   d. Write list record to lists/{listId}
   e. Write link records to links/{listId}/{linkId}
   f. Write to userLists/{uid}/{listId} (if authenticated)
   g. Return { listId, slug, publicUrl }
5. Client redirects to /{slug} (public page)
6. Public page SSR reads from RTDB, renders HTML with OG meta tags
```

---

## 4. Data Model

### 4.1 Entity-Relationship Overview

```
┌──────────┐       1:N       ┌──────────┐
│   User   │────────────────▶│   List   │
│  (Auth)  │                 │          │
└──────────┘                 └────┬─────┘
                                  │ 1:N
                                  ▼
                             ┌──────────┐
                             │   Link   │
                             │          │
                             └──────────┘

┌──────────┐       1:1       ┌──────────┐
│   Slug   │────────────────▶│   List   │
│  (Index) │                 │          │
└──────────┘                 └──────────┘
```

### 4.2 Firebase RTDB JSON Structure

```jsonc
{
  // ──────────────────────────────────
  // LIST RECORDS
  // ──────────────────────────────────
  "lists": {
    "{listId}": {
      "slug": "burke/tools",          // string, lowercase, unique
      "description": "My fav tools",   // string, max 280 chars
      "ownerId": "firebase-uid-123",   // string | null (null = anonymous)
      "createdAt": 1711526400000,      // number, Unix epoch ms (server timestamp)
      "updatedAt": 1711526400000       // number, Unix epoch ms (server timestamp)
    }
  },

  // ──────────────────────────────────
  // LINK RECORDS (nested under listId)
  // ──────────────────────────────────
  "links": {
    "{listId}": {
      "{linkId}": {
        "url": "https://github.com",         // string, normalized URL
        "position": 0,                        // integer, 0-indexed sort order
        "ogTitle": "GitHub",                  // string | null
        "ogDescription": "Where the world…",  // string | null
        "ogImage": "https://github.com/og.png", // string (external URL) | null
        "ogSiteName": "GitHub",               // string | null
        "createdAt": 1711526400000            // number, Unix epoch ms
      }
    }
  },

  // ──────────────────────────────────
  // SLUG → LIST INDEX (for uniqueness + lookup)
  // ──────────────────────────────────
  "slugs": {
    // Forward slashes encoded as ~ in RTDB keys (see §4.4)
    "burke~tools": "{listId}",
    "a8f3k2x9": "{listId}"
  },

  // ──────────────────────────────────
  // USER → LIST INDEX (for My Links page)
  // ──────────────────────────────────
  "userLists": {
    "{uid}": {
      "{listId}": true
    }
  }
}
```

### 4.3 Data Validation Rules

| Field | Type | Constraints |
|-------|------|-------------|
| `slug` | string | 1–200 chars; lowercase; allowed chars: `a-z`, `0-9`, `-`, `_`, `/`; must not start/end with `/`; no consecutive slashes; unique across all lists |
| `description` | string | 0–280 characters; plain text only |
| `ownerId` | string \| null | Must match a valid Firebase Auth UID when present |
| `url` | string | Must be a valid `http://` or `https://` URL after normalization |
| `position` | integer | ≥ 0; unique within a list (enforced by client on save) |
| `ogTitle` | string \| null | Max 500 chars (truncate on scrape) |
| `ogDescription` | string \| null | Max 1000 chars (truncate on scrape) |
| `ogImage` | string \| null | Must be a valid `http://` or `https://` URL |
| `ogSiteName` | string \| null | Max 200 chars |

### 4.4 RTDB Key Encoding for Forward Slashes

Firebase RTDB keys cannot contain `.`, `$`, `#`, `[`, `]`, or `/`. Since vanity URL slugs support `/` for hierarchical paths, we encode `/` as `~` (tilde) in RTDB keys only. The tilde character is disallowed in user-facing slugs to prevent collision.

```
User enters:    burke/tools
Stored slug:    burke/tools     (in the list record's slug field — this is a value, not a key)
RTDB key:       burke~tools     (in the slugs/ index — this is a key)
Public URL:     /burke/tools
```

**Why tilde?** It's a single character, visually distinct, and not typically used in URL slugs. Alternative encodings (e.g., URL-encoding `%2F`) create longer, less readable keys and may themselves conflict with RTDB key restrictions.

### 4.5 Firebase RTDB Security Rules

All data mutations go through Cloud Functions using the Firebase Admin SDK (which bypasses security rules). Client-side access is read-only. This ensures all validation, rate limiting, sanitization, and authorization logic runs server-side and cannot be bypassed.

```json
{
  "rules": {
    "lists": {
      "$listId": {
        ".read": true,
        ".write": false
      }
    },
    "links": {
      "$listId": {
        ".read": true,
        ".write": false
      }
    },
    "slugs": {
      "$slug": {
        ".read": true,
        ".write": false
      }
    },
    "userLists": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": false
      }
    }
  }
}
```

**Key security invariants:**
- **All writes are admin-only.** Cloud Functions use the Admin SDK, which bypasses these rules entirely. This prevents clients from creating data that skips API validation, rate limiting, or OG metadata sanitization.
- **Reads are public** for lists, links, and slugs (needed for SSR and client-side display). `userLists` is readable only by the owning user.
- **Slug uniqueness** is enforced in Cloud Functions using a transactional write: the function reads `slugs/{encodedSlug}`, and if the key exists, returns `409 SLUG_TAKEN`. Since all writes go through a single code path, this is race-free.
- **Authorization** is enforced in Cloud Functions: update/delete handlers verify `lists/{listId}.ownerId === uid` before proceeding.

---

## 5. API / Interface Specifications

### 5.1 API Overview

All API endpoints are Next.js App Router route handlers deployed as Cloud Functions. Base path: `/api`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/lists` | Optional | Publish a new list |
| `GET` | `/api/lists/:listId` | None | Get list with links |
| `PATCH` | `/api/lists/:listId` | Required | Update list (description, links) |
| `DELETE` | `/api/lists/:listId` | Required | Hard-delete a list |
| `GET` | `/api/slugs/:slug` | None | Check slug availability |
| `POST` | `/api/og` | None | Scrape OG metadata for a URL |
| `GET` | `/api/health` | None | Health check |

### 5.2 Endpoint: Check Slug Availability

Used for real-time vanity URL validation during compose.

```
GET /api/slugs/:slug
```

**Path parameter:** `slug` — URL-encoded slug (e.g., `burke%2Ftools` for `burke/tools`).

**Response (available):**
```json
{
  "slug": "burke/tools",
  "available": true
}
```

**Response (taken):**
```json
{
  "slug": "burke/tools",
  "available": false
}
```

**Response (invalid format):**
```json
{
  "error": {
    "code": "INVALID_SLUG_FORMAT",
    "message": "Slug must contain only lowercase letters, numbers, hyphens, underscores, and forward slashes."
  }
}
```

| Status | Condition |
|--------|-----------|
| `200` | Slug is available or taken (check `available` field) |
| `400` | Slug format is invalid |
| `429` | Rate limit exceeded |

### 5.3 Endpoint: Publish a List

```
POST /api/lists
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <firebase-id-token>   (optional — omit for anonymous publish)
```

**Request body:**
```json
{
  "slug": "burke/tools",
  "description": "My favorite developer tools",
  "links": [
    {
      "url": "https://github.com",
      "position": 0,
      "ogTitle": "GitHub",
      "ogDescription": "Where the world builds software",
      "ogImage": "https://github.githubassets.com/images/modules/open_graph/github-octocat.png",
      "ogSiteName": "GitHub"
    },
    {
      "url": "https://code.visualstudio.com",
      "position": 1,
      "ogTitle": "Visual Studio Code",
      "ogDescription": "Code editing. Redefined.",
      "ogImage": "https://code.visualstudio.com/opengraphimg/opengraph-home.png",
      "ogSiteName": "Visual Studio Code"
    }
  ]
}
```

**Fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `slug` | string | No | If omitted or empty, auto-generated (8-char nanoid). Must be unique. |
| `description` | string | No | Max 280 characters. Defaults to `""`. |
| `links` | array | Yes | Must contain ≥ 1 and ≤ 500 links. Each link includes `url`, `position`, and OG fields. |

**OG metadata sanitization:** All client-supplied OG fields are sanitized server-side before storage — HTML tags are stripped, strings are truncated to safe lengths (title: 200 chars, description: 500 chars, siteName: 100 chars), and `ogImage` is validated as a valid `http/https` URL. This prevents stored-XSS attacks from callers who bypass the `/api/og` endpoint.

**Response (201 Created):**
```json
{
  "listId": "Lx9k2mF4",
  "slug": "burke/tools",
  "publicUrl": "/burke/tools",
  "createdAt": 1711526400000
}
```

**Error responses:**

| Status | Code | Message |
|--------|------|---------|
| `400` | `INVALID_SLUG_FORMAT` | Slug contains invalid characters |
| `400` | `DESCRIPTION_TOO_LONG` | Description exceeds 280 characters |
| `400` | `NO_LINKS` | List must contain at least one link |
| `400` | `TOO_MANY_LINKS` | List exceeds the maximum of 500 links |
| `400` | `INVALID_URL` | One or more URLs are not valid http/https URLs |
| `409` | `SLUG_TAKEN` | The vanity URL is already in use — please choose another |
| `429` | `RATE_LIMIT_EXCEEDED` | Too many publish requests. Try again later. |

**Error response shape:**
```json
{
  "error": {
    "code": "SLUG_TAKEN",
    "message": "The vanity URL 'burke/tools' is already in use. Please choose another."
  }
}
```

**Business logic:**
1. If `Authorization` header present, verify Firebase ID token → extract `uid`.
2. Validate slug format (or generate nanoid if blank).
3. Validate all link URLs.
4. Validate description length.
5. Attempt atomic write to `slugs/{encodedSlug}` — if key exists, return `409 SLUG_TAKEN`.
6. Generate `listId` (nanoid, 12 chars).
7. Write `lists/{listId}` with server timestamp.
8. Write all links to `links/{listId}/{linkId}`.
9. If authenticated, write `userLists/{uid}/{listId}: true`.
10. Return success response.

### 5.4 Endpoint: Scrape OG Metadata

```
POST /api/og
```

**Request body:**
```json
{
  "url": "https://github.com"
}
```

**Response (200 OK):**
```json
{
  "url": "https://github.com",
  "ogTitle": "GitHub: Let's build from here",
  "ogDescription": "GitHub is where over 100 million developers shape the future of software.",
  "ogImage": "https://github.githubassets.com/images/modules/open_graph/github-octocat.png",
  "ogSiteName": "GitHub"
}
```

**Response (scrape failed — still 200, with nulls):**
```json
{
  "url": "https://example-that-blocks-scraping.com",
  "ogTitle": null,
  "ogDescription": null,
  "ogImage": null,
  "ogSiteName": null
}
```

| Status | Code | Message |
|--------|------|---------|
| `200` | — | Success (even if OG tags not found — returns nulls) |
| `400` | `INVALID_URL` | URL is not a valid http/https URL |
| `400` | `BLOCKED_URL` | URL resolves to a private/internal IP range |
| `429` | `RATE_LIMIT_EXCEEDED` | Too many scrape requests |

**SSRF protections (applied before fetching):**
1. Resolve the URL's hostname to an IP address.
2. Block private/internal ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`.
3. Enforce 5-second timeout on the HTTP request.
4. Follow a maximum of 3 redirects. Re-validate each redirect target against the IP blocklist.
5. Parse only the first 512 KB of the response body (stop reading after that).
6. Extract `og:title`, `og:description`, `og:image`, `og:site_name` from `<meta>` tags.

### 5.5 Endpoint: Update a List

```
PATCH /api/lists/:listId
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <firebase-id-token>   (required)
```

**Request body (all fields optional):**
```json
{
  "description": "Updated description",
  "updatedAt": 1711526400000,
  "links": [
    {
      "id": "existingLinkId",
      "url": "https://github.com",
      "position": 1,
      "ogTitle": "GitHub",
      "ogDescription": "Where the world builds software",
      "ogImage": "https://github.githubassets.com/images/modules/open_graph/github-octocat.png",
      "ogSiteName": "GitHub"
    },
    {
      "url": "https://newsite.com",
      "position": 0,
      "ogTitle": "New Site",
      "ogDescription": null,
      "ogImage": null,
      "ogSiteName": null
    }
  ]
}
```

**Optimistic concurrency:** The `updatedAt` field is required and must match the list's current `updatedAt` value. If it doesn't match (another edit occurred since the client last fetched), the server returns `409 CONFLICT`. The client must re-fetch the list and reconcile before retrying.

**OG metadata sanitization:** All client-supplied OG fields (`ogTitle`, `ogDescription`, `ogImage`, `ogSiteName`) are sanitized server-side before storage — HTML tags are stripped, strings are truncated to safe lengths (title: 200 chars, description: 500 chars, siteName: 100 chars), and `ogImage` is validated as a valid `http/https` URL.

**Semantics:** When `links` is provided, it represents the full desired state — the server replaces all links under `links/{listId}` with the provided array. Links with an `id` field retain their existing ID; links without get a new generated ID.

**Response (200 OK):**
```json
{
  "listId": "Lx9k2mF4",
  "updatedAt": 1711530000000
}
```

| Status | Code | Message |
|--------|------|---------|
| `400` | `DESCRIPTION_TOO_LONG` | Description exceeds 280 characters |
| `400` | `INVALID_URL` | One or more URLs are not valid |
| `400` | `TOO_MANY_LINKS` | List exceeds the maximum of 500 links |
| `400` | `MISSING_UPDATED_AT` | `updatedAt` field is required for optimistic concurrency |
| `401` | `UNAUTHORIZED` | Missing or invalid auth token |
| `403` | `FORBIDDEN` | You are not the owner of this list |
| `404` | `LIST_NOT_FOUND` | List does not exist |
| `409` | `CONFLICT` | List was modified since your last fetch. Re-fetch and retry. |

### 5.6 Endpoint: Delete a List

```
DELETE /api/lists/:listId
```

**Headers:**
```
Authorization: Bearer <firebase-id-token>   (required)
```

**Response (200 OK):**
```json
{
  "deleted": true,
  "listId": "Lx9k2mF4"
}
```

**Business logic (hard delete):**
1. Verify auth token → extract `uid`.
2. Load `lists/{listId}` → verify `ownerId === uid` (else `403`).
3. Read the list's `slug`, encode it for the key.
4. Atomically delete: `lists/{listId}`, `links/{listId}`, `slugs/{encodedSlug}`, `userLists/{uid}/{listId}`.
5. Return success.

| Status | Code | Message |
|--------|------|---------|
| `401` | `UNAUTHORIZED` | Missing or invalid auth token |
| `403` | `FORBIDDEN` | You are not the owner of this list |
| `404` | `LIST_NOT_FOUND` | List does not exist |

### 5.7 Endpoint: Get List (internal use for SSR)

```
GET /api/lists/:listId
```

**Response (200 OK):**
```json
{
  "listId": "Lx9k2mF4",
  "slug": "burke/tools",
  "description": "My favorite developer tools",
  "ownerId": "firebase-uid-123",
  "createdAt": 1711526400000,
  "updatedAt": 1711526400000,
  "links": [
    {
      "id": "link1",
      "url": "https://github.com",
      "position": 0,
      "ogTitle": "GitHub",
      "ogDescription": "Where the world builds software",
      "ogImage": "https://github.githubassets.com/images/modules/open_graph/github-octocat.png",
      "ogSiteName": "GitHub"
    }
  ]
}
```

| Status | Code | Message |
|--------|------|---------|
| `404` | `LIST_NOT_FOUND` | No list exists with this ID |

### 5.8 Endpoint: Health Check

```
GET /api/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": 1711526400000,
  "version": "1.0.0"
}
```

### 5.9 Authentication Model

All API requests that modify data (except anonymous publish) require a Firebase ID token in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**Token verification flow:**
1. Extract the `Bearer` token from the header.
2. Call `admin.auth().verifyIdToken(token)` using the Firebase Admin SDK.
3. On success, extract `uid` from the decoded token.
4. On failure (expired, invalid, malformed), return `401 UNAUTHORIZED`.

**Authorization rules:**
- **Create list:** Auth optional (anonymous users can create).
- **Update list:** Auth required. `ownerId` must match `uid`.
- **Delete list:** Auth required. `ownerId` must match `uid`.
- **Slug check:** No auth required.
- **OG scrape:** No auth required (rate-limited by IP).
- **Read list:** No auth required (public).

### 5.10 Rate Limiting

Rate limiting is applied at the Cloud Functions layer using **Firebase RTDB counters** keyed by client IP address. RTDB counters are used instead of in-memory rate limiting because Cloud Functions instances scale independently and don't share memory.

**IP extraction:** The client IP is read from `req.headers['x-forwarded-for']` (set by Firebase Hosting) or `req.socket.remoteAddress` as fallback. The first IP in the `x-forwarded-for` chain is used.

**Counter structure:** Rate limit counters are stored at `_rateLimits/{endpoint}/{ipHash}/{windowKey}` using a hashed IP. Counters are incremented atomically via RTDB transactions. Expired windows are cleaned up periodically via a scheduled Cloud Function.

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| `POST /api/lists` (anonymous only) | 10 requests | per hour | IP |
| `POST /api/og` | 60 requests | per hour | IP |
| `GET /api/slugs/:slug` | 120 requests | per hour | IP |

Authenticated publish requests are rate-limited at a higher threshold (100/hour per UID) to prevent abuse while not hindering legitimate use.

**Rate limit response (429):**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 3600
  }
}
```

The `Retry-After` HTTP header is also set (in seconds).

---

## 6. Non-Functional Requirements

### 6.1 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Public page SSR (Time to First Byte)** | < 800ms (p95) | Single RTDB read + HTML render |
| **API response (slug check)** | < 200ms (p95) | Single RTDB read |
| **API response (publish)** | < 1500ms (p95) | Multiple RTDB writes in a multi-path update |
| **OG scrape** | < 6s (p95) | 5s timeout on external fetch + parsing overhead |
| **Client-side compose interaction** | < 100ms (p95) | Drag-and-drop, input, local state updates |
| **Lighthouse performance score** (public pages) | ≥ 90 | SSR + minimal client JS |

### 6.2 Scalability

| Dimension | Strategy |
|-----------|----------|
| **Compute** | Cloud Functions auto-scale (serverless); no provisioned instances needed for v1 |
| **Database** | Firebase RTDB scales reads via automatic sharding; for v1, a single RTDB instance is sufficient (supports ~200K simultaneous connections) |
| **Static assets** | Firebase Hosting CDN caches globally |
| **Cold starts** | Minimize Cloud Function cold starts by keeping the function bundle lean (< 10 MB); use `minInstances: 1` in production for the SSR function |

### 6.3 Availability

| Target | Value |
|--------|-------|
| **Uptime** | 99.9% (aligned with Firebase SLA) |
| **Recovery Time Objective (RTO)** | < 5 minutes (Firebase-managed infrastructure) |
| **Recovery Point Objective (RPO)** | 0 (RTDB is replicated in real-time) |

### 6.4 Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Transport encryption** | TLS 1.2+ enforced by Firebase Hosting |
| **Auth tokens** | Firebase ID tokens (signed JWTs, 1-hour expiry, auto-refreshed by client SDK) |
| **SSRF protection** | IP blocklist, timeout, redirect limit on OG scraper (see §5.4) |
| **Input sanitization** | All user inputs validated and sanitized server-side; HTML in OG metadata is stripped |
| **XSS prevention** | React's default escaping; OG metadata rendered as text, never `dangerouslySetInnerHTML` |
| **CSP headers** | `default-src 'self'; img-src *; script-src 'self' 'unsafe-inline'` — `img-src *` is necessary because OG thumbnails are hotlinked from arbitrary domains. A future image proxy would tighten this to specific origins. |
| **CSRF protection** | Not applicable — API is stateless with Bearer token auth; no cookies |
| **URL scheme enforcement** | Only `http://` and `https://` accepted; `javascript:`, `data:`, `file:`, `mailto:` blocked |
| **Data access** | RTDB security rules enforce ownership (see §4.5) |

---

## 7. Implementation Details

### 7.1 Technology Stack

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| **Framework** | Next.js (App Router) | 15.x | Full-stack React framework; SSR for public pages, API routes for backend, excellent DX |
| **Runtime** | Node.js | 20.x LTS | Required by Cloud Functions; current LTS |
| **Language** | TypeScript | 5.x | Type safety across full stack |
| **Hosting** | Firebase Hosting | — | CDN, automatic SSL, seamless Cloud Functions integration |
| **Compute** | Cloud Functions for Firebase (2nd gen) | — | Serverless, auto-scaling, pay-per-use |
| **Database** | Firebase Realtime Database | — | Real-time sync, simple JSON data model, strong security rules |
| **Auth** | Firebase Authentication | — | Managed OAuth, ID tokens, Admin SDK for verification |
| **ID generation** | nanoid | 5.x | URL-safe, compact, collision-resistant IDs |
| **OG parsing** | open-graph-scraper | latest | Battle-tested library for extracting OG metadata |
| **Drag-and-drop** | @dnd-kit/core + @dnd-kit/sortable | latest | Modern, accessible, React-native DnD library; vertical-only constraint built-in |
| **UI styling** | Tailwind CSS | 4.x | Utility-first, rapid prototyping, no runtime cost |

### 7.2 Third-Party Dependencies

| Package | Purpose |
|---------|---------|
| `firebase` | Client SDK (Auth, RTDB) |
| `firebase-admin` | Server SDK (Auth verification, RTDB admin access) |
| `nanoid` | ID generation for lists, links, and auto-slugs |
| `open-graph-scraper` | OG metadata extraction |
| `@dnd-kit/core`, `@dnd-kit/sortable` | Drag-and-drop UI |
| `@dnd-kit/modifiers` | Vertical-axis constraint for drag-and-drop |
| `tailwindcss` | Styling |
| `zod` | Input validation for API request schemas |

**Dev dependencies:**
| Package | Purpose |
|---------|---------|
| `firebase-tools` | Firebase CLI for emulators, deployment |
| `@firebase/rules-unit-testing` | Unit testing RTDB security rules |
| `vitest` | Unit test framework |
| `playwright` | E2E test framework |

### 7.3 Project Structure

```
/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (nav header, auth provider)
│   ├── page.tsx                  # Homepage (/)
│   ├── [...slug]/
│   │   └── page.tsx              # Public list page (SSR) — catches /burke/tools, /a8f3k2x9
│   ├── app/
│   │   ├── layout.tsx            # App layout (authenticated shell)
│   │   ├── compose/
│   │   │   └── page.tsx          # List compose (new list)
│   │   ├── compose/[listId]/
│   │   │   └── page.tsx          # List compose (edit existing)
│   │   └── my-links/
│   │       └── page.tsx          # My Links dashboard
│   └── api/
│       ├── lists/
│       │   └── route.ts          # POST /api/lists
│       ├── lists/[listId]/
│       │   └── route.ts          # GET, PATCH, DELETE /api/lists/:listId
│       ├── slugs/[slug]/
│       │   └── route.ts          # GET /api/slugs/:slug
│       ├── og/
│       │   └── route.ts          # POST /api/og
│       └── health/
│           └── route.ts          # GET /api/health
├── lib/
│   ├── firebase-client.ts        # Firebase client SDK init
│   ├── firebase-admin.ts         # Firebase Admin SDK init
│   ├── auth.ts                   # Token verification helper
│   ├── rtdb.ts                   # RTDB read/write helpers
│   ├── og-scraper.ts             # OG scraping with SSRF protections
│   ├── slug.ts                   # Slug validation, encoding, nanoid generation
│   ├── url.ts                    # URL validation and normalization
│   ├── rate-limiter.ts           # IP-based rate limiting
│   └── types.ts                  # Shared TypeScript types
├── components/
│   ├── nav-header.tsx            # Global navigation
│   ├── link-card.tsx             # Link card component (OG preview)
│   ├── link-card-placeholder.tsx # Fallback card for missing OG data
│   ├── sortable-link-list.tsx    # Drag-and-drop link list
│   ├── slug-input.tsx            # Vanity URL input with real-time validation
│   ├── url-input.tsx             # URL input (homepage + compose)
│   ├── auth-modal.tsx            # Sign-in modal (Google + GitHub)
│   └── publish-button.tsx        # Publish button with disabled state logic
├── hooks/
│   ├── use-draft.ts              # localStorage draft persistence
│   ├── use-auth.ts               # Auth state hook
│   └── use-debounce.ts           # Debounce hook for slug validation
├── database.rules.json           # Firebase RTDB security rules
├── firebase.json                 # Firebase project config
├── next.config.ts                # Next.js configuration
├── tailwind.config.ts            # Tailwind configuration
└── tsconfig.json                 # TypeScript configuration
```

### 7.4 Authentication Flow

**Sign In:**
1. User clicks "Sign In" → auth modal opens.
2. User selects Google or GitHub → `signInWithPopup(auth, provider)`.
3. Firebase client SDK handles the OAuth redirect and returns a `UserCredential`.
4. Client stores the auth state in a React context (`useAuth` hook).
5. Firebase SDK auto-refreshes ID tokens before expiry.

**Auth transition during compose:**
1. Anonymous user starts composing a list (draft saved to localStorage).
2. User clicks "Sign In" while on the compose page.
3. After successful sign-in, the compose page detects the auth state change.
4. The draft remains intact in localStorage — no data loss.
5. When the user publishes, the list is saved with their `uid` as `ownerId`.
6. The list is now editable because it's associated with their account.

**Why this works:** The compose page only reads the auth state at publish time. The draft is purely client-side (localStorage), so it's unaffected by auth changes.

### 7.5 Key UI Pages

#### Homepage (`/`)

- **Server Component** (static or ISR).
- Hero section with app name, tagline, and oversized URL input.
- URL input on submit → navigates to `/app/compose?url={encodedUrl}`.
- Sign-in button in nav header opens the auth modal.

#### Compose Page (`/app/compose` and `/app/compose/[listId]`)

- **Client Component** (interactive).
- Top section: vanity URL input (with debounced validation, **300-500ms debounce** before hitting the API to avoid exhausting the 120/hour rate limit) + publish button.
- Description textarea (280-char limit with character counter).
- URL input for adding links.
- Sortable link card list (@dnd-kit, vertical axis only).
- Each card shows OG preview (title, description, thumbnail, URL) with a delete button.
- Draft auto-saved to localStorage on every change (debounced, 500ms).

**Vanity URL validation logic:**
```typescript
// lib/slug.ts

const SLUG_REGEX = /^[a-z0-9]([a-z0-9\-_\/]*[a-z0-9])?$/;
const CONSECUTIVE_SLASH_REGEX = /\/{2,}/;
const RESERVED_PREFIXES = ['app', 'api', '_next'];
const RESERVED_EXACT = ['favicon.ico', 'robots.txt', 'sitemap.xml'];

export function validateSlugFormat(slug: string): {
  valid: boolean;
  error?: string;
} {
  if (slug.length === 0) return { valid: true }; // empty = auto-generate
  if (slug.length > 200) {
    return { valid: false, error: 'Slug must be 200 characters or fewer.' };
  }

  const lower = slug.toLowerCase();
  if (lower !== slug) {
    return { valid: false, error: 'Slug must be lowercase.' };
  }
  if (!SLUG_REGEX.test(slug)) {
    return {
      valid: false,
      error: 'Slug contains invalid characters.',
    };
  }
  if (CONSECUTIVE_SLASH_REGEX.test(slug)) {
    return {
      valid: false,
      error: 'Slug must not contain consecutive slashes.',
    };
  }
  if (slug.startsWith('/') || slug.endsWith('/')) {
    return {
      valid: false,
      error: 'Slug must not start or end with a slash.',
    };
  }

  const firstSegment = slug.split('/')[0];
  if (RESERVED_PREFIXES.includes(firstSegment)) {
    return { valid: false, error: `"${firstSegment}" is a reserved path.` };
  }
  if (RESERVED_EXACT.includes(slug)) {
    return { valid: false, error: `"${slug}" is a reserved path.` };
  }

  return { valid: true };
}
```

**URL normalization logic:**
```typescript
// lib/url.ts

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const BLOCKED_PROTOCOLS = [
  'javascript:',
  'data:',
  'file:',
  'mailto:',
  'ftp:',
  'blob:',
];
const BARE_DOMAIN_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/;

export function normalizeUrl(input: string): {
  url: string;
  valid: boolean;
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { url: '', valid: false, error: 'URL is required.' };

  // Check for blocked protocols
  for (const proto of BLOCKED_PROTOCOLS) {
    if (trimmed.toLowerCase().startsWith(proto)) {
      return {
        url: '',
        valid: false,
        error: `"${proto}" URLs are not allowed.`,
      };
    }
  }

  // If no protocol, check if it looks like a bare domain and prepend https://
  let urlString = trimmed;
  if (!trimmed.includes('://')) {
    if (BARE_DOMAIN_REGEX.test(trimmed)) {
      urlString = `https://${trimmed}`;
    } else {
      return { url: '', valid: false, error: 'Invalid URL format.' };
    }
  }

  try {
    const parsed = new URL(urlString);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return {
        url: '',
        valid: false,
        error: 'Only http and https URLs are allowed.',
      };
    }
    return { url: parsed.href, valid: true };
  } catch {
    return { url: '', valid: false, error: 'Invalid URL format.' };
  }
}
```

#### Public List Page (`/[...slug]`)

- **Server Component** with SSR (dynamic rendering, no caching).
- `Cache-Control: no-store` — public pages are always rendered fresh from RTDB on every request. This ensures immediate consistency after authenticated edits. RTDB reads are fast (~50ms), so uncached SSR meets the <800ms TTFB target.
- On request, resolve the slug to a `listId` via the `slugs/` index, then read `lists/{listId}` and `links/{listId}`.
- **404 handling:** If the slug does not exist in the `slugs/` index, return HTTP 404 with a "List not found" page that includes a call-to-action to create a new list.
- Render full HTML with OG meta tags in `<head>` for social sharing:
  ```html
  <meta property="og:title" content="burke/tools — The Urlist" />
  <meta property="og:description" content="My favorite developer tools" />
  <meta property="og:url" content="https://urlist.app/burke/tools" />
  ```
- Display list description, then all link cards in order.
- Each link card is clickable → opens URL in a new tab (`target="_blank" rel="noopener noreferrer"`).
- Broken thumbnail images: use an `onError` handler to swap to a placeholder image.

**Why SSR?** Public list pages must be crawlable by search engines and social media link previews. SSR ensures full HTML is available on first request without client-side JavaScript.

#### My Links Page (`/app/my-links`)

- **Client Component** (authenticated only; redirect to `/` if not signed in).
- Fetch lists from `userLists/{uid}` → resolve each to `lists/{listId}`.
- Display each list as a row: slug, description (truncated), link count.
- Actions: Edit (navigate to `/app/compose/{listId}`), Delete (confirmation dialog → `DELETE /api/lists/{listId}`).

### 7.6 Key Business Logic

#### Draft Persistence (localStorage)

```typescript
// hooks/use-draft.ts

const DRAFT_KEY = 'urlist-draft';

interface Draft {
  slug: string;
  description: string;
  links: DraftLink[];
  savedAt: number;
}

// On mount: load draft from localStorage
// On change: debounced save to localStorage (500ms)
// On publish: clear draft from localStorage
// Draft shape matches the compose page state exactly
```

- **Single-draft model:** Only one active draft at a time. Starting a new list replaces the previous draft.
- **Edit mode:** When editing an existing list (`/app/compose/{listId}`), the draft key includes the listId: `urlist-draft-{listId}`. This prevents conflicts between new-list drafts and edit drafts.
- **Staleness:** Drafts have a `savedAt` timestamp. On load, if the draft is > 30 days old, discard it.

#### Auth Transition During Compose

1. The `useAuth` hook provides the current auth state.
2. The compose page does NOT re-initialize when auth state changes — the React state (slug, description, links) persists in memory.
3. The publish handler reads the current auth state at call time:
   - If `user` is present → include the Firebase ID token in the publish request.
   - If `user` is null → omit the token (anonymous publish).
4. No special migration logic is needed — the draft is entirely client-side.

#### OG Scrape Failure Handling

When `/api/og` returns null values for OG fields:
1. The link is still added to the compose list — scrape failure never blocks adding a link.
2. The link card displays the raw URL as the title.
3. A generic placeholder image is shown instead of a thumbnail.
4. The link remains fully functional (clickable, draggable, publishable).

#### Broken Thumbnail Handling (Public Page)

```tsx
// components/link-card.tsx

function LinkCard({ link }: { link: Link }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="link-card">
      {link.ogImage && !imgError ? (
        <img
          src={link.ogImage}
          alt=""
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className="placeholder-image" aria-hidden="true" />
      )}
      {/* ... title, description, URL ... */}
    </div>
  );
}
```

#### Vanity URL Race Condition

```
Timeline:
1. User A checks "burke/tools" → API returns available ✓
2. User B checks "burke/tools" → API returns available ✓
3. User B publishes with "burke/tools" → writes to slugs/burke~tools → succeeds ✓
4. User A publishes with "burke/tools" → attempts write to slugs/burke~tools → FAILS
   (RTDB security rule: ".write": "!data.exists()" rejects the write)
5. API catches the write failure → returns 409 SLUG_TAKEN to User A
6. User A sees: "The vanity URL 'burke/tools' was taken. Please choose another."
```

**Why this is safe:** Since all writes go through Cloud Functions using the Admin SDK, slug reservation uses a transactional write: the function checks if `slugs/{encodedSlug}` exists, and if not, writes atomically. If two requests race, the RTDB transaction ensures only one succeeds. The losing request receives `409 SLUG_TAKEN`.

#### Nanoid Auto-Slug Generation

```typescript
import { nanoid } from 'nanoid';

// Generate an 8-character URL-safe slug
// Alphabet: A-Za-z0-9_- (default nanoid alphabet)
// Collision probability: ~1 in 2.8 trillion at 1000 IDs/hour for 1 year
function generateSlug(): string {
  return nanoid(8).toLowerCase(); // Lowercase for case-insensitive consistency
}
```

**Why 8 characters?** Provides sufficient uniqueness for a link-sharing app (2.8 trillion combinations) while keeping URLs short and memorable. If collision is detected (RTDB write fails), retry once with a new nanoid.

#### Publish Button Disabled State

The publish button is disabled when:
```typescript
const isPublishDisabled =
  links.length === 0 || // No links added
  slugValidation.status === 'invalid' || // Slug format is bad
  slugValidation.status === 'taken' || // Slug is already taken
  slugValidation.status === 'checking'; // Slug check in progress
```

When `slug` is empty (auto-generate mode), the slug validation status is `'valid'` — an empty slug is always valid.

---

## 8. Error Handling & Resilience

### 8.1 Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|------------|
| **OG scrape timeout (5s)** | Link added without rich preview | Return null OG fields; show raw URL with placeholder card |
| **OG scrape target returns non-HTML** | No metadata extracted | Same as timeout — graceful null fallback |
| **RTDB write failure (slug taken)** | Publish blocked | Return `409 SLUG_TAKEN` with clear message; user picks a new slug |
| **RTDB read failure (transient)** | Public page or API returns error | Return `503 Service Unavailable` with `Retry-After: 5` header |
| **Firebase Auth token expired** | API call rejected | Client SDK auto-refreshes tokens; if refresh fails, prompt re-auth |
| **Cloud Function cold start** | Elevated latency on first request | Set `minInstances: 1` for the SSR function in production |
| **External thumbnail 404/broken** | Image missing on public page | `onError` handler swaps to placeholder image |
| **localStorage full/unavailable** | Draft not persisted | Silent failure — compose still works in-memory; warn user if possible |
| **Nanoid collision** | Auto-slug already exists | Retry slug generation once; if second attempt fails, return 500 |

### 8.2 Retry Logic

| Operation | Retry Strategy |
|-----------|---------------|
| RTDB reads (API routes) | 1 automatic retry with 500ms backoff |
| RTDB writes (publish/update) | No retry — return error to user (writes are not idempotent without dedup keys) |
| OG scraping | No retry — return null fields immediately (user can remove and re-add the link) |
| Nanoid slug collision | 1 retry with a new nanoid |

### 8.3 Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| OG scraper service down | Links still addable; all OG fields null; placeholder cards shown |
| RTDB partially unavailable | Public pages may return 503; app pages still render (compose works offline via localStorage) |
| Auth service down | Anonymous compose still works; sign-in modal shows error; publish works for anonymous |

### 8.4 Client-Side Error Handling

All API calls from the client use a shared fetch wrapper that:
1. Parses the JSON error response.
2. Displays the `error.message` field in a toast notification.
3. For `401` errors, prompts re-authentication.
4. For `429` errors, displays the retry-after duration.
5. For `5xx` errors, shows a generic "Something went wrong. Please try again."

---

## 9. Testing Strategy

### 9.1 Unit Tests

**Scope:** API business logic in Cloud Functions / API route handlers.

**Framework:** Vitest (fast, TypeScript-native, compatible with Next.js).

**Coverage target:** ≥ 80% line coverage for `lib/` and API route handlers.

| Module | Key Test Cases |
|--------|----------------|
| `lib/slug.ts` | Valid slugs, invalid chars, reserved prefixes, consecutive slashes, encoding |
| `lib/url.ts` | Bare domains, blocked protocols, valid HTTP/HTTPS, edge cases (unicode, ports) |
| `lib/og-scraper.ts` | Successful scrape, timeout, SSRF blocking (private IPs), redirect limit |
| `lib/rate-limiter.ts` | Under limit, at limit, over limit, window reset |
| `api/lists/route.ts` | Publish with/without auth, missing links, slug collision, description too long |
| `api/lists/[listId]/route.ts` | Update authorized, update unauthorized, delete authorized, not found |
| `api/slugs/[slug]/route.ts` | Available, taken, invalid format |
| `api/og/route.ts` | Valid URL, invalid URL, blocked URL |

### 9.2 Integration Tests

**Scope:** API routes against a real Firebase Emulator Suite.

**Setup:** Firebase Emulator Suite (Auth, RTDB) running locally in CI.

| Test Scenario | Validates |
|---------------|-----------|
| Publish → Read public page | Full round-trip: publish API, slug index, SSR read |
| Publish → Update → Read | Edit flow preserves links, updates description |
| Publish → Delete → Read returns 404 | Hard delete removes all data and slug |
| Anonymous publish → attempt edit returns 403 | Anonymous lists are immutable |
| Two users race for same slug | Second publish gets 409 |

### 9.3 End-to-End Tests

**Framework:** Playwright.

**Critical user flows:**

| Flow | Steps |
|------|-------|
| **Create and publish (anonymous)** | Homepage → enter URL → compose page → add 2 more links → reorder → publish → verify public page |
| **Create and publish (authenticated)** | Sign in → compose → add links → set vanity URL → publish → verify public page |
| **Edit existing list** | Sign in → My Links → click Edit → add link → remove link → change description → save → verify public page |
| **Delete a list** | Sign in → My Links → click Delete → confirm → verify 404 on public URL |
| **Auth transition** | Start compose anonymously → sign in → publish → verify list appears in My Links |
| **Draft recovery** | Compose page → add links → navigate away → return to compose → verify draft restored |

### 9.4 Accessibility Testing

- **Keyboard navigation:** Verify all interactive elements (URL inputs, slug input, publish button, link cards, delete buttons) are reachable and operable via keyboard.
- **Drag-and-drop:** @dnd-kit provides keyboard-accessible reordering out of the box. Test that links can be reordered using keyboard (Space to pick up, Arrow keys to move, Space to drop).
- **Screen reader:** Verify ARIA live regions announce drag-and-drop state changes. Verify link card content is readable.
- **Focus management:** After adding a link, focus returns to the URL input. After deleting a link, focus moves to the nearest remaining link or the URL input.

### 9.5 Performance Testing

- Lighthouse CI on public list pages (target: ≥ 90 performance score).
- Load test the publish endpoint with 50 concurrent requests to validate rate limiting.
- Measure SSR response times under load (target: < 800ms p95).

---

## 10. Deployment & Operations

### 10.1 Environments

| Environment | Purpose | Firebase Project |
|-------------|---------|-----------------|
| **Local** | Development | Firebase Emulator Suite (Auth, RTDB, Hosting, Functions) |
| **Staging** | Pre-production testing | Separate Firebase project (`urlist-staging`) |
| **Production** | Live users | Production Firebase project (`urlist-prod`) |

### 10.2 Deployment Process

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Git Push   │────▶│   CI/CD      │────▶│   Firebase   │
│   (main)     │     │   Pipeline   │     │   Deploy     │
└─────────────┘     └──────────────┘     └──────────────┘
```

1. Developer pushes to `main` (or merges a PR).
2. CI pipeline (GitHub Actions) runs:
   a. `npm ci` — install dependencies.
   b. `npm run lint` — ESLint + TypeScript type check.
   c. `npm run test` — unit tests (Vitest).
   d. `npm run build` — Next.js production build.
   e. Integration tests against Firebase Emulator.
   f. E2E tests (Playwright) against Firebase Emulator.
3. On success, deploy to staging:
   a. `firebase deploy --only hosting,functions --project urlist-staging`
4. Manual promotion to production:
   a. `firebase deploy --only hosting,functions --project urlist-prod`

### 10.3 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          firebaseServiceAccount: ${{ secrets.FIREBASE_SA_STAGING }}
          projectId: urlist-staging
```

### 10.4 Monitoring & Alerting

| Signal | Tool | Alert Condition |
|--------|------|-----------------|
| **Function errors** | Firebase Console / Cloud Logging | Error rate > 1% over 5 minutes |
| **Function latency** | Cloud Monitoring | p95 latency > 2s for SSR, > 3s for API |
| **RTDB usage** | Firebase Console | > 80% of free-tier concurrent connections |
| **Auth failures** | Firebase Auth console | Spike in failed sign-ins (manual review) |
| **Health check** | External uptime monitor (e.g., UptimeRobot) | `GET /api/health` returns non-200 |

### 10.5 Logging Strategy

All Cloud Functions emit structured JSON logs using `console.log` with a consistent format:

```typescript
// lib/logger.ts

interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  service: string;
  traceId?: string;
  data?: Record<string, unknown>;
}

export function log(entry: LogEntry): void {
  console.log(
    JSON.stringify({
      severity: entry.level.toUpperCase(),
      message: entry.message,
      service: entry.service,
      traceId: entry.traceId,
      ...entry.data,
      timestamp: new Date().toISOString(),
    }),
  );
}
```

**Log levels:**

| Level | Usage |
|-------|-------|
| `info` | Request received, publish succeeded, list deleted |
| `warn` | Rate limit triggered, OG scrape failed, slug collision |
| `error` | RTDB write failure, auth verification failure, unhandled exception |

**Key log points:**
- Every API request: method, path, auth status, response status, duration.
- Publish: listId, slug, link count, anonymous vs. authenticated.
- OG scrape: target URL, success/failure, duration.
- Rate limit: IP, endpoint, current count.
- Errors: full error stack, request context.

### 10.6 Rollback Procedures

1. **Cloud Functions rollback:** Re-deploy the previous Git commit via CI/CD (`git revert` + push to main), or manually deploy a specific commit. Firebase does not have a single CLI rollback command for functions.
2. **Hosting rollback:** Firebase Hosting retains recent deployments. Roll back via `firebase hosting:clone SOURCE_SITE_ID:SOURCE_VERSION TARGET_SITE_ID:live`.
3. **Database rules rollback:** Maintain `database.rules.json` in version control. Deploy previous version with `firebase deploy --only database`.
4. **Data rollback:** Firebase RTDB supports automatic backups (daily). For v1, enable daily backups and document the restore procedure.

### 10.7 Environment & Secrets Management

| Variable | Scope | Source | Description |
|----------|-------|--------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Client | `.env.local` / CI secrets | Firebase project API key (safe to expose) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Client | `.env.local` / CI secrets | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Client | `.env.local` / CI secrets | RTDB URL |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Client | `.env.local` / CI secrets | Firebase project ID |
| `FIREBASE_SERVICE_ACCOUNT` | Server (CI) | GitHub Secrets | Service account JSON for Firebase Admin SDK and deployment |

**Per-environment config:**
- **Local:** `.env.local` file (not committed) + Firebase Emulator Suite. Set `FIREBASE_AUTH_EMULATOR_HOST` and `FIREBASE_DATABASE_EMULATOR_HOST` to route to emulators.
- **Staging/Production:** Environment variables set in GitHub Actions secrets. Separate Firebase projects (`urlist-staging`, `urlist-prod`) with distinct config values.

### 10.8 Anonymous Post-Publish UX

After an anonymous user publishes a list, they are redirected to the public page with a one-time **"Save this URL" banner** prominently displayed at the top:

- The banner shows the full public URL with a **Copy to clipboard** button.
- Message: *"This list is published! Save this URL — you won't be able to find it later."*
- The banner is shown via a `?published=true` query parameter on the redirect. It is dismissed on click or after 30 seconds.
- Additionally, the last 10 published list URLs are stored in `localStorage` under `urlist-recent-publishes` so the user can recover them from the same browser.

---

## 11. Validated Assumptions & Decisions

This section captures every validated decision and the rationale behind it.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Next.js full-stack on Firebase** | Unified codebase for frontend and backend; SSR for public pages (SEO/social sharing); serverless scaling; Firebase ecosystem is tightly integrated |
| 2 | **Firebase RTDB (not Firestore)** | Simpler data model (JSON tree); real-time sync for instant public page updates; lower read latency for small documents; no need for Firestore's advanced querying |
| 3 | **Google + GitHub OAuth only** | Primary audience is developers (GitHub) and general users (Google); two providers cover the vast majority of users without complexity |
| 4 | **Hotlinked thumbnails (no download)** | Eliminates storage costs, image processing pipeline, and content moderation burden; broken images handled with placeholders |
| 5 | **Case-insensitive slugs (stored lowercase)** | Prevents confusion (`Burke/Tools` vs `burke/tools`); single canonical form simplifies lookups |
| 6 | **Forward slashes in slugs** | Enables intuitive hierarchical organization (`burke/tools`, `favorites/2026`); encoded in RTDB keys as `~` |
| 7 | **Hard delete** | Simplifies implementation — no soft-delete state machine, no "trash" concept, no scheduled cleanup; slug is freed immediately |
| 8 | **8-char nanoid for auto-slugs** | Short enough for sharing; 2.8T combinations is sufficient; lowercase for consistency |
| 9 | **OG metadata scraped once, persisted** | Avoids repeated external fetches on every page view; keeps public page renders fast and predictable |
| 10 | **No per-list link limit** | Capped at 500 links per list to stay within RTDB atomic write limits (~16MB); 500 feels unlimited to normal users |
| 11 | **localStorage draft persistence** | Works for both anonymous and authenticated users; no server-side draft infrastructure needed; immediate UX benefit |
| 12 | **Description limit: 280 chars** | Aligns with common short-form text patterns; sufficient for a summary |
| 13 | **IP-based rate limiting** | Simple to implement; effective against anonymous abuse; authenticated users get higher limits |
| 14 | **Only `/app` reserved** | Minimal namespace reservation; all app pages under one prefix; `/api`, `/_next`, and common root files also reserved for safety |
| 15 | **No GDPR/CCPA for v1** | Reduces implementation scope; can be added in v2 if user base warrants it |
| 16 | **Admin-only RTDB writes** | All mutations go through Cloud Functions via Admin SDK; prevents clients from bypassing validation, rate limiting, and sanitization |
| 17 | **Optimistic concurrency on updates** | `updatedAt` check prevents silent data loss from concurrent edits in multiple tabs/devices |
| 18 | **OG metadata sanitization** | Client-supplied OG fields are sanitized server-side (HTML stripped, length-limited) to prevent stored-XSS |
| 19 | **Cloud Functions 2nd gen** | Better concurrency, longer timeouts, Cloud Run-based; recommended for new projects |
| 20 | **SSR with no caching** | Public pages always fresh from RTDB; immediate consistency after edits; RTDB reads fast enough (~50ms) |

### Open Questions

All assumptions have been validated. No open questions remain for v1.

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **CSR** | Client-Side Rendering — page rendered in the browser via JavaScript |
| **SSR** | Server-Side Rendering — page rendered on the server and sent as complete HTML |
| **RTDB** | Firebase Realtime Database — a cloud-hosted NoSQL JSON database with real-time sync |
| **Cloud Functions** | Google Cloud Functions for Firebase — serverless functions triggered by HTTP requests or events |
| **OG / OpenGraph** | Open Graph Protocol — metadata standard (`og:title`, `og:image`, etc.) used by social platforms for rich link previews |
| **Vanity URL** | A user-chosen, human-readable slug for a list's public URL (e.g., `burke/tools`) |
| **Slug** | The URL path segment identifying a list (either user-chosen vanity slug or auto-generated nanoid) |
| **Nanoid** | A compact, URL-safe unique ID generator library |
| **SSRF** | Server-Side Request Forgery — an attack where a server is tricked into making requests to internal resources |
| **TOCTOU** | Time-of-Check-Time-of-Use — a race condition where a value changes between validation and use |
| **ID Token** | A Firebase Authentication JWT containing the user's identity, used for API authentication |
| **DnD** | Drag and Drop — UI interaction for reordering list items |
| **CDN** | Content Delivery Network — geographically distributed servers for fast static asset delivery |
| **Cold Start** | The initialization delay when a serverless function is invoked after a period of inactivity |
| **Hard Delete** | Permanent removal of data with no recovery mechanism (as opposed to soft delete / archival) |
| **ISR** | Incremental Static Regeneration — a Next.js feature that updates static pages after deployment |

---

*End of specification.*

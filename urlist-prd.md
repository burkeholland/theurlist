# Product Requirements Document: The Urlist

## Overview

The Urlist is a link-sharing application that allows users to curate collections of URLs into named lists and share them publicly via a unique URL. Lists can be created anonymously or by authenticated users, with authenticated users gaining the ability to manage and edit their lists over time.

---

## User Roles

| Role | Description |
|------|-------------|
| **Anonymous User** | Can create and publish lists without an account. Published lists are permanent and uneditable. |
| **Authenticated User** | Can create, publish, and edit lists. Has access to a personal list management dashboard. |

---

## Features

### 1. Homepage

- A clean landing page that serves as the entry point for all users.
- **Sign In** — A button/link that opens a modal presenting available sign-in options (e.g., OAuth providers).
- **Create a List input** — An oversized text input prominently displayed on the homepage. The user can type or paste a URL directly to begin creating their first list. This action does not require authentication.
  - Protocol is optional — bare domains (e.g., `github.com`) are accepted.
  - Submitting a URL from this input navigates the user to the List Compose page with that URL already added.

---

### 2. List Compose Page

This is the primary creation and editing interface. It contains the following elements, in order from top to bottom:

#### Vanity URL
- A text input at the top of the page for the list's public URL slug.
- Accepts all valid URL characters, **including forward slashes**, allowing hierarchical paths (e.g., `burke/tools` or `favorites/2026`).
- If left blank, the system auto-assigns a URL slug.
- **Validation (real-time):**
  - Format validation — must contain only valid URL characters.
  - Uniqueness validation — checked against the backend database; an inline error is shown if the slug is already taken.
- The vanity URL **cannot be changed** after a list is published (for authenticated users editing existing lists, this field is locked/read-only).

#### Description
- A plain-text input field below the vanity URL.
- Character limit left to implementer's discretion, but should be appropriate for a short summary.
- No rich text or markdown required.

#### Add Link Input
- An oversized text input for adding URLs to the list.
- Protocol is optional — bare domains are accepted.
- Submitting a URL creates a new link card and appends it to the list below.
- The input clears after each submission, ready for the next link.

#### Link Cards
- Each link added to the list is represented as a full-width card in the list below the input.
- Cards are populated using **OpenGraph metadata** scraped from the URL at the time of addition:
  - Site name
  - Description
  - Thumbnail image
  - URL (displayed)
- Cards are **drag-and-drop reorderable**:
  - Movement is constrained to the **vertical axis only** (no horizontal drift) to clearly communicate reordering intent.
- Cards can be **removed** from the list at any time before or after publishing (authenticated users only after publishing).

#### Publish Button
- Located prominently at the top of the page (e.g., in the page header or sticky toolbar).
- **Disabled** if either of the following conditions is true:
  - The vanity URL field contains an invalid or already-taken value.
  - The list contains zero links.
- **Enabled** only when a valid (or empty/auto-assigned) vanity URL is set **and** at least one link is in the list.
- On publish:
  - The list is saved and a public URL is generated.
  - The user is redirected to the **Public List Page** for that list.

---

### 3. Public List Page

- A read-only view of a published list.
- Displays:
  - List title (vanity URL / slug)
  - Description
  - All link cards in their saved order, with OpenGraph data (name, description, thumbnail, URL)
  - Each link card is clickable and opens the URL in a new tab.
- No editing controls are shown on this page.

---

### 4. Authentication & Session Management

- Sign-in is triggered via a modal from the homepage (or any sign-in prompt in the app).
- Authentication provider details are left to the implementer.
- Session state determines what editing and management capabilities are available.

---

### 5. Anonymous Publishing Rules

- Anonymous users **can** publish lists without creating an account.
- Once an anonymous list is published, it is **permanent and cannot be edited**.
- There is no mechanism for an anonymous user to claim or recover a list after publishing.

---

### 6. Authenticated Publishing Rules

- Authenticated users can publish lists and **edit them after the fact**.
- Editable after publishing:
  - Add new links
  - Remove existing links
  - Reorder links
  - Update the description
- **Not editable after publishing:**
  - The vanity URL — it is locked permanently once the list is published.
- Edits to a published list should ideally be reflected on the public page immediately (exact consistency behavior left to implementer).

---

### 7. My Links Page (Authenticated Users Only)

- Accessible via the **navigation header** (e.g., "My Links" nav item).
- Displays all lists created by the authenticated user.
- Each list entry shows the vanity URL, description summary, and link count.
- Actions available per list:
  - **Edit** — navigates to the List Compose page for that list.
  - **Delete** — removes the list and its public URL permanently (with confirmation prompt).
- Clicking a list navigates to its List Compose page for editing.

---

### 8. Navigation / Header

- Present on all pages.
- Contains:
  - App name/logo (links to homepage)
  - **My Links** (visible only to authenticated users)
  - **Sign In** (visible only to unauthenticated users)
  - **Sign Out** / account indicator (visible only to authenticated users)

---

## Key Behaviors Summary

| Behavior | Detail |
|----------|--------|
| Protocol in URLs | Optional — bare domains are accepted everywhere |
| Vanity URL characters | All valid URL characters, including `/` |
| Vanity URL uniqueness | Validated in real-time against the backend |
| Auto-assigned slug | Provided when vanity URL is left blank |
| OpenGraph scraping | Triggered at the time a link is added |
| Drag-to-reorder | Vertical axis only |
| Publish gate | Requires ≥1 link AND valid/empty vanity URL |
| Anonymous lists | Publish-once, no edits after publishing |
| Authenticated lists | Fully editable except vanity URL post-publish |
| Vanity URL lock | Locked permanently after first publish |

---

## Out of Scope (v1)

- Link click analytics
- List privacy settings (private/unlisted lists)
- Collaborative editing
- Link previews with live fetch (OpenGraph scraped at add time only)
- Anonymous list claiming/transfer to an account

'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/nav-header';
import { UrlInput } from '@/components/url-input';
import { SortableLinkList } from '@/components/sortable-link-list';
import { useDraft } from '@/hooks/use-draft';
import { useAuth } from '@/hooks/use-auth';
import type { DraftLink, ListWithLinks } from '@/lib/types';
import { nanoid } from 'nanoid';

interface EditPageProps {
  params: Promise<{ listId: string }>;
}

export default function EditComposePage({ params }: EditPageProps) {
  const { listId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading, getIdToken } = useAuth();
  const { description, setDescription, links, setLinks, loaded, addLink, removeLink, reorderLinks, clearDraft } = useDraft(listId);

  const [listData, setListData] = useState<ListWithLinks | null>(null);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingUrl, setAddingUrl] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  // Fetch existing list data
  useEffect(() => {
    async function fetchList() {
      try {
        const res = await fetch(`/api/lists/${listId}`);
        if (!res.ok) {
          setError('List not found.');
          return;
        }
        const data: ListWithLinks = await res.json();
        setListData(data);

        // Only populate draft if draft is empty (not previously saved)
        if (loaded && links.length === 0) {
          setDescription(data.description);
          setLinks(
            data.links.map((l) => ({
              id: l.id,
              url: l.url,
              position: l.position,
              ogTitle: l.ogTitle,
              ogDescription: l.ogDescription,
              ogImage: l.ogImage,
              ogSiteName: l.ogSiteName,
            }))
          );
        }
      } catch {
        setError('Failed to load list.');
      } finally {
        setFetching(false);
      }
    }

    if (loaded) {
      void fetchList();
    }
  }, [listId, loaded, links.length, setDescription, setLinks]);

  const handleAddUrl = useCallback(
    async (url: string) => {
      setAddingUrl(true);
      try {
        const res = await fetch('/api/og', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        const newLink: DraftLink = {
          id: nanoid(10),
          url: data.url || url,
          position: links.length,
          ogTitle: data.ogTitle || null,
          ogDescription: data.ogDescription || null,
          ogImage: data.ogImage || null,
          ogSiteName: data.ogSiteName || null,
        };
        addLink(newLink);
      } catch {
        addLink({
          id: nanoid(10),
          url,
          position: links.length,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          ogSiteName: null,
        });
      } finally {
        setAddingUrl(false);
      }
    },
    [links.length, addLink]
  );

  const handleSave = async () => {
    if (!listData) return;
    setSaving(true);
    setError(null);

    try {
      const token = await getIdToken();
      if (!token) {
        setError('You must be signed in to edit a list.');
        return;
      }

      const res = await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          description,
          updatedAt: listData.updatedAt,
          links: links.map((l, i) => ({
            id: l.id,
            url: l.url,
            position: i,
            ogTitle: l.ogTitle,
            ogDescription: l.ogDescription,
            ogImage: l.ogImage,
            ogSiteName: l.ogSiteName,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Failed to save changes.');
        return;
      }

      clearDraft();
      router.push(`/${listData.slug}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || fetching || !loaded) {
    return (
      <div>
        <NavHeader />
        <main
          style={{
            maxWidth: '860px',
            margin: '0 auto',
            padding: '28px 16px 48px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                height: '26px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
            <div
              style={{
                height: '18px',
                width: '220px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
            <div
              style={{
                height: '74px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
            <div
              style={{
                height: '44px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
            <div
              style={{
                height: '120px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      <NavHeader />
      <main
        style={{
          maxWidth: '860px',
          margin: '0 auto',
          padding: '28px 16px 48px',
        }}
      >
        <header className="compose-header">
          <h1>Edit list</h1>
          {listData ? (
            <p
              className="muted"
              style={{
                marginTop: '6px',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              /{listData.slug}
            </p>
          ) : null}
        </header>

        {error && (
          <div
            style={{
              color: 'var(--danger)',
              fontSize: '13px',
              marginBottom: '12px',
            }}
          >
            {error}
          </div>
        )}

        <div className="compose-meta-panel">
          <div className="field-group">
            <label htmlFor="description" className="label">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 280))}
              placeholder="What's this list about?"
              className="input"
            />
            <p className="char-count">{description.length}/280</p>
          </div>
        </div>

        <div className="field-group">
          <label className="label">Add links</label>
          <UrlInput onSubmit={handleAddUrl} placeholder="Paste a URL..." loading={addingUrl} size="large" />
        </div>

        <section className="field-group">
          <div className="section-head">
            <h2>
              Links <span className="count-badge">{links.length}</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <SortableLinkList links={links} onReorder={reorderLinks} onDelete={removeLink} />
          </div>
        </section>

        <div className="compose-actions">
          <button
            onClick={handleSave}
            disabled={links.length === 0 || saving}
            className="btn btn-primary"
            style={links.length === 0 || saving ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span className="small muted">{links.length} link{links.length === 1 ? '' : 's'}</span>
        </div>

        <style jsx>{`
          .compose-header {
            margin-bottom: 20px;
          }
          .compose-header h1 {
            font-size: 18px;
            font-weight: 600;
          }
          .compose-meta-panel {
            background: var(--bg-secondary);
            border-radius: 10px;
            padding: 16px 16px 4px;
            margin-bottom: 14px;
          }
          .field-group {
            margin-bottom: 14px;
          }
          .section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          .section-head h2 {
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .compose-actions {
            margin-top: 16px;
            display: flex;
            gap: 8px;
            align-items: center;
          }
        `}</style>
      </main>
    </div>
  );
}

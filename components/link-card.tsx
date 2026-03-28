'use client';

import { useState } from 'react';
import type { DraftLink, LinkWithId } from '@/lib/types';
import { LinkCardPlaceholder } from './link-card-placeholder';

interface LinkCardProps {
  link: DraftLink | LinkWithId;
  onDelete?: (id: string) => void;
  isPublicView?: boolean;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function LinkCard({ link, onDelete, isPublicView = false }: LinkCardProps) {
  const [imgError, setImgError] = useState(false);
  const hostname = getHostname(link.url);
  const title = link.ogTitle || hostname;
  const description = link.ogDescription;

  if (isPublicView) {
    return (
      <div className="pub-card">
        <div className="pub-card-img">
          {link.ogImage && !imgError ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={link.ogImage} alt="" onError={() => setImgError(true)} loading="lazy" />
          ) : (
            <LinkCardPlaceholder />
          )}
        </div>
        <div className="pub-card-body">
          <div className="pub-card-title">
            <a href={link.url} target="_blank" rel="noopener noreferrer">{title}</a>
          </div>
          <div className="pub-card-domain">{hostname}</div>
          {description && <div className="pub-card-desc">{description}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="pub-card">
      <div className="pub-card-img">
        {link.ogImage && !imgError ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={link.ogImage} alt="" onError={() => setImgError(true)} loading="lazy" />
        ) : (
          <LinkCardPlaceholder />
        )}
      </div>
      <div className="pub-card-body">
        <div className="pub-card-title">{title}</div>
        <div className="pub-card-domain">{hostname}</div>
        <div className="pub-card-desc">{description}</div>
      </div>
      {onDelete && (
        <button
          onClick={() => onDelete(link.id)}
          className="remove-btn"
          title="Remove"
          style={{ alignSelf: 'start', margin: '10px 8px 0 0' }}
        >
          ×
        </button>
      )}
    </div>
  );
}

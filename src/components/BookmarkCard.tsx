import { motion } from 'framer-motion';
import { useLinkMindStore } from '../store';
import { getDomain, cn } from '../utils';
import type { Bookmark } from '../types';
import Highlight from './Highlight';

interface BookmarkCardProps {
  bookmark: Bookmark;
  isSelected?: boolean;
  onContextMenu?: (e: React.MouseEvent, bookmark: Bookmark) => void;
}

const categoryBorderColor: Record<Bookmark['category'], string> = {
  Project: 'border-l-category-project',
  Area: 'border-l-category-area',
  Resource: 'border-l-category-resource',
};

const categoryGlow: Record<Bookmark['category'], string> = {
  Project: 'hover:shadow-[0_0_24px_rgba(99,102,241,0.12)]',
  Area: 'hover:shadow-[0_0_24px_rgba(245,158,11,0.12)]',
  Resource: 'hover:shadow-[0_0_24px_rgba(16,185,129,0.12)]',
};

const categoryPillClass: Record<Bookmark['category'], string> = {
  Project: 'pill pill-project',
  Area: 'pill pill-area',
  Resource: 'pill pill-resource',
};

const statusPillClass: Record<Bookmark['status'], string> = {
  Active: 'pill pill-active',
  Idle: 'pill pill-idle',
  'To Read': 'pill pill-toread',
};

export default function BookmarkCard({
  bookmark,
  isSelected = false,
  onContextMenu,
}: BookmarkCardProps) {
  const toggleSelectedBookmark = useLinkMindStore((s) => s.toggleSelectedBookmark);
  const collections = useLinkMindStore((s) => s.collections);

  const collection = bookmark.collectionId
    ? collections.find((c) => c.id === bookmark.collectionId)
    : undefined;

  const visibleTags = bookmark.tags.slice(0, 3);
  const extraTagCount = bookmark.tags.length - 3;

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't open link if user clicked a checkbox, button, or inside one
    if (
      target.closest('input[type="checkbox"]') ||
      target.closest('button') ||
      target.closest('label')
    ) {
      return;
    }
    window.open(bookmark.url, '_blank');
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, bookmark);
  };

  return (
    <motion.div
      layout
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      className={cn(
        'glass-subtle rounded-2xl p-4 cursor-pointer group relative bookmark-card-focusable',
        'border-l-[3px] transition-shadow duration-300',
        'focus:ring-2 focus:ring-accent-primary focus:outline-none',
        categoryBorderColor[bookmark.category],
        categoryGlow[bookmark.category],
        isSelected && 'ring-2 ring-accent-primary/60'
      )}
    >
      {/* Selection checkbox */}
      <label
        className={cn(
          'absolute top-3 right-3 z-10 transition-opacity duration-200',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleSelectedBookmark(bookmark.id)}
          className="w-4 h-4 rounded-md accent-accent-primary cursor-pointer"
        />
      </label>

      {/* Top row: favicon + title + domain */}
      <div className="flex items-center gap-2 mb-3 pr-6">
        <img
          src={bookmark.faviconUrl}
          alt=""
          width={24}
          height={24}
          className="rounded-md shrink-0"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-surface-950 truncate">
            <Highlight text={bookmark.title} matches={bookmark.matches} matchKey="title" />
          </p>
          <p className="text-xs text-surface-600 truncate">
            <Highlight text={getDomain(bookmark.url)} matches={bookmark.matches} matchKey="url" />
          </p>
        </div>
      </div>

      {/* Middle row: category + status pills */}
      <div className="flex items-center gap-2 mb-3">
        <span className={categoryPillClass[bookmark.category]}>
          {bookmark.category}
        </span>
        <span className={statusPillClass[bookmark.status]}>
          {bookmark.status}
        </span>
      </div>

      {/* Bottom row: tags + collection */}
      <div className="flex items-center flex-wrap gap-1.5">
        {visibleTags.map((tag) => (
          <span key={tag} className="tag-chip">
            <Highlight text={tag} matches={bookmark.matches} matchKey="tags" value={tag} />
          </span>
        ))}
        {extraTagCount > 0 && (
          <span className="tag-chip text-surface-600">+{extraTagCount}</span>
        )}

        {collection && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-surface-600 truncate max-w-[120px]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: collection.color }}
            />
            <span className="truncate">
              <Highlight text={collection.name} matches={bookmark.matches} matchKey="collectionName" />
            </span>
          </span>
        )}
      </div>
    </motion.div>
  );
}

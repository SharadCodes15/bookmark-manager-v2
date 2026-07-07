import { motion } from 'framer-motion';
import { Pencil, Trash2, ExternalLink, Pin } from 'lucide-react';
import { useLinkMindStore } from '../store';
import { getDomain, cn } from '../utils';
import type { Bookmark } from '../types';
import Highlight from './Highlight';

interface BookmarkListItemProps {
  bookmark: Bookmark;
  isSelected?: boolean;
  onContextMenu?: (e: React.MouseEvent, bookmark: Bookmark) => void;
}

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

export default function BookmarkListItem({
  bookmark,
  isSelected = false,
  onContextMenu,
}: BookmarkListItemProps) {
  const toggleSelectedBookmark = useLinkMindStore((s) => s.toggleSelectedBookmark);
  const openEditModal = useLinkMindStore((s) => s.openEditModal);
  const deleteBookmark = useLinkMindStore((s) => s.deleteBookmark);
  const collections = useLinkMindStore((s) => s.collections);

  const collection = bookmark.collectionId
    ? collections.find((c) => c.id === bookmark.collectionId)
    : undefined;

  const visibleTags = bookmark.tags.slice(0, 2);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, bookmark);
  };

  return (
    <motion.div
      layout
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      transition={{ duration: 0.15 }}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      className={cn(
        'glass-neumorphic-raised rounded-xl px-4 py-3 flex items-center gap-3 group bookmark-card-focusable',
        'focus:ring-2 focus:ring-accent-primary focus:outline-none',
        isSelected && 'ring-2 ring-accent-primary/60'
      )}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => toggleSelectedBookmark(bookmark.id)}
        className="w-4 h-4 rounded-md accent-accent-primary cursor-pointer shrink-0"
      />

      {/* Favicon */}
      <img
        src={bookmark.faviconUrl}
        alt=""
        width={20}
        height={20}
        className="rounded-md shrink-0"
        loading="lazy"
      />

      {/* Title + domain */}
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <span className="font-semibold text-sm text-surface-950 truncate">
          <Highlight text={bookmark.title} matches={bookmark.matches} matchKey="title" />
        </span>
        {bookmark.pinned && (
          <Pin className="w-3.5 h-3.5 text-accent-secondary shrink-0" />
        )}
        <span className="text-xs text-surface-600 truncate hidden sm:inline">
          <Highlight text={getDomain(bookmark.url)} matches={bookmark.matches} matchKey="url" />
        </span>
      </div>

      {/* Category pill */}
      <span className={cn(categoryPillClass[bookmark.category], 'hidden md:inline-flex')}>
        {bookmark.category}
      </span>

      {/* Status pill */}
      <span className={cn(statusPillClass[bookmark.status], 'hidden md:inline-flex')}>
        {bookmark.status}
      </span>

      {/* Tags */}
      <div className="hidden lg:flex items-center gap-1.5">
        {visibleTags.map((tag) => (
          <span key={tag} className="tag-chip">
            <Highlight text={tag} matches={bookmark.matches} matchKey="tags" value={tag} />
          </span>
        ))}
      </div>

      {/* Collection dot */}
      {collection && (
        <span className="hidden xl:flex items-center gap-1.5 text-xs text-surface-600 truncate max-w-[100px]">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: collection.color }}
          />
          <span className="truncate">
            <Highlight text={collection.name} matches={bookmark.matches} matchKey="collectionName" />
          </span>
        </span>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openEditModal(bookmark);
          }}
          className="p-1.5 rounded-lg hover:bg-surface-300 text-surface-600 hover:text-surface-900 transition-colors"
          aria-label="Edit bookmark"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void deleteBookmark(bookmark.id);
          }}
          className="p-1.5 rounded-lg hover:bg-surface-300 text-surface-600 hover:text-accent-danger transition-colors"
          aria-label="Delete bookmark"
        >
          <Trash2 size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(bookmark.url, '_blank', 'noopener,noreferrer');
          }}
          className="p-1.5 rounded-lg hover:bg-surface-300 text-surface-600 hover:text-surface-900 transition-colors"
          aria-label="Open link"
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </motion.div>
  );
}

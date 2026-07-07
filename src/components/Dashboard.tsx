import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLinkMindStore } from '../store';
import BookmarkCard from './BookmarkCard';
import BookmarkListItem from './BookmarkListItem';
import ContextMenu from './ContextMenu';
import EmptyState from './EmptyState';
import BulkActions from './BulkActions';
import type { Bookmark } from '../types';

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 24,
    },
  },
};

export default function Dashboard() {
  const { viewMode, getFilteredBookmarks, selectedBookmarkIds, filters } = useLinkMindStore();
  const filteredBookmarks = getFilteredBookmarks();

  const [contextMenu, setContextMenu] = useState<{
    bookmark: Bookmark;
    position: { x: number; y: number };
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, bookmark: Bookmark) => {
      e.preventDefault();
      setContextMenu({
        bookmark,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  // Arrow key grid/list navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

      const active = document.activeElement;
      // Do not override arrow keys if user is editing inputs/dropdowns
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;

      const cards = Array.from(
        document.querySelectorAll('.bookmark-card-focusable')
      ) as HTMLElement[];
      if (cards.length === 0) return;

      let index = cards.indexOf(active as HTMLElement);

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        index = (index + 1) % cards.length;
        cards[index]?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        index = (index - 1 + cards.length) % cards.length;
        cards[index]?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasActiveFilters =
    filters.search !== '' ||
    filters.categories.length > 0 ||
    filters.statuses.length > 0 ||
    filters.collectionIds.length > 0 ||
    filters.tags.length > 0;

  if (filteredBookmarks.length === 0) {
    return <EmptyState hasFilters={hasActiveFilters} />;
  }

  return (
    <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
      {/* Bulk Actions Bar */}
      {selectedBookmarkIds.size > 0 && <BulkActions />}

      {/* Results count */}
      {hasActiveFilters && (
        <p className="text-xs text-surface-500 mb-3 px-1">
          Showing <span className="font-semibold text-surface-700">{filteredBookmarks.length}</span> result{filteredBookmarks.length !== 1 ? 's' : ''}
        </p>
      )}

      <AnimatePresence mode="wait">
        {viewMode === 'grid' ? (
          <motion.div
            key="grid"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
          >
            {filteredBookmarks.map((bookmark) => (
              <motion.div key={bookmark.id} variants={itemVariants} layout>
                <BookmarkCard
                  bookmark={bookmark}
                  isSelected={selectedBookmarkIds.has(bookmark.id)}
                  onContextMenu={handleContextMenu}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="space-y-2"
          >
            {filteredBookmarks.map((bookmark) => (
              <motion.div key={bookmark.id} variants={itemVariants} layout>
                <BookmarkListItem
                  bookmark={bookmark}
                  isSelected={selectedBookmarkIds.has(bookmark.id)}
                  onContextMenu={handleContextMenu}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            bookmark={contextMenu.bookmark}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Trash2,
  X,
  CheckSquare,
  Layers,
  Activity,
  Folder,
} from 'lucide-react';
import { useLinkMindStore } from '../store';
import type { Category, Status } from '../types';

export default function BulkActions() {
  const {
    selectedBookmarkIds,
    clearSelection,
    bulkDeleteBookmarks,
    bulkUpdateBookmarks,
    collections,
    getFilteredBookmarks,
    selectAllVisible,
  } = useLinkMindStore();

  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);

  const count = selectedBookmarkIds.size;
  const ids = Array.from(selectedBookmarkIds);
  const filteredBookmarks = getFilteredBookmarks();

  const categoryOptions: Category[] = ['Project', 'Area', 'Resource'];
  const statusOptions: Status[] = ['Active', 'Idle', 'To Read'];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="glass rounded-2xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap"
    >
      <div className="flex items-center gap-2 text-sm">
        <CheckSquare className="w-4 h-4 text-accent-primary" />
        <span className="font-semibold text-surface-900">{count}</span>
        <span className="text-surface-600">selected</span>
      </div>

      <div className="h-4 w-px bg-surface-400" />

      {/* Select All */}
      <button
        onClick={() => selectAllVisible(filteredBookmarks.map((b) => b.id))}
        className="text-xs text-accent-primary hover:text-accent-primary-light transition-colors"
      >
        Select all ({filteredBookmarks.length})
      </button>

      <div className="flex-1" />

      {/* Category */}
      <div className="relative">
        <button
          onClick={() => {
            setShowCategoryMenu(!showCategoryMenu);
            setShowStatusMenu(false);
            setShowCollectionMenu(false);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-300 hover:bg-surface-400 text-xs text-surface-700 transition-colors"
        >
          <Layers className="w-3.5 h-3.5" />
          Category
        </button>
        {showCategoryMenu && (
          <div className="absolute top-full mt-1 right-0 glass rounded-xl py-1 min-w-[120px] z-50 shadow-xl">
            {categoryOptions.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  bulkUpdateBookmarks(ids, { category: cat });
                  setShowCategoryMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-surface-700 hover:bg-surface-300 transition-colors"
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="relative">
        <button
          onClick={() => {
            setShowStatusMenu(!showStatusMenu);
            setShowCategoryMenu(false);
            setShowCollectionMenu(false);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-300 hover:bg-surface-400 text-xs text-surface-700 transition-colors"
        >
          <Activity className="w-3.5 h-3.5" />
          Status
        </button>
        {showStatusMenu && (
          <div className="absolute top-full mt-1 right-0 glass rounded-xl py-1 min-w-[120px] z-50 shadow-xl">
            {statusOptions.map((s) => (
              <button
                key={s}
                onClick={() => {
                  bulkUpdateBookmarks(ids, { status: s });
                  setShowStatusMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-surface-700 hover:bg-surface-300 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Collection */}
      <div className="relative">
        <button
          onClick={() => {
            setShowCollectionMenu(!showCollectionMenu);
            setShowCategoryMenu(false);
            setShowStatusMenu(false);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-300 hover:bg-surface-400 text-xs text-surface-700 transition-colors"
        >
          <Folder className="w-3.5 h-3.5" />
          Collection
        </button>
        {showCollectionMenu && (
          <div className="absolute top-full mt-1 right-0 glass rounded-xl py-1 min-w-[160px] z-50 shadow-xl max-h-48 overflow-y-auto">
            <button
              onClick={() => {
                bulkUpdateBookmarks(ids, { collectionId: undefined });
                setShowCollectionMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-surface-500 italic hover:bg-surface-300 transition-colors"
            >
              None
            </button>
            {collections.map((col) => (
              <button
                key={col.id}
                onClick={() => {
                  bulkUpdateBookmarks(ids, { collectionId: col.id });
                  setShowCollectionMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-surface-700 hover:bg-surface-300 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                {col.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={() => bulkDeleteBookmarks(ids)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-danger/15 hover:bg-accent-danger/25 text-accent-danger text-xs font-medium transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>

      {/* Clear selection */}
      <button
        onClick={clearSelection}
        className="p-1.5 rounded-lg hover:bg-surface-300 text-surface-500 transition-colors"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

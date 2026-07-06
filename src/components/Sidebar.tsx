import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Activity,
  BookOpen,
  X,
  Filter,
  Hash,
} from 'lucide-react';
import { useLinkMindStore } from '../store';
import type { Category, Status } from '../types';

const categories: { value: Category; label: string; icon: typeof Layers; colorClass: string }[] = [
  { value: 'Project', label: 'Projects', icon: Layers, colorClass: 'text-category-project' },
  { value: 'Area', label: 'Areas', icon: Activity, colorClass: 'text-category-area' },
  { value: 'Resource', label: 'Resources', icon: BookOpen, colorClass: 'text-category-resource' },
];

const statuses: { value: Status; label: string; colorClass: string; bgClass: string }[] = [
  { value: 'Active', label: 'Active', colorClass: 'text-status-active', bgClass: 'bg-status-active/15' },
  { value: 'Idle', label: 'Idle', colorClass: 'text-status-idle', bgClass: 'bg-status-idle/15' },
  { value: 'To Read', label: 'To Read', colorClass: 'text-status-toread', bgClass: 'bg-status-toread/15' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const {
    bookmarks,
    collections,
    filters,
    setFilters,
    resetFilters,
  } = useLinkMindStore();

  const activeFilterCount =
    filters.categories.length +
    filters.statuses.length +
    filters.collectionIds.length +
    filters.tags.length;

  const toggleCategory = (cat: Category) => {
    const current = filters.categories;
    setFilters({
      categories: current.includes(cat)
        ? current.filter((c) => c !== cat)
        : [...current, cat],
    });
  };

  const toggleStatus = (status: Status) => {
    const current = filters.statuses;
    setFilters({
      statuses: current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status],
    });
  };

  const toggleCollection = (colId: string) => {
    const current = filters.collectionIds;
    setFilters({
      collectionIds: current.includes(colId)
        ? current.filter((c) => c !== colId)
        : [...current, colId],
    });
  };

  const getCategoryCount = (cat: Category) =>
    bookmarks.filter((b) => b.category === cat).length;

  const getStatusCount = (status: Status) =>
    bookmarks.filter((b) => b.status === status).length;

  const getCollectionCount = (colId: string) =>
    bookmarks.filter((b) => b.collectionId === colId).length;

  // Get all unique tags with counts
  const tagCounts = bookmarks.reduce<Record<string, number>>((acc, b) => {
    b.tags.forEach((t) => {
      acc[t] = (acc[t] || 0) + 1;
    });
    return acc;
  }, {});
  const topTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-surface-600" />
          <span className="text-sm font-semibold text-surface-800">Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-accent-primary text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-xs text-accent-primary hover:text-accent-primary-light transition-all px-2.5 py-1 rounded-lg glass-neumorphic-raised hover:scale-[1.03] active:scale-[0.97]"
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg hover:bg-surface-300 text-surface-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {/* Collections */}
        <section>
          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1 mb-2">
            Collections
          </h3>
          {collections.length === 0 ? (
            <p className="text-xs text-surface-500 px-1 italic">No collections yet</p>
          ) : (
            <div className="space-y-0.5">
              {collections.map((col) => {
                const isActive = filters.collectionIds.includes(col.id);
                const count = getCollectionCount(col.id);
                return (
                  <button
                    key={col.id}
                    onClick={() => toggleCollection(col.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
                      isActive
                        ? 'glass-neumorphic-pressed text-surface-950 font-bold'
                        : 'text-surface-700 glass-neumorphic-raised'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/10"
                      style={{ backgroundColor: col.color }}
                    />
                    <span className="truncate flex-1 text-left">{col.name}</span>
                    <span className="text-xs text-surface-500 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Categories */}
        <section>
          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1 mb-2">
            Categories
          </h3>
          <div className="space-y-0.5">
            {categories.map(({ value, label, icon: Icon, colorClass }) => {
              const isActive = filters.categories.includes(value);
              const count = getCategoryCount(value);
              return (
                <button
                  key={value}
                  onClick={() => toggleCategory(value)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    isActive
                      ? 'glass-neumorphic-pressed text-surface-950 font-bold'
                      : 'text-surface-700 glass-neumorphic-raised'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${colorClass}`} />
                  <span className="flex-1 text-left">{label}</span>
                  <span className="text-xs text-surface-500 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Status */}
        <section>
          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1 mb-2">
            Status
          </h3>
          <div className="flex flex-wrap gap-1.5 px-1">
            {statuses.map(({ value, label, colorClass }) => {
              const isActive = filters.statuses.includes(value);
              const count = getStatusCount(value);
              return (
                <button
                  key={value}
                  onClick={() => toggleStatus(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-[1.03] active:scale-[0.97] ${
                    isActive
                      ? `glass-neumorphic-pressed ${colorClass} font-bold`
                      : 'glass-neumorphic-raised text-surface-600'
                  }`}
                >
                  {label}
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Tags */}
        {topTags.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1 mb-2">
              Top Tags
            </h3>
            <div className="flex flex-wrap gap-1.5 px-1">
              {topTags.map(([tag, count]) => {
                const isActive = filters.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      const current = filters.tags;
                      setFilters({
                        tags: current.includes(tag)
                          ? current.filter((t) => t !== tag)
                          : [...current, tag],
                      });
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all hover:scale-[1.03] active:scale-[0.97] ${
                      isActive
                        ? 'glass-neumorphic-pressed text-accent-primary font-bold'
                        : 'glass-neumorphic-raised text-surface-600'
                    }`}
                  >
                    <Hash className="w-3 h-3" />
                    {tag}
                    <span className="opacity-50">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 glass-subtle border-r border-glass-border overflow-hidden">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar (overlay) */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-72 z-50 glass border-r border-glass-border"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

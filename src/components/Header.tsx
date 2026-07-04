import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  LayoutGrid,
  List,
  Network,
  Sun,
  Moon,
  ArrowUpDown,
  SlidersHorizontal,
  Settings,
  MessageSquare,
  Home,
  BookOpen,
} from 'lucide-react';
import { useLinkMindStore } from '../store';
import type { ViewMode, SortOption } from '../types';

const viewOptions: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'home', icon: Home, label: 'Home' },
  { mode: 'grid', icon: BookOpen, label: 'Library' },
  { mode: 'mindmap', icon: Network, label: 'Mind Map' },
  { mode: 'chatbot', icon: MessageSquare, label: 'AI Chat' },
];

/** Check if viewMode is a library mode (grid or list) */
function isLibraryMode(mode: ViewMode): boolean {
  return mode === 'grid' || mode === 'list';
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'category', label: 'Category' },
  { value: 'status', label: 'Status' },
];

interface HeaderProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  onOpenSettings?: () => void;
}

export default function Header({ onToggleSidebar, onOpenSettings }: HeaderProps) {
  const {
    viewMode,
    setViewMode,
    sortOption,
    setSortOption,
    filters,
    setFilters,
    theme,
    toggleTheme,
    bookmarks,
  } = useLinkMindStore();

  const searchRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K and "/" focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (e.target as HTMLElement).tagName
        )
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeFilterCount =
    filters.categories.length +
    filters.statuses.length +
    filters.collectionIds.length +
    filters.tags.length;

  return (
    <header className="sticky top-0 z-40 glass border-b border-white/[0.04]">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-lg shadow-accent-primary/20">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <h1 className="text-lg font-bold tracking-tight hidden sm:block">
            <span className="bg-gradient-to-r from-accent-primary-light to-accent-secondary bg-clip-text text-transparent">
              Link
            </span>
            <span className="text-surface-900">Mind</span>
          </h1>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-xl relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-600 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search bookmarks… (⌘K)"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            className="w-full bg-surface-200/80 border border-glass-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-surface-900 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary/30 transition-all"
          />
          {filters.search && (
            <button
              onClick={() => setFilters({ search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-700 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sidebar Toggle (mobile) */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden relative p-2 rounded-xl bg-surface-200 hover:bg-surface-300 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-surface-700" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent-primary text-[10px] font-bold text-white flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        {/* Sort */}
        <div className="hidden md:flex items-center gap-1">
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-200/80 hover:bg-surface-300 border border-glass-border text-sm text-surface-700 transition-colors">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{sortOptions.find(s => s.value === sortOption)?.label}</span>
            </button>
            <div className="absolute right-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="glass rounded-xl py-1 min-w-[140px] shadow-xl">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortOption(opt.value)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-300 transition-colors ${
                      sortOption === opt.value ? 'text-accent-primary font-medium' : 'text-surface-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-surface-200/80 rounded-xl border border-glass-border p-0.5">
          {viewOptions.map(({ mode, icon: Icon, label }) => {
            const isActive = viewMode === mode || (mode === 'grid' && viewMode === 'list');
            return (
              <motion.button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`relative p-2 rounded-lg transition-colors ${
                  isActive ? 'text-white' : 'text-surface-600 hover:text-surface-700'
                }`}
                title={label}
              >
                {isActive && (
                  <motion.div
                    layoutId="viewToggle"
                    className="absolute inset-0 bg-accent-primary rounded-lg"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className="w-4 h-4 relative z-10" />
              </motion.button>
            );
          })}
        </div>

        {/* Grid / List sub-toggle (visible only in Library mode) */}
        {isLibraryMode(viewMode) && (
          <div className="flex items-center bg-surface-200/80 rounded-lg border border-glass-border p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-surface-400 text-surface-950'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-surface-400 text-surface-950'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Settings Toggle */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl bg-surface-200/80 hover:bg-surface-300 border border-glass-border text-surface-600 hover:text-surface-700 transition-colors"
          title="Open Settings & Analytics"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-surface-200/80 hover:bg-surface-300 border border-glass-border text-surface-600 hover:text-surface-700 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Bookmark Count */}
        <div className="hidden lg:flex items-center gap-1 text-xs text-surface-500 tabular-nums">
          <span className="font-semibold text-surface-700">{bookmarks.length}</span>
          <span>links</span>
        </div>
      </div>
    </header>
  );
}

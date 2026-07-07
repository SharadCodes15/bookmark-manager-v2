import { useEffect, useState, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { useLinkMindStore } from './store';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import HomeScreen from './components/HomeScreen';
import AddEditModal from './components/AddEditModal';
import FloatingAddButton from './components/FloatingAddButton';
import MindMap from './components/MindMap';
import SettingsModal from './components/SettingsModal';
import AIChatbot from './components/AIChatbot';

function App() {
  const { theme, loadData, isLoading, isAddModalOpen, openAddModal, viewMode } = useLinkMindStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open add link modal automatically if loaded via bookmarklet (quickadd=1)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('quickadd') === '1') {
      openAddModal();
    }
  }, [openAddModal]);

  useEffect(() => {
    document.documentElement.className = theme === 'light' ? 'light' : '';
  }, [theme]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl+N to open add modal
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        openAddModal();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openAddModal]);

  // Global drag & drop for JSON import
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/json') {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (data.bookmarks && data.collections) {
            useLinkMindStore.getState().importData(data);
          }
        } catch {
          // ignore invalid files
        }
      }
    },
    []
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center animate-pulse-glow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-surface-600 text-sm font-medium tracking-wide">Loading LinkMind…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-surface-0 text-surface-900 flex flex-col"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--color-surface-200)',
            color: 'var(--color-surface-900)',
            border: '1px solid var(--color-glass-border)',
            borderRadius: '12px',
            fontSize: '0.875rem',
            fontFamily: 'var(--font-sans)',
            backdropFilter: 'blur(12px)',
          },
        }}
      />

      <Header
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        isSidebarOpen={sidebarOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {viewMode !== 'home' && viewMode !== 'mindmap' && viewMode !== 'chatbot' && (
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}

        <main className="flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {viewMode === 'home' ? (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                className="flex-1 overflow-y-auto"
              >
                <HomeScreen />
              </motion.div>
            ) : viewMode === 'mindmap' ? (
              <motion.div
                key="mindmap"
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                className="flex-1 flex flex-col relative w-full h-full"
              >
                <MindMap />
              </motion.div>
            ) : viewMode === 'chatbot' ? (
              <motion.div
                key="chatbot"
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                className="flex-1 flex flex-col relative w-full h-full"
              >
                <AIChatbot />
              </motion.div>
            ) : (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                className="flex-1 overflow-y-auto"
              >
                <Dashboard />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {viewMode !== 'chatbot' && <FloatingAddButton />}

      <AnimatePresence>
        {isAddModalOpen && <AddEditModal />}
      </AnimatePresence>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;

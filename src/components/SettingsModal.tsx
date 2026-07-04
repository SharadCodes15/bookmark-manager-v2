import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Settings,
  BarChart3,
  Database,
  Upload,
  Download,
  Trash2,
  Tag,
  Folder,
  Layers,
  AlertTriangle,
  Bot,
  Eye,
  EyeOff,
  Sparkles,
  Link,
  Plus,
} from 'lucide-react';
import { useLinkMindStore } from '../store';
import { toast } from 'react-hot-toast';
import CleanupTab from './CleanupTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    bookmarks,
    collections,
    importData,
    exportData,
  } = useLinkMindStore();

  const [activeTab, setActiveTab] = useState<'stats' | 'data' | 'ai' | 'cleanup' | 'quickadd'>('stats');
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Settings local state
  const { aiSettings, saveAISettings } = useLinkMindStore();
  const [provider, setProvider] = useState(aiSettings.provider);
  const [apiKey, setApiKey] = useState(aiSettings.apiKey);
  const [endpoint, setEndpoint] = useState(aiSettings.endpoint);
  const [model, setModel] = useState(aiSettings.model);
  const [showApiKey, setShowApiKey] = useState(false);

  // Sync AI Settings when modal opens
  useEffect(() => {
    if (isOpen) {
      setProvider(aiSettings.provider);
      setApiKey(aiSettings.apiKey);
      setEndpoint(aiSettings.endpoint);
      setModel(aiSettings.model);
      setShowApiKey(false);
    }
  }, [isOpen, aiSettings]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Calculations for Stats
  const totalCount = bookmarks.length;
  const activeCount = bookmarks.filter((b) => b.status === 'Active').length;
  const idleCount = bookmarks.filter((b) => b.status === 'Idle').length;
  const toReadCount = bookmarks.filter((b) => b.status === 'To Read').length;

  const projectCount = bookmarks.filter((b) => b.category === 'Project').length;
  const areaCount = bookmarks.filter((b) => b.category === 'Area').length;
  const resourceCount = bookmarks.filter((b) => b.category === 'Resource').length;

  // Collection counts
  const collectionStats = collections.map((col) => {
    const count = bookmarks.filter((b) => b.collectionId === col.id).length;
    return { ...col, count };
  }).sort((a, b) => b.count - a.count);

  // Tag counts
  const tagCounts = bookmarks.reduce<Record<string, number>>((acc, b) => {
    b.tags.forEach((t) => {
      acc[t] = (acc[t] || 0) + 1;
    });
    return acc;
  }, {});
  const topTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Import JSON Handler
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        if (!data.bookmarks || !data.collections) {
          toast.error('Invalid file structure. Must contain bookmarks and collections.');
          return;
        }
        await importData(data);
      } catch (err) {
        toast.error('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Export JSON Handler
  const handleExport = () => {
    try {
      const data = exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `linkmind-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Backup exported successfully');
    } catch {
      toast.error('Failed to export backup');
    }
  };

  // Clear Database Handler
  const handleClearDatabase = async () => {
    const { db } = await import('../db');
    try {
      await db.bookmarks.clear();
      await db.collections.clear();
      // Reload store data
      await useLinkMindStore.getState().loadData();
      toast.success('Database cleared successfully');
      setConfirmClear(false);
      onClose();
    } catch {
      toast.error('Failed to clear database');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Modal Panel */}
          <motion.div
            className="glass relative z-10 w-full max-w-2xl rounded-2xl flex flex-col max-h-[85vh] overflow-hidden shadow-2xl"
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-accent-primary" />
                <h2 className="text-lg font-bold text-surface-950">Settings & Analytics</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-surface-600 hover:bg-surface-300 hover:text-surface-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs Selector */}
            <div className="flex flex-wrap border-b border-glass-border bg-surface-50/50 px-6 py-2 gap-2">
              <button
                onClick={() => setActiveTab('stats')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'stats'
                    ? 'bg-surface-300 text-surface-950 shadow-sm'
                    : 'text-surface-600 hover:bg-surface-200 hover:text-surface-800'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Analytics Dashboard
              </button>
              <button
                onClick={() => setActiveTab('data')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'data'
                    ? 'bg-surface-300 text-surface-950 shadow-sm'
                    : 'text-surface-600 hover:bg-surface-200 hover:text-surface-800'
                }`}
              >
                <Database className="w-4 h-4" />
                Data & Backups
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'ai'
                    ? 'bg-surface-300 text-surface-950 shadow-sm'
                    : 'text-surface-600 hover:bg-surface-200 hover:text-surface-800'
                }`}
              >
                <Bot className="w-4 h-4" />
                AI Assistant
              </button>
              <button
                onClick={() => setActiveTab('cleanup')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'cleanup'
                    ? 'bg-surface-300 text-surface-950 shadow-sm'
                    : 'text-surface-600 hover:bg-surface-200 hover:text-surface-800'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                Cleanup
              </button>
              <button
                onClick={() => setActiveTab('quickadd')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'quickadd'
                    ? 'bg-surface-300 text-surface-950 shadow-sm'
                    : 'text-surface-600 hover:bg-surface-200 hover:text-surface-800'
                }`}
              >
                <Link className="w-4 h-4" />
                Quick Add
              </button>
            </div>

            {/* Tab Body (scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'stats' ? (
                /* ── TAB 1: ANALYTICS ──────────────────────────────── */
                <div className="space-y-6">
                  {/* Grid cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="glass-subtle p-4 rounded-xl text-center">
                      <span className="text-xs font-semibold text-surface-600 uppercase tracking-wider block mb-1">
                        Total Bookmarks
                      </span>
                      <span className="text-3xl font-extrabold text-accent-primary tabular-nums">
                        {totalCount}
                      </span>
                    </div>
                    <div className="glass-subtle p-4 rounded-xl text-center">
                      <span className="text-xs font-semibold text-surface-600 uppercase tracking-wider block mb-1">
                        Collections
                      </span>
                      <span className="text-3xl font-extrabold text-accent-secondary tabular-nums">
                        {collections.length}
                      </span>
                    </div>
                    <div className="glass-subtle p-4 rounded-xl text-center">
                      <span className="text-xs font-semibold text-surface-600 uppercase tracking-wider block mb-1">
                        Unique Tags
                      </span>
                      <span className="text-3xl font-extrabold text-accent-success tabular-nums">
                        {Object.keys(tagCounts).length}
                      </span>
                    </div>
                  </div>

                  {/* Status stacked progress bar */}
                  <section className="glass-subtle p-5 rounded-2xl">
                    <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
                      Status Breakdown
                    </h3>
                    {totalCount === 0 ? (
                      <p className="text-xs text-surface-500 italic">No bookmarks to analyze</p>
                    ) : (
                      <div className="space-y-4">
                        {/* Stacked bar */}
                        <div className="h-4 rounded-full overflow-hidden flex bg-surface-200">
                          {activeCount > 0 && (
                            <div
                              style={{ width: `${(activeCount / totalCount) * 100}%` }}
                              className="bg-accent-success transition-all"
                              title={`Active: ${activeCount}`}
                            />
                          )}
                          {toReadCount > 0 && (
                            <div
                              style={{ width: `${(toReadCount / totalCount) * 100}%` }}
                              className="bg-accent-info transition-all"
                              title={`To Read: ${toReadCount}`}
                            />
                          )}
                          {idleCount > 0 && (
                            <div
                              style={{ width: `${(idleCount / totalCount) * 100}%` }}
                              className="bg-status-idle transition-all"
                              title={`Idle: ${idleCount}`}
                            />
                          )}
                        </div>

                        {/* Legend */}
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="flex flex-col items-center p-2 rounded-xl bg-surface-50/50">
                            <span className="flex items-center gap-1.5 font-medium text-status-active mb-0.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-accent-success" />
                              Active
                            </span>
                            <span className="font-bold text-sm text-surface-900 tabular-nums">
                              {activeCount} ({Math.round((activeCount / totalCount) * 100)}%)
                            </span>
                          </div>
                          <div className="flex flex-col items-center p-2 rounded-xl bg-surface-50/50">
                            <span className="flex items-center gap-1.5 font-medium text-accent-info mb-0.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-accent-info" />
                              To Read
                            </span>
                            <span className="font-bold text-sm text-surface-900 tabular-nums">
                              {toReadCount} ({Math.round((toReadCount / totalCount) * 100)}%)
                            </span>
                          </div>
                          <div className="flex flex-col items-center p-2 rounded-xl bg-surface-50/50">
                            <span className="flex items-center gap-1.5 font-medium text-status-idle mb-0.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-status-idle" />
                              Idle
                            </span>
                            <span className="font-bold text-sm text-surface-900 tabular-nums">
                              {idleCount} ({Math.round((idleCount / totalCount) * 100)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Two columns: Categories & Collections / Tags */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Categories */}
                    <div className="glass-subtle p-5 rounded-2xl">
                      <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-accent-primary" />
                        Categories
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-xs text-surface-700 mb-1">
                            <span>Projects</span>
                            <span className="font-semibold tabular-nums">{projectCount}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
                            <div
                              style={{ width: totalCount ? `${(projectCount / totalCount) * 100}%` : '0%' }}
                              className="h-full bg-category-project"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-surface-700 mb-1">
                            <span>Areas</span>
                            <span className="font-semibold tabular-nums">{areaCount}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
                            <div
                              style={{ width: totalCount ? `${(areaCount / totalCount) * 100}%` : '0%' }}
                              className="h-full bg-category-area"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-surface-700 mb-1">
                            <span>Resources</span>
                            <span className="font-semibold tabular-nums">{resourceCount}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
                            <div
                              style={{ width: totalCount ? `${(resourceCount / totalCount) * 100}%` : '0%' }}
                              className="h-full bg-category-resource"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Top Tags */}
                    <div className="glass-subtle p-5 rounded-2xl">
                      <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
                        <Tag className="w-4 h-4 text-accent-success" />
                        Top Tags
                      </h3>
                      {topTags.length === 0 ? (
                        <p className="text-xs text-surface-500 italic">No tags added yet</p>
                      ) : (
                        <div className="space-y-2">
                          {topTags.map(([tag, count]) => (
                            <div key={tag} className="flex items-center justify-between text-xs">
                              <span className="bg-surface-300 px-2 py-1 rounded-md text-surface-800 flex items-center gap-1 font-medium">
                                #{tag}
                              </span>
                              <span className="text-surface-600 font-bold tabular-nums">
                                {count} {count === 1 ? 'bookmark' : 'bookmarks'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Collections List */}
                  <section className="glass-subtle p-5 rounded-2xl">
                    <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
                      <Folder className="w-4 h-4 text-accent-secondary" />
                      Collection Stats
                    </h3>
                    {collectionStats.length === 0 ? (
                      <p className="text-xs text-surface-500 italic">No collections created yet</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                        {collectionStats.map((col) => (
                          <div key={col.id} className="flex items-center justify-between text-xs py-1 border-b border-glass-border last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                              <span className="font-semibold text-surface-850 truncate max-w-[200px]">{col.name}</span>
                            </div>
                            <span className="text-surface-600 font-bold tabular-nums">
                              {col.count} {col.count === 1 ? 'link' : 'links'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              ) : activeTab === 'data' ? (
                /* ── TAB 2: DATA & BACKUP ──────────────────────────── */
                <div className="space-y-6">
                  {/* Backup & Restore Panel */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Export */}
                    <div className="glass-subtle p-5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-surface-900 mb-2 flex items-center gap-2">
                          <Download className="w-4 h-4 text-accent-primary" />
                          Export Database
                        </h4>
                        <p className="text-xs text-surface-600 mb-4 leading-relaxed">
                          Download a single `.json` backup file containing all your bookmarks and custom collections. Keep this safe to migrate or restore your data.
                        </p>
                      </div>
                      <button
                        onClick={handleExport}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white py-2.5 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-accent-primary/20 transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        Export Backup JSON
                      </button>
                    </div>

                    {/* Import */}
                    <div className="glass-subtle p-5 rounded-2xl flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-surface-900 mb-2 flex items-center gap-2">
                          <Upload className="w-4 h-4 text-accent-success" />
                          Import Backup
                        </h4>
                        <p className="text-xs text-surface-600 mb-4 leading-relaxed">
                          Merge another backup file into your active Database. Bookmarks with matching IDs will be skipped, preventing duplicates.
                        </p>
                      </div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 bg-surface-300 hover:bg-surface-400 text-surface-850 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer border border-glass-border"
                      >
                        <Upload className="w-4 h-4" />
                        Select JSON File
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImport}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="border border-accent-danger/25 bg-accent-danger/5 rounded-2xl p-5 space-y-4">
                    <h4 className="text-sm font-bold text-accent-danger flex items-center gap-2">
                      <AlertTriangle className="w-4.5 h-4.5" />
                      Danger Zone
                    </h4>
                    <p className="text-xs text-surface-600 leading-relaxed">
                      Clearing the database will permanently delete all saved bookmarks and collections from IndexedDB. This action is irreversible! Make sure you have exported a backup.
                    </p>

                    {confirmClear ? (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleClearDatabase}
                          className="bg-accent-danger text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-accent-danger-dark transition-all cursor-pointer"
                        >
                          Yes, Delete Everything
                        </button>
                        <button
                          onClick={() => setConfirmClear(false)}
                          className="bg-surface-300 text-surface-800 px-4 py-2 rounded-xl text-xs font-medium hover:bg-surface-400 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClear(true)}
                        className="flex items-center gap-1.5 text-accent-danger hover:bg-accent-danger/10 px-4 py-2 border border-accent-danger/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        Clear IndexedDB Database
                      </button>
                    )}
                  </div>
                </div>
              ) : activeTab === 'cleanup' ? (
                <CleanupTab />
              ) : activeTab === 'ai' ? (
                /* ── TAB 3: AI CONFIGURATION ────────────────────────── */
                <div className="space-y-5">
                  <div className="glass-subtle p-5 rounded-2xl space-y-4">
                    <h4 className="text-sm font-bold text-surface-900 flex items-center gap-2">
                      <Sparkles className="w-4.5 h-4.5 text-accent-primary" />
                      Configure AI Chatbot Settings
                    </h4>
                    <p className="text-xs text-surface-600 leading-relaxed">
                      Select your favorite AI Provider. Use local Ollama for complete data privacy (requires Ollama running on your machine) or Cloud APIs for higher intelligence.
                    </p>

                    {/* Provider */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider">
                        AI Provider
                      </label>
                      <select
                        value={provider}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setProvider(val);
                          // Suggest default endpoints/models when switching
                          if (val === 'ollama') {
                            setEndpoint('http://localhost:11434');
                            setModel('llama3');
                          } else if (val === 'openai') {
                            setEndpoint('https://api.openai.com/v1');
                            setModel('gpt-4o');
                          } else if (val === 'gemini') {
                            setEndpoint('');
                            setModel('gemini-1.5-flash');
                          } else if (val === 'anthropic') {
                            setEndpoint('https://api.anthropic.com/v1');
                            setModel('claude-3-5-sonnet-20240620');
                          }
                        }}
                        className="w-full rounded-xl border border-glass-border bg-surface-200 px-4 py-2.5 text-sm text-surface-900 focus:border-accent-primary focus:outline-none"
                      >
                        <option value="ollama">Ollama (Local / Offline-first)</option>
                        <option value="openai">OpenAI (ChatGPT)</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="anthropic">Anthropic Claude</option>
                      </select>
                    </div>

                    {/* Endpoint (show for ollama, openai, anthropic) */}
                    {provider !== 'gemini' && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider">
                          API Endpoint URL
                        </label>
                        <input
                          type="url"
                          placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
                          value={endpoint}
                          onChange={(e) => setEndpoint(e.target.value)}
                          className="w-full rounded-xl border border-glass-border bg-surface-200 px-4 py-2.5 text-sm text-surface-900 focus:border-accent-primary focus:outline-none placeholder-surface-500"
                        />
                      </div>
                    )}

                    {/* API Key (show for cloud providers) */}
                    {provider !== 'ollama' && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider">
                          API Secret Key
                        </label>
                        <div className="relative">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            placeholder={`Enter your ${provider.toUpperCase()} API Key`}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full rounded-xl border border-glass-border bg-surface-200 pl-4 pr-10 py-2.5 text-sm text-surface-900 focus:border-accent-primary focus:outline-none placeholder-surface-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-700 transition-colors"
                          >
                            {showApiKey ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Model Name */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider">
                        Model Name / Identifier
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. gpt-4o, llama3, gemini-1.5-flash"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full rounded-xl border border-glass-border bg-surface-200 px-4 py-2.5 text-sm text-surface-900 focus:border-accent-primary focus:outline-none placeholder-surface-500"
                      />
                    </div>

                    {/* Save Button */}
                    <button
                      onClick={() => {
                        saveAISettings({ provider, apiKey, endpoint, model });
                      }}
                      className="w-full bg-gradient-to-r from-accent-primary to-accent-secondary text-white py-2.5 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-accent-primary/20 transition-all cursor-pointer mt-2"
                    >
                      Save Assistant Configuration
                    </button>
                  </div>
                </div>
              ) : (
                /* ── TAB 5: QUICK ADD BOOKMARKLET ────────────────────── */
                <div className="space-y-6">
                  <div className="glass-subtle p-6 rounded-2xl space-y-4">
                    <h4 className="text-sm font-bold text-surface-900 flex items-center gap-2">
                      <Link className="w-4.5 h-4.5 text-accent-primary" />
                      Quick Add Bookmarklet
                    </h4>
                    <p className="text-sm text-surface-700 leading-relaxed">
                      Drag this button to your bookmarks bar. Click it on any page to save that page to LinkMind.
                    </p>

                    <div className="flex flex-col items-center justify-center p-8 bg-surface-50/50 rounded-xl border border-glass-border">
                      <a
                        href={`javascript:void(window.open('${window.location.origin}/?quickadd=1&url='+encodeURIComponent(window.location.href)+'&title='+encodeURIComponent(document.title),'_blank'))`}
                        onClick={(e) => e.preventDefault()}
                        className="select-none cursor-grab inline-flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-accent-primary/25 hover:shadow-accent-primary/45 transition-all active:cursor-grabbing transform hover:-translate-y-0.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Add to LinkMind</span>
                      </a>
                      <span className="text-[11px] text-surface-500 mt-3 flex items-center gap-1">
                        <span>💡</span> Tip: Drag this button to your browser's Bookmarks/Favorites bar.
                      </span>
                    </div>

                    <div className="space-y-3 pt-2 text-xs text-surface-600 leading-relaxed">
                      <h5 className="font-semibold text-surface-800">How to use it:</h5>
                      <ol className="list-decimal pl-4 space-y-1.5">
                        <li>Make sure your browser's Bookmarks Bar is visible (Ctrl+Shift+B or Cmd+Shift+B).</li>
                        <li>Drag the gradient button above directly onto your bookmarks bar.</li>
                        <li>When browsing any webpage you want to save, click the **+ Add to LinkMind** bookmark on your bookmarks bar.</li>
                        <li>It will open LinkMind in a new tab with the page's title and URL automatically filled in the **Add Link** modal!</li>
                      </ol>

                      <div className="mt-3.5 p-3.5 bg-surface-100/40 rounded-xl border border-glass-border text-[11px] text-surface-600 space-y-1.5">
                        <p className="font-semibold text-surface-800">⚠️ Troubleshooting Notes:</p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><strong>Popup Blocker:</strong> If nothing happens when you click the bookmarklet, check the right side of your browser's address bar for a "Popup blocked" icon and choose "Always allow popups".</li>
                          <li><strong>Content Security Policy (CSP):</strong> Some highly secure websites (like GitHub, Google, or Twitter) use strict policies that block bookmarklet executions. If the button doesn't respond on a specific site, copy the URL manually. The bookmarklet will work on almost all standard articles, documentation pages, blogs, and other sites!</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-glass-border flex justify-end">
              <button
                onClick={onClose}
                className="bg-surface-350 hover:bg-surface-400 text-surface-900 px-5 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer"
              >
                Close Settings
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

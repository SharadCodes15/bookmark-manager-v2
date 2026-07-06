import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Square,
  Sparkles,
  Bot,
  User,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useLinkMindStore } from '../store';
import { streamAIChat } from '../services/aiService';
import Markdown from './Markdown';
import { toast } from 'react-hot-toast';

const PRESETS = [
  'What collections do I have and how many bookmarks are in each?',
  'List my bookmarks categorized as "Resource" that have tags.',
  'Show me bookmarks related to "Python" or developer tools.',
  'Explain what LinkMind is and how I can organize my links.',
];

export default function AIChatbot() {
  const {
    bookmarks,
    collections,
    aiSettings,
    chatSessions,
    currentSessionId,
    chatMessages,
    createChatSession,
    deleteChatSession,
    loadChatMessages,
    addChatMessage,
    updateLastMessage,
    commitLastMessageToDB,
  } = useLinkMindStore();

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Handle textarea height auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Create default session if none exists
  useEffect(() => {
    if (chatSessions.length === 0 && !isStreaming) {
      void createChatSession('Welcome Chat');
    } else if (currentSessionId === null && chatSessions.length > 0) {
      void loadChatMessages(chatSessions[0].id);
    }
  }, [chatSessions, currentSessionId, createChatSession, loadChatMessages, isStreaming]);

  const handleNewChat = async () => {
    if (isStreaming) {
      toast.error('Please stop the current stream before starting a new chat');
      return;
    }
    const newId = await createChatSession('New Conversation');
    if (newId) {
      void loadChatMessages(newId);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const messageContent = (textToSend || input).trim();
    if (!messageContent || isStreaming || !currentSessionId) return;

    setInput('');
    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    // 1. Add user message
    await addChatMessage(currentSessionId, 'user', messageContent);

    // 2. Add empty assistant message that will be streamed into
    await addChatMessage(currentSessionId, 'assistant', '');

    let fullResponse = '';
    try {
      // 3. Start streaming API call
      // Get the message history up to this point (excluding the empty assistant slot we just added)
      const messageHistory = useLinkMindStore.getState().chatMessages.slice(0, -1);

      await streamAIChat(
        messageHistory,
        bookmarks,
        collections,
        aiSettings,
        (chunk) => {
          fullResponse += chunk;
          updateLastMessage(fullResponse);
        },
        abortControllerRef.current.signal
      );

      // 4. Commit final response
      await commitLastMessageToDB();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast('Streaming stopped');
      } else {
        console.error(err);
        const errMsg = `⚠️ Error generating response: ${err.message || 'API request failed'}. Please check your AI Settings configuration.`;
        updateLastMessage(errMsg);
        await commitLastMessageToDB();
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      abortControllerRef.current = null;
      void commitLastMessageToDB();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden h-full relative">
      {/* ── Conversation Sidebar ───────────────────────────────────── */}
      <aside className="w-64 shrink-0 glass-subtle border-r border-glass-border flex flex-col hidden md:flex">
        {/* New Chat Button */}
        <div className="p-4 border-b border-glass-border">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-accent-primary to-accent-primary-dark text-white py-2 px-4 rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-accent-primary/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {chatSessions.map((session) => {
            const isActive = session.id === currentSessionId;
            return (
              <div
                key={session.id}
                onClick={() => !isActive && !isStreaming && loadChatMessages(session.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  isActive
                    ? 'glass-neumorphic-pressed text-surface-950 font-bold'
                    : 'glass-neumorphic-raised text-surface-650 hover:text-surface-900'
                } ${isStreaming && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MessageSquare className="w-4 h-4 shrink-0 text-accent-primary" />
                  <span className="truncate">{session.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isStreaming) void deleteChatSession(session.id);
                  }}
                  className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent-danger/25 text-surface-500 hover:text-accent-danger transition-all cursor-pointer"
                  disabled={isStreaming}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Main Chat Container ────────────────────────────────────── */}
      <section className="flex-1 flex flex-col bg-surface-0 relative overflow-hidden h-full">
        {/* Chat Header */}
        <div className="px-6 py-3.5 border-b border-glass-border flex items-center justify-between shrink-0 glass bg-surface-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-surface-950">LinkMind AI Assistant</h2>
              <span className="text-[10px] text-surface-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-success" />
                Active Context: {bookmarks.length} Bookmarks
              </span>
            </div>
          </div>
        </div>

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
          {chatMessages.length <= 2 ? (
            /* ── Chat Empty State (Helper Prompts) ───────────────────── */
            <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-12 text-center">
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 rounded-2xl bg-accent-primary/10 flex items-center justify-center mb-6 shadow-lg shadow-accent-primary/5 border border-accent-primary/10"
              >
                <Sparkles className="w-7 h-7 text-accent-primary" />
              </motion.div>
              <h3 className="text-lg font-bold text-surface-900 mb-2">Welcome to LinkMind AI</h3>
              <p className="text-xs text-surface-600 mb-8 max-w-sm">
                Ask anything about your collections, bookmarks, and tags, or hold a general assistant conversation. Try one of these prompts:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleSend(preset)}
                    className="glass-neumorphic-raised p-3 rounded-xl text-left text-xs text-surface-750 hover:text-surface-950 transition-all hover:scale-[1.02] active:scale-[0.98] flex gap-2 cursor-pointer"
                    disabled={isStreaming}
                  >
                    <HelpCircle className="w-4 h-4 text-accent-secondary shrink-0" />
                    <span>{preset}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Chat Message List ───────────────────────────────────── */
            <div className="max-w-3xl mx-auto space-y-5">
              {chatMessages
                .filter((m) => m.role !== 'system')
                .map((msg, index) => {
                  const isUser = msg.role === 'user';
                  // Skip empty assistant placeholder when rendering
                  if (msg.role === 'assistant' && !msg.content && isStreaming && index === chatMessages.length - 1) {
                    return null;
                  }

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* Avatar Left */}
                      {!isUser && (
                        <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center border border-accent-primary/15 shrink-0 shadow-sm mt-0.5">
                          <Bot className="w-4 h-4 text-accent-primary" />
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={`rounded-2xl px-4 py-3 max-w-[85%] sm:max-w-[75%] shadow-sm transition-all ${
                          isUser
                            ? 'glass-neumorphic-pressed bg-accent-primary/15 text-surface-950 rounded-tr-sm'
                            : 'glass-neumorphic-raised rounded-tl-sm'
                        }`}
                      >
                        {isUser ? (
                          <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        ) : (
                          <Markdown content={msg.content} />
                        )}
                      </div>

                      {/* Avatar Right */}
                      {isUser && (
                        <div className="w-8 h-8 rounded-lg bg-surface-300 flex items-center justify-center border border-glass-border shrink-0 shadow-sm mt-0.5">
                          <User className="w-4 h-4 text-surface-800" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}

              {/* Streaming loading indicator */}
              {isStreaming && chatMessages[chatMessages.length - 1]?.content === '' && (
                <div className="flex gap-3.5 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center border border-accent-primary/15 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-accent-primary" />
                  </div>
                  <div className="rounded-2xl px-4 py-3 glass border border-glass-border rounded-tl-sm max-w-sm flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input Bar ────────────────────────────────────────────── */}
        <div className="p-4 border-t border-glass-border shrink-0 glass bg-surface-50/50">
          <div className="max-w-3xl mx-auto relative flex flex-col gap-2.5">
            {/* Warning if API key is missing for cloud providers */}
            {aiSettings.provider !== 'ollama' && !aiSettings.apiKey.trim() && (
              <div className="flex items-center gap-1.5 text-[11px] text-accent-warning bg-accent-warning/15 px-3 py-1.5 rounded-lg border border-accent-warning/20">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>AI API key is missing. Configure it in Settings to enable chatbot responses.</span>
              </div>
            )}

            <div className="relative flex items-end">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Ask LinkMind AI assistant... (Enter to send, Shift+Enter for new line)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full glass-neumorphic-pressed rounded-2xl pl-4 pr-12 py-3 text-xs sm:text-sm text-surface-900 placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-accent-primary/30 resize-none max-h-[160px] overflow-y-auto leading-normal border-none"
                disabled={!currentSessionId}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                {isStreaming ? (
                  <button
                    onClick={handleStop}
                    className="p-2 rounded-xl bg-accent-danger text-white glass-neumorphic-raised hover:scale-[1.05] active:scale-[0.95] transition-all cursor-pointer flex items-center justify-center shrink-0"
                    title="Stop Generating"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || !currentSessionId}
                    className="p-2 rounded-xl bg-accent-primary text-white glass-neumorphic-raised hover:scale-[1.05] active:scale-[0.95] transition-all cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40"
                    title="Send Message"
                  >
                    <Send className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

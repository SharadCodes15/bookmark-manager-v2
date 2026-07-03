export interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: 'Project' | 'Area' | 'Resource';
  status: 'Active' | 'Idle' | 'To Read';
  tags: string[];
  collectionId?: string;
  faviconUrl: string;
  createdAt: number;
  matches?: any[];
}

export interface Collection {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface LinkMindExport {
  bookmarks: Bookmark[];
  collections: Collection[];
  exportDate: string;
}

export type ViewMode = 'grid' | 'list' | 'mindmap' | 'chatbot';
export type SortOption = 'newest' | 'oldest' | 'title' | 'category' | 'status';
export type Category = Bookmark['category'];
export type Status = Bookmark['status'];

export interface Filters {
  search: string;
  categories: Category[];
  statuses: Status[];
  collectionIds: string[];
  tags: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface AISettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama';
  apiKey: string;
  endpoint: string;
  model: string;
}

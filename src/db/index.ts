import Dexie, { type Table } from 'dexie';
import type { Bookmark, Collection, ChatSession, ChatMessage } from '../types';

export class LinkMindDB extends Dexie {
  bookmarks!: Table<Bookmark, string>;
  collections!: Table<Collection, string>;
  chatSessions!: Table<ChatSession, string>;
  chatMessages!: Table<ChatMessage, string>;

  constructor() {
    super('LinkMindDB');
    this.version(1).stores({
      bookmarks: 'id, title, url, category, status, collectionId, createdAt, *tags',
      collections: 'id, name, createdAt',
    });
    this.version(2).stores({
      bookmarks: 'id, title, url, category, status, collectionId, createdAt, *tags',
      collections: 'id, name, createdAt',
      chatSessions: 'id, title, createdAt, updatedAt',
      chatMessages: 'id, sessionId, role, createdAt',
    });
  }
}

export const db = new LinkMindDB();

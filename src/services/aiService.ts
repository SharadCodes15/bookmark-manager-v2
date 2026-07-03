import type { Bookmark, Collection, ChatMessage, AISettings } from '../types';

function serializeContext(bookmarks: Bookmark[], collections: Collection[]): string {
  const collectionsMap = new Map(collections.map((c) => [c.id, c.name]));
  const count = bookmarks.length;
  if (count === 0) {
    return 'The user has no bookmarks saved in LinkMind yet.';
  }

  const bookmarksSummary = bookmarks
    .map((b) => {
      const colName = b.collectionId ? collectionsMap.get(b.collectionId) || 'None' : 'None';
      return `- Title: ${b.title}\n  URL: ${b.url}\n  Category: ${b.category}\n  Status: ${b.status}\n  Collection: ${colName}\n  Tags: ${b.tags.length > 0 ? b.tags.join(', ') : 'None'}`;
    })
    .join('\n');

  return `The user has a personal bookmark database called LinkMind.
Total Bookmarks Count: ${count}
Here is the complete bookmarks data:
${bookmarksSummary}`;
}

export async function streamAIChat(
  messages: ChatMessage[],
  bookmarks: Bookmark[],
  collections: Collection[],
  settings: AISettings,
  onChunk: (chunk: string) => void,
  signal: AbortSignal
): Promise<void> {
  const context = serializeContext(bookmarks, collections);

  const systemPrompt = `You are LinkMind AI, a helpful personal assistant. You have full access to the user's bookmarks database to help search, organize, and answer questions.
${context}

When the user asks questions about their bookmarks (e.g. "what tags do I have?", "list my resources in Area", "what is in my Python collection?"), use the data above to answer accurately. 
If they ask general questions, hold a normal conversational dialog.
You must render your responses in Markdown format. Use headers, bullet points, bold text, and code blocks (with programming language flags) when appropriate. Keep your tone professional, friendly, and helpful.`;

  // Format messages for the API (except system prompt for Gemini which is separate or at the top)
  const provider = settings.provider;
  const endpoint = settings.endpoint.trim();
  const apiKey = settings.apiKey.trim();
  const model = settings.model.trim();

  if (provider === 'ollama') {
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const url = `${endpoint || 'http://localhost:11434'}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'llama3',
        messages: formattedMessages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama error (${response.status}): ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last partial line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            onChunk(parsed.message.content);
          } else if (parsed.response) {
            onChunk(parsed.response);
          }
        } catch (e) {
          console.error('Failed to parse Ollama stream line', e);
        }
      }
    }
  } else if (provider === 'openai') {
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const url = `${endpoint || 'https://api.openai.com/v1'}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: formattedMessages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI error (${response.status}): ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned || !cleaned.startsWith('data: ')) continue;
        const jsonText = cleaned.slice(6);
        if (jsonText === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonText);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch (e) {
          // ignore parsing error for chunk anomalies
        }
      }
    }
  } else if (provider === 'gemini') {
    // Gemini API
    // Format messages for Gemini API
    const contents = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
      {
        role: 'model',
        parts: [{ text: 'I understand. I am LinkMind AI. I will help the user based on their bookmarks database.' }],
      },
      ...messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ];

    const targetModel = model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini error (${response.status}): ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Gemini streams JSON arrays or chunk envelopes
      // Since it streams a JSON array of items, we can parse it incrementally
      // A safe way is to split by commas or extract text between candidate indices if SSE is not used, 
      // or we can parse individual stream objects if they come line by line.
      // Wait, Gemini streamGenerateContent returns JSON objects like:
      // [
      //   { "candidates": [{"content": {"parts": [{"text": "chunk"}]}}] }
      // ]
      // But it is returned as a JSON array, which is hard to parse incrementally with simple split('\n').
      // Let's do a search on how to parse Gemini streams, or use SSE if supported.
      // Wait, Gemini streamGenerateContent API returns a JSON array of parts, but it wraps it in `[\n` and `,\n`.
      // We can clean up the line by removing `[` or `,` or `]` and parsing as a single object:
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        let cleaned = line.trim();
        if (cleaned.startsWith('[')) cleaned = cleaned.slice(1).trim();
        if (cleaned.endsWith(',')) cleaned = cleaned.slice(0, -1).trim();
        if (cleaned.endsWith(']')) cleaned = cleaned.slice(0, -1).trim();
        if (!cleaned) continue;

        try {
          const parsed = JSON.parse(cleaned);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            onChunk(text);
          }
        } catch {
          // Chunk might span lines, continue accumulating
        }
      }
    }
  } else if (provider === 'anthropic') {
    // Anthropic API (Claude) - stream messages
    const formattedMessages = messages.map((m) => ({
      role: m.role === 'system' ? 'user' : m.role, // Anthropic messages API doesn't support system in messages list
      content: m.content,
    }));

    const url = `${endpoint || 'https://api.anthropic.com/v1'}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-html-in-templates': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-20240620',
        messages: formattedMessages,
        system: systemPrompt,
        stream: true,
        max_tokens: 4096,
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Anthropic error (${response.status}): ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned || !cleaned.startsWith('data: ')) continue;
        const jsonText = cleaned.slice(6);
        try {
          const parsed = JSON.parse(jsonText);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            onChunk(parsed.delta.text);
          }
        } catch {
          // ignore
        }
      }
    }
  } else {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

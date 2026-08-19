const { QdrantClient } = require("@qdrant/js-client-rest");
const localEmbeddings = require("./localEmbeddings");
const { LocalEmbeddings } = localEmbeddings;
const debugLogger = require("./debugLogger");
const { chunkConversation } = require("./conversationChunker");
const { chunkNote } = require("./noteChunker");

// Chunk points are addressed by packing the chunk index into the low digits of
// the note id, so one note's chunks never collide with another's. Requires
// MAX_CHUNKS_PER_NOTE < CHUNK_ID_STRIDE, which noteChunker's tests assert.
const CHUNK_ID_STRIDE = 1000;

class VectorIndex {
  constructor() {
    this.client = null;
    this.collectionName = "notes";
    this.noteChunksCollection = "note_chunks";
    this.conversationChunksCollection = "conversation_chunks";
  }

  init(port) {
    this.client = new QdrantClient({ host: "127.0.0.1", port });
  }

  async ensureCollection() {
    if (!this.client) return;
    try {
      await this.client.getCollection(this.collectionName);
    } catch {
      try {
        await this.client.createCollection(this.collectionName, {
          vectors: { size: 384, distance: "Cosine" },
        });
      } catch (err) {
        debugLogger.error("Failed to create Qdrant collection", { error: err.message });
      }
    }
  }

  async upsertNote(noteId, text, payload = {}) {
    if (!this.client) return;
    try {
      const vector = await localEmbeddings.embedText(text);
      await this.client.upsert(this.collectionName, {
        points: [{ id: noteId, vector: Array.from(vector), payload }],
      });
    } catch (err) {
      debugLogger.debug("Vector index upsert failed", { noteId, error: err.message });
    }
  }

  async deleteNote(noteId) {
    if (!this.client) return;
    try {
      await this.client.delete(this.collectionName, { points: [noteId] });
    } catch (err) {
      debugLogger.debug("Vector index delete failed", { noteId, error: err.message });
    }
  }

  async deleteBySpace(spaceId) {
    if (!this.client) return false;
    try {
      await this.client.delete(this.collectionName, {
        filter: { must: [{ key: "space_id", match: { value: spaceId } }] },
      });
      return true;
    } catch (err) {
      debugLogger.debug("Vector index space delete failed", { spaceId, error: err.message });
      return false;
    }
  }

  async search(queryText, limit = 5, filter) {
    if (!this.client) return [];
    try {
      const vector = await localEmbeddings.embedText(queryText);
      const results = await this.client.search(this.collectionName, {
        vector: Array.from(vector),
        limit,
        ...(filter ? { filter } : {}),
      });
      return results.map((r) => ({ noteId: r.id, score: r.score }));
    } catch (err) {
      debugLogger.debug("Vector search failed", { error: err.message });
      return [];
    }
  }

  async reindexAll(notes, onProgress) {
    if (!this.client) return { failed: notes.length };
    const BATCH_SIZE = 50;
    let failed = 0;
    for (let i = 0; i < notes.length; i += BATCH_SIZE) {
      const batch = notes.slice(i, i + BATCH_SIZE);
      const texts = batch.map((n) =>
        LocalEmbeddings.noteEmbedText(n.title, n.content, n.enhanced_content)
      );
      try {
        const vectors = await localEmbeddings.embedTexts(texts);
        const points = batch.map((n, j) => ({
          id: n.id,
          vector: Array.from(vectors[j]),
          payload: { space_id: n.space_id, folder_id: n.folder_id ?? null },
        }));
        await this.client.upsert(this.collectionName, { points });
      } catch (err) {
        failed += batch.length;
        debugLogger.debug("Vector reindex batch failed", { offset: i, error: err.message });
      }
      if (onProgress) onProgress(Math.min(i + BATCH_SIZE, notes.length), notes.length);
    }
    return { failed };
  }

  // ------------------------------------------------------------ note chunks
  //
  // The `notes` collection holds one vector per note over its first 1500
  // characters. This one holds a vector per passage, over the whole note
  // including its transcript — so a long meeting is searchable past its
  // opening minute, and a hit can point at the part that actually matched.

  async ensureNoteChunksCollection() {
    if (!this.client) return;
    try {
      await this.client.getCollection(this.noteChunksCollection);
    } catch {
      try {
        await this.client.createCollection(this.noteChunksCollection, {
          vectors: { size: 384, distance: "Cosine" },
        });
      } catch (err) {
        debugLogger.error("Failed to create note_chunks collection", { error: err.message });
      }
    }
  }

  async upsertNoteChunks(note) {
    if (!this.client || !note?.id) return;
    try {
      // Replaced wholesale: an edit that shortens a note would otherwise leave
      // its old tail chunks behind, still matching text that no longer exists.
      await this.deleteNoteChunks(note.id);

      const chunks = chunkNote({
        title: note.title,
        content: note.content,
        enhancedContent: note.enhanced_content,
        transcript: note.transcript,
      });
      if (chunks.length === 0) return;

      const vectors = await localEmbeddings.embedTexts(chunks.map((c) => c.text));
      const points = chunks.map((chunk, i) => ({
        id: note.id * CHUNK_ID_STRIDE + chunk.chunkIndex,
        vector: Array.from(vectors[i]),
        payload: {
          note_id: note.id,
          chunk_index: chunk.chunkIndex,
          space_id: note.space_id ?? null,
          folder_id: note.folder_id ?? null,
          // Carried so a hit returns the passage itself; without it every
          // result needs a second read just to show what matched.
          text: chunk.text,
        },
      }));
      await this.client.upsert(this.noteChunksCollection, { points });
    } catch (err) {
      debugLogger.debug("Note chunk upsert failed", { noteId: note.id, error: err.message });
    }
  }

  async deleteNoteChunks(noteId) {
    if (!this.client) return;
    try {
      await this.client.delete(this.noteChunksCollection, {
        filter: { must: [{ key: "note_id", match: { value: noteId } }] },
      });
    } catch (err) {
      debugLogger.debug("Note chunk delete failed", { noteId, error: err.message });
    }
  }

  /** Whether this note already has passage vectors — drives the backfill. */
  async hasNoteChunks(noteId) {
    if (!this.client) return true;
    try {
      const result = await this.client.count(this.noteChunksCollection, {
        filter: { must: [{ key: "note_id", match: { value: noteId } }] },
        exact: false,
      });
      return (result?.count ?? 0) > 0;
    } catch {
      // Claim it is indexed on failure: re-embedding a note that already has
      // chunks is wasted CPU, and the next launch tries again anyway.
      return true;
    }
  }

  async deleteNoteChunksBySpace(spaceId) {
    if (!this.client) return;
    try {
      await this.client.delete(this.noteChunksCollection, {
        filter: { must: [{ key: "space_id", match: { value: spaceId } }] },
      });
    } catch (err) {
      debugLogger.debug("Note chunk space delete failed", { spaceId, error: err.message });
    }
  }

  /**
   * Passage search, collapsed to one hit per note.
   *
   * A note whose every chunk matches would otherwise fill the whole result set
   * and crowd out other notes that answer the question just as well. The best
   * passage wins and represents its note.
   */
  async searchNoteChunks(queryText, limit = 8, filter) {
    if (!this.client) return [];
    try {
      const vector = await localEmbeddings.embedText(queryText);
      const results = await this.client.search(this.noteChunksCollection, {
        vector: Array.from(vector),
        // Over-fetched because several hits can collapse onto one note.
        limit: limit * 4,
        with_payload: true,
        ...(filter ? { filter } : {}),
      });

      const best = new Map();
      for (const hit of results) {
        const noteId = hit.payload?.note_id;
        if (typeof noteId !== "number") continue;
        const existing = best.get(noteId);
        if (!existing || hit.score > existing.score) {
          best.set(noteId, {
            noteId,
            score: hit.score,
            chunkIndex: hit.payload?.chunk_index ?? 0,
            snippet: typeof hit.payload?.text === "string" ? hit.payload.text : null,
          });
        }
      }

      return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (err) {
      debugLogger.debug("Note chunk search failed", { error: err.message });
      return [];
    }
  }

  async reindexAllNoteChunks(notes, onProgress) {
    if (!this.client) return { failed: 0 };
    let failed = 0;
    for (let i = 0; i < notes.length; i++) {
      try {
        await this.upsertNoteChunks(notes[i]);
      } catch {
        failed += 1;
      }
      if (onProgress) onProgress(i + 1, notes.length);
    }
    return { failed };
  }

  async ensureConversationChunksCollection() {
    if (!this.client) return;
    try {
      await this.client.getCollection(this.conversationChunksCollection);
    } catch {
      try {
        await this.client.createCollection(this.conversationChunksCollection, {
          vectors: { size: 384, distance: "Cosine" },
        });
      } catch (err) {
        debugLogger.error("Failed to create conversation_chunks collection", {
          error: err.message,
        });
      }
    }
  }

  async upsertConversationChunks(conversationId, title, messages) {
    if (!this.client) return;
    try {
      await this.deleteConversationChunks(conversationId);
      const chunks = chunkConversation(title, messages);
      if (chunks.length === 0) return;

      const texts = chunks.map((c) => c.text);
      const vectors = await localEmbeddings.embedTexts(texts);
      const points = chunks.map((c, i) => ({
        id: conversationId * 1000 + c.chunkIndex,
        vector: Array.from(vectors[i]),
        payload: { conversation_id: conversationId, chunk_index: c.chunkIndex },
      }));
      await this.client.upsert(this.conversationChunksCollection, { points });
    } catch (err) {
      debugLogger.debug("Conversation chunks upsert failed", {
        conversationId,
        error: err.message,
      });
    }
  }

  async deleteConversationChunks(conversationId) {
    if (!this.client) return;
    try {
      await this.client.delete(this.conversationChunksCollection, {
        filter: { must: [{ key: "conversation_id", match: { value: conversationId } }] },
      });
    } catch (err) {
      debugLogger.debug("Conversation chunks delete failed", {
        conversationId,
        error: err.message,
      });
    }
  }

  async searchConversations(queryText, limit = 10) {
    if (!this.client) return [];
    try {
      const vector = await localEmbeddings.embedText(queryText);
      const results = await this.client.search(this.conversationChunksCollection, {
        vector: Array.from(vector),
        limit: limit * 3,
      });

      const bestByConversation = new Map();
      for (const r of results) {
        if (r.score < 0.3) continue;
        const convId = r.payload.conversation_id;
        if (!bestByConversation.has(convId) || r.score > bestByConversation.get(convId)) {
          bestByConversation.set(convId, r.score);
        }
      }

      return [...bestByConversation.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([conversationId, score]) => ({ conversationId, score }));
    } catch (err) {
      debugLogger.debug("Conversation search failed", { error: err.message });
      return [];
    }
  }

  async reindexAllConversations(conversations, onProgress) {
    if (!this.client) return;
    const BATCH_SIZE = 50;
    for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
      const batch = conversations.slice(i, i + BATCH_SIZE);
      for (const conv of batch) {
        try {
          const chunks = chunkConversation(conv.title, conv.messages);
          if (chunks.length === 0) continue;

          const texts = chunks.map((c) => c.text);
          const vectors = await localEmbeddings.embedTexts(texts);
          const points = chunks.map((c, j) => ({
            id: conv.id * 1000 + c.chunkIndex,
            vector: Array.from(vectors[j]),
            payload: { conversation_id: conv.id, chunk_index: c.chunkIndex },
          }));
          await this.client.upsert(this.conversationChunksCollection, { points });
        } catch (err) {
          debugLogger.debug("Conversation reindex failed", {
            conversationId: conv.id,
            error: err.message,
          });
        }
      }
      if (onProgress)
        onProgress(Math.min(i + BATCH_SIZE, conversations.length), conversations.length);
    }
  }

  isReady() {
    return this.client !== null;
  }

  /**
   * Drops every collection and recreates them empty, for "reset app data".
   *
   * Vectors live in Qdrant's own store, not the SQLite file, so erasing the
   * database leaves the whole index standing. Semantic search would keep
   * returning notes that no longer exist — and each chunk point carries its
   * passage text in the payload, so the deleted content comes back with them.
   */
  async resetAll() {
    if (!this.client) return;
    for (const name of [
      this.collectionName,
      this.noteChunksCollection,
      this.conversationChunksCollection,
    ]) {
      try {
        await this.client.deleteCollection(name);
      } catch (err) {
        debugLogger.error("Failed to delete Qdrant collection", {
          collection: name,
          error: err.message,
        });
      }
    }
    await this.ensureCollection();
    await this.ensureNoteChunksCollection();
    await this.ensureConversationChunksCollection();
  }
}

module.exports = new VectorIndex();

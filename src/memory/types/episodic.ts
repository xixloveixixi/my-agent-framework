/**
 * Episodic Memory - 情景记忆
 * 特点：
 * - SQLite+Qdrant混合存储架构
 * - 支持时间序列和会话级检索
 * - 结构化过滤 + 语义向量检索
 */

import { BaseMemory, MemoryItem, MemoryConfig, TFIDFEmbedding } from '../base';
import { SimpleVectorStore } from './vector-store';
import { IMemoryStore } from '../store';

export interface EpisodicEvent {
  id: string;
  content: string;
  timestamp: number;
  duration?: number;
  location?: string;
  actors?: string[];
  emotion?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 情景记忆 - 事件序列存储
 */
export class EpisodicMemory implements BaseMemory {
  private events: Map<string, EpisodicEvent> = new Map();
  private vectorStore: SimpleVectorStore;
  private store?: IMemoryStore;
  private maxSize: number;
  private tfidf: TFIDFEmbedding;
  private sessions: Map<string, string[]> = new Map();  // 会话索引
  private useExternalStore: boolean;

  constructor(
    config?: MemoryConfig,
    store?: IMemoryStore
  ) {
    this.maxSize = config?.maxSize || 1000;
    this.vectorStore = new SimpleVectorStore();
    this.tfidf = new TFIDFEmbedding();
    this.store = store;
    this.useExternalStore = !!store;

    if (this.useExternalStore) {
      console.log('📦 Episodic Memory 使用外部存储');
    }
  }

  /**
   * 添加情景记忆
   */
  async add(content: string, metadata?: Record<string, unknown>): Promise<void> {
    const sessionId = (metadata?.session_id as string) || 'default';

    const event: EpisodicEvent = {
      id: `ep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      timestamp: Date.now(),
      ...(metadata as Partial<EpisodicEvent>),
    };

    // 更新会话索引
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
    }
    this.sessions.get(sessionId)!.push(event.id);

    if (this.useExternalStore && this.store) {
      const item: MemoryItem = {
        id: event.id,
        content: event.content,
        timestamp: event.timestamp,
        metadata: event.metadata,
      };
      await this.store.add('episodic', item);
    } else {
      this.events.set(event.id, event);

      // 添加到向量存储用于语义检索
      this.vectorStore.add({
        id: event.id,
        content: event.content,
        metadata: {
          timestamp: event.timestamp,
          session_id: sessionId,
          importance: metadata?.importance ?? 0.5,
        },
      });

      // 容量控制
      if (this.events.size > this.maxSize) {
        const oldest = this.getOldestEventId();
        if (oldest) {
          this.events.delete(oldest);
        }
      }
    }
  }

  /**
   * 混合检索：结构化过滤 + 语义向量检索
   */
  async search(query: string, limit: number = 5): Promise<MemoryItem[]> {
    if (this.useExternalStore && this.store) {
      return this.store.search('episodic', query, limit);
    }

    // 1. 向量语义检索
    const hits = this.vectorStore.searchWithScores(query, limit * 5);

    // 2. 计算综合评分
    const scoredResults: Array<{ score: number; item: MemoryItem }> = [];

    for (const hit of hits) {
      const event = this.events.get(hit.item.id);
      if (!event) continue;

      const score = this.calculateEpisodeScore(hit);
      const memoryItem: MemoryItem = {
        id: event.id,
        content: event.content,
        timestamp: event.timestamp,
        metadata: event.metadata,
      };

      scoredResults.push({ score, item: memoryItem });
    }

    // 3. 排序返回
    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.slice(0, limit).map(s => s.item);
  }

  /**
   * 结构化过滤 + 语义检索（高级API）
   */
  async retrieve(
    query: string,
    limit: number = 5,
    options?: {
      sessionId?: string;
      startTime?: number;
      endTime?: number;
      minImportance?: number;
      userId?: string;
    }
  ): Promise<MemoryItem[]> {
    // 1. 结构化预过滤
    let candidateIds: Set<string> | null = null;

    if (options?.sessionId) {
      const sessionIds = this.sessions.get(options.sessionId);
      if (sessionIds) {
        candidateIds = new Set(sessionIds);
      }
    }

    // 2. 向量检索
    const hits = this.vectorStore.searchWithScores(query, limit * 5);

    // 3. 综合评分与过滤
    const results: Array<{ score: number; item: MemoryItem }> = [];

    for (const hit of hits) {
      const hitId = hit.item.id;
      const hitMetadata = hit.item.metadata;

      // 过滤：检查是否在候选集中
      if (candidateIds && !candidateIds.has(hitId)) {
        continue;
      }

      // 过滤：时间范围
      const hitTimestamp = (hitMetadata?.timestamp as number) || 0;
      if (options?.startTime && hitTimestamp < options.startTime) {
        continue;
      }
      if (options?.endTime && hitTimestamp > options.endTime) {
        continue;
      }

      // 过滤：最小重要性
      const importance = (hitMetadata?.importance as number) ?? 0.5;
      if (options?.minImportance && importance < options.minImportance) {
        continue;
      }

      const event = this.events.get(hitId);
      if (!event) continue;

      const score = this.calculateEpisodeScore(hit);
      results.push({
        score,
        item: {
          id: event.id,
          content: event.content,
          timestamp: event.timestamp,
          metadata: event.metadata,
        },
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map(r => r.item);
  }

  /**
   * 情景记忆评分算法
   * 公式：(向量相似度 × 0.8 + 时间近因性 × 0.2) × 重要性权重
   */
  private calculateEpisodeScore(hit: { item: { id: string; metadata?: Record<string, unknown> }; score: number }): number {
    // 向量分数（简化，假设 score 是余弦相似度）
    const vecScore = hit.score || 0;

    // 时间近因性分数
    const recencyScore = this.calculateRecency(hit.item.metadata?.timestamp as number);

    // 重要性
    const importance = (hit.item.metadata?.importance as number) ?? 0.5;

    // 评分公式
    const baseRelevance = vecScore * 0.8 + recencyScore * 0.2;
    const importanceWeight = 0.8 + importance * 0.4;

    return baseRelevance * importanceWeight;
  }

  /**
   * 计算时间近因性
   */
  private calculateRecency(timestamp?: number): number {
    if (!timestamp) return 0;

    const now = Date.now();
    const age = now - timestamp;
    const days = age / (1000 * 60 * 60 * 24);

    // 30天内线性衰减，之后为0
    return Math.max(0, 1 - days / 30);
  }

  /**
   * 获取所有情景记忆
   */
  async getAll(): Promise<MemoryItem[]> {
    if (this.useExternalStore && this.store) {
      return this.store.getAll('episodic');
    }

    return Array.from(this.events.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(e => ({
        id: e.id,
        content: e.content,
        timestamp: e.timestamp,
        metadata: e.metadata,
      }));
  }

  /**
   * 清空情景记忆
   */
  async clear(): Promise<void> {
    if (this.useExternalStore && this.store) {
      await this.store.clear('episodic');
    } else {
      this.events.clear();
      this.vectorStore.clear();
      this.sessions.clear();
    }
  }

  /**
   * 获取记忆数量
   */
  size(): number {
    if (this.useExternalStore && this.store) {
      return this.store.count('episodic');
    }
    return this.events.size;
  }

  /**
   * 获取时间范围内的记忆
   */
  async getByTimeRange(startTime: number, endTime: number): Promise<MemoryItem[]> {
    const all = await this.getAll();
    return all
      .filter(e => e.timestamp >= startTime && e.timestamp <= endTime)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 获取最近的 N 个事件
   */
  async getRecent(count: number): Promise<EpisodicEvent[]> {
    const all = await this.getAll();
    return all.slice(0, count).map(e => ({
      id: e.id,
      content: e.content,
      timestamp: e.timestamp,
      metadata: e.metadata,
    })) as EpisodicEvent[];
  }

  /**
   * 按时间线重建
   */
  async reconstructTimeline(): Promise<Array<{ time: number; event: string }>> {
    const all = await this.getAll();
    return all
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(e => ({
        time: e.timestamp,
        event: e.content,
      }));
  }

  /**
   * 获取特定地点的记忆
   */
  async getByLocation(location: string): Promise<MemoryItem[]> {
    const all = await this.getAll();
    return all
      .filter(e => (e.metadata?.location as string)?.toLowerCase() === location.toLowerCase())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 获取特定情感标记的记忆
   */
  async getByEmotion(emotion: string): Promise<MemoryItem[]> {
    const all = await this.getAll();
    return all
      .filter(e => (e.metadata?.emotion as string)?.toLowerCase() === emotion.toLowerCase())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 提取关键模式
   */
  async extractPatterns(): Promise<Record<string, number>> {
    const patterns: Record<string, number> = {};
    const all = await this.getAll();

    all.forEach(event => {
      const words = event.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3) {
          patterns[word] = (patterns[word] || 0) + 1;
        }
      });
    });

    return patterns;
  }

  /**
   * 删除指定记忆
   */
  async delete(id: string): Promise<boolean> {
    if (this.useExternalStore && this.store) {
      return this.store.delete('episodic', id);
    }

    const event = this.events.get(id);
    if (event) {
      // 从会话索引中移除
      const sessionId = event.metadata?.session_id as string;
      if (sessionId) {
        const sessionIds = this.sessions.get(sessionId);
        if (sessionIds) {
          const index = sessionIds.indexOf(id);
          if (index > -1) {
            sessionIds.splice(index, 1);
          }
        }
      }
    }

    return this.events.delete(id);
  }

  /**
   * 获取会话列表
   */
  getSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * 获取指定会话的记忆
   */
  async getBySession(sessionId: string): Promise<MemoryItem[]> {
    const sessionIds = this.sessions.get(sessionId);
    if (!sessionIds) return [];

    const all = await this.getAll();
    return all.filter(e => sessionIds.includes(e.id));
  }

  private getOldestEventId(): string | null {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    this.events.forEach((event, id) => {
      if (event.timestamp < oldestTime) {
        oldestTime = event.timestamp;
        oldestId = id;
      }
    });

    return oldestId;
  }
}

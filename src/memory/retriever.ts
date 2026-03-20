/**
 * Memory Retriever - 统一检索层
 * 所有记忆类型的统一检索接口
 */

import { MemoryItem } from './base';
import { IMemoryStore } from './store';

export interface RetrievalOptions {
  query: string;
  limit?: number;
  memoryTypes?: string[];
  minImportance?: number;
  maxAge?: number;  // 最大年龄（毫秒）
  sessionId?: string;
}

export interface RetrievalResult {
  id: string;
  content: string;
  memory_type: string;
  importance: number;
  timestamp: number;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * 统一检索器
 */
export class MemoryRetriever {
  private store: IMemoryStore;
  private defaultLimit: number;

  constructor(store: IMemoryStore, defaultLimit: number = 10) {
    this.store = store;
    this.defaultLimit = defaultLimit;
  }

  /**
   * 统一检索接口
   */
  async retrieve(options: RetrievalOptions): Promise<RetrievalResult[]> {
    const {
      query,
      limit = this.defaultLimit,
      memoryTypes,
      minImportance = 0,
      maxAge,
      sessionId,
    } = options;

    const types = memoryTypes || ['working', 'episodic', 'semantic', 'perceptual'];
    const results: RetrievalResult[] = [];
    const now = Date.now();

    for (const memoryType of types) {
      const items = await this.store.search(memoryType, query, limit);

      for (const item of items) {
        // 过滤重要性
        const importance = (item.metadata?.importance as number) ?? 0.5;
        if (importance < minImportance) continue;

        // 过滤年龄
        if (maxAge && item.timestamp) {
          if (now - item.timestamp > maxAge) continue;
        }

        // 过滤会话
        if (sessionId && item.metadata?.session_id !== sessionId) continue;

        // 计算相关性分数
        const score = this.calculateScore(query, item);

        results.push({
          id: item.id,
          content: item.content,
          memory_type: memoryType,
          importance,
          timestamp: item.timestamp || 0,
          score,
          metadata: item.metadata,
        });
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 计算相关性分数
   */
  private calculateScore(query: string, item: MemoryItem): number {
    let score = 0;
    const lowerQuery = query.toLowerCase();
    const content = item.content.toLowerCase();

    // 精确匹配
    if (content.includes(lowerQuery)) {
      score += 10;
    }

    // 词匹配
    const queryWords = lowerQuery.split(/\s+/);
    const contentWords = content.split(/\s+/);
    queryWords.forEach(word => {
      if (contentWords.includes(word)) {
        score += 2;
      }
    });

    // 重要性加权
    const importance = (item.metadata?.importance as number) ?? 0.5;
    score *= (0.5 + importance);

    // 时间衰减（越新分数越高）
    if (item.timestamp) {
      const age = Date.now() - item.timestamp;
      const days = age / (1000 * 60 * 60 * 24);
      const timeFactor = Math.max(0.5, 1 - days / 30); // 30天后不再加分
      score *= timeFactor;
    }

    return score;
  }

  /**
   * 获取最近记忆
   */
  async getRecent(memoryType: string, count: number = 10): Promise<RetrievalResult[]> {
    const items = await this.store.getAll(memoryType);

    return items
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, count)
      .map(item => ({
        id: item.id,
        content: item.content,
        memory_type: memoryType,
        importance: (item.metadata?.importance as number) ?? 0.5,
        timestamp: item.timestamp || 0,
        score: 1,
        metadata: item.metadata,
      }));
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<Record<string, number>> {
    const types = ['working', 'episodic', 'semantic', 'perceptual'];
    const stats: Record<string, number> = {};

    for (const type of types) {
      stats[type] = await this.store.count(type);
    }

    return stats;
  }
}

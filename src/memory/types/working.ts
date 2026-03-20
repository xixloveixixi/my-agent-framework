/**
 * Working Memory - 工作记忆
 * 特点：
 * - 容量有限（默认50条）+ TTL自动清理
 * - 纯内存存储，访问速度极快
 * - 混合检索：TF-IDF向量化 + 关键词匹配
 */

import { BaseMemory, MemoryItem, MemoryConfig, TFIDFEmbedding } from '../base';
import { IMemoryStore } from '../store';

interface WorkingMemoryConfig {
  working_memory_capacity?: number;
  working_memory_ttl?: number;
}

export class WorkingMemory implements BaseMemory {
  private items: Map<string, MemoryItem> = new Map();
  private store?: IMemoryStore;
  private maxCapacity: number;
  private maxAgeMinutes: number;
  private tfidf: TFIDFEmbedding;
  private useExternalStore: boolean;

  constructor(config?: MemoryConfig & WorkingMemoryConfig, store?: IMemoryStore) {
    this.maxCapacity = (config as WorkingMemoryConfig)?.working_memory_capacity || 50;
    this.maxAgeMinutes = (config as WorkingMemoryConfig)?.working_memory_ttl || 60;
    this.tfidf = new TFIDFEmbedding();
    this.store = store;
    this.useExternalStore = !!store;

    if (this.useExternalStore) {
      console.log('📦 Working Memory 使用外部存储');
    } else {
      // 启动过期清理定时器
      this.startCleanupTimer();
    }
  }

  /**
   * 添加工作记忆
   */
  async add(content: string, metadata?: Record<string, unknown>): Promise<void> {
    this.expireOldMemories();

    if (this.items.size >= this.maxCapacity) {
      this.removeLowestPriorityMemory();
    }

    const item: MemoryItem = {
      id: `wm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      timestamp: Date.now(),
      metadata,
    };

    if (this.useExternalStore && this.store) {
      await this.store.add('working', item);
    } else {
      this.items.set(item.id, item);
    }
  }

  /**
   * 混合检索：TF-IDF向量化 + 关键词匹配
   */
  async search(query: string, limit: number = 5): Promise<MemoryItem[]> {
    this.expireOldMemories();

    const items = await this.getAll();

    // TF-IDF 向量检索
    const vectorScores = await this.tryTfidfSearch(query, items);

    // 计算综合分数
    const scoredMemories: Array<{ score: number; item: MemoryItem }> = [];

    for (const item of items) {
      const vectorScore = vectorScores.get(item.id) || 0;
      const keywordScore = this.calculateKeywordScore(query, item.content);

      // 混合评分
      const baseRelevance = vectorScore > 0
        ? vectorScore * 0.7 + keywordScore * 0.3
        : keywordScore;

      const timeDecay = this.calculateTimeDecay(item.timestamp);
      const importanceWeight = 0.8 + ((item.metadata?.importance as number) || 0.5) * 0.4;

      const finalScore = baseRelevance * timeDecay * importanceWeight;

      if (finalScore > 0) {
        scoredMemories.push({ score: finalScore, item });
      }
    }

    scoredMemories.sort((a, b) => b.score - a.score);
    return scoredMemories.slice(0, limit).map(s => s.item);
  }

  /**
   * 尝试 TF-IDF 向量检索
   */
  private async tryTfidfSearch(query: string, items: MemoryItem[]): Promise<Map<string, number>> {
    const scores = new Map<string, number>();

    try {
      const queryVector = await this.tfidf.embed(query);
      const contents = items.map(i => i.content);

      // 批量生成向量
      const docVectors = await this.tfidf.embedBatch(contents);

      // 计算余弦相似度
      for (let i = 0; i < items.length; i++) {
        const similarity = this.cosineSimilarity(queryVector, docVectors[i]);
        if (similarity > 0) {
          scores.set(items[i].id, similarity);
        }
      }
    } catch {
      // TF-IDF 失败时返回空
    }

    return scores;
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * 计算关键词匹配分数
   */
  private calculateKeywordScore(query: string, content: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    // 精确匹配
    if (contentLower.includes(queryLower)) {
      return 1.0;
    }

    // 词匹配
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);
    const contentWords = contentLower.split(/\s+/);

    let matchCount = 0;
    for (const word of queryWords) {
      if (contentWords.includes(word)) {
        matchCount++;
      }
    }

    return queryWords.length > 0 ? matchCount / queryWords.length : 0;
  }

  /**
   * 计算时间衰减
   */
  private calculateTimeDecay(timestamp: number): number {
    const ageMinutes = (Date.now() - timestamp) / (1000 * 60);
    // 指数衰减：1小时后衰减到约 36.7%，24小时后接近 0
    return Math.exp(-ageMinutes / this.maxAgeMinutes);
  }

  /**
   * 过期清理
   */
  private expireOldMemories(): void {
    const now = Date.now();
    const maxAgeMs = this.maxAgeMinutes * 60 * 1000;
    const keysToDelete: string[] = [];

    this.items.forEach((item, key) => {
      if (now - item.timestamp > maxAgeMs) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.items.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`🧹 Working Memory: 清理了 ${keysToDelete.length} 条过期记忆`);
    }
  }

  /**
   * 移除最低优先级的记忆
   */
  private removeLowestPriorityMemory(): void {
    let lowestPriority = Infinity;
    let lowestKey: string | null = null;

    this.items.forEach((item, key) => {
      const importance = (item.metadata?.importance as number) ?? 0.5;
      const timeFactor = (Date.now() - item.timestamp) / (1000 * 60); // 分钟

      // 优先级 = 重要性 + 时间因子（越新越高）
      const priority = importance - (timeFactor / 1000);

      if (priority < lowestPriority) {
        lowestPriority = priority;
        lowestKey = key;
      }
    });

    if (lowestKey) {
      this.items.delete(lowestKey);
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    // 每 5 分钟检查一次
    setInterval(() => this.expireOldMemories(), 300000);
  }

  /**
   * 获取所有记忆
   */
  async getAll(): Promise<MemoryItem[]> {
    if (this.useExternalStore && this.store) {
      return this.store.getAll('working');
    }
    return Array.from(this.items.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 清空记忆
   */
  async clear(): Promise<void> {
    if (this.useExternalStore && this.store) {
      await this.store.clear('working');
    } else {
      this.items.clear();
    }
  }

  /**
   * 获取记忆数量
   */
  size(): number {
    if (this.useExternalStore && this.store) {
      return this.store.count('working');
    }
    return this.items.size;
  }

  /**
   * 删除指定记忆
   */
  async delete(id: string): Promise<boolean> {
    if (this.useExternalStore && this.store) {
      return this.store.delete('working', id);
    }
    return this.items.delete(id);
  }

  /**
   * 获取最近的记忆（兼容旧API）
   */
  async getRecent(count: number): Promise<MemoryItem[]> {
    const all = await this.getAll();
    return all.slice(0, count);
  }

  /**
   * 获取统计信息（兼容旧API）
   */
  getStats(): { size: number; oldest: number | null; newest: number | null } {
    const items = Array.from(this.items.values());
    if (items.length === 0) {
      return { size: 0, oldest: null, newest: null };
    }

    const timestamps = items.map(i => i.timestamp);
    return {
      size: this.items.size,
      oldest: Math.min(...timestamps),
      newest: Math.max(...timestamps),
    };
  }
}

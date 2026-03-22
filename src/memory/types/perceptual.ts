/**
 * Perceptual Memory - 感知记忆
 * 多模态记忆，支持文本、图像、视频等感知数据
 * 支持按模态分离的向量存储
 */

import { BaseMemory, MemoryItem, MemoryConfig } from '../base';
import { SimpleVectorStore } from './vector-store';
import { IMemoryStore } from '../store';

export type PerceptualDataType = 'text' | 'image' | 'audio' | 'video' | 'image_url';

/**
 * 模态向量维度配置
 * 不同模态使用不同维度的向量
 */
export const MODAL_VECTOR_DIMS: Record<PerceptualDataType, number> = {
  text: 1536,        // 文本：常用 OpenAI embedding 维度
  image: 512,         // 图像：常用 CLIP 维度
  audio: 512,        // 音频：常用音频embedding维度
  video: 512,        // 视频：常用视频embedding维度
  image_url: 512,    // URL图像：同图像维度
};

export interface PerceptualData {
  id: string;
  type: PerceptualDataType;
  content: string;
  embedding?: number[];
  timestamp: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 感知记忆检索选项
 */
export interface PerceptualRetrieveOptions {
  /** 用户ID */
  userId?: string;
  /** 目标模态过滤（如只搜索图像） */
  targetModality?: PerceptualDataType;
  /** 查询模态（用于跨模态检索，如用文本查图像） */
  queryModality?: PerceptualDataType;
  /** 重要性权重 */
  importanceWeight?: number;
  /** 时间近因性权重 */
  recencyWeight?: number;
  /** 向量相似度权重 */
  vectorWeight?: number;
}

/**
 * 检索结果项（带评分）
 */
export interface ScoredMemoryItem extends MemoryItem {
  vectorScore: number;
  recencyScore: number;
  importance: number;
  combinedScore: number;
}

/**
 * 感知记忆 - 多模态数据存储
 * 支持按模态分离的向量存储
 */
export class PerceptualMemory implements BaseMemory {
  private data: Map<string, PerceptualData> = new Map();
  // 按模态分离的向量存储
  private vectorStores: Map<PerceptualDataType, SimpleVectorStore> = new Map();
  private store?: IMemoryStore;
  private maxSize: number;
  private useExternalStore: boolean;
  // 各模态的最大容量
  private maxSizePerType: Map<PerceptualDataType, number> = new Map();

  constructor(
    config?: MemoryConfig,
    store?: IMemoryStore
  ) {
    this.maxSize = config?.maxSize || 2000;
    this.store = store;
    this.useExternalStore = !!store;

    // 初始化各模态的向量存储
    const types: PerceptualDataType[] = ['text', 'image', 'audio', 'video', 'image_url'];
    types.forEach(type => {
      this.vectorStores.set(type, new SimpleVectorStore());
      // 每个模态默认最大容量
      this.maxSizePerType.set(type, Math.floor(this.maxSize / types.length));
    });

    if (this.useExternalStore) {
      console.log('📦 Perceptual Memory 使用外部存储');
    }
    console.log('🖼️ Perceptual Memory 使用模态分离向量存储');
  }

  /**
   * 获取指定模态的向量存储
   */
  private getVectorStore(type: PerceptualDataType): SimpleVectorStore {
    return this.vectorStores.get(type) || this.vectorStores.get('text')!;
  }

  /**
   * 添加感知数据
   */
  async add(content: string, metadata?: Record<string, unknown>): Promise<void> {
    const type = (metadata?.type as PerceptualDataType) || 'text';

    const item: PerceptualData = {
      id: `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content,
      timestamp: Date.now(),
      source: metadata?.source as string,
      metadata,
    };

    if (this.useExternalStore && this.store) {
      const memoryItem: MemoryItem = {
        id: item.id,
        content: item.content,
        timestamp: item.timestamp,
        metadata: { type: item.type, source: item.source, ...item.metadata },
      };
      await this.store.add('perceptual', memoryItem);
    } else {
      this.data.set(item.id, item);

      // 添加到对应模态的向量存储
      this.getVectorStore(type).add({
        id: item.id,
        content: this.getSearchableContent(item),
        metadata: { type, timestamp: item.timestamp },
      });

      // 超过容量时触发遗忘
      if (this.getSizeByType(type) > (this.maxSizePerType.get(type) || this.maxSize)) {
        this.evictOldestByType(type);
      }
    }
  }

  /**
   * 搜索感知记忆
   * @param query 查询文本
   * @param limit 返回数量限制
   * @param types 可选的模态过滤，不指定则搜索所有模态
   */
  async search(query: string, limit: number = 10, types?: PerceptualDataType[]): Promise<MemoryItem[]> {
    if (this.useExternalStore && this.store) {
      return this.store.search('perceptual', query, limit);
    }

    // 确定要搜索的模态
    const searchTypes = types || Array.from(this.vectorStores.keys());

    // 并行搜索各模态的向量存储
    const searchPromises = searchTypes.map(async (type) => {
      const store = this.getVectorStore(type);
      return store.search(query, limit);
    });

    const allResults = await Promise.all(searchPromises);
    const flatResults = allResults.flat();

    // 按相关性排序并返回
    return flatResults.slice(0, limit).map(item => {
      const data = this.data.get(item.id);
      return {
        id: item.id,
        content: item.content,
        timestamp: data?.timestamp || Date.now(),
        metadata: data?.metadata,
      };
    });
  }

  /**
   * 检索感知记忆（支持跨模态查询 + 融合排序）
   * @param query 查询文本
   * @param limit 返回数量限制
   * @param options 检索选项
   */
  async retrieve(
    query: string,
    limit: number = 5,
    options?: PerceptualRetrieveOptions
  ): Promise<ScoredMemoryItem[]> {
    const {
      userId,
      targetModality,
      queryModality = targetModality || 'text',
      importanceWeight = 0.4,
      recencyWeight = 0.2,
      vectorWeight = 0.8,
    } = options || {};

    // 确定要搜索的目标模态
    const searchTypes = targetModality
      ? [targetModality]
      : Array.from(this.vectorStores.keys());

    // 扩展候选池（因为融合后可能过滤掉一些）
    const candidateLimit = Math.max(limit * 5, 20);

    // 同模态向量检索
    const allHits: Array<{ item: MemoryItem; modality: PerceptualDataType; vectorScore: number }> = [];

    for (const targetType of searchTypes) {
      const store = this.getVectorStore(targetType);

      // 获取查询向量（如果实现了多模态embedding，这里可以用queryModality）
      // 当前简化版：直接用文本搜索
      const results = store.search(query, candidateLimit);

      // 转换为同步结果
      const syncResults = results instanceof Promise ? await results : results;

      for (const item of syncResults) {
        // 过滤用户ID
        if (userId && item.metadata?.userId !== userId) {
          continue;
        }

        // 计算向量相似度分数（简化为随机或基于内容匹配）
        const vectorScore = this.calculateVectorScore(query, item.content);

        allHits.push({
          item: {
            id: item.id,
            content: item.content,
            timestamp: (item.metadata?.timestamp as number) || Date.now(),
            metadata: item.metadata,
          },
          modality: targetType,
          vectorScore,
        });
      }
    }

    // 融合排序：向量相似度 + 时间近因性 + 重要性权重
    const now = Date.now();
    const scoredResults: ScoredMemoryItem[] = [];

    for (const hit of allHits) {
      const timestamp = hit.item.timestamp;
      const recencyScore = this.calculateRecencyScore(timestamp, now);
      const importance = (hit.item.metadata?.importance as number) || 0.5;

      // 评分算法: combinedScore = (vector_score * vectorWeight + recencyScore * recencyWeight) * importanceWeight
      const baseRelevance = hit.vectorScore * vectorWeight + recencyScore * recencyWeight;
      const importanceWeightCalc = 0.8 + (importance * 0.4);
      const combinedScore = baseRelevance * importanceWeightCalc;

      scoredResults.push({
        ...hit.item,
        vectorScore: hit.vectorScore,
        recencyScore,
        importance,
        combinedScore,
      });
    }

    // 按综合分数排序
    scoredResults.sort((a, b) => b.combinedScore - a.combinedScore);

    return scoredResults.slice(0, limit);
  }

  /**
   * 计算向量相似度分数（简化版）
   * 实际生产中应使用真实的embedding向量比较
   */
  private calculateVectorScore(query: string, content: string): number {
    // 简单的关键词匹配作为相似度代理
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const word of queryWords) {
      if (contentWords.some(c => c.includes(word) || word.includes(c))) {
        matches++;
      }
    }

    // 返回0-1之间的分数
    return queryWords.length > 0 ? matches / queryWords.length : 0;
  }

  /**
   * 计算时间近因性分数
   * 越近的记忆分数越高，遵循指数衰减
   */
  private calculateRecencyScore(timestamp: number, now: number, halfLife: number = 86400000): number {
    const age = now - timestamp; // 毫秒
    return Math.exp(-age / halfLife); // 指数衰减，半衰期默认为1天
  }

  /**
   * 跨模态检索
   * 用文本查询其他模态（如查询图像：用文本描述匹配图像）
   * @param query 文本查询
   * @param targetModality 目标模态
   * @param limit 返回数量
   */
  async retrieveCrossModal(
    query: string,
    targetModality: PerceptualDataType,
    limit: number = 5
  ): Promise<ScoredMemoryItem[]> {
    return this.retrieve(query, limit, {
      targetModality,
      queryModality: 'text', // 使用文本作为查询模态
    });
  }

  /**
   * 获取指定模态的向量存储
   * 用于外部调用（如需要直接操作向量存储）
   */
  getVectorStoreByModality(type: PerceptualDataType): SimpleVectorStore {
    return this.getVectorStore(type);
  }

  /**
   * 获取所有记忆
   */
  async getAll(): Promise<MemoryItem[]> {
    if (this.useExternalStore && this.store) {
      return this.store.getAll('perceptual');
    }

    return Array.from(this.data.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(d => ({
        id: d.id,
        content: d.content,
        timestamp: d.timestamp,
        metadata: { type: d.type, source: d.source, ...d.metadata },
      }));
  }

  /**
   * 清空感知记忆
   * @param type 可选，指定要清空的模态，不指定则清空所有
   */
  async clear(type?: PerceptualDataType): Promise<void> {
    if (this.useExternalStore && this.store) {
      await this.store.clear('perceptual');
    } else {
      if (type) {
        // 清空指定模态
        this.getVectorStore(type).clear();
        // 同时清理该模态的数据
        for (const [id, data] of this.data.entries()) {
          if (data.type === type) {
            this.data.delete(id);
          }
        }
      } else {
        // 清空所有
        this.data.clear();
        this.vectorStores.forEach(store => store.clear());
      }
    }
  }

  /**
   * 获取记忆数量
   */
  size(): number {
    if (this.useExternalStore && this.store) {
      return this.store.count('perceptual');
    }
    return this.data.size;
  }

  /**
   * 获取指定类型的感知数据
   */
  async getByType(type: PerceptualDataType): Promise<PerceptualData[]> {
    const all = await this.getAll();
    return all
      .filter(d => d.metadata?.type === type)
      .map(d => ({
        id: d.id,
        type: d.metadata?.type as PerceptualDataType,
        content: d.content,
        timestamp: d.timestamp,
        metadata: d.metadata,
      })) as PerceptualData[];
  }

  /**
   * 获取指定来源的感知数据
   */
  async getBySource(source: string): Promise<PerceptualData[]> {
    const all = await this.getAll();
    return all
      .filter(d => d.metadata?.source === source)
      .map(d => ({
        id: d.id,
        type: d.metadata?.type as PerceptualDataType,
        content: d.content,
        timestamp: d.timestamp,
        metadata: d.metadata,
      })) as PerceptualData[];
  }

  /**
   * 获取时间范围内的感知数据
   */
  async getByTimeRange(startTime: number, endTime: number): Promise<PerceptualData[]> {
    const all = await this.getAll();
    return all
      .filter(d => d.timestamp >= startTime && d.timestamp <= endTime)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(d => ({
        id: d.id,
        type: d.metadata?.type as PerceptualDataType,
        content: d.content,
        timestamp: d.timestamp,
        metadata: d.metadata,
      })) as PerceptualData[];
  }

  /**
   * 获取最近的感知数据
   */
  async getRecent(count: number, type?: PerceptualDataType): Promise<PerceptualData[]> {
    let items = await this.getAll();

    if (type) {
      items = items.filter(d => (d.metadata?.type as PerceptualDataType) === type);
    }

    return items
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count)
      .map(d => ({
        id: d.id,
        type: d.metadata?.type as PerceptualDataType,
        content: d.content,
        timestamp: d.timestamp,
        metadata: d.metadata,
      })) as PerceptualData[];
  }

  /**
   * 添加图像感知
   */
  async addImage(imagePath: string, description?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.add(description || imagePath, {
      ...metadata,
      type: 'image',
      imagePath,
    });
  }

  /**
   * 添加 URL 图像感知
   */
  async addImageFromURL(url: string, description?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.add(description || url, {
      ...metadata,
      type: 'image_url',
      imageUrl: url,
    });
  }

  /**
   * 添加音频感知
   */
  async addAudio(audioPath: string, transcript?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.add(transcript || audioPath, {
      ...metadata,
      type: 'audio',
      audioPath,
    });
  }

  /**
   * 添加视频感知
   */
  async addVideo(videoPath: string, description?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.add(description || videoPath, {
      ...metadata,
      type: 'video',
      videoPath,
    });
  }

  /**
   * 获取统计信息
   */
  getStats(): Record<string, number> {
    if (this.useExternalStore && this.store) {
      // 简化统计
      const all = this.store.getAll('perceptual');
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      all.then(items => {
        const stats: Record<string, number> = { text: 0, image: 0, audio: 0, video: 0 };
        items.forEach(item => {
          const type = (item.metadata?.type as string) || 'text';
          stats[type] = (stats[type] || 0) + 1;
        });
        return stats;
      });
    }

    const stats: Record<string, number> = {
      text: 0,
      image: 0,
      audio: 0,
      video: 0,
    };

    this.data.forEach(d => {
      stats[d.type] = (stats[d.type] || 0) + 1;
    });

    return stats;
  }

  /**
   * 获取可搜索的内容
   */
  private getSearchableContent(data: PerceptualData): string {
    switch (data.type) {
      case 'text':
        return data.content;
      case 'image':
      case 'image_url':
        return data.metadata?.description as string || data.content;
      case 'audio':
        return data.metadata?.transcript as string || data.content;
      case 'video':
        return data.metadata?.description as string || data.content;
      default:
        return data.content;
    }
  }

  /**
   * 删除指定记忆
   */
  async delete(id: string): Promise<boolean> {
    if (this.useExternalStore && this.store) {
      return this.store.delete('perceptual', id);
    }

    const data = this.data.get(id);
    if (data) {
      // 从对应模态的向量存储中删除
      this.getVectorStore(data.type).delete(id);
      return this.data.delete(id);
    }
    return false;
  }

  /**
   * 获取指定模态的记忆数量
   */
  private getSizeByType(type: PerceptualDataType): number {
    return this.getVectorStore(type).size();
  }

  /**
   * 驱逐指定模态的最旧记忆
   */
  private evictOldestByType(type: PerceptualDataType): void {
    const store = this.getVectorStore(type);
    const items = store.getAll();

    if (items.length > 0) {
      // 按时间排序，最旧的在前
      items.sort((a, b) => {
        const timeA = (a.metadata?.timestamp as number) || 0;
        const timeB = (b.metadata?.timestamp as number) || 0;
        return timeA - timeB;
      });

      // 删除最旧的
      const oldest = items[0];
      store.delete(oldest.id);
      this.data.delete(oldest.id);
    }
  }

  /**
   * 获取指定模态的向量维度
   */
  getVectorDim(type: PerceptualDataType): number {
    return MODAL_VECTOR_DIMS[type] || MODAL_VECTOR_DIMS.text;
  }

  /**
   * 获取所有模态类型
   */
  getModalities(): PerceptualDataType[] {
    return Array.from(this.vectorStores.keys());
  }

  /**
   * 按模态获取记忆数量
   */
  getSizeByModalities(): Record<PerceptualDataType, number> {
    const result: Record<string, number> = {};
    this.vectorStores.forEach((store, type) => {
      result[type] = store.size();
    });
    return result as Record<PerceptualDataType, number>;
  }
}

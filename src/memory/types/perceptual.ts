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

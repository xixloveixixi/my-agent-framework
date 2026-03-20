/**
 * Perceptual Memory - 感知记忆
 * 多模态记忆，支持文本、图像、视频等感知数据
 * 支持统一存储或本地存储
 */

import { BaseMemory, MemoryItem, MemoryConfig } from '../base';
import { SimpleVectorStore } from './vector-store';
import { IMemoryStore } from '../store';

export type PerceptualDataType = 'text' | 'image' | 'audio' | 'video' | 'image_url';

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
 */
export class PerceptualMemory implements BaseMemory {
  private data: Map<string, PerceptualData> = new Map();
  private vectorStore: SimpleVectorStore;
  private store?: IMemoryStore;
  private maxSize: number;
  private useExternalStore: boolean;

  constructor(
    config?: MemoryConfig,
    store?: IMemoryStore
  ) {
    this.maxSize = config?.maxSize || 2000;
    this.vectorStore = new SimpleVectorStore();
    this.store = store;
    this.useExternalStore = !!store;

    if (this.useExternalStore) {
      console.log('📦 Perceptual Memory 使用外部存储');
    }
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

      this.vectorStore.add({
        id: item.id,
        content: this.getSearchableContent(item),
        metadata: { type, timestamp: item.timestamp },
      });

      if (this.data.size > this.maxSize) {
        const oldest = this.getOldestId();
        if (oldest) {
          this.data.delete(oldest);
        }
      }
    }
  }

  /**
   * 搜索感知记忆
   */
  async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
    if (this.useExternalStore && this.store) {
      return this.store.search('perceptual', query, limit);
    }

    const results = this.vectorStore.search(query, limit);
    return results.map(item => {
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
   */
  async clear(): Promise<void> {
    if (this.useExternalStore && this.store) {
      await this.store.clear('perceptual');
    } else {
      this.data.clear();
      this.vectorStore.clear();
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
    return this.data.delete(id);
  }

  private getOldestId(): string | null {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    this.data.forEach((d, id) => {
      if (d.timestamp < oldestTime) {
        oldestTime = d.timestamp;
        oldestId = id;
      }
    });

    return oldestId;
  }
}

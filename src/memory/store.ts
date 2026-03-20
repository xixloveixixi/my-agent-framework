/**
 * Memory Store - 统一存储层
 * 所有记忆类型的集中存储后端
 */

import { MemoryItem, MemoryConfig } from './base';

export interface StoreConfig extends MemoryConfig {
  userId?: string;
  storagePath?: string;  // 持久化路径
}

/**
 * 统一存储接口
 */
export interface IMemoryStore {
  add(memoryType: string, item: MemoryItem): Promise<void>;
  get(memoryType: string, id: string): Promise<MemoryItem | undefined>;
  getAll(memoryType: string): Promise<MemoryItem[]>;
  search(memoryType: string, query: string, limit: number): Promise<MemoryItem[]>;
  delete(memoryType: string, id: string): Promise<boolean>;
  clear(memoryType?: string): Promise<void>;
  count(memoryType?: string): number;
  setUserId(userId: string): void;
  getUserId(): string;
}

/**
 * 内存存储实现
 */
export class MemoryStore implements IMemoryStore {
  private store: Map<string, Map<string, MemoryItem>> = new Map();
  private config: StoreConfig;
  private userId: string;

  constructor(config?: StoreConfig, userId: string = 'default_user') {
    this.config = config || {};
    this.userId = userId;
    this.initStore();
  }

  private initStore(): void {
    // 初始化各类型记忆的存储
    ['working', 'episodic', 'semantic', 'perceptual'].forEach(type => {
      this.store.set(type, new Map());
    });
    console.log(`📦 MemoryStore 初始化 (user: ${this.userId})`);
  }

  /**
   * 添加记忆
   */
  async add(memoryType: string, item: MemoryItem): Promise<void> {
    const typeStore = this.store.get(memoryType);
    if (!typeStore) {
      throw new Error(`未知记忆类型: ${memoryType}`);
    }
    typeStore.set(item.id, item);
  }

  /**
   * 获取单条记忆
   */
  async get(memoryType: string, id: string): Promise<MemoryItem | undefined> {
    return this.store.get(memoryType)?.get(id);
  }

  /**
   * 获取所有记忆
   */
  async getAll(memoryType: string): Promise<MemoryItem[]> {
    const typeStore = this.store.get(memoryType);
    if (!typeStore) return [];
    return Array.from(typeStore.values());
  }

  /**
   * 搜索记忆
   */
  async search(memoryType: string, query: string, limit: number): Promise<MemoryItem[]> {
    const items = await this.getAll(memoryType);
    const lowerQuery = query.toLowerCase();

    return items
      .filter(item => item.content.toLowerCase().includes(lowerQuery))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);
  }

  /**
   * 删除记忆
   */
  async delete(memoryType: string, id: string): Promise<boolean> {
    return this.store.get(memoryType)?.delete(id) || false;
  }

  /**
   * 清空记忆
   */
  async clear(memoryType?: string): Promise<void> {
    if (memoryType) {
      this.store.get(memoryType)?.clear();
    } else {
      this.store.forEach(typeStore => typeStore.clear());
    }
  }

  /**
   * 统计数量
   */
  count(memoryType?: string): number {
    if (memoryType) {
      return this.store.get(memoryType)?.size || 0;
    }
    let total = 0;
    this.store.forEach(typeStore => total += typeStore.size);
    return total;
  }

  /**
   * 获取用户ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * 设置用户ID（切换用户）
   */
  setUserId(userId: string): void {
    this.userId = userId;
    console.log(`👤 切换用户: ${userId}`);
  }
}

/**
 * 持久化存储（JSON文件）
 */
export class PersistentMemoryStore extends MemoryStore {
  private storagePath: string;

  constructor(config: StoreConfig) {
    super(config, config.userId || 'default_user');
    this.storagePath = config.storagePath || './memory_data.json';
    this.load();
  }

  /**
   * 从文件加载
   */
  private async load(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const parsed = JSON.parse(data);

      // 恢复数据
      ['working', 'episodic', 'semantic', 'perceptual'].forEach(type => {
        if (parsed[type]) {
          parsed[type].forEach((item: MemoryItem) => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.add(type, item);
          });
        }
      });
      console.log('💾 MemoryStore: 已从文件加载');
    } catch {
      console.log('📝 MemoryStore: 新建存储');
    }
  }

  /**
   * 保存到文件
   */
  async save(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const data: Record<string, MemoryItem[]> = {};

      ['working', 'episodic', 'semantic', 'perceptual'].forEach(async type => {
        const items = await this.getAll(type);
        data[type] = items;
      });

      await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log('💾 MemoryStore: 已保存到文件');
    } catch (error) {
      console.error('❌ 保存失败:', error);
    }
  }
}

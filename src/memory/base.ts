/**
 * Memory 模块基础定义
 * 定义记忆的基本数据结构和接口
 */

export interface MemoryItem {
  id: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryConfig {
  maxSize?: number;
  ttl?: number;  // Time-To-Live，工作记忆的过期时间（毫秒）
  enablePersistence?: boolean;
}

/**
 * 记忆基类接口
 */
export interface BaseMemory {
  /**
   * 添加记忆
   */
  add(content: string, metadata?: Record<string, unknown>): Promise<void> | void;

  /**
   * 搜索记忆
   */
  search(query: string, limit?: number): Promise<MemoryItem[]>;

  /**
   * 获取所有记忆
   */
  getAll(): Promise<MemoryItem[]>;

  /**
   * 清空记忆
   */
  clear(): Promise<void>;

  /**
   * 获取记忆数量
   */
  size(): number;

  /**
   * 删除指定记忆
   */
  delete?(id: string): Promise<boolean>;
}

/**
 * 记忆类型枚举
 */
export enum MemoryType {
  WORKING = 'working',       // 工作记忆
  EPISODIC = 'episodic',     // 情景记忆
  SEMANTIC = 'semantic',     // 语义记忆
  PERCEPTUAL = 'perceptual'  // 感知记忆
}

/**
 * 存储类型枚举
 */
export enum StorageType {
  QDRANT = 'qdrant',      // 向量存储
  NEO4J = 'neo4j',        // 图存储
  SQLITE = 'sqlite',      // 文档存储
  MEMORY = 'memory'       // 内存存储
}

/**
 * 嵌入服务接口
 */
export interface EmbeddingService {
  /**
   * 生成文本嵌入
   */
  embed(text: string): Promise<number[]>;

  /**
   * 批量生成嵌入
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * 默认的 TF-IDF 嵌入服务
 */
export class TFIDFEmbedding implements EmbeddingService {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private documentCount: number = 0;

  async embed(text: string): Promise<number[]> {
    const words = this.tokenize(text);
    const tf = this.computeTF(words);

    // 转换为稀疏向量
    const vector: number[] = [];
    this.vocabulary.forEach((_, word) => {
      const tfValue = tf[word] || 0;
      const idfValue = this.idf.get(word) || 1;
      vector.push(tfValue * idfValue);
    });

    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // 更新 IDF
    texts.forEach(text => {
      const words = new Set(this.tokenize(text));
      words.forEach(word => {
        const current = this.idf.get(word) || 0;
        this.idf.set(word, current + 1);
      });
      this.documentCount++;
    });

    // 构建词汇表
    texts.forEach(text => {
      this.tokenize(text).forEach(word => {
        if (!this.vocabulary.has(word)) {
          this.vocabulary.set(word, this.vocabulary.size);
        }
      });
    });

    return Promise.all(texts.map(text => this.embed(text)));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  private computeTF(words: string[]): Record<string, number> {
    const tf: Record<string, number> = {};
    const total = words.length;

    words.forEach(word => {
      tf[word] = (tf[word] || 0) + 1;
    });

    Object.keys(tf).forEach(word => {
      tf[word] = tf[word] / total;
    });

    return tf;
  }
}

/**
 * 记忆工厂 - 创建不同类型的记忆
 */
export class MemoryFactory {
  /**
   * 创建工作记忆
   */
  static createWorkingMemory(config?: MemoryConfig) {
    return import('./types/working').then(m => new m.WorkingMemory(config));
  }

  /**
   * 创建情景记忆
   */
  static createEpisodicMemory(config?: MemoryConfig) {
    return import('./types/episodic').then(m => new m.EpisodicMemory(config));
  }

  /**
   * 创建语义记忆
   */
  static createSemanticMemory(config?: MemoryConfig) {
    return import('./types/semantic').then(m => new m.SemanticMemory(config));
  }

  /**
   * 创建感知记忆
   */
  static createPerceptualMemory(config?: MemoryConfig) {
    return import('./types/perceptual').then(m => new m.PerceptualMemory(config));
  }
}

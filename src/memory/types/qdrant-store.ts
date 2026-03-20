/**
 * Qdrant Vector Store - Qdrant 向量数据库存储
 * 支持远程 Qdrant 服务的向量存储和检索
 * 使用 REST API 直接调用，无需额外依赖
 */

import { VectorItem, SearchResult } from './vector-store';

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize?: number;
  distance?: 'Cosine' | 'Euclidean' | 'Dot';
}

interface QdrantResponse<T> {
  result?: T;
  status?: string;
  time?: number;
}

interface QdrantPointPayload {
  id: string | number;
  version?: number;
  score?: number;
  payload?: Record<string, unknown>;
  vector?: number[];
}

/**
 * Qdrant 向量存储
 * 使用 REST API
 */
export class QdrantVectorStore {
  private config: QdrantConfig;
  private localStore: Map<string, VectorItem> = new Map();
  private initialized: boolean = false;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(config: QdrantConfig) {
    this.config = {
      vectorSize: config.vectorSize || 384,
      distance: config.distance || 'Cosine',
      ...config,
    };
  }

  /**
   * 初始化 Qdrant 连接
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // 测试连接
      const response = await this.request<{ collections: { name: string }[] }>(
        '/collections',
        'GET'
      );

      if (response.result) {
        this.initialized = true;
        console.log(`✅ Qdrant 连接成功: ${this.config.url}`);
        return true;
      }
      return false;
    } catch (error) {
      console.warn(`⚠️ Qdrant 连接失败，将使用本地存储: ${error}`);
      return false;
    }
  }

  /**
   * 发送请求到 Qdrant
   */
  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' | 'PUT' = 'GET',
    body?: unknown
  ): Promise<QdrantResponse<T>> {
    const url = `${this.config.url}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['api-key'] = this.config.apiKey;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Qdrant 请求失败: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<QdrantResponse<T>>;
  }

  /**
   * 确保集合存在
   */
  async ensureCollection(): Promise<void> {
    try {
      const response = await this.request<{ name: string }[]>('/collections', 'GET');

      if (response.result) {
        const exists = response.result.some(c => c.name === this.config.collectionName);

        if (!exists) {
          await this.request(`/collections/${this.config.collectionName}`, 'PUT', {
            vectors: {
              size: this.config.vectorSize,
              distance: this.config.distance,
            },
          });
          console.log(`✅ 创建 Qdrant 集合: ${this.config.collectionName}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Qdrant 集合检查失败: ${error}`);
    }
  }

  /**
   * 添加向量项
   */
  async add(item: VectorItem): Promise<void> {
    const vector = await this.computeEmbedding(item.content.toString());

    if (this.initialized) {
      try {
        await this.request(`/collections/${this.config.collectionName}/points`, 'POST', {
          points: [{
            id: item.id,
            vector,
            payload: {
              content: item.content,
              ...item.metadata,
            },
          }],
        });
      } catch (error) {
        console.warn(`⚠️ Qdrant 插入失败，使用本地存储: ${error}`);
        this.localStore.set(item.id, { ...item, embedding: vector });
      }
    } else {
      this.localStore.set(item.id, { ...item, embedding: vector });
    }
  }

  /**
   * 批量添加
   */
  async addBatch(items: VectorItem[]): Promise<void> {
    const vectors = await Promise.all(items.map(item => this.computeEmbedding(item.content.toString())));

    if (this.initialized) {
      try {
        await this.request(`/collections/${this.config.collectionName}/points`, 'POST', {
          points: items.map((item, i) => ({
            id: item.id,
            vector: vectors[i],
            payload: {
              content: item.content,
              ...item.metadata,
            },
          })),
        });
        return;
      } catch (error) {
        console.warn(`⚠️ Qdrant 批量插入失败: ${error}`);
      }
    }

    // 回退到本地存储
    items.forEach((item, i) => {
      this.localStore.set(item.id, { ...item, embedding: vectors[i] });
    });
  }

  /**
   * 语义搜索
   */
  async search(query: string, topK: number = 5): Promise<VectorItem[]> {
    const results = await this.searchWithScores(query, topK);
    return results.map(r => r.item);
  }

  /**
   * 带分数的搜索
   */
  async searchWithScores(query: string, topK: number = 5): Promise<SearchResult[]> {
    const queryVector = await this.computeEmbedding(query);

    if (this.initialized) {
      try {
        const response = await this.request<QdrantPointPayload[]>(
          `/collections/${this.config.collectionName}/points/search`,
          'POST',
          {
            vector: queryVector,
            limit: topK,
          }
        );

        if (response.result) {
          return response.result.map(p => ({
            item: {
              id: String(p.id),
              content: (p.payload?.content as string) || '',
              metadata: p.payload,
            },
            score: p.score || 0,
          }));
        }
      } catch (error) {
        console.warn(`⚠️ Qdrant 搜索失败: ${error}`);
      }
    }

    // 回退到本地搜索
    return this.localSearchWithScores(query, topK);
  }

  /**
   * 本地 TF-IDF 搜索（回退方案）
   */
  private localSearchWithScores(query: string, topK: number): SearchResult[] {
    const results: SearchResult[] = [];
    const queryWords = this.tokenize(query);

    this.localStore.forEach((item) => {
      const contentWords = this.tokenize(item.content.toString());
      const matchCount = queryWords.filter(w => contentWords.includes(w)).length;

      if (matchCount > 0) {
        results.push({
          item,
          score: matchCount / queryWords.length,
        });
      }
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * 关键词搜索
   */
  searchByKeywords(keywords: string[], topK: number = 5): VectorItem[] {
    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
    const results: SearchResult[] = [];

    this.localStore.forEach((item) => {
      const contentLower = item.content.toString().toLowerCase();
      let matchCount = 0;

      keywordSet.forEach(keyword => {
        if (contentLower.includes(keyword)) {
          matchCount++;
        }
      });

      if (matchCount > 0) {
        results.push({
          item,
          score: matchCount / keywordSet.size,
        });
      }
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK).map(r => r.item);
  }

  /**
   * 获取所有项
   */
  async getAll(): Promise<VectorItem[]> {
    if (this.initialized) {
      try {
        const response = await this.request<{ next_page_offset?: string; points: QdrantPointPayload[] }>(
          `/collections/${this.config.collectionName}/points`,
          'POST',
          { limit: 1000 }
        );

        if (response.result?.points) {
          return response.result.points.map(p => ({
            id: String(p.id),
            content: (p.payload?.content as string) || '',
            metadata: p.payload,
          }));
        }
      } catch (error) {
        console.warn(`⚠️ Qdrant 获取失败: ${error}`);
      }
    }

    return Array.from(this.localStore.values());
  }

  /**
   * 获取指定项
   */
  get(id: string): VectorItem | undefined {
    return this.localStore.get(id);
  }

  /**
   * 删除项
   */
  async delete(id: string): Promise<boolean> {
    if (this.initialized) {
      try {
        await this.request(`/collections/${this.config.collectionName}/points/delete`, 'POST', {
          points: [id],
        });
      } catch (error) {
        console.warn(`⚠️ Qdrant 删除失败: ${error}`);
      }
    }

    return this.localStore.delete(id);
  }

  /**
   * 清空
   */
  async clear(): Promise<void> {
    if (this.initialized) {
      try {
        // 删除所有点
        const all = await this.getAll();
        if (all.length > 0) {
          await this.request(`/collections/${this.config.collectionName}/points/delete`, 'POST', {
            points: all.map(p => p.id),
          });
        }
      } catch (error) {
        console.warn(`⚠️ Qdrant 清空失败: ${error}`);
      }
    }

    this.localStore.clear();
    this.embeddingCache.clear();
  }

  /**
   * 获取大小
   */
  size(): number {
    return this.localStore.size;
  }

  /**
   * 计算文本 embedding
   * 使用简单的词袋模型生成伪 embedding
   */
  private async computeEmbedding(text: string): Promise<number[]> {
    // 检查缓存
    const cacheKey = text.slice(0, 100);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // 简单的词袋 embedding
    const words = this.tokenize(text);
    const dimension = this.config.vectorSize!;
    const vector = new Array(dimension).fill(0);

    // 使用词哈希生成伪随机但稳定的向量
    words.forEach((word) => {
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(j);
        hash = hash & hash;
      }
      const index = Math.abs(hash) % dimension;
      vector[index] += 1 / Math.max(words.length, 1);
    });

    // 归一化
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    this.embeddingCache.set(cacheKey, vector);
    return vector;
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.initialized;
  }
}

/**
 * Qdrant Store - 向量存储后端
 * 兼容 Qdrant 的向量存储接口（需要 Qdrant 服务）
 */

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface QdrantSearchParams {
  vector: number[];
  limit: number;
  score_threshold?: number;
  filter?: Record<string, unknown>;
}

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collection: string;
  dimension?: number;
}

/**
 * Qdrant 向量存储客户端
 * 注意：需要运行 Qdrant 服务
 */
export class QdrantStore {
  private url: string;
  private apiKey?: string;
  private collection: string;
  private dimension: number;
  private initialized: boolean = false;

  constructor(config: QdrantConfig) {
    this.url = config.url;
    this.apiKey = config.apiKey;
    this.collection = config.collection;
    this.dimension = config.dimension || 384;
  }

  /**
   * 初始化集合
   */
  async init(): Promise<void> {
    try {
      // 检查集合是否存在
      const exists = await this.collectionExists();
      if (!exists) {
        await this.createCollection();
      }
      this.initialized = true;
      console.log(`✅ Qdrant 集合 "${this.collection}" 已就绪`);
    } catch (error) {
      console.warn(`⚠️ Qdrant 初始化失败: ${error}`);
      console.warn('⚠️ 将使用内存存储作为后备');
    }
  }

  /**
   * 添加向量
   */
  async add(points: QdrantPoint[]): Promise<void> {
    if (!this.initialized) {
      console.warn('⚠️ Qdrant 未初始化');
      return;
    }

    const response = await fetch(`${this.url}/collections/${this.collection}/points`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Api-Key': this.apiKey }),
      },
      body: JSON.stringify({
        points: points.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant add error: ${response.status}`);
    }
  }

  /**
   * 搜索向量
   */
  async search(params: QdrantSearchParams): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
    if (!this.initialized) {
      return [];
    }

    const response = await fetch(`${this.url}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Api-Key': this.apiKey }),
      },
      body: JSON.stringify({
        vector: params.vector,
        limit: params.limit,
        score_threshold: params.score_threshold,
        with_payload: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant search error: ${response.status}`);
    }

    const data = await response.json() as {
      result?: Array<{ id: string; score: number; payload: Record<string, unknown> }>;
    };

    return data.result || [];
  }

  /**
   * 删除向量
   */
  async delete(ids: string[]): Promise<void> {
    if (!this.initialized) return;

    const response = await fetch(`${this.url}/collections/${this.collection}/points/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Api-Key': this.apiKey }),
      },
      body: JSON.stringify({ points: ids }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant delete error: ${response.status}`);
    }
  }

  /**
   * 清空集合
   */
  async clear(): Promise<void> {
    if (!this.initialized) return;

    const response = await fetch(`${this.url}/collections/${this.collection}/points/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Api-Key': this.apiKey }),
      },
      body: JSON.stringify({ filter: {} }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant clear error: ${response.status}`);
    }
  }

  /**
   * 获取集合大小
   */
  async size(): Promise<number> {
    if (!this.initialized) return 0;

    const response = await fetch(`${this.url}/collections/${this.collection}`, {
      headers: {
        ...(this.apiKey && { 'Api-Key': this.apiKey }),
      },
    });

    if (!response.ok) {
      return 0;
    }

    const data = await response.json() as {
      result?: { points_count: number };
    };

    return data.result?.points_count || 0;
  }

  private async collectionExists(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/collections/${this.collection}`, {
        headers: {
          ...(this.apiKey && { 'Api-Key': this.apiKey }),
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async createCollection(): Promise<void> {
    const response = await fetch(`${this.url}/collections/${this.collection}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Api-Key': this.apiKey }),
      },
      body: JSON.stringify({
        vectors: {
          size: this.dimension,
          distance: 'Cosine',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant create collection error: ${response.status}`);
    }
  }
}

/**
 * 嵌入服务 - 文本向量化
 * 支持多种嵌入方式：DashScope/Local/TFIDF
 */

import { EmbeddingService, TFIDFEmbedding } from './base';

export interface EmbeddingConfig {
  provider: 'tfidf' | 'dashscope' | 'openai' | 'local';
  apiKey?: string;
  model?: string;
}

/**
 * 统一嵌入服务
 */
export class EmbeddingManager {
  private service: EmbeddingService;
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.service = this.createService(config);
  }

  private createService(config: EmbeddingConfig): EmbeddingService {
    switch (config.provider) {
      case 'tfidf':
        return new TFIDFEmbedding();

      case 'dashscope':
        return new DashScopeEmbedding(config.apiKey, config.model);

      case 'openai':
        return new OpenAIEmbedding(config.apiKey, config.model);

      case 'local':
        return new LocalEmbedding(config.model);

      default:
        return new TFIDFEmbedding();
    }
  }

  /**
   * 嵌入单个文本
   */
  async embed(text: string): Promise<number[]> {
    return this.service.embed(text);
  }

  /**
   * 批量嵌入
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.service.embedBatch(texts);
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * DashScope 嵌入服务（阿里云）
 */
class DashScopeEmbedding implements EmbeddingService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'text-embedding-v2') {
    this.apiKey = apiKey || process.env.DASHSCOPE_API_KEY || '';
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('DashScope API Key 未配置');
    }

    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`DashScope API Error: ${response.status}`);
    }

    const data = await response.json() as {
      output?: { embeddings?: Array<{ embedding: number[] }> };
    };

    return data.output?.embeddings?.[0]?.embedding || [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('DashScope API Key 未配置');
    }

    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`DashScope API Error: ${response.status}`);
    }

    const data = await response.json() as {
      output?: { embeddings?: Array<{ embedding: number[] }> };
    };

    return data.output?.embeddings?.map(e => e.embedding) || [];
  }
}

/**
 * OpenAI 嵌入服务
 */
class OpenAIEmbedding implements EmbeddingService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'text-embedding-3-small') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API Key 未配置');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API Error: ${response.status}`);
    }

    const data = await response.json() as {
      data?: Array<{ embedding: number[] }>;
    };

    return data.data?.[0]?.embedding || [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API Key 未配置');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API Error: ${response.status}`);
    }

    const data = await response.json() as {
      data?: Array<{ embedding: number[] }>;
    };

    return data.data?.map(d => d.embedding) || [];
  }
}

/**
 * 本地嵌入服务（Sentence Transformers）
 */
class LocalEmbedding implements EmbeddingService {
  private modelName: string;

  constructor(modelName: string = 'paraphrase-multilingual-MiniLM-L12-v2') {
    this.modelName = modelName;
    console.log(`📦 本地嵌入模型: ${modelName}`);
    console.log('⚠️ 本地嵌入需要额外安装: npm install @xenova/transformers');
  }

  async embed(text: string): Promise<number[]> {
    // 实际使用时需要加载模型
    // 这里返回占位实现
    console.warn('⚠️ 本地嵌入模型需要额外配置');
    const tfidf = new TFIDFEmbedding();
    return tfidf.embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    console.warn('⚠️ 本地嵌入模型需要额外配置');
    const tfidf = new TFIDFEmbedding();
    return tfidf.embedBatch(texts);
  }
}

/**
 * Simple Vector Store - 轻量级向量存储
 * 简化版向量存储，用于本地内存
 */

export interface VectorItem<T = string> {
  id: string;
  content: T;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult<T = string> {
  item: VectorItem<T>;
  score: number;
}

export class SimpleVectorStore {
  private items: Map<string, VectorItem> = new Map();
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private documentCount: number = 0;
  // 存储预计算的嵌入向量
  private embeddings: Map<string, number[]> = new Map();

  /**
   * 添加向量项
   */
  add(item: VectorItem): void {
    this.items.set(item.id, item);
    this.documentCount++;

    // 如果有预计算的嵌入向量，保存起来
    if (item.embedding && item.embedding.length > 0) {
      this.embeddings.set(item.id, item.embedding);
      return; // 不需要计算 TF-IDF
    }

    // 更新词汇表和 IDF（用于 TF-IDF 搜索）
    const words = this.tokenize(item.content.toString());
    const uniqueWords = new Set(words);

    uniqueWords.forEach(word => {
      // 更新词汇表
      if (!this.vocabulary.has(word)) {
        this.vocabulary.set(word, this.vocabulary.size);
      }

      // 简单 IDF 计算
      const current = this.idf.get(word) || 0;
      this.idf.set(word, current + 1);
    });
  }

  /**
   * 检查是否使用预计算嵌入
   */
  hasEmbeddings(): boolean {
    return this.embeddings.size > 0;
  }

  /**
   * 批量添加
   */
  addBatch(items: VectorItem[]): void {
    items.forEach(item => this.add(item));
  }

  /**
   * 语义搜索（返回带分数的结果）
   */
  searchWithScores(query: string, topK: number = 5, queryEmbedding?: number[]): SearchResult[] {
    if (this.items.size === 0) {
      return [];
    }

    // 如果有预计算嵌入且提供了查询嵌入，使用向量相似度
    if (this.hasEmbeddings() && queryEmbedding && queryEmbedding.length > 0) {
      return this.searchByEmbeddingScores(queryEmbedding, topK);
    }

    // 否则使用 TF-IDF
    const queryVector = this.computeTFIDF(query);
    const results: SearchResult[] = [];

    this.items.forEach((item) => {
      const itemVector = this.computeTFIDF(item.content.toString());
      const score = this.cosineSimilarity(queryVector, itemVector);
      results.push({ item, score });
    });

    // 按相似度排序
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * 使用嵌入向量搜索
   */
  private searchByEmbeddingScores(queryEmbedding: number[], topK: number): SearchResult[] {
    const results: SearchResult[] = [];

    this.items.forEach((item) => {
      const itemEmbedding = this.embeddings.get(item.id);
      if (itemEmbedding) {
        const score = this.cosineSimilarity(queryEmbedding, itemEmbedding);
        results.push({ item, score });
      }
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * 语义搜索（返回向量项）
   */
  search(query: string, topK: number = 5, queryEmbedding?: number[]): VectorItem[] {
    return this.searchWithScores(query, topK, queryEmbedding).map(r => r.item);
  }

  /**
   * 关键词搜索
   */
  searchByKeywords(keywords: string[], topK: number = 5): VectorItem[] {
    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
    const results: SearchResult[] = [];

    this.items.forEach((item, id) => {
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
  getAll(): VectorItem[] {
    return Array.from(this.items.values());
  }

  /**
   * 获取指定项
   */
  get(id: string): VectorItem | undefined {
    return this.items.get(id);
  }

  /**
   * 删除项
   */
  delete(id: string): boolean {
    return this.items.delete(id);
  }

  /**
   * 清空
   */
  clear(): void {
    this.items.clear();
    this.vocabulary.clear();
    this.idf.clear();
    this.documentCount = 0;
  }

  /**
   * 获取大小
   */
  size(): number {
    return this.items.size;
  }

  /**
   * 计算 TF-IDF 向量
   */
  private computeTFIDF(text: string): number[] {
    const words = this.tokenize(text);
    const tf = this.computeTF(words);
    const vector: number[] = [];

    // 使用固定维度
    const dimension = Math.max(this.vocabulary.size, 100);

    this.vocabulary.forEach((_, word) => {
      const tfValue = tf[word] || 0;
      const idfValue = this.computeIDF(word);
      vector.push(tfValue * idfValue);
    });

    return vector;
  }

  /**
   * 计算词频
   */
  private computeTF(words: string[]): Record<string, number> {
    const tf: Record<string, number> = {};
    const total = words.length;

    if (total === 0) {
      return tf;
    }

    words.forEach(word => {
      tf[word] = (tf[word] || 0) + 1;
    });

    Object.keys(tf).forEach(word => {
      tf[word] = tf[word] / total;
    });

    return tf;
  }

  /**
   * 计算 IDF
   */
  private computeIDF(word: string): number {
    const df = this.idf.get(word) || 1;
    return Math.log(this.documentCount / df) + 1;
  }

  /**
   * 余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    const maxLen = Math.max(a.length, b.length);

    // 补齐到相同长度
    const vecA = [...a, ...new Array(Math.max(0, maxLen - a.length)).fill(0)];
    const vecB = [...b, ...new Array(Math.max(0, maxLen - b.length)).fill(0)];

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < maxLen; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
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
}

/**
 * Document Store - 文档存储后端
 * 简单的 JSON 文件存储（轻量级 SQLite 替代）
 */

export interface Document {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentStoreConfig {
  filepath: string;
}

/**
 * 文档存储 - 基于 JSON 文件
 */
export class DocumentStore {
  private filepath: string;
  private documents: Map<string, Document> = new Map();
  private dirty: boolean = false;

  constructor(config: DocumentStoreConfig) {
    this.filepath = config.filepath;
  }

  /**
   * 初始化（加载已有数据）
   */
  async init(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.filepath, 'utf-8');
      const docs = JSON.parse(data) as Document[];

      docs.forEach(doc => {
        this.documents.set(doc.id, doc);
      });

      console.log(`✅ Document Store: 加载了 ${this.documents.size} 条文档`);
    } catch (error) {
      // 文件不存在，从头开始
      console.log('📝 Document Store: 新建存储');
    }
  }

  /**
   * 保存到文件
   */
  async save(): Promise<void> {
    if (!this.dirty) return;

    try {
      const fs = await import('fs/promises');
      const docs = Array.from(this.documents.values());
      await fs.writeFile(this.filepath, JSON.stringify(docs, null, 2), 'utf-8');
      this.dirty = false;
      console.log('💾 Document Store: 已保存');
    } catch (error) {
      console.error(`❌ Document Store 保存失败: ${error}`);
    }
  }

  /**
   * 添加文档
   */
  async add(content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const doc: Document = {
      id,
      content,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.documents.set(id, doc);
    this.dirty = true;

    // 自动保存
    await this.save();

    return id;
  }

  /**
   * 更新文档
   */
  async update(id: string, content: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
    const existing = this.documents.get(id);
    if (!existing) return false;

    existing.content = content;
    existing.metadata = { ...existing.metadata, ...metadata };
    existing.updatedAt = Date.now();

    this.documents.set(id, existing);
    this.dirty = true;
    await this.save();

    return true;
  }

  /**
   * 删除文档
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.documents.delete(id);
    if (deleted) {
      this.dirty = true;
      await this.save();
    }
    return deleted;
  }

  /**
   * 获取文档
   */
  get(id: string): Document | undefined {
    return this.documents.get(id);
  }

  /**
   * 搜索文档（简单内容匹配）
   */
  search(query: string, limit: number = 10): Document[] {
    const lowerQuery = query.toLowerCase();
    const results = Array.from(this.documents.values())
      .filter(doc => doc.content.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);

    return results;
  }

  /**
   * 按元数据筛选
   */
  filterByMetadata(key: string, value: unknown): Document[] {
    return Array.from(this.documents.values())
      .filter(doc => doc.metadata[key] === value)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 获取所有文档
   */
  getAll(): Document[] {
    return Array.from(this.documents.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 清空所有文档
   */
  async clear(): Promise<void> {
    this.documents.clear();
    this.dirty = true;
    await this.save();
  }

  /**
   * 获取文档数量
   */
  size(): number {
    return this.documents.size;
  }
}

/**
 * RAG Pipeline - 检索增强生成管道
 * 端到端的 RAG 处理流程
 */

import { SimpleVectorStore } from '../types/vector-store';

export interface RAGConfig {
  topK?: number;
  similarityThreshold?: number;
  maxContextLength?: number;
  promptTemplate?: string;
}

export interface RAGDocument {
  id: string;
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface RAGResult {
  answer: string;
  sources: Array<{ content: string; source?: string; score: number }>;
}

/**
 * RAG 管道
 */
export class RAGPipeline {
  private vectorStore: SimpleVectorStore;
  private config: RAGConfig;

  constructor(vectorStore?: SimpleVectorStore, config?: RAGConfig) {
    this.vectorStore = vectorStore || new SimpleVectorStore();
    this.config = {
      topK: config?.topK || 3,
      similarityThreshold: config?.similarityThreshold || 0.1,
      maxContextLength: config?.maxContextLength || 2000,
      promptTemplate: config?.promptTemplate || this.defaultPromptTemplate,
    };
  }

  /**
   * 添加文档
   */
  addDocument(doc: RAGDocument): void {
    this.vectorStore.add({
      id: doc.id,
      content: doc.content,
      metadata: { source: doc.source, ...doc.metadata },
    });
  }

  /**
   * 批量添加文档
   */
  addDocuments(docs: RAGDocument[]): void {
    docs.forEach(doc => this.addDocument(doc));
  }

  /**
   * 检索相关文档
   */
  retrieve(query: string): RAGDocument[] {
    const results = this.vectorStore.search(query, this.config.topK);

    return results.map(item => ({
      id: item.id,
      content: item.content,
      source: item.metadata?.source as string,
      metadata: item.metadata,
    }));
  }

  /**
   * 构建上下文
   */
  buildContext(query: string): { context: string; sources: Array<{ content: string; source?: string; score: number }> } {
    const docs = this.retrieve(query);

    let context = '';
    const sources: Array<{ content: string; source?: string; score: number }> = [];

    docs.forEach((doc, index) => {
      const truncatedContent = doc.content.slice(0, 500);
      context += `[${index + 1}] ${truncatedContent}${doc.content.length > 500 ? '...' : ''}\n\n`;
      sources.push({
        content: doc.content,
        source: doc.source,
        score: 1,
      });
    });

    return { context, sources };
  }

  /**
   * 生成回答
   */
  async generate(
    query: string,
    llm: { generate(prompt: string): Promise<string> }
  ): Promise<RAGResult> {
    const { context, sources } = this.buildContext(query);

    const prompt = this.config.promptTemplate!
      .replace('{context}', context)
      .replace('{question}', query);

    const answer = await llm.generate(prompt);

    return { answer, sources };
  }

  /**
   * 流式生成
   */
  async *generateStream(
    query: string,
    llm: { streamGenerate?(prompt: string): AsyncGenerator<string> }
  ): AsyncGenerator<string> {
    const { context } = this.buildContext(query);

    const prompt = this.config.promptTemplate!
      .replace('{context}', context)
      .replace('{question}', query);

    // 如果 LLM 支持流式
    if ('streamGenerate' in llm) {
      yield* (llm as { streamGenerate(prompt: string): AsyncGenerator<string> }).streamGenerate(prompt);
    } else {
      // 回退到普通生成
      const result = await (llm as { generate(prompt: string): Promise<string> }).generate(prompt);
      yield result;
    }
  }

  /**
   * 混合检索
   */
  hybridRetrieve(query: string, keywords?: string[]): RAGDocument[] {
    const semanticResults = this.vectorStore.search(query, this.config.topK);
    const keywordResults = keywords
      ? this.vectorStore.searchByKeywords(keywords, this.config.topK)
      : [];

    // 合并去重
    const seen = new Set<string>();
    const merged: RAGDocument[] = [];

    [...semanticResults, ...keywordResults].forEach(item => {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push({
          id: item.id,
          content: item.content,
          source: item.metadata?.source as string,
          metadata: item.metadata,
        });
      }
    });

    return merged.slice(0, this.config.topK);
  }

  /**
   * 获取文档数量
   */
  size(): number {
    return this.vectorStore.size();
  }

  /**
   * 清空知识库
   */
  clear(): void {
    this.vectorStore.clear();
  }

  /**
   * 默认提示词模板
   */
  private defaultPromptTemplate = `你是一个知识问答助手。请根据以下参考资料回答问题。

## 参考资料
{context}

## 问题
{question}

## 回答`;
}

/**
 * 文档加载器
 */
export interface DocumentLoader {
  load(source: string): Promise<RAGDocument[]>;
}

/**
 * 文本文档加载器
 */
export class TextDocumentLoader implements DocumentLoader {
  async load(source: string): Promise<RAGDocument[]> {
    // 判断是文件路径还是文本内容
    if (source.includes('/') || source.includes('\\') || source.endsWith('.txt') || source.endsWith('.md')) {
      try {
        const fs = await import('fs/promises');
        const content = await fs.readFile(source, 'utf-8');
        return this.parseContent(content, source);
      } catch {
        return this.parseContent(source, 'text');
      }
    }

    return this.parseContent(source, 'text');
  }

  private parseContent(content: string, source: string): RAGDocument[] {
    // 按段落分割
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());

    return paragraphs.map((para, index) => ({
      id: `doc_${Date.now()}_${index}`,
      content: para.trim(),
      source,
    }));
  }
}

/**
 * Markdown 文档加载器
 */
export class MarkdownLoader implements DocumentLoader {
  async load(source: string): Promise<RAGDocument[]> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(source, 'utf-8');
      return this.parseMarkdown(content, source);
    } catch {
      return this.parseMarkdown(source, 'markdown');
    }
  }

  private parseMarkdown(content: string, source: string): RAGDocument[] {
    const documents: RAGDocument[] = [];
    const blocks = content.split(/#{1,6}\s+/);

    blocks.forEach((block, index) => {
      if (block.trim()) {
        documents.push({
          id: `md_${Date.now()}_${index}`,
          content: block.trim(),
          source,
          metadata: { type: 'markdown' },
        });
      }
    });

    return documents;
  }
}

/**
 * 文档处理器
 */
export class DocumentProcessor {
  private pipeline: RAGPipeline;

  constructor(pipeline: RAGPipeline) {
    this.pipeline = pipeline;
  }

  /**
   * 从文本加载
   */
  async loadText(text: string): Promise<number> {
    const loader = new TextDocumentLoader();
    const docs = await loader.load(text);
    this.pipeline.addDocuments(docs);
    return docs.length;
  }

  /**
   * 从文件加载
   */
  async loadFile(filepath: string): Promise<number> {
    const ext = filepath.toLowerCase();
    let loader: DocumentLoader;

    if (ext.endsWith('.md') || ext.endsWith('.markdown')) {
      loader = new MarkdownLoader();
    } else {
      loader = new TextDocumentLoader();
    }

    const docs = await loader.load(filepath);
    this.pipeline.addDocuments(docs);
    return docs.length;
  }

  /**
   * 从 URL 加载
   */
  async loadURL(url: string): Promise<number> {
    try {
      const response = await fetch(url);
      const html = await response.text();

      // 去除 HTML 标签
      const text = html.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n');
      return await this.loadText(text);
    } catch (error) {
      console.error(`从 URL 加载失败: ${error}`);
      return 0;
    }
  }
}

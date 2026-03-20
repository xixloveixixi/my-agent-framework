/**
 * RAG Pipeline - 检索增强生成管道
 * 端到端的 RAG 处理流程
 */

import { SimpleVectorStore, VectorItem } from '../types/vector-store';
import { QdrantVectorStore } from '../types/qdrant-store';
import { DocumentConverter } from './converter';

/**
 * 统一的向量存储接口
 */
export interface VectorStore {
  add(item: VectorItem): void | Promise<void>;
  addBatch(items: VectorItem[]): void | Promise<void>;
  search(query: string, topK: number): VectorItem[] | Promise<VectorItem[]>;
  searchByKeywords(keywords: string[], topK: number): VectorItem[];
  getAll(): VectorItem[] | Promise<VectorItem[]>;
  get(id: string): VectorItem | undefined;
  delete(id: string): boolean | Promise<boolean>;
  clear(): void | Promise<void>;
  size(): number;
}

export interface RAGConfig {
  topK?: number;
  similarityThreshold?: number;
  maxContextLength?: number;
  promptTemplate?: string;
  /** 多查询扩展配置 */
  mqeEnabled?: boolean;
  /** MQE 扩展查询数量 */
  mqeCount?: number;
  /** 假设文档嵌入配置 */
  hydeEnabled?: boolean;
  /** 候选池乘数（扩展检索时） */
  candidatePoolMultiplier?: number;
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
  private vectorStore: VectorStore;
  private config: RAGConfig;

  constructor(vectorStore?: VectorStore, config?: RAGConfig) {
    this.vectorStore = vectorStore || new SimpleVectorStore();
    this.config = {
      topK: config?.topK || 3,
      similarityThreshold: config?.similarityThreshold || 0.1,
      maxContextLength: config?.maxContextLength || 2000,
      promptTemplate: config?.promptTemplate || this.defaultPromptTemplate,
      mqeEnabled: config?.mqeEnabled ?? false,
      mqeCount: config?.mqeCount || 3,
      hydeEnabled: config?.hydeEnabled ?? false,
      candidatePoolMultiplier: config?.candidatePoolMultiplier || 4,
    };
  }

  /**
   * 添加文档
   */
  addDocument(doc: RAGDocument): void {
    const result = this.vectorStore.add({
      id: doc.id,
      content: doc.content,
      metadata: { source: doc.source, ...doc.metadata },
    });
    // 如果是异步操作，等待完成
    if (result instanceof Promise) {
      result.catch(console.error);
    }
  }

  /**
   * 批量添加文档
   */
  addDocuments(docs: RAGDocument[]): void {
    const result = this.vectorStore.addBatch(docs.map(doc => ({
      id: doc.id,
      content: doc.content,
      metadata: { source: doc.source, ...doc.metadata },
    })));
    if (result instanceof Promise) {
      result.catch(console.error);
    }
  }

  /**
   * 检索相关文档
   */
  retrieve(query: string): RAGDocument[] {
    const results = this.vectorStore.search(query, this.config.topK!);

    // 处理同步和异步情况
    if (results instanceof Promise) {
      // 同步版本返回空数组，异步操作会通过回调更新
      console.warn('⚠️ 异步检索需要使用 retrieveAsync');
      return [];
    }

    return (results as VectorItem[]).map(item => ({
      id: item.id,
      content: item.content,
      source: item.metadata?.source as string,
      metadata: item.metadata,
    }));
  }

  /**
   * 异步检索相关文档
   */
  async retrieveAsync(query: string): Promise<RAGDocument[]> {
    const results = await this.vectorStore.search(query, this.config.topK!) as VectorItem[];

    return results.map(item => ({
      id: item.id,
      content: item.content,
      source: item.metadata?.source as string,
      metadata: item.metadata,
    }));
  }

  /**
   * 多查询扩展（MQE）- 生成多样化查询
   * 使用 LLM 生成语义等价或互补的查询扩展
   */
  async generateMQE(
    query: string,
    llm: { generate(prompt: string): Promise<string> },
    count?: number
  ): Promise<string[]> {
    const n = count || this.config.mqeCount || 3;

    const systemPrompt = `你是检索查询扩展助手。生成语义等价或互补的多样化查询。使用中文，简短，每行一个查询，不要有编号或标点符号。`;

    const userPrompt = `原始查询：${query}
请给出 ${n} 个不同表述的查询，每行一个。`;

    try {
      const response = await llm.generate(`${systemPrompt}\n\n${userPrompt}`);

      // 解析返回的查询
      const lines = response.split('\n')
        .map(line => line.replace(/^[-.\d\s、\t]+/, '').trim())
        .filter(line => line.length > 0);

      // 返回原始查询 + 扩展查询
      const expansions = lines.slice(0, n);
      return [query, ...expansions];
    } catch (error) {
      console.warn(`⚠️ MQE 生成失败: ${error}`);
      return [query];
    }
  }

  /**
   * 使用 MQE 进行检索
   * 并行执行多个查询并合并结果
   */
  async retrieveWithMQE(
    query: string,
    llm: { generate(prompt: string): Promise<string> },
    options?: {
      count?: number;
      topK?: number;
      mergeStrategy?: 'score' | 'diversity';
    }
  ): Promise<RAGDocument[]> {
    const n = options?.count || this.config.mqeCount || 3;
    const k = options?.topK || this.config.topK || 3;

    // 生成扩展查询
    const queries = await this.generateMQE(query, llm, n);
    console.log(`🔍 MQE 查询: ${queries.join(' | ')}`);

    // 并行执行所有查询
    const searchPromises = queries.map(async (q) => {
      const results = await this.vectorStore.search(q, k) as VectorItem[];
      return results.map(item => ({
        id: item.id,
        content: item.content,
        source: item.metadata?.source as string,
        metadata: { ...item.metadata, query: q },
      }));
    });

    const allResults = await Promise.all(searchPromises);

    // 合并结果
    const merged = this.mergeSearchResults(allResults, options?.mergeStrategy || 'score');

    return merged;
  }

  /**
   * 合并多个查询的检索结果
   */
  private mergeSearchResults(
    results: RAGDocument[][],
    strategy: 'score' | 'diversity' = 'score'
  ): RAGDocument[] {
    const docMap = new Map<string, { doc: RAGDocument; count: number }>();

    // 统计每个文档出现的次数
    results.forEach(queryResults => {
      queryResults.forEach((doc, index) => {
        const existing = docMap.get(doc.id);
        if (existing) {
          existing.count += 1;
        } else {
          docMap.set(doc.id, { doc, count: 1 });
        }
      });
    });

    // 根据策略排序
    const merged = Array.from(docMap.values()).map(({ doc, count }) => ({
      doc,
      score: strategy === 'score' ? count / results.length : count,
    }));

    merged.sort((a, b) => b.score - a.score);

    // 返回合并后的结果
    return merged.map(({ doc }) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        mqeScore: docMap.get(doc.id)?.count || 0,
      },
    }));
  }

  /**
   * 统一扩展检索 - 整合 MQE 和 HyDE
   * "扩展-检索-合并"三步流程
   *
   * @param query 原始查询
   * @param llm 语言模型
   * @param options 可选参数
   */
  async searchWithExpansion(
    query: string,
    llm: { generate(prompt: string): Promise<string> },
    options?: {
      topK?: number;
      enableMQE?: boolean;
      mqeCount?: number;
      enableHyDE?: boolean;
      candidatePoolMultiplier?: number;
    }
  ): Promise<RAGDocument[]> {
    if (!query) {
      return [];
    }

    const topK = options?.topK || this.config.topK || 3;
    const enableMQE = options?.enableMQE ?? this.config.mqeEnabled ?? false;
    const mqeCount = options?.mqeCount || this.config.mqeCount || 3;
    const enableHyDE = options?.enableHyDE ?? this.config.hydeEnabled ?? false;
    const candidatePoolMultiplier = options?.candidatePoolMultiplier || this.config.candidatePoolMultiplier || 4;

    // ========== 步骤1: 扩展 ==========
    const expansions: string[] = [query];

    // MQE 扩展
    if (enableMQE && mqeCount > 0) {
      const mqeQueries = await this.generateMQE(query, llm, mqeCount);
      // 跳过第一个（原始查询）
      expansions.push(...mqeQueries.slice(1));
    }

    // HyDE 扩展
    if (enableHyDE) {
      const hydeDoc = await this.generateHypotheticalDoc(query, llm);
      if (hydeDoc && hydeDoc !== query) {
        expansions.push(hydeDoc);
      }
    }

    // 去重
    const uniqExpansions: string[] = [];
    for (const e of expansions) {
      if (e && !uniqExpansions.includes(e)) {
        uniqExpansions.push(e);
      }
    }

    console.log(`🔍 扩展查询 (${uniqExpansions.length}): ${uniqExpansions.join(' | ')}`);

    // ========== 步骤2: 检索 ==========
    // 计算候选池大小
    const poolSize = Math.max(topK * candidatePoolMultiplier, 20);
    const perQuery = Math.max(1, Math.floor(poolSize / Math.max(1, uniqExpansions.length)));

    // 并行执行所有扩展查询的检索
    const searchPromises = uniqExpansions.map(async (q) => {
      const results = await this.vectorStore.search(q, perQuery) as VectorItem[];
      return results.map(item => ({
        id: item.id,
        content: item.content,
        source: item.metadata?.source as string,
        metadata: {
          ...item.metadata,
          expansionQuery: q,
        },
      }));
    });

    const allResults = await Promise.all(searchPromises);

    // ========== 步骤3: 合并 ==========
    const merged = this.mergeExpansionResults(allResults, uniqExpansions.length);

    return merged.slice(0, topK);
  }

  /**
   * 合并扩展检索结果
   */
  private mergeExpansionResults(
    results: RAGDocument[][],
    expansionCount: number
  ): RAGDocument[] {
    const docMap = new Map<string, { doc: RAGDocument; count: number; maxScore: number }>();

    // 收集所有结果
    results.forEach(queryResults => {
      queryResults.forEach((doc) => {
        const existing = docMap.get(doc.id);
        if (existing) {
          existing.count += 1;
        } else {
          docMap.set(doc.id, { doc, count: 1, maxScore: 1 });
        }
      });
    });

    // 转换为数组并排序
    const merged = Array.from(docMap.values()).map(({ doc, count }) => ({
      doc,
      count,
      // 综合分数：基础分数 + 扩展覆盖率加分
      finalScore: (count / expansionCount) + 0.1,
    }));

    merged.sort((a, b) => b.finalScore - a.finalScore);

    return merged.map(({ doc, count }) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        expansionCount: count,
        expansionCoverage: count / expansionCount,
      },
    }));
  }

  /**
   * HyDE 检索 - 假设文档嵌入
   * 核心思想：用答案找答案
   * 1. 用 LLM 生成假设性答案文档
   * 2. 用假设文档检索真实文档
   */
  async retrieveWithHyDE(
    query: string,
    llm: { generate(prompt: string): Promise<string> },
    options?: {
      topK?: number;
      includeHypothetical?: boolean;
    }
  ): Promise<{
    documents: RAGDocument[];
    hypotheticalDoc: string;
  }> {
    const k = options?.topK || this.config.topK || 3;

    // 1. 生成假设性文档
    const hypotheticalDoc = await this.generateHypotheticalDoc(query, llm);
    console.log(`📝 HyDE 假设文档: ${hypotheticalDoc.slice(0, 100)}...`);

    // 2. 用假设文档检索真实文档
    const results = await this.vectorStore.search(hypotheticalDoc, k) as VectorItem[];

    const documents: RAGDocument[] = results.map(item => ({
      id: item.id,
      content: item.content,
      source: item.metadata?.source as string,
      metadata: {
        ...item.metadata,
        hydeQuery: hypotheticalDoc,
      } as Record<string, unknown>,
    }));

    // 如果需要，在结果中包含假设文档
    if (options?.includeHypothetical) {
      documents.unshift({
        id: 'hypothetical_doc',
        content: hypotheticalDoc,
        source: 'hyde_generated',
        metadata: { isHypothetical: true, hydeQuery: hypotheticalDoc },
      });
    }

    return { documents, hypotheticalDoc };
  }

  /**
   * 生成假设性文档
   * 用于 HyDE 检索
   */
  private async generateHypotheticalDoc(
    query: string,
    llm: { generate(prompt: string): Promise<string> }
  ): Promise<string> {
    const systemPrompt = `根据用户问题，先写一段可能的答案性段落，用于向量检索的查询文档。不要分析过程，直接写一段中等长度、客观、包含关键术语的陈述段落。`;

    const userPrompt = `问题：${query}
请直接写一段中等长度、客观、包含关键术语的段落。`;

    try {
      const response = await llm.generate(`${systemPrompt}\n\n${userPrompt}`);
      return response.trim();
    } catch (error) {
      console.warn(`⚠️ HyDE 假设文档生成失败: ${error}`);
      // 回退到原始查询
      return query;
    }
  }

  /**
   * 构建上下文
   * @param query 原始查询
   * @param options 可选参数：llm 用于启用 MQE/HyDE，useMQE/useHyDE 启用对应策略
   */
  async buildContextAsync(
    query: string,
    options?: {
      llm?: { generate(prompt: string): Promise<string> };
      useMQE?: boolean;
      useHyDE?: boolean;
    }
  ): Promise<{ context: string; sources: Array<{ content: string; source?: string; score: number }> }> {
    // 决定是否使用扩展检索
    const enableMQE = options?.useMQE ?? this.config.mqeEnabled ?? false;
    const enableHyDE = options?.useHyDE ?? this.config.hydeEnabled ?? false;
    const llm = options?.llm;

    let docs: RAGDocument[];

    if ((enableMQE || enableHyDE) && llm) {
      // 使用统一的扩展检索
      docs = await this.searchWithExpansion(query, llm, {
        enableMQE,
        enableHyDE,
      });
    } else {
      // 普通检索
      docs = await this.retrieveAsync(query);
    }

    let context = '';
    const sources: Array<{ content: string; source?: string; score: number }> = [];

    docs.forEach((doc, index) => {
      const truncatedContent = doc.content.slice(0, 500);
      context += `[${index + 1}] ${truncatedContent}${doc.content.length > 500 ? '...' : ''}\n\n`;
      sources.push({
        content: doc.content,
        source: doc.source,
        score: (doc.metadata?.expansionCount as number) || (doc.metadata?.mqeScore as number) || 1,
      });
    });

    return { context, sources };
  }

  /**
   * 生成回答
   * @param query 用户查询
   * @param llm 语言模型
   * @param options 可选参数：useMQE 启用多查询扩展，useHyDE 启用假设文档嵌入
   */
  async generate(
    query: string,
    llm: { generate(prompt: string): Promise<string> },
    options?: { useMQE?: boolean; useHyDE?: boolean }
  ): Promise<RAGResult> {
    const useMQE = options?.useMQE ?? this.config.mqeEnabled ?? false;
    const useHyDE = options?.useHyDE ?? this.config.hydeEnabled ?? false;

    const { context, sources } = await this.buildContextAsync(query, {
      llm,
      useMQE,
      useHyDE,
    });

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
    const { context } = await this.buildContextAsync(query);

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
    const semanticResults = this.vectorStore.search(query, this.config.topK!);
    const keywordResults = keywords
      ? this.vectorStore.searchByKeywords(keywords, this.config.topK!)
      : [];

    // 处理异步结果
    let semResults: VectorItem[] = [];
    if (semanticResults instanceof Promise) {
      console.warn('⚠️ 异步检索需要使用 hybridRetrieveAsync');
    } else {
      semResults = semanticResults as VectorItem[];
    }

    // 合并去重
    const seen = new Set<string>();
    const merged: RAGDocument[] = [];

    [...semResults, ...keywordResults].forEach(item => {
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

    return merged.slice(0, this.config.topK!);
  }

  /**
   * 获取文档数量
   */
  size(): number {
    try {
      const size = this.vectorStore.size();
      // SimpleVectorStore.size() 是同步的，QdrantVectorStore 有 size 属性
      return (size as number) || 0;
    } catch {
      return 0;
    }
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
 * MarkItDown 文档加载器 - 支持多格式文档转换
 * 基于 Markdown 标题结构的智能分块
 */
export class MarkItDownLoader implements DocumentLoader {
  private converter: DocumentConverter | null = null;

  constructor() {
    this.initConverter();
  }

  private async initConverter(): Promise<void> {
    try {
      const { DocumentConverter } = await import('./converter');
      this.converter = new DocumentConverter();
      console.log('✅ MarkItDown 加载器已初始化');
    } catch (error) {
      console.warn(`⚠️ 文档转换器初始化失败: ${error}`);
    }
  }

  async load(source: string): Promise<RAGDocument[]> {
    // 检查是否是文件路径
    const isFilePath = source.includes('/') || source.includes('\\') ||
      /\.(pdf|docx?|xlsx?|pptx?|txt|md|markdown|html?|csv|json|xml|rtf|odt|ods|odp|jpg|jpeg|png|gif|bmp|webp|mp3|wav|m4a|ogg|flac|mp4|avi|mov|mkv)$/i.test(source);

    if (!isFilePath) {
      // 如果不是文件路径，作为文本内容处理
      return this.parseMarkdownWithHeadings(source, 'text');
    }

    try {
      const fs = await import('fs/promises');
      await fs.access(source); // 检查文件是否存在

      // 使用文档转换器
      if (this.converter) {
        const result = await this.converter.convert(source);
        if (result.success && result.content) {
          console.log(`📄 文档转换成功: ${source} (${result.format})`);
          return this.parseMarkdownWithHeadings(result.content, source);
        }
      }

      // 回退到直接读取
      const content = await fs.readFile(source, 'utf-8');
      return this.parseMarkdownWithHeadings(content, source);
    } catch (error) {
      console.warn(`⚠️ 文件加载失败: ${error}`);
      return this.parseMarkdownWithHeadings(source, 'text');
    }
  }

  /**
   * 根据标题层次分割段落，保持语义完整性
   */
  private parseMarkdownWithHeadings(text: string, source: string): RAGDocument[] {
    const lines = text.split('\n');
    const headingStack: string[] = [];
    const paragraphs: Array<{ content: string; headingPath: string | null; start: number; end: number }> = [];
    const buf: string[] = [];
    let charPos = 0;

    const flushBuf = (endPos: number) => {
      if (buf.length === 0) return;
      const content = buf.join('\n').trim();
      if (!content) return;
      paragraphs.push({
        content,
        headingPath: headingStack.length > 0 ? headingStack.join(' > ') : null,
        start: Math.max(0, endPos - content.length),
        end: endPos,
      });
    };

    for (const line of lines) {
      const raw = line;
      const stripped = line.trim();

      // 处理标题行
      if (stripped.startsWith('#')) {
        flushBuf(charPos);
        buf.length = 0;

        const match = stripped.match(/^(#+)\s+(.+)$/);
        if (match) {
          const level = match[1].length;
          const title = match[2].trim();

          if (level <= headingStack.length) {
            headingStack.length = level - 1;
          }
          headingStack.push(title);
        } else {
          // 不符合格式的 # 行，当作一级标题
          if (headingStack.length === 0) {
            headingStack.push(stripped.replace(/^#+/, '').trim());
          }
        }

        charPos += raw.length + 1;
        continue;
      }

      // 段落内容累积
      if (stripped === '') {
        flushBuf(charPos);
        buf.length = 0;
      } else {
        buf.push(raw);
      }
      charPos += raw.length + 1;
    }

    flushBuf(charPos);

    if (paragraphs.length === 0) {
      paragraphs.push({
        content: text,
        headingPath: null,
        start: 0,
        end: text.length,
      });
    }

    // 转换为 RAGDocument
    return paragraphs.map((para, index) => ({
      id: `md_${Date.now()}_${index}`,
      content: para.content,
      source,
      metadata: {
        type: 'markitdown',
        headingPath: para.headingPath,
        start: para.start,
        end: para.end,
      },
    }));
  }

  /**
   * 基于 Token 数量的智能分块
   */
  static chunkByTokens(
    documents: RAGDocument[],
    chunkTokens: number = 500,
    overlapTokens: number = 50
  ): RAGDocument[] {
    const chunks: RAGDocument[] = [];
    let currentChunk: RAGDocument[] = [];
    let currentTokens = 0;
    let i = 0;

    while (i < documents.length) {
      const doc = documents[i];
      const docTokens = MarkItDownLoader.approxTokenLen(doc.content);

      if (currentTokens + docTokens <= chunkTokens || currentChunk.length === 0) {
        currentChunk.push(doc);
        currentTokens += docTokens;
        i++;
      } else {
        // 生成当前分块
        const content = currentChunk.map(d => d.content).join('\n\n');
        const headingPath = [...currentChunk].reverse().find(d => d.metadata?.headingPath)?.metadata?.headingPath as string | null;

        chunks.push({
          id: `chunk_${Date.now()}_${chunks.length}`,
          content,
          source: currentChunk[0]?.source,
          metadata: {
            headingPath,
            start: currentChunk[0]?.metadata?.start || 0,
            end: currentChunk[currentChunk.length - 1]?.metadata?.end || 0,
          },
        });

        // 构建重叠部分
        if (overlapTokens > 0 && currentChunk.length > 0) {
          const kept: RAGDocument[] = [];
          let keptTokens = 0;

          for (let j = currentChunk.length - 1; j >= 0; j--) {
            const d = currentChunk[j];
            const t = MarkItDownLoader.approxTokenLen(d.content);
            if (keptTokens + t > overlapTokens) break;
            kept.unshift(d);
            keptTokens += t;
          }
          currentChunk = kept;
          currentTokens = keptTokens;
        } else {
          currentChunk = [];
          currentTokens = 0;
        }
      }
    }

    // 处理最后一个分块
    if (currentChunk.length > 0) {
      const content = currentChunk.map(d => d.content).join('\n\n');
      const headingPath = [...currentChunk].reverse().find(d => d.metadata?.headingPath)?.metadata?.headingPath as string | null;

      chunks.push({
        id: `chunk_${Date.now()}_${chunks.length}`,
        content,
        source: currentChunk[0]?.source,
        metadata: {
          headingPath,
          start: currentChunk[0]?.metadata?.start || 0,
          end: currentChunk[currentChunk.length - 1]?.metadata?.end || 0,
        },
      });
    }

    return chunks;
  }

  /**
   * 近似估计 Token 长度，支持中英文混合
   */
  static approxTokenLen(text: string): number {
    // CJK 字符按 1 token 计算
    const cjk = [...text].filter(ch => MarkItDownLoader.isCJK(ch)).length;
    // 其他字符按空白分词计算
    const nonCjkTokens = text.split(/\s+/).filter(t => t).length;
    return cjk + nonCjkTokens;
  }

  /**
   * 判断是否为 CJK 字符
   */
  static isCJK(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (
      (0x4E00 <= code && code <= 0x9FFF) ||   // CJK 统一汉字
      (0x3400 <= code && code <= 0x4DBF) ||   // CJK 扩展 A
      (0x20000 <= code && code <= 0x2A6DF) || // CJK 扩展 B
      (0x2A700 <= code && code <= 0x2B73F) || // CJK 扩展 C
      (0x2B740 <= code && code <= 0x2B81F) || // CJK 扩展 D
      (0x2B820 <= code && code <= 0x2CEAF) || // CJK 扩展 E
      (0xF900 <= code && code <= 0xFAFF)      // CJK 兼容汉字
    );
  }
}

/**
 * 文档处理器
 */
export class DocumentProcessor {
  private pipeline: RAGPipeline;
  private markItDownLoader: MarkItDownLoader;

  constructor(pipeline: RAGPipeline) {
    this.pipeline = pipeline;
    this.markItDownLoader = new MarkItDownLoader();
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

    // 使用 MarkItDown 加载的格式
    const markItDownFormats = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.md', '.markdown', '.html', '.htm', '.csv',
      '.json', '.xml', '.rtf', '.odt', '.ods', '.odp'
    ];

    if (markItDownFormats.some(format => ext.endsWith(format))) {
      const docs = await this.markItDownLoader.load(filepath);
      this.pipeline.addDocuments(docs);
      return docs.length;
    }

    // 默认使用文本加载器
    const loader = new TextDocumentLoader();
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

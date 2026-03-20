/**
 * RAG Tool - 检索增强工具
   提供完整的 RAG 能力：
    - 添加多格式文档（PDF、Office、图片、音频等）
    - 智能检索与召回
    - LLM 增强问答
    - 知识库管理
    - 支持 Qdrant 向量数据库
    - 多管道/多命名空间支持
    任意格式文档 → MarkItDown转换 → Markdown文本 → 智能分块 → 向量化 → 存储检索

 */

import { BaseTool, ToolParameter } from './base';
import { RAGPipeline, DocumentProcessor, TextDocumentLoader } from '../memory/rag/pipeline';
import { SimpleVectorStore } from '../memory/types/vector-store';
import { QdrantVectorStore, QdrantConfig } from '../memory/types/qdrant-store';

export interface RAGToolConfig {
  /** Qdrant 服务 URL */
  qdrantUrl?: string;
  /** Qdrant API Key */
  qdrantApiKey?: string;
  /** 集合名称 */
  collectionName?: string;
  /** 命名空间/管道名 */
  namespace?: string;
  /** 默认使用内存存储 */
  useMemory?: boolean;
}

export class RAGTool extends BaseTool {
  name = 'rag';
  description = '检索增强生成工具，基于知识库回答问题，支持 Qdrant 向量数据库';
  private pipelines: Map<string, RAGPipeline> = new Map();
  private docProcessors: Map<string, DocumentProcessor> = new Map();
  private defaultNamespace: string;

  constructor(config: RAGToolConfig = {}) {
    super();
    this.defaultNamespace = config.namespace || 'default';

    // 初始化默认管道
    this.createPipeline(config);
  }

  /**
   * 创建 RAG 管道
   */
  private createPipeline(config: RAGToolConfig): void {
    const namespace = config.namespace || 'default';

    // 创建向量存储
    let vectorStore: SimpleVectorStore | QdrantVectorStore;

    if (config.qdrantUrl && !config.useMemory) {
      // 使用 Qdrant
      const qdrantConfig: QdrantConfig = {
        url: config.qdrantUrl,
        apiKey: config.qdrantApiKey,
        collectionName: config.collectionName || 'rag_knowledge_base',
      };
      vectorStore = new QdrantVectorStore(qdrantConfig);
      console.log(`📦 RAG 管道 [${namespace}]: 使用 Qdrant 向量数据库`);
    } else {
      // 使用内存存储
      vectorStore = new SimpleVectorStore();
      console.log(`📦 RAG 管道 [${namespace}]: 使用内存向量存储`);
    }

    const pipeline = new RAGPipeline(vectorStore as SimpleVectorStore);
    const processor = new DocumentProcessor(pipeline);

    this.pipelines.set(namespace, pipeline);
    this.docProcessors.set(namespace, processor);
  }

  /**
   * 获取当前命名空间
   */
  private getCurrentPipeline(): { pipeline: RAGPipeline; processor: DocumentProcessor } {
    const pipeline = this.pipelines.get(this.defaultNamespace);
    const processor = this.docProcessors.get(this.defaultNamespace);

    if (!pipeline || !processor) {
      throw new Error(`管道 ${this.defaultNamespace} 不存在`);
    }

    return { pipeline, processor };
  }

  /**
   * 切换命名空间
   */
  useNamespace(namespace: string): void {
    if (!this.pipelines.has(namespace)) {
      // 自动创建新管道
      this.createPipeline({
        namespace,
        qdrantUrl: undefined, // 新命名空间默认使用内存
      });
    }
    this.defaultNamespace = namespace;
  }

  /**
   * 创建新命名空间管道
   */
  createNamespace(config: RAGToolConfig & { namespace: string }): void {
    this.createPipeline(config);
  }

  /**
   * 获取所有命名空间
   */
  getNamespaces(): string[] {
    return Array.from(this.pipelines.keys());
  }

  /**
   * 获取 RAG 管道
   */
  getPipeline(namespace?: string): RAGPipeline | undefined {
    return this.pipelines.get(namespace || this.defaultNamespace);
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'action',
        type: 'string',
        description: '操作: ask(问答), add(添加文档), load(加载文件), clear(清空)',
        required: true,
      },
      {
        name: 'query',
        type: 'string',
        description: '问题或搜索内容',
        required: false,
      },
      {
        name: 'content',
        type: 'string',
        description: '要添加的文档内容',
        required: false,
      },
      {
        name: 'source',
        type: 'string',
        description: '文档来源路径或 URL',
        required: false,
      },
    ];
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const action = params.action as string;

    try {
      switch (action) {
        case 'ask':
          return '❌ RAG 需要 LLM 才能回答问题，请在 Agent 中配置';

        case 'add':
          return await this.addContent(params.content as string);

        case 'load':
          return await this.loadSource(params.source as string);

        case 'clear':
          return this.clear();

        case 'stats':
          return this.getStats();

        case 'namespace':
          return this.switchNamespace(params.query as string);

        default:
          return `❌ 未知操作: ${action}`;
      }
    } catch (error) {
      return `❌ RAG 工具错误: ${(error as Error).message}`;
    }
  }

  /**
   * 切换命名空间
   */
  private switchNamespace(namespace: string): string {
    if (!namespace) {
      return `📂 当前命名空间: ${this.defaultNamespace}\n可用命名空间: ${this.getNamespaces().join(', ')}`;
    }
    this.useNamespace(namespace);
    return `✅ 已切换到命名空间: ${namespace}`;
  }

  /**
   * 添加内容到知识库
   */
  private async addContent(content: string): Promise<string> {
    const { processor } = this.getCurrentPipeline();
    const count = await processor.loadText(content);
    return `✅ 已添加 ${count} 个文档片段到知识库 [${this.defaultNamespace}]`;
  }

  /**
   * 从文件加载
   */
  private async loadSource(source: string): Promise<string> {
    if (!source) {
      return '❌ 请提供 source 参数（文件路径或 URL）';
    }

    const { processor } = this.getCurrentPipeline();
    let count = 0;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      count = await processor.loadURL(source);
    } else {
      count = await processor.loadFile(source);
    }

    return `✅ 已从 ${source} 加载 ${count} 个文档 [${this.defaultNamespace}]`;
  }

  /**
   * 清空知识库
   */
  private clear(): string {
    const { pipeline } = this.getCurrentPipeline();
    pipeline.clear();
    return `✅ 知识库已清空 [${this.defaultNamespace}]`;
  }

  /**
   * 获取统计
   */
  private getStats(): string {
    const { pipeline } = this.getCurrentPipeline();
    return `📚 知识库统计 [${this.defaultNamespace}]: ${pipeline.size()} 个文档`;
  }
}

/**
 * RAG 问答工具 - 需要 LLM
 */
export class RAGQATool extends BaseTool {
  name = 'rag_qa';
  description = '基于知识库的问答工具';
  private ragPipeline: RAGPipeline;
  private llm?: { generate(prompt: string): Promise<string> };

  constructor(ragPipeline?: RAGPipeline, llm?: { generate(prompt: string): Promise<string> }) {
    super();
    this.ragPipeline = ragPipeline || new RAGPipeline();
    this.llm = llm;
  }

  /**
   * 设置 LLM
   */
  setLLM(llm: { generate(prompt: string): Promise<string> }): void {
    this.llm = llm;
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'question',
        type: 'string',
        description: '问题',
        required: true,
      },
    ];
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    if (!this.llm) {
      return '❌ RAG QA 需要配置 LLM';
    }

    const question = params.question as string;
    if (!question) {
      return '❌ 请提供 question 参数';
    }

    try {
      const result = await this.ragPipeline.generate(question, this.llm);

      let output = `${result.answer}\n\n---\n\n📚 参考来源:\n`;
      result.sources.forEach((source, index) => {
        output += `${index + 1}. ${source.content.slice(0, 100)}...${source.source ? ` (${source.source})` : ''}\n`;
      });

      return output;
    } catch (error) {
      return `❌ 问答失败: ${(error as Error).message}`;
    }
  }
}

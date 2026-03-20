/**
 * RAG Tool - 检索增强工具
 * 为 Agent 提供知识问答能力
 */

import { BaseTool, ToolParameter } from './base';
import { RAGPipeline, DocumentProcessor, TextDocumentLoader } from '../memory/rag/pipeline';

export class RAGTool extends BaseTool {
  name = 'rag';
  description = '检索增强生成工具，基于知识库回答问题';
  private ragPipeline: RAGPipeline;
  private docProcessor: DocumentProcessor;

  constructor(ragPipeline?: RAGPipeline) {
    super();
    this.ragPipeline = ragPipeline || new RAGPipeline();
    this.docProcessor = new DocumentProcessor(this.ragPipeline);
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

        default:
          return `❌ 未知操作: ${action}`;
      }
    } catch (error) {
      return `❌ RAG 工具错误: ${(error as Error).message}`;
    }
  }

  /**
   * 添加内容到知识库
   */
  private async addContent(content: string): Promise<string> {
    const count = await this.docProcessor.loadText(content);
    return `✅ 已添加 ${count} 个文档片段到知识库`;
  }

  /**
   * 从文件加载
   */
  private async loadSource(source: string): Promise<string> {
    if (!source) {
      return '❌ 请提供 source 参数（文件路径或 URL）';
    }

    let count = 0;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      count = await this.docProcessor.loadURL(source);
    } else {
      count = await this.docProcessor.loadFile(source);
    }

    return `✅ 已从 ${source} 加载 ${count} 个文档`;
  }

  /**
   * 清空知识库
   */
  private clear(): string {
    this.ragPipeline.clear();
    return '✅ 知识库已清空';
  }

  /**
   * 获取统计
   */
  private getStats(): string {
    return `📚 知识库统计: ${this.ragPipeline.size()} 个文档`;
  }

  /**
   * 获取 RAG 管道（供 Agent 使用）
   */
  getPipeline(): RAGPipeline {
    return this.ragPipeline;
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

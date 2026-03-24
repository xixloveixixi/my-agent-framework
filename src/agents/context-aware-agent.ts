/**
 * ContextAwareAgent - 具有上下文感知能力的 Agent
 * 集成 ContextBuilder GSSC 流水线，自动构建优化的上下文
 */

import { SimpleAgent } from './simple-agent';
import { HelloAgentsLLM } from '../core/llm';
import { Message } from '../core/message';
import { ToolRegistry } from '../tools/registry';
import { AgentConfig, MessageRole } from '../types';
import {
  ContextBuilder,
  ContextConfig,
  GatherParams,
  ContextTool,
} from '../context';

export interface ContextAwareAgentConfig extends AgentConfig {
  /** 记忆工具 */
  memoryTool?: ContextTool;
  /** RAG 工具 */
  ragTool?: ContextTool;
  /** 上下文配置 */
  contextConfig?: Partial<ContextConfig>;
  /** 是否自动记录到记忆 */
  autoMemory?: boolean;
}

export class ContextAwareAgent extends SimpleAgent {
  private contextBuilder: ContextBuilder;
  private memoryTool?: ContextTool;
  private ragTool?: ContextTool;
  private autoMemory: boolean;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    options?: ContextAwareAgentConfig
  ) {
    super(name, llm, {
      ...options,
      systemPrompt: options?.systemPrompt || '你是一个有用的AI助手。',
    });

    // 初始化上下文构建器
    this.memoryTool = options?.memoryTool;
    this.ragTool = options?.ragTool;
    this.autoMemory = options?.autoMemory ?? true;

    this.contextBuilder = new ContextBuilder(options?.contextConfig || {
      maxTokens: 4000,
      reserveRatio: 0.2,
      minRelevance: 0.1,
      enableCompression: true,
    });

    console.log(`🧠 ${name} 上下文感知模式已启用`);
  }

  /**
   * 运行 Agent，自动构建优化的上下文
   */
  async run(input: string, options?: { maxIterations?: number }): Promise<string> {
    console.log(`\n🤖 ${this.name} 正在处理: ${input}`);

    // 1. 使用 ContextBuilder 构建优化的上下文
    const contextResult = await this.buildContext(input);

    // 2. 构建消息列表
    const messages = this.buildContextMessages(input, contextResult.structuredContext);

    // 3. 调用 LLM
    const response = await this.llm.invoke(messages);

    // 4. 保存到历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(response, 'assistant'));

    // 5. 自动记录到记忆
    if (this.autoMemory && this.memoryTool) {
      await this.recordToMemory(input, response);
    }

    console.log(`✅ ${this.name} 响应完成`);
    return response;
  }

  /**
   * 构建优化的上下文
   */
  private async buildContext(userQuery: string): Promise<{
    structuredContext?: string;
    totalTokens: number;
    utilization: number;
  }> {
    // 准备对话历史
    const conversationHistory = this.getHistory().map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));

    const params: GatherParams = {
      userQuery,
      conversationHistory,
      systemInstructions: this.systemPrompt,
      memoryTool: this.memoryTool,
      ragTool: this.ragTool,
    };

    return await this.contextBuilder.build(params);
  }

  /**
   * 构建使用优化上下文的消息列表
   */
  private buildContextMessages(
    input: string,
    structuredContext?: string
  ): Array<{ role: MessageRole; content: string }> {
    const messages: Array<{ role: MessageRole; content: string }> = [];

    // 优先使用结构化上下文
    if (structuredContext) {
      messages.push({ role: 'system', content: structuredContext });
    } else {
      // 回退到原始系统提示
      messages.push({
        role: 'system',
        content: this.systemPrompt || '你是一个有用的AI助手。',
      });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: input });

    return messages;
  }

  /**
   * 记录交互到记忆系统
   */
  private async recordToMemory(userInput: string, response: string): Promise<void> {
    if (!this.memoryTool) return;

    try {
      await this.memoryTool.run({
        action: 'add',
        content: `Q: ${userInput}\nA: ${response.slice(0, 200)}...`,
        memory_type: 'episodic',
        importance: 0.6,
      });
    } catch (e) {
      console.warn(`[ContextAwareAgent] 记录记忆失败: ${e}`);
    }
  }

  /**
   * 更新上下文配置
   */
  updateContextConfig(config: Partial<ContextConfig>): void {
    this.contextBuilder.updateConfig(config);
    console.log(`🧠 ${this.name} 上下文配置已更新`);
  }

  /**
   * 获取当前上下文统计
   */
  getContextStats(): ContextConfig {
    return this.contextBuilder.getConfig();
  }

  /**
   * 手动触发记忆检索
   */
  async searchMemory(query: string): Promise<string> {
    if (!this.memoryTool) {
      return '记忆工具未配置';
    }
    return this.memoryTool.run({
      action: 'search',
      query,
      limit: 5,
    });
  }

  /**
   * 手动触发 RAG 检索
   */
  async searchKnowledge(query: string): Promise<string> {
    if (!this.ragTool) {
      return 'RAG 工具未配置';
    }
    return this.ragTool.run({
      action: 'search',
      query,
      limit: 5,
    });
  }

  /**
   * 流式运行（继承自 SimpleAgent）
   */
  async *streamRun(
    input: string
  ): AsyncGenerator<string> {
    console.log(`🌊 ${this.name} 开始流式处理: ${input}`);

    // 构建上下文
    const contextResult = await this.buildContext(input);
    const messages = this.buildContextMessages(input, contextResult.structuredContext);

    // 流式调用 LLM
    let fullResponse = '';
    console.log('📝 实时响应: ');

    for await (const chunk of this.llm.stream(messages)) {
      fullResponse += chunk;
      yield chunk;
    }

    // 保存到历史和记忆
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(fullResponse, 'assistant'));

    if (this.autoMemory && this.memoryTool) {
      await this.recordToMemory(input, fullResponse);
    }

    console.log(`\n✅ ${this.name} 流式响应完成`);
  }

  toString(): string {
    return `ContextAwareAgent(name=${this.name}, context=${this.getContextStats().maxTokens} tokens)`;
  }
}

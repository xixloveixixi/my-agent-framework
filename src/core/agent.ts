/**
 * Agent 基类 - 抽象基类
 */
import { HelloAgentsLLM } from './llm';
import { Message } from './message';
import { Config } from './config';
import { AgentConfig, Tool } from '../types';

export abstract class Agent {
  protected name: string;
  protected llm: HelloAgentsLLM;
  protected systemPrompt?: string;
  protected config: Config;
  protected history: Message[] = [];
  protected tools: Map<string, Tool> = new Map();

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    config?: AgentConfig
  ) {
    this.name = name;
    this.llm = llm;
    this.systemPrompt = config?.systemPrompt;
    this.config = new Config();
  }

  /**
   * 运行 Agent - 抽象方法
   */
  abstract run(input: string, options?: Record<string, unknown>): Promise<string>;

  /**
   * 添加消息到历史记录
   */
  addMessage(message: Message): void {
    this.history.push(message);
    // 限制历史长度
    if (this.history.length > this.config.maxHistoryLength) {
      this.history = this.history.slice(-this.config.maxHistoryLength);
    }
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 获取历史记录
   */
  getHistory(): Message[] {
    return [...this.history];
  }

  /**
   * 添加工具
   */
  addTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    console.log(`🔧 工具已添加: ${tool.name}`);
  }

  /**
   * 移除工具
   */
  removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 获取所有工具描述
   */
  getToolsDescription(): string {
    if (this.tools.size === 0) {
      return '暂无可用工具';
    }

    const descriptions: string[] = [];
    for (const [name, tool] of this.tools) {
      descriptions.push(`- ${name}: ${tool.description}`);
    }
    return descriptions.join('\n');
  }

  /**
   * 获取工具 JSON 格式
   */
  getToolsForPrompt(): string {
    if (this.tools.size === 0) {
      return '[]';
    }

    const toolsArray: Record<string, unknown>[] = [];
    for (const [name, tool] of this.tools) {
      toolsArray.push({
        name,
        description: tool.description,
        parameters: tool.parameters || {},
      });
    }
    return JSON.stringify(toolsArray, null, 2);
  }

  /**
   * 执行工具调用
   */
  protected async executeTool(name: string, params: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `错误: 工具 ${name} 不存在`;
    }

    try {
      const result = await tool.execute(params);
      return result;
    } catch (error) {
      return `工具执行错误: ${(error as Error).message}`;
    }
  }

  toString(): string {
    return `Agent(name=${this.name}, provider=${this.llm.getProvider()})`;
  }
}

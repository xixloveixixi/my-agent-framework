/**
 * SimpleAgent - 简单对话 Agent（详细版，继承基类）
 */
import { Agent } from '../core/agent';
import { HelloAgentsLLM } from '../core/llm';
import { Message } from '../core/message';
import { ToolRegistry } from '../tools/registry';
import { AgentConfig, Tool, MessageRole } from '../types';

export class SimpleAgent extends Agent {
  private enableToolCalling: boolean;
  private toolRegistry?: ToolRegistry;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    options?: AgentConfig & {
      toolRegistry?: ToolRegistry;
      enableToolCalling?: boolean;
    }
  ) {
    super(name, llm, options);

    this.toolRegistry = options?.toolRegistry;

    // 计算可用工具数量
    const toolCount = (this.toolRegistry?.size() || 0) + this.tools.size;

    // 只有明确启用且有可用工具时才开启
    this.enableToolCalling = (options?.enableToolCalling ?? true) && toolCount > 0;

    console.log(`✅ ${name} 初始化完成，工具调用: ${this.enableToolCalling ? '启用' : '禁用'}`);
    if (this.enableToolCalling) {
      console.log(`🔧 可用工具数量: ${toolCount}`);
    }
  }

  /**
   * 运行 Agent
   */
  async run(input: string, options?: { maxIterations?: number }): Promise<string> {
    const maxIterations = options?.maxIterations || 3;
    console.log(`🤖 ${this.name} 正在处理: ${input}`);

    // 构建消息列表
    const messages = this.buildMessages(input);

    if (!this.enableToolCalling || this.tools.size === 0) {
      // 简单对话模式
      const response = await this.llm.invoke(messages);
      this.addMessage(new Message(input, 'user'));
      this.addMessage(new Message(response, 'assistant'));
      console.log(`✅ ${this.name} 响应完成`);
      return response;
    }

    // 工具调用模式
    return this.runWithTools(messages, input, maxIterations);
  }

  /**
   * 构建消息列表
   */
  private buildMessages(input: string): Array<{ role: MessageRole; content: string }> {
    const messages: Array<{ role: MessageRole; content: string }> = [];

    // 添加系统消息
    const systemPrompt = this.getEnhancedSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });

    // 添加历史消息
    for (const msg of this.history) {
      messages.push({ role: msg.role as MessageRole, content: msg.content });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: input });

    return messages;
  }

  /**
   * 获取增强的系统提示词
   */
  private getEnhancedSystemPrompt(): string {
    const basePrompt = this.systemPrompt || '你是一个有用的AI助手。';

    if (!this.enableToolCalling || this.tools.size === 0) {
      return basePrompt;
    }

    const toolsDescription = this.getToolsDescription();
    if (!toolsDescription || toolsDescription === '暂无可用工具') {
      return basePrompt;
    }

    return `${basePrompt}

## 可用工具
你可以使用以下工具来帮助回答问题:
${toolsDescription}

## 工具调用格式
当需要使用工具时，请使用以下格式:
\`[TOOL_CALL:{tool_name}:{parameters}]\`

例如:
- \`[TOOL_CALL:calculator:{"expression":"2+3"}]\`
- \`[TOOL_CALL:search:query=Python]\`
- \`[TOOL_CALL:search:action=search,query=AI,limit=5]\`

工具调用结果会自动插入到对话中，然后你可以基于结果继续回答。`;
  }

  /**
   * 带工具调用的运行逻辑
   */
  private async runWithTools(
    messages: Array<{ role: MessageRole; content: string }>,
    input: string,
    maxIterations: number
  ): Promise<string> {
    let currentIteration = 0;
    let finalResponse = '';

    while (currentIteration < maxIterations) {
      // 调用 LLM
      const response = await this.llm.invoke(messages);

      // 检查是否有工具调用
      const toolCalls = this.parseToolCalls(response);

      if (toolCalls.length > 0) {
        console.log(`🔧 检测到 ${toolCalls.length} 个工具调用`);

        // 移除工具调用标记
        let cleanResponse = response;
        const toolResults: string[] = [];

        for (const call of toolCalls) {
          const result = await this.executeTool(call.toolName, call.parameters);
          toolResults.push(result);
          cleanResponse = cleanResponse.replace(call.original, '');
        }

        // 添加助手响应
        messages.push({ role: 'assistant', content: cleanResponse });

        // 添加工具结果
        const toolResultsText = toolResults.join('\n\n');
        messages.push({
          role: 'user',
          content: `工具执行结果:\n${toolResultsText}\n\n请基于这些结果给出完整的回答。`,
        });

        currentIteration++;
        continue;
      }

      // 没有工具调用，这是最终响应
      finalResponse = response;
      break;
    }

    // 超过最大迭代次数，获取最后响应
    if (currentIteration >= maxIterations && !finalResponse) {
      finalResponse = await this.llm.invoke(messages);
    }

    // 保存到历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(finalResponse, 'assistant'));
    console.log(`✅ ${this.name} 响应完成`);

    return finalResponse;
  }

  /**
   * 解析工具调用
   */
  private parseToolCalls(response: string): Array<{
    toolName: string;
    parameters: Record<string, unknown>;
    original: string;
  }> {
    const toolCalls: Array<{
      toolName: string;
      parameters: Record<string, unknown>;
      original: string;
    }> = [];

    // 匹配 [TOOL_CALL:toolName:params]
    const regex = /\[TOOL_CALL:([^:]+):([^\]]+)\]/g;
    let match;

    while ((match = regex.exec(response)) !== null) {
      try {
        // 尝试 JSON 解析
        const params = JSON.parse(match[2]);
        toolCalls.push({
          toolName: match[1].trim(),
          parameters: params,
          original: match[0],
        });
      } catch {
        // JSON 解析失败，作为字符串处理
        toolCalls.push({
          toolName: match[1].trim(),
          parameters: { value: match[2].trim() },
          original: match[0],
        });
      }
    }

    return toolCalls;
  }

  // ==================== 便利方法 ====================

  /**
   * 检查是否有可用工具
   */
  hasTools(): boolean {
    return this.enableToolCalling && this.tools.size > 0;
  }

  /**
   * 列出所有可用工具
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 启用/禁用工具调用
   */
  setToolCalling(enabled: boolean): void {
    this.enableToolCalling = enabled;
  }

  /**
   * 流式运行 Agent
   */
  async *streamRun(input: string): AsyncGenerator<string> {
    console.log(`🌊 ${this.name} 开始流式处理: ${input}`);

    const messages = this.buildMessages(input);

    // 流式调用 LLM
    let fullResponse = '';
    console.log('📝 实时响应: ');

    for await (const chunk of this.llm.stream(messages)) {
      fullResponse += chunk;
      yield chunk;
    }

    // 保存到历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(fullResponse, 'assistant'));
    console.log(`\n✅ ${this.name} 流式响应完成`);
  }

  toString(): string {
    return `SimpleAgent(name=${this.name}, tools=${this.listTools().join(', ') || 'none'})`;
  }
}

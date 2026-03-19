/**
 * ReActAgent - 推理+行动 Agent
 * 遵循 ReAct (Reasoning + Acting) 范式
 */
import { Agent } from '../core/agent';
import { HelloAgentsLLM } from '../core/llm';
import { Message } from '../core/message';
import { AgentConfig, ToolCall, Message as MessageType } from '../types';

export class ReActAgent extends Agent {
  private maxIterations: number;
  private verbose: boolean;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    config?: AgentConfig & { maxIterations?: number; verbose?: boolean }
  ) {
    super(name, llm, config);
    this.maxIterations = config?.maxIterations || 5;
    this.verbose = config?.verbose || false;
    console.log(`✅ ${name} (ReAct) 初始化完成`);
  }

  /**
   * 运行 Agent
   */
  async run(input: string, options: Record<string, unknown> = {}): Promise<string> {
    const maxIterations = (options.maxIterations as number) || this.maxIterations;
    console.log(`🤖 ${this.name} (ReAct) 正在处理: ${input}`);

    // 构建消息列表
    const messages = this.buildMessages(input);
    let step = 0;
    let finalResponse = '';

    while (step < maxIterations) {
      step++;

      // 调用 LLM
      const response = await this.llm.invoke(messages);

      if (this.verbose) {
        console.log(`\n--- Step ${step} ---`);
        console.log(response);
      }

      // 解析 Thought, Action, Observation
      const parsed = this.parseReActResponse(response);

      if (!parsed.action) {
        // 没有 action，这是最终响应
        finalResponse = response;
        break;
      }

      // 执行 action
      const observation = await this.executeTool(parsed.action, parsed.actionInput || {});

      if (this.verbose) {
        console.log(`Observation: ${observation}`);
      }

      // 添加到消息中
      messages.push({ role: 'assistant', content: response });
      messages.push({
        role: 'user',
        content: `Observation: ${observation}`,
      });
    }

    // 保存到历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(finalResponse, 'assistant'));

    return finalResponse;
  }

  /**
   * 构建消息列表
   */
  private buildMessages(input: string): MessageType[] {
    const messages: MessageType[] = [];

    // ReAct 格式的系统提示词
    const systemPrompt = this.getReActSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });

    // 添加历史消息
    for (const msg of this.history) {
      messages.push(msg.toDict());
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: input });

    return messages;
  }

  /**
   * ReAct 系统提示词
   */
  private getReActSystemPrompt(): string {
    const basePrompt = this.systemPrompt || '你是一个有帮助的AI助手。';
    const toolsDescription = this.getToolsDescription();

    return `${basePrompt}

你可以通过思考和行动来解决问题。

## 推理格式
请按照以下格式进行推理:

Thought: 你对问题的分析和思考
Action: 要使用的工具名称 (例如: calculator, search)
Action Input: 工具的输入参数
Observation: 工具执行的结果

你可以进行多轮推理，直到得到最终答案。

## 可用工具
${toolsDescription || '当前没有可用工具'}

## 输出格式
请严格按照以下格式输出:
Thought: ...
Action: ...
Action Input: ...
或者，如果问题已经解决，直接给出最终答案。
`;
  }

  /**
   * 解析 ReAct 响应
   */
  private parseReActResponse(response: string): {
    thought?: string;
    action?: string;
    actionInput?: Record<string, unknown>;
  } {
    const thoughtMatch = response.match(/Thought:\s*(.+?)(?=\nAction:|$)/s);
    const actionMatch = response.match(/Action:\s*(.+?)(?=\nAction Input:|$)/s);
    const actionInputMatch = response.match(/Action Input:\s*([\s\S]+?)$/);

    // 尝试解析 action input 为 JSON
    let actionInput: Record<string, unknown> = {};
    if (actionInputMatch) {
      try {
        actionInput = JSON.parse(actionInputMatch[1].trim());
      } catch {
        actionInput = { value: actionInputMatch[1].trim() };
      }
    }

    return {
      thought: thoughtMatch?.[1]?.trim(),
      action: actionMatch?.[1]?.trim(),
      actionInput,
    };
  }
}

/**
 * PlanAndSolveAgent - 计划与执行 Agent
 * 先制定计划，再逐步执行
 */
import { Agent } from '../core/agent';
import { HelloAgentsLLM } from '../core/llm';
import { Message } from '../core/message';
import { AgentConfig, Message as MessageType } from '../types';

export class PlanAndSolveAgent extends Agent {
  private maxSteps: number;
  private verbose: boolean;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    config?: AgentConfig & { maxSteps?: number; verbose?: boolean }
  ) {
    super(name, llm, config);
    this.maxSteps = config?.maxIterations || 10;
    this.verbose = (config as PlanAndSolveConfig)?.verbose || false;
    console.log(`✅ ${name} (Plan-and-Solve) 初始化完成`);
  }

  /**
   * 运行 Agent
   */
  async run(input: string, options: Record<string, unknown> = {}): Promise<string> {
    const maxSteps = (options.maxSteps as number) || this.maxSteps;
    console.log(`🤖 ${this.name} (Plan-and-Solve) 正在处理: ${input}`);

    // 第一步：制定计划
    const plan = await this.createPlan(input);
    console.log(`📋 计划: ${plan}`);

    if (this.verbose) {
      console.log('\n--- 计划 ---\n', plan);
    }

    // 第二步：执行计划
    const result = await this.executePlan(plan, input, maxSteps);

    // 保存到历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(result, 'assistant'));

    return result;
  }

  /**
   * 创建计划
   */
  private async createPlan(input: string): Promise<string> {
    const systemPrompt = this.getPlanSystemPrompt();
    const messages: MessageType[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为以下问题制定一个解决计划:\n\n${input}` },
    ];

    return await this.llm.invoke(messages);
  }

  /**
   * 执行计划
   */
  private async executePlan(plan: string, originalInput: string, maxSteps: number): Promise<string> {
    const messages: MessageType[] = [
      { role: 'system', content: this.getExecuteSystemPrompt() },
      {
        role: 'user',
        content: `问题: ${originalInput}\n\n计划:\n${plan}`,
      },
    ];

    let step = 0;
    let currentResult = '';

    while (step < maxSteps) {
      step++;

      const response = await this.llm.invoke(messages);

      if (this.verbose) {
        console.log(`\n--- Step ${step} ---\n`, response);
      }

      // 检查是否包含 "Final Answer" 或完成标记
      const finalAnswerMatch = response.match(/Final Answer:\s*([\s\S]+)/i);

      if (finalAnswerMatch) {
        currentResult = finalAnswerMatch[1].trim();
        break;
      }

      // 检查是否有工具调用
      const toolCallMatch = response.match(/Action:\s*(\w+)\s*\(([\s\S]*?)\)/);

      if (toolCallMatch) {
        const toolName = toolCallMatch[1];
        let params = {};

        try {
          params = JSON.parse(toolCallMatch[2]);
        } catch {
          params = { input: toolCallMatch[2] };
        }

        const observation = await this.executeTool(toolName, params);

        messages.push({ role: 'assistant', content: response });
        messages.push({ role: 'user', content: `Observation: ${observation}` });

        continue;
      }

      // 没有工具调用，也没有最终答案，可能是需要继续
      currentResult = response;
      break;
    }

    return currentResult || '任务完成';
  }

  /**
   * 获取计划系统提示词
   */
  private getPlanSystemPrompt(): string {
    return `你是一个问题解决专家。请为用户的问题制定一个清晰、可执行的计划。

## 要求
1. 先理解问题
2. 将复杂问题分解为简单的步骤
3. 列出每个步骤需要做什么
4. 如果需要使用工具，明确指出

## 输出格式
请按以下格式输出计划:
- 步骤1: ...
- 步骤2: ...

确保计划清晰、具体、可执行。`;
  }

  /**
   * 获取执行系统提示词
   */
  private getExecuteSystemPrompt(): string {
    const toolsDescription = this.getToolsDescription();

    return `你是一个执行专家。请按照计划逐步执行任务。

## 要求
1. 严格按照计划执行
2. 每执行一步，报告观察结果
3. 如果遇到问题，尝试解决
4. 最终给出答案

## 输出格式
请按以下格式输出:
Action: tool_name(input)
Observation: 工具返回结果

或者，直接给出最终答案:
Final Answer: 你的最终答案

## 可用工具
${toolsDescription || '当前没有可用工具'}

请开始执行计划。`;
  }
}

interface PlanAndSolveConfig extends AgentConfig {
  maxSteps?: number;
  verbose?: boolean;
}

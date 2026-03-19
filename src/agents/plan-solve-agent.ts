/**
 * PlanAndSolveAgent - 计划与执行 Agent
 * 先制定计划，再逐步执行
 */
import { Agent } from '../core/agent';
import { HelloAgentsLLM } from '../core/llm';
import { Message } from '../core/message';
import { AgentConfig, MessageRole } from '../types';

// 默认规划器提示词模板
const DEFAULT_PLANNER_PROMPT = `你是一个顶级的AI规划专家。你的任务是将用户提出的复杂问题分解成一个由多个简单步骤组成的行动计划。
请确保计划中的每个步骤都是一个独立的、可执行的子任务，并且严格按照逻辑顺序排列。
你的输出必须是一个Python列表，其中每个元素都是一个描述子任务的字符串。

问题: {question}

请严格按照以下格式输出你的计划:
\`\`\`python
["步骤1", "步骤2", "步骤3", ...]
\`\`\`
`;

// 默认执行器提示词模板
const DEFAULT_EXECUTOR_PROMPT = `你是一位顶级的AI执行专家。你的任务是严格按照给定的计划，一步步地解决问题。
你将收到原始问题、完整的计划、以及到目前为止已经完成的步骤和结果。
请你专注于解决"当前步骤"，并仅输出该步骤的最终答案，不要输出任何额外的解释或对话。

# 原始问题:
{question}

# 完整计划:
{plan}

# 历史步骤与结果:
{history}

# 当前步骤:
{current_step}

请仅输出针对"当前步骤"的回答:
`;

export type PlanAndSolvePrompts = {
  planner: string;
  executor: string;
};

export class PlanAndSolveAgent extends Agent {
  private maxSteps: number;
  private prompts: PlanAndSolvePrompts;
  private verbose: boolean;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    options?: AgentConfig & {
      maxSteps?: number;
      customPrompts?: Partial<PlanAndSolvePrompts>;
      verbose?: boolean;
    }
  ) {
    super(name, llm, options);

    this.maxSteps = options?.maxSteps || 10;
    this.verbose = options?.verbose || false;

    // 合并默认提示词和自定义提示词
    this.prompts = {
      planner: options?.customPrompts?.planner || DEFAULT_PLANNER_PROMPT,
      executor: options?.customPrompts?.executor || DEFAULT_EXECUTOR_PROMPT,
    };

    console.log(`✅ ${this.name} (Plan-and-Solve) 初始化完成，最大步骤: ${this.maxSteps}`);
  }

  /**
   * 运行 Agent
   */
  async run(input: string, options?: Record<string, unknown>): Promise<string> {
    const maxSteps = (options?.maxSteps as number) || this.maxSteps;
    console.log(`🤖 ${this.name} (Plan-and-Solve) 正在处理: ${input}`);

    // 第一步：制定计划
    console.log('\n📋 步骤1: 制定计划...');
    const plan = await this.createPlan(input);
    console.log(`📋 计划: ${plan}`);

    if (this.verbose) {
      console.log('\n--- 完整计划 ---');
      console.log(plan);
    }

    // 第二步：执行计划
    console.log('\n🚀 步骤2: 执行计划...');
    const result = await this.executePlan(plan, input, maxSteps);

    // 保存到历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(result, 'assistant'));
    console.log(`✅ ${this.name} 处理完成`);

    return result;
  }

  /**
   * 创建计划
   */
  private async createPlan(question: string): Promise<string> {
    const prompt = this.prompts.planner.replace('{question}', question);

    const messages = [{ role: 'user' as MessageRole, content: prompt }];

    return await this.llm.invoke(messages);
  }

  /**
   * 执行计划
   */
  private async executePlan(planText: string, question: string, maxSteps: number): Promise<string> {
    // 解析计划（提取 Python 列表）
    const plan = this.parsePlan(planText);
    console.log(`📝 解析到 ${plan.length} 个步骤`);

    if (plan.length === 0) {
      // 无法解析计划，直接让 LLM 回答
      return await this.llm.invoke([{ role: 'user' as MessageRole, content: question }]);
    }

    // 执行每个步骤
    const history: string[] = [];
    let step = 0;

    while (step < plan.length && step < maxSteps) {
      const currentStep = plan[step];
      console.log(`\n--- 步骤 ${step + 1}/${plan.length}: ${currentStep} ---`);

      // 构建执行器提示词
      const historyStr = history.length > 0 ? history.join('\n') : '无';
      const prompt = this.prompts.executor
        .replace('{question}', question)
        .replace('{plan}', plan.join('\n'))
        .replace('{history}', historyStr)
        .replace('{current_step}', currentStep);

      const messages = [{ role: 'user' as MessageRole, content: prompt }];
      const stepResult = await this.llm.invoke(messages);

      console.log(`📤 步骤结果: ${stepResult}`);

      // 记录到历史
      history.push(`步骤${step + 1}: ${currentStep} -> ${stepResult}`);

      step++;

      // 检查是否是最终答案（最后一步）
      if (step === plan.length) {
        return stepResult;
      }
    }

    // 如果提前结束，返回最后的结果
    return history[history.length - 1]?.split('-> ')[1] || '任务完成';
  }

  /**
   * 解析计划文本，提取 Python 列表
   */
  private parsePlan(planText: string): string[] {
    // 尝试提取 ```python ... ``` 块
    const pythonBlockMatch = planText.match(/```python\s*([\s\S]*?)```/);
    if (pythonBlockMatch) {
      return this.parsePythonList(pythonBlockMatch[1]);
    }

    // 尝试直接匹配 Python 列表
    const listMatch = planText.match(/\[[\s\S]*\]/);
    if (listMatch) {
      return this.parsePythonList(listMatch[0]);
    }

    // 无法解析，返回空数组
    console.warn('⚠️ 无法解析计划格式，将作为单步骤处理');
    return [];
  }

  /**
   * 解析 Python 列表字符串
   */
  private parsePythonList(listStr: string): string[] {
    try {
      // 使用 Function 解析 Python 列表（安全风险可控，因为输入来自 LLM）
      // 转换 Python 语法为 JS
      const jsListStr = listStr
        .replace(/'/g, '"') // 单引号转双引号
        .replace(/None/g, 'null')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false');

      const parsed = JSON.parse(jsListStr);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch (e) {
      console.warn('⚠️ 解析 Python 列表失败:', e);
    }

    return [];
  }

  // ==================== 便利方法 ====================

  /**
   * 获取当前提示词模板
   */
  getPrompts(): PlanAndSolvePrompts {
    return { ...this.prompts };
  }

  /**
   * 更新提示词模板
   */
  setPrompts(prompts: Partial<PlanAndSolvePrompts>): void {
    if (prompts.planner) this.prompts.planner = prompts.planner;
    if (prompts.executor) this.prompts.executor = prompts.executor;
  }

  /**
   * 单独创建计划（用于调试）
   */
  async plan(question: string): Promise<string> {
    return await this.createPlan(question);
  }

  /**
   * 单独执行计划（用于调试）
   */
  async execute(plan: string, question: string): Promise<string> {
    return await this.executePlan(plan, question, this.maxSteps);
  }

  toString(): string {
    return `PlanAndSolveAgent(name=${this.name}, maxSteps=${this.maxSteps})`;
  }
}

/**
 * ReflectionAgent - 自我反思 Agent
 * 通过反思和改进来提升回答质量
 */
import { Agent } from '../core/agent';
import { HelloAgentsLLM } from '../core/llm';
import { Message } from '../core/message';
import { AgentConfig, MessageRole } from '../types';

// 默认提示词模板
const DEFAULT_PROMPTS = {
  initial: `请根据以下要求完成任务:

任务: {task}

请提供一个完整、准确的回答。
`,
  reflect: `请仔细审查以下回答，并找出可能的问题或改进空间:

# 原始任务:
{task}

# 当前回答:
{content}

请分析这个回答的质量，指出不足之处，并提出具体的改进建议。
如果回答已经很好，请回答"无需改进"。
`,
  refine: `请根据反馈意见改进你的回答:

# 原始任务:
{task}

# 上一轮回答:
{last_attempt}

# 反馈意见:
{feedback}

请提供一个改进后的回答。
`,
};

export type PromptTemplates = typeof DEFAULT_PROMPTS;

export class ReflectionAgent extends Agent {
  private maxReflections: number;
  private prompts: PromptTemplates;
  private verbose: boolean;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    options?: AgentConfig & {
      maxReflections?: number;
      customPrompts?: Partial<PromptTemplates>;
      verbose?: boolean;
    }
  ) {
    super(name, llm, options);

    this.maxReflections = options?.maxReflections || 3;
    this.verbose = options?.verbose || false;

    // 合并默认提示词和自定义提示词
    this.prompts = {
      initial: options?.customPrompts?.initial || DEFAULT_PROMPTS.initial,
      reflect: options?.customPrompts?.reflect || DEFAULT_PROMPTS.reflect,
      refine: options?.customPrompts?.refine || DEFAULT_PROMPTS.refine,
    };

    console.log(`✅ ${this.name} (Reflection) 初始化完成，最大反思次数: ${this.maxReflections}`);
  }

  /**
   * 运行 Agent
   */
  async run(input: string, options?: Record<string, unknown>): Promise<string> {
    const maxReflections = (options?.maxReflections as number) || this.maxReflections;
    console.log(`🤖 ${this.name} (Reflection) 正在处理: ${input}`);

    // 1. 生成初始响应
    let response = await this.generateResponse(input);
    console.log(`📝 初始响应: ${response.slice(0, 100)}...`);

    if (this.verbose) {
      console.log('\n--- 初始响应 ---');
      console.log(response);
    }

    // 2. 反思循环
    for (let i = 0; i < maxReflections; i++) {
      console.log(`\n🔍 反思第 ${i + 1} 次`);

      // 进行反思
      const reflection = await this.reflect(input, response);

      if (this.verbose) {
        console.log('\n--- 反思结果 ---');
        console.log(reflection);
      }

      // 检查是否满意（无需改进）
      const isSatisfied = this.checkSatisfied(reflection);

      if (isSatisfied) {
        console.log('✅ 反思结果：无需改进，结束反思');
        break;
      }

      // 3. 基于反思改进响应
      response = await this.improveResponse(input, response, reflection);
      console.log(`🔄 已改进响应 (${i + 1}/${maxReflections})`);

      if (this.verbose) {
        console.log('\n--- 改进后响应 ---');
        console.log(response);
      }
    }

    // 4. 保存到历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(response, 'assistant'));
    console.log(`✅ ${this.name} 处理完成`);

    return response;
  }

  /**
   * 生成初始响应
   */
  private async generateResponse(task: string): Promise<string> {
    const prompt = this.prompts.initial.replace('{task}', task);

    const messages = [
      { role: 'user' as MessageRole, content: prompt },
    ];

    return await this.llm.invoke(messages);
  }

  /**
   * 反思
   */
  private async reflect(task: string, content: string): Promise<string> {
    const prompt = this.prompts.reflect
      .replace('{task}', task)
      .replace('{content}', content);

    const messages = [
      { role: 'user' as MessageRole, content: prompt },
    ];

    return await this.llm.invoke(messages);
  }

  /**
   * 改进响应
   */
  private async improveResponse(task: string, lastAttempt: string, feedback: string): Promise<string> {
    const prompt = this.prompts.refine
      .replace('{task}', task)
      .replace('{last_attempt}', lastAttempt)
      .replace('{feedback}', feedback);

    const messages = [
      { role: 'user' as MessageRole, content: prompt },
    ];

    return await this.llm.invoke(messages);
  }

  /**
   * 检查是否满意
   * 如果返回 "无需改进" 或类似表述，则认为满意
   */
  private checkSatisfied(reflection: string): boolean {
    const satisfiedKeywords = [
      '无需改进',
      '不需要改进',
      '已经很好',
      '已经足够',
      '没有问题了',
      '不需要修改',
      'no need to improve',
      'already good',
      'satisfied',
    ];

    const lowerReflection = reflection.toLowerCase();
    return satisfiedKeywords.some((keyword) => lowerReflection.includes(keyword.toLowerCase()));
  }

  // ==================== 便利方法 ====================

  /**
   * 获取当前提示词模板
   */
  getPrompts(): PromptTemplates {
    return { ...this.prompts };
  }

  /**
   * 更新提示词模板
   */
  setPrompts(prompts: Partial<PromptTemplates>): void {
    if (prompts.initial) this.prompts.initial = prompts.initial;
    if (prompts.reflect) this.prompts.reflect = prompts.reflect;
    if (prompts.refine) this.prompts.refine = prompts.refine;
  }

  /**
   * 单步执行（用于调试）
   */
  async generate(task: string): Promise<string> {
    return await this.generateResponse(task);
  }

  async reflectOn(task: string, content: string): Promise<string> {
    return await this.reflect(task, content);
  }

  async refine(task: string, lastAttempt: string, feedback: string): Promise<string> {
    return await this.improveResponse(task, lastAttempt, feedback);
  }

  toString(): string {
    return `ReflectionAgent(name=${this.name}, maxReflections=${this.maxReflections})`;
  }
}

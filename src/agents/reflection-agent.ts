/**
 * ReflectionAgent - 自我反思 Agent
 * 通过反思和改进来提升回答质量
 */
import { Agent } from '../core/agent';
import { HelloAgentsLLM } from '../core/llm';
import { Message } from '../core/message';
import { AgentConfig, Message as MessageType } from '../types';

export class ReflectionAgent extends Agent {
  private maxReflections: number;
  private verbose: boolean;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    config?: AgentConfig & { maxReflections?: number; verbose?: boolean }
  ) {
    super(name, llm, config);
    this.maxReflections = (config as ReflectionConfig)?.maxReflections || 3;
    this.verbose = (config as ReflectionConfig)?.verbose || false;
    console.log(`✅ ${name} (Reflection) 初始化完成`);
  }

  /**
   * 运行 Agent
   */
  async run(input: string, options: Record<string, unknown> = {}): Promise<string> {
    const maxReflections = (options.maxReflections as number) || this.maxReflections;
    console.log(`🤖 ${this.name} (Reflection) 正在处理: ${input}`);

    // 第一次尝试
    let response = await this.generateResponse(input, []);
    console.log(`📝 初始响应: ${response.slice(0, 100)}...`);

    if (this.verbose) {
      console.log('\n--- 初始响应 ---\n', response);
    }

    // 反思循环
    for (let i = 0; i < maxReflections; i++) {
      // 进行反思
      const reflection = await this.reflect(input, response);

      if (this.verbose) {
        console.log(`\n--- 反思 ${i + 1} ---\n`, reflection);
      }

      // 检查是否满意
      const isSatisfied = await this.isSatisfied(reflection);

      if (isSatisfied) {
        console.log(`✅ 对反思结果满意，结束反思`);
        break;
      }

      // 基于反思改进
      response = await this.improveResponse(input, response, reflection);
      console.log(`🔄 已改进响应 (${i + 1}/${maxReflections})`);

      if (this.verbose) {
        console.log('\n--- 改进后响应 ---\n', response);
      }
    }

    // 保存到历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(response, 'assistant'));

    return response;
  }

  /**
   * 生成初始响应
   */
  private async generateResponse(input: string, context: MessageType[]): Promise<string> {
    const messages: MessageType[] = [];

    // 系统提示词
    const systemPrompt = this.systemPrompt || '你是一个有帮助的AI助手。请直接回答用户的问题。';
    messages.push({ role: 'system', content: systemPrompt });

    // 添加上下文
    messages.push(...context);

    // 添加用户输入
    messages.push({ role: 'user', content: input });

    return await this.llm.invoke(messages);
  }

  /**
   * 反思
   */
  private async reflect(input: string, response: string): Promise<string> {
    const messages: MessageType[] = [
      {
        role: 'system',
        content: `你是一个批评家。请仔细审查AI助手的回答，并指出其中的问题或改进空间。

请从以下几个方面进行审查:
1. 准确性 - 回答是否正确？
2. 完整性 - 是否遗漏了重要信息？
3. 清晰度 - 表达是否清晰？
4. 实用性 - 回答是否有帮助？

请给出具体的改进建议。`,
      },
      {
        role: 'user',
        content: `问题: ${input}\n\n回答: ${response}\n\n请进行批评性反思。`,
      },
    ];

    return await this.llm.invoke(messages);
  }

  /**
   * 检查是否满意
   */
  private async isSatisfied(reflection: string): Promise<boolean> {
    const messages: MessageType[] = [
      {
        role: 'system',
        content: `你是一个判断者。请根据反思内容，判断回答是否需要改进。

如果回答已经足够好，只需要回答 "SATISFIED"。
如果需要改进，请回答 "NEEDS_IMPROVEMENT" 并简要说明原因。`,
      },
      {
        role: 'user',
        content: `反思内容:\n${reflection}\n\n请判断是否满意。`,
      },
    ];

    const result = await this.llm.invoke(messages);
    return result.toUpperCase().includes('SATISFIED');
  }

  /**
   * 改进响应
   */
  private async improveResponse(input: string, originalResponse: string, reflection: string): Promise<string> {
    const messages: MessageType[] = [
      {
        role: 'system',
        content: `你是一个改进专家。请根据反思意见改进原来的回答。

## 要求
1. 认真阅读反思意见
2. 针对每个问题进行改进
3. 保持原回答中正确的部分
4. 给出更好的答案`,
      },
      {
        role: 'user',
        content: `原始问题: ${input}

原始回答: ${originalResponse}

反思意见: ${reflection}

请改进回答。`,
      },
    ];

    return await this.llm.invoke(messages);
  }
}

interface ReflectionConfig extends AgentConfig {
  maxReflections?: number;
  verbose?: boolean;
}

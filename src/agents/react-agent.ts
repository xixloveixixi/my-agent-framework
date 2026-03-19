/**
 * ReActAgent - 推理+行动 Agent
 * 遵循 ReAct (Reasoning + Acting) 范式
 */
import { Agent } from '../core/agent';
import { HelloAgentsLLM } from '../core/llm';
import { Message } from '../core/message';
import { ToolRegistry } from '../tools/registry';
import { AgentConfig, MessageRole } from '../types';

// ReAct 提示词模板
const DEFAULT_REACT_PROMPT = `你是一个具备推理和行动能力的AI助手。你可以通过思考分析问题，然后调用合适的工具来获取信息，最终给出准确的答案。

## 可用工具
{tools}

## 工作流程
请严格按照以下格式进行回应，每次只能执行一个步骤:

Thought: 分析当前问题，思考需要什么信息或采取什么行动。
Action: 选择一个行动，格式必须是以下之一:
- \`{{tool_name}}[{{tool_input}}]\` - 调用指定工具
- \`Finish[最终答案]\` - 当你有足够信息给出最终答案时

## 重要提醒
1. 每次回应必须包含Thought和Action两部分
2. 工具调用的格式必须严格遵循:工具名[参数]
3. 只有当你确信有足够信息回答问题时，才使用Finish
4. 如果工具返回的信息不够，继续使用其他工具或相同工具的不同参数

## 当前任务
**Question:** {question}

## 执行历史
{history}

现在开始你的推理和行动:
`;

export class ReActAgent extends Agent {
  private toolRegistry?: ToolRegistry;
  private maxSteps: number;
  private currentHistory: string[];  // 执行历史
  private promptTemplate: string;     // 提示词模板
  private verbose: boolean;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    options?: AgentConfig & {
      toolRegistry?: ToolRegistry;
      maxSteps?: number;
      customPrompt?: string;
      verbose?: boolean;
    }
  ) {
    super(name, llm, options);

    this.toolRegistry = options?.toolRegistry;
    this.maxSteps = options?.maxSteps || 5;
    this.currentHistory = [];
    this.promptTemplate = options?.customPrompt || DEFAULT_REACT_PROMPT;
    this.verbose = options?.verbose || false;

    console.log(`✅ ${name} (ReAct) 初始化完成，最大步数: ${this.maxSteps}`);
  }

  /**
   * 运行 Agent
   */
  async run(input: string, options?: Record<string, unknown>): Promise<string> {
    const maxSteps = (options?.maxSteps as number) || this.maxSteps;
    this.currentHistory = [];

    console.log(`\n🤖 ${this.name} (ReAct) 开始处理: ${input}`);

    let currentStep = 0;

    while (currentStep < maxSteps) {
      currentStep++;
      console.log(`\n--- 第 ${currentStep} 步 ---`);

      // 1. 构建提示词
      const prompt = this.buildPrompt(input);

      // 2. 调用 LLM
      const messages = [{ role: 'user' as MessageRole, content: prompt }];
      const responseText = await this.llm.invoke(messages, options);

      if (this.verbose) {
        console.log('\n📝 LLM 响应:');
        console.log(responseText);
      }

      // 3. 解析输出
      const { thought, action } = this.parseOutput(responseText);

      console.log(`💭 Thought: ${thought || '(无)'}`);
      console.log(`🎬 Action: ${action || '(无)'}`);

      // 4. 检查 action 有效性 - 防止空转
      if (!action || action.trim() === '') {
        console.log('⚠️ 无法解析 Action，继续尝试或结束');

        // 检查是否有有效的 thought，如果有说明模型在思考但无法生成有效 action
        if (thought && thought.length > 10) {
          // 再给一次机会，直接返回 thought 作为响应
          this.addMessage(new Message(input, 'user'));
          this.addMessage(new Message(thought, 'assistant'));
          return thought;
        }

        // 达到最大步数限制
        if (currentStep >= maxSteps) {
          const finalAnswer = '抱歉，我无法在限定步数内完成这个任务。';
          this.addMessage(new Message(input, 'user'));
          this.addMessage(new Message(finalAnswer, 'assistant'));
          console.log(`❌ 达到最大步数: ${maxSteps}`);
          return finalAnswer;
        }

        // 继续下一轮尝试
        continue;
      }

      // 5. 检查完成条件 - Finish[答案]
      if (action.startsWith('Finish')) {
        const finalAnswer = this.parseActionInput(action);
        console.log(`✅ 最终答案: ${finalAnswer}`);

        this.addMessage(new Message(input, 'user'));
        this.addMessage(new Message(finalAnswer, 'assistant'));
        return finalAnswer;
      }

      // 6. 执行工具调用
      const { toolName, toolInput } = this.parseAction(action);

      // 检查工具是否存在
      if (!this.toolRegistry?.has(toolName) && !this.tools.has(toolName) && toolName !== 'Finish') {
        console.log(`⚠️ 工具 '${toolName}' 不存在，将作为最终响应处理`);
        this.addMessage(new Message(input, 'user'));
        this.addMessage(new Message(responseText, 'assistant'));
        return responseText;
      }

      if (this.verbose) {
        console.log(`🔧 执行工具: ${toolName}`);
        console.log(`📥 工具输入: ${JSON.stringify(toolInput)}`);
      }

      // 从 ToolRegistry 执行
      let observation: string;
      if (this.toolRegistry) {
        observation = await this.toolRegistry.executeTool(toolName, toolInput as Record<string, unknown>);
      } else {
        // 回退到基类的 tools
        observation = await this.executeTool(toolName, toolInput as Record<string, unknown>);
      }

      console.log(`📤 观察结果: ${observation}`);

      // 记录到执行历史
      this.currentHistory.push(`Action: ${action}`);
      this.currentHistory.push(`Observation: ${observation}`);
    }

    // 达到最大步数
    const finalAnswer = '抱歉，我无法在限定步数内完成这个任务。';
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(finalAnswer, 'assistant'));
    console.log(`❌ 达到最大步数: ${maxSteps}`);

    return finalAnswer;
  }

  /**
   * 构建提示词
   */
  private buildPrompt(question: string): string {
    // 获取工具描述
    let toolsDesc = '当前没有可用工具';
    if (this.toolRegistry) {
      toolsDesc = this.toolRegistry.getToolsDescription();
    } else if (this.tools.size > 0) {
      toolsDesc = this.getToolsDescription();
    }

    // 执行历史
    const historyStr = this.currentHistory.join('\n') || '无';

    // 替换模板占位符
    return this.promptTemplate
      .replace('{tools}', toolsDesc)
      .replace('{question}', question)
      .replace('{history}', historyStr);
  }

  /**
   * 解析 LLM 输出
   * 格式: Thought: ... Action: tool[params] 或 Finish[答案]
   */
  private parseOutput(response: string): { thought: string; action: string } {
    // 解析 Thought
    const thoughtMatch = response.match(/Thought:\s*([\s\S]*?)(?=\nAction:|$)/i);
    const thought = thoughtMatch?.[1]?.trim() || '';

    // 解析 Action
    const actionMatch = response.match(/Action:\s*([\s\S]*?)$/i);
    const action = actionMatch?.[1]?.trim() || '';

    return { thought, action };
  }

  /**
   * 解析 Action
   * 格式: toolName[params] 或 Finish[答案]
   */
  private parseAction(action: string): { toolName: string; toolInput: unknown } {
    // 检查是否是 Finish
    if (action.startsWith('Finish')) {
      return { toolName: 'Finish', toolInput: this.parseActionInput(action) };
    }

    // 匹配 toolName[params] 格式
    const match = action.match(/^(\w+)\s*\[([\s\S]*)\]$/);
    if (match) {
      const toolName = match[1].trim();
      const paramsStr = match[2].trim();

      // 尝试解析 JSON
      try {
        return { toolName, toolInput: JSON.parse(paramsStr) };
      } catch {
        // 解析失败，作为字符串
        return { toolName, toolInput: paramsStr };
      }
    }

    // 无法解析，返回原始内容
    return { toolName: action, toolInput: {} };
  }

  /**
   * 解析 Action 输入 ( Finish[...] 或 tool[...] )
   */
  private parseActionInput(action: string): string {
    const match = action.match(/\[([\s\S]*)\]$/);
    return match?.[1]?.trim() || action;
  }

  // ==================== 便利方法 ====================

  /**
   * 设置工具注册表
   */
  setToolRegistry(toolRegistry: ToolRegistry): void {
    this.toolRegistry = toolRegistry;
  }

  /**
   * 获取工具注册表
   */
  getToolRegistry(): ToolRegistry | undefined {
    return this.toolRegistry;
  }

  /**
   * 检查是否有可用工具
   */
  hasTools(): boolean {
    return (this.toolRegistry?.size() || 0) > 0 || this.tools.size > 0;
  }

  /**
   * 列出所有可用工具
   */
  listTools(): string[] {
    if (this.toolRegistry) {
      return this.toolRegistry.listTools();
    }
    return Array.from(this.tools.keys());
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(): string[] {
    return [...this.currentHistory];
  }

  toString(): string {
    return `ReActAgent(name=${this.name}, maxSteps=${this.maxSteps}, tools=${this.listTools().join(', ') || 'none'})`;
  }
}

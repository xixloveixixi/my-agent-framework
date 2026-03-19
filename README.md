# HelloAgents Framework

从零构建的 TypeScript Agent 框架，提供了多种 Agent 模式、工具调用能力和灵活的大语言模型集成。

## 特性

- **多种 Agent 模式**: 支持 SimpleAgent、ReActAgent、PlanAndSolveAgent、ReflectionAgent
- **工具调用**: 内置计算器、搜索等工具，支持自定义工具扩展
- **流式响应**: 支持流式输出，提升用户体验
- **对话历史**: 自动管理对话上下文，支持历史记录配置
- **类型安全**: 完整的 TypeScript 类型定义
- **模块化设计**: 核心、Agent、工具模块分离，便于扩展

## 安装

```bash
npm install
npm run build
```

## 快速开始

```typescript
import { SimpleAgent, HelloAgentsLLM, CalculatorTool, SearchTool } from './src';

// 1. 初始化 LLM
const llm = new HelloAgentsLLM({
  provider: 'openai',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY
});

// 2. 创建 Agent
const agent = new SimpleAgent('MyAgent', llm, {
  systemPrompt: '你是一个有用的AI助手。'
});

// 3. 添加工具
agent.addTool(new CalculatorTool());
agent.addTool(new SearchTool());

// 4. 运行
const response = await agent.run('计算 123 * 456 等于多少？');
console.log(response);
```

## 项目结构

```
src/
├── core/                 # 核心模块
│   ├── agent.ts          # Agent 基类
│   ├── llm.ts            # 大语言模型封装
│   ├── message.ts        # 消息类
│   ├── config.ts         # 配置管理
│   └── index.ts          # 核心模块导出
│
├── agents/               # Agent 实现
│   ├── simple-agent.ts   # 简单对话 Agent
│   ├── react-agent.ts   # ReAct Agent
│   ├── plan-solve-agent.ts  # 计划执行 Agent
│   ├── reflection-agent.ts  # 反思 Agent
│   └── index.ts          # Agents 导出
│
├── tools/                # 工具模块
│   ├── base.ts           # 工具基类
│   ├── calculator.ts     # 计算器工具
│   ├── search.ts         # 搜索工具
│   ├── registry.ts       # 工具注册表
│   └── index.ts          # 工具导出
│
├── types/                # 类型定义
│   └── index.ts
│
├── examples/             # 示例
│   └── custom-llm.ts     # 自定义 LLM 示例
│
└── index.ts             # 主入口
```

## Agent 类型

### SimpleAgent
简单对话 Agent，支持工具调用和流式响应。适合简单的对话场景。

```typescript
const agent = new SimpleAgent('助手', llm);
const result = await agent.run('你好，请介绍一下自己');
```

### ReActAgent
ReAct (Reasoning + Acting) 模式的 Agent，通过推理和行动循环来解决问题。

```typescript
import { ReActAgent, HelloAgentsLLM, CalculatorTool, ToolRegistry } from './src';

// 创建工具注册表
const registry = new ToolRegistry();
registry.register(new CalculatorTool());

// 创建 ReActAgent
const agent = new ReActAgent('研究助手', llm, {
  toolRegistry: registry,
  maxSteps: 10,           // 最大推理步数
  verbose: true           // 详细输出模式
});

// 运行
const result = await agent.run('计算 15 * 25 + 30 等于多少？');
console.log(result);

// 获取执行历史
console.log(agent.getExecutionHistory());
```

#### ReActAgent 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| toolRegistry | ToolRegistry | undefined | 工具注册表 |
| maxSteps | number | 5 | 最大推理步数 |
| customPrompt | string | DEFAULT_REACT_PROMPT | 自定义提示词模板 |
| verbose | boolean | false | 是否输出详细日志 |

#### 工作流程

1. **Thought**: 分析当前问题，思考需要什么信息
2. **Action**: 选择工具执行或 Finish 给出最终答案
3. **Observation**: 获取工具执行结果
4. 重复步骤 1-3 直到得到最终答案

#### 自定义提示词

```typescript
const customPrompt = `你是一个专业的数学助手。

## 可用工具
{tools}

## 工作流程
Thought: 分析问题
Action: calculator[表达式] 或 Finish[答案]

## 问题
**Question:** {question}

## 历史
{history}

开始推理:`;

const agent = new ReActAgent('数学助手', llm, {
  customPrompt,
  maxSteps: 10
});
```

### PlanAndSolveAgent
先制定计划，再逐步执行的 Agent。适合复杂任务分解和多步骤问题处理。

```typescript
import { PlanAndSolveAgent, HelloAgentsLLM } from './src';

// 创建 PlanAndSolveAgent
const agent = new PlanAndSolveAgent('规划助手', llm, {
  maxSteps: 10,    // 最大执行步骤
  verbose: true    // 详细输出模式
});

// 运行
const result = await agent.run('请写一个快速排序算法并解释其时间复杂度');
console.log(result);

// 单步执行（用于调试）
const plan = await agent.plan('如何学习 TypeScript？');
console.log('计划:', plan);

const execution = await agent.execute(plan, '如何学习 TypeScript？');
console.log('执行结果:', execution);
```

#### PlanAndSolveAgent 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| maxSteps | number | 10 | 最大执行步骤数 |
| customPrompts | Partial\<PlanAndSolvePrompts\> | DEFAULT_PROMPTS | 自定义提示词模板 |
| verbose | boolean | false | 是否输出详细日志 |

#### 工作流程

1. **Plan (Planner)**: 将复杂问题分解为多个步骤的 Python 列表
2. **Execute (Executor)**: 按顺序逐步执行每个步骤
3. **Combine**: 整合所有步骤的结果作为最终答案

#### 自定义提示词

```typescript
const agent = new PlanAndSolveAgent('助手', llm, {
  customPrompts: {
    planner: `将问题分解为步骤:
问题: {question}

输出 JSON 数组格式: ["步骤1", "步骤2"]`,
    executor: `问题: {question}
计划: {plan}
历史: {history}
当前步骤: {current_step}

只输出当前步骤的结果:`
  }
});
```

### ReflectionAgent
具备自我反思能力的 Agent，通过多轮反思和改进来提升回答质量。

```typescript
import { ReflectionAgent, HelloAgentsLLM } from './src';

// 创建 ReflectionAgent
const agent = new ReflectionAgent('反思助手', llm, {
  maxReflections: 3,    // 最大反思次数
  verbose: true          // 详细输出模式
});

// 运行
const result = await agent.run('请解释什么是 TypeScript 泛型？');
console.log(result);

// 单步执行（用于调试）
const initial = await agent.generate('解释 React Hooks');
const reflection = await agent.reflectOn('解释 React Hooks', initial);
const refined = await agent.refine('解释 React Hooks', initial, reflection);
```

#### ReflectionAgent 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| maxReflections | number | 3 | 最大反思次数 |
| customPrompts | Partial\<PromptTemplates\> | DEFAULT_PROMPTS | 自定义提示词模板 |
| verbose | boolean | false | 是否输出详细日志 |

#### 工作流程

1. **Generate**: 根据任务生成初始响应
2. **Reflect**: 反思当前响应，找出不足之处
3. **Refine**: 根据反馈改进响应
4. 重复步骤 2-3 直到满意或达到最大次数

#### 自定义提示词

```typescript
const agent = new ReflectionAgent('助手', llm, {
  customPrompts: {
    initial: '请用简洁的语言解释: {task}',
    reflect: '检查以下回答是否准确: {content}',
    refine: '改进以下回答: {last_attempt}，反馈: {feedback}'
  }
});
```

## 工具

### CalculatorTool
数学计算工具，支持基本算术运算。

```typescript
agent.addTool(new CalculatorTool());
// 使用: "计算 100 + 200 / 5"
```

### SearchTool
搜索工具，支持网页搜索功能。

```typescript
agent.addTool(new SearchTool());
// 使用: "搜索 TypeScript 教程"
```

### 自定义工具

```typescript
import { BaseTool, Tool } from './src/types';

// 方式1: 继承 BaseTool
class MyTool extends BaseTool {
  name = 'my_tool';
  description = '我的自定义工具';

  // 定义参数
  getParameters() {
    return [
      {
        name: 'input',
        type: 'string',
        description: '输入内容',
        required: true
      }
    ];
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    // 自动验证参数
    this.validateParams(params, ['input']);

    const input = params.input as string;
    // 自定义逻辑
    return `处理结果: ${input}`;
  }
}

agent.addTool(new MyTool());

// 方式2: 直接实现 Tool 接口
const customTool: Tool = {
  name: 'hello',
  description: '打招呼工具',
  execute: async (params) => `你好, ${params.name}!`
};
```

#### BaseTool 核心功能

| 方法 | 说明 |
|------|------|
| getParameters() | 获取工具参数定义 |
| validateParams() | 验证必填参数 |
| toOpenAISchema() | 转换为 OpenAI Function Calling 格式 |

#### OpenAI Function Calling 集成

```typescript
const tool = new CalculatorTool();
// 转换为 OpenAI 格式
const schema = tool.toOpenAISchema();
// 可直接用于 OpenAI API 的 function call
```

## 配置

### LLM 配置

```typescript
const llm = new HelloAgentsLLM({
  provider: 'openai',      // 提供商: openai, anthropic, custom
  model: 'gpt-4',          // 模型名称
  apiKey: 'your-api-key',  // API Key
  baseUrl: '...',          // 自定义 API 地址
  temperature: 0.7,        // 温度参数
  maxTokens: 2000          // 最大 token 数
});
```

### Agent 配置

```typescript
const agent = new SimpleAgent('助手', llm, {
  systemPrompt: '你是一个专业的技术顾问。',  // 系统提示词
  maxHistoryLength: 20                        // 最大历史记录数
});
```

## 流式响应

```typescript
for await (const chunk of agent.streamRun('给我讲个故事')) {
  process.stdout.write(chunk);
}
```

## 环境变量

在 `.env` 文件中配置:

```env
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## 运行示例

```bash
npm run example
```

## 技术栈

- TypeScript 5.3+
- Node.js

## License

MIT

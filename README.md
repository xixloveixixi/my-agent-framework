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

### PlanAndSolveAgent
先制定计划，再执行计划的 Agent。适合复杂任务分解。

### ReflectionAgent
具备自我反思能力的 Agent，可以评估和改进自己的输出。

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

class MyTool extends BaseTool {
  name = 'my_tool';
  description = '我的自定义工具';

  async execute(params: Record<string, unknown>): Promise<string> {
    const input = params.input as string;
    // 自定义逻辑
    return `处理结果: ${input}`;
  }
}

agent.addTool(new MyTool());
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

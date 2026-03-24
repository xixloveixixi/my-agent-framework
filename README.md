# HelloAgents Framework

从零构建的 TypeScript Agent 框架，提供了多种 Agent 模式、工具调用能力和灵活的大语言模型集成。

## 特性

- **多种 Agent 模式**: 支持 SimpleAgent、ReActAgent、PlanAndSolveAgent、ReflectionAgent、ContextAwareAgent、ProjectAssistant
- **工具调用**: 内置计算器、搜索、记忆、RAG、笔记等工具，支持自定义工具扩展
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
│   ├── context-aware-agent.ts  # 上下文感知 Agent
│   ├── project-assistant.ts  # 项目助手
│   └── index.ts          # Agents 导出
│
├── tools/                # 工具模块
│   ├── base.ts           # 工具基类
│   ├── calculator.ts     # 计算器工具
│   ├── search.ts         # 搜索工具
│   ├── memory-tool.ts    # 记忆工具
│   ├── rag-tool.ts       # RAG 工具
│   ├── note-tool.ts      # 笔记工具
│   ├── terminal-tool.ts  # 终端工具
│   ├── registry.ts       # 工具注册表
│   └── index.ts          # 工具导出
│
├── memory/               # 记忆模块
│   ├── base.ts           # 记忆基类
│   ├── manager.ts        # 记忆管理器
│   ├── store.ts          # 存储层
│   ├── embedding.ts      # 嵌入服务
│   ├── retriever.ts      # 检索层
│   ├── types/            # 记忆类型定义
│   │   ├── working.ts    # 工作记忆
│   │   ├── episodic.ts   # 情景记忆
│   │   ├── semantic.ts  # 语义记忆
│   │   └── perceptual.ts # 感知记忆
│   ├── storage/          # 存储实现
│   │   ├── memory-store.ts
│   │   ├── qdrant-store.ts
│   │   └── neo4j-store.ts
│   └── rag/              # RAG 实现
│       └── pipeline.ts
│
├── context/              # 上下文工程模块
│   ├── types.ts          # 类型定义
│   ├── builder.ts        # ContextBuilder 实现
│   └── index.ts          # 模块导出
├── types/                # 类型定义
│   └── index.ts
│
├── examples/             # 示例
│   ├── custom-llm.ts     # 自定义 LLM 示例
│   └── memory-example.ts # 记忆示例
│
└── index.ts             # 主入口
```

## 上下文工程

HelloAgents 提供了完整的上下文工程模块 (ContextBuilder)，实现 GSSC (Gather-Select-Structure-Compress) 流水线。

### 核心概念

#### ContextPacket
候选信息包，系统中信息的基本单元。

```typescript
interface ContextPacket {
  content: string;        // 信息内容
  timestamp: Date;        // 时间戳
  tokenCount: number;     // Token 数量
  relevanceScore: number; // 相关性分数 (0.0-1.0)
  metadata?: Record<string, unknown>;
  source?: 'memory' | 'conversation' | 'system' | 'tool';
  priority?: number;
}
```

#### ContextConfig
上下文构建配置。

```typescript
interface ContextConfig {
  maxTokens: number;        // 最大 token 数量
  reserveRatio: number;     // 为系统指令预留的比例 (0.0-1.0)
  minRelevance: number;    // 最低相关性阈值
  enableCompression: boolean; // 是否启用压缩
  recencyWeight: number;   // 新近性权重 (0.0-1.0)
  relevanceWeight: number; // 相关性权重 (0.0-1.0)
}
```

### GSSC 流水线

#### 1. Gather - 多源信息汇集
从系统指令、记忆、RAG、对话历史等来源收集候选信息。

#### 2. Select - 智能信息选择
基于相关性 + 新近性综合评分，贪心选择填充 token 预算。

```typescript
combinedScore = relevanceWeight × relevance + recencyWeight × recency
```

#### 3. Structure - 结构化输出
输出标准化五段式模板：

```
[Role & Policies]  ← 系统指令
[Task]             ← 用户查询
[Evidence]         ← RAG 检索结果
[Context]          ← 记忆 + 对话历史
[Output]           ← 输出引导
```

#### 4. Compress - 兜底压缩
当上下文超限时，按 Section 顺序分区截断压缩。

### 使用示例

```typescript
import { ContextBuilder, ContextConfig, buildContext } from './src';

const builder = new ContextBuilder({
  maxTokens: 3000,
  reserveRatio: 0.2,
  minRelevance: 0.1,
  enableCompression: true,
});

const result = await builder.build({
  userQuery: '如何优化 Pandas 内存?',
  systemInstructions: '你是一位数据工程顾问。',
  conversationHistory: [
    { role: 'user', content: '我正在开发数据分析工具' },
    { role: 'assistant', content: '很好，请继续。' }
  ],
  memoryTool,   // 可选
  ragTool,      // 可选
});

console.log(result.structuredContext);
console.log(`Token 使用: ${result.totalTokens}/${result.utilization * 100}%`);
```

---

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

### ContextAwareAgent
具备上下文感知能力的 Agent，集成 GSSC 流水线自动构建优化的上下文。

```typescript
import { ContextAwareAgent, HelloAgentsLLM } from './src';

const agent = new ContextAwareAgent('智能顾问', llm, {
  systemPrompt: '你是一位专业顾问。',
  contextConfig: {
    maxTokens: 4000,
    reserveRatio: 0.2,
    minRelevance: 0.1,
    enableCompression: true,
  },
  memoryTool,  // 可选：记忆工具
  ragTool,     // 可选：RAG 工具
  autoMemory: true,  // 自动记录对话到记忆
});

// 运行 - 自动构建优化上下文
const response = await agent.run('如何优化 Pandas 内存?');
console.log(response);

// 手动检索
const memories = await agent.searchMemory('用户偏好');
const knowledge = await agent.searchKnowledge('Pandas 优化');
```

#### ContextAwareAgent 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| contextConfig | ContextConfig | 默认配置 | 上下文构建配置 |
| memoryTool | ContextTool | undefined | 记忆工具 |
| ragTool | ContextTool | undefined | RAG 工具 |
| autoMemory | boolean | true | 自动记录对话到记忆 |

#### 特性

- **GSSC 流水线**: 自动汇集、选择、结构化、压缩上下文
- **多源整合**: 记忆、RAG、对话历史智能融合
- **自动记忆**: 对话自动记录到记忆系统
- **动态配置**: 运行时更新上下文配置

### ProjectAssistant

长期项目助手，集成 NoteTool 和 ContextBuilder，提供项目生命周期管理。

```typescript
import { ProjectAssistant } from './src';

// 创建项目助手
const assistant = new ProjectAssistant('项目助手', {
  projectName: 'my_project',
  noteLimit: 3,
  autoNote: true,
  toolConfig: {
    notePath: './project_notes',
  },
});

// 聊天（自动检索相关笔记 + 构建上下文）
const response = await assistant.chat('我们完成了第一阶段重构...');

// 手动操作笔记
await assistant.createNote('API 设计', '## 设计规范', 'reference');
await assistant.searchNotes('重构');
await assistant.listNotes('blocker');
await assistant.getSummary();
```

#### ProjectAssistant 功能

- **自动笔记检索**: 聊天时自动检索相关笔记
- **智能上下文构建**: 整合笔记、记忆、RAG 构建优化上下文
- **自动保存**: 根据内容自动判断笔记类型保存
- **项目管理**: 支持任务状态、阻碍、行动项等分类

#### 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| projectName | string | - | 项目名称 |
| maxContextTokens | number | 4000 | 最大上下文 token 数 |
| noteLimit | number | 3 | 每次检索的笔记数量 |
| autoNote | boolean | true | 是否自动保存对话为笔记 |
| toolConfig.notePath | string | ./${projectName}_notes | 笔记存储路径 |
| toolConfig.ragPath | string | - | RAG 知识库路径 |

## 工具

### CalculatorTool
数学计算工具，支持基本算术运算。

```typescript
agent.addTool(new CalculatorTool());
// 使用: "计算 100 + 200 / 5"
```

### SearchTool
搜索工具，支持 Tavily 和 SerpApi 多种搜索源。

```typescript
import { SearchTool } from './src';

// 创建搜索工具 (支持 hybrid/tavily/serpapi)
const searchTool = new SearchTool('hybrid');

// 基础使用
agent.addTool(searchTool);
// 使用: "搜索 TypeScript 教程"

// 高级使用
const results = await searchTool.execute({
  query: 'TypeScript 教程',
  maxResults: 5
});
```

#### 环境配置

```env
# 方式1: Tavily API (推荐)
TAVILY_API_KEY=your-tavily-key

# 方式2: SerpApi (Google搜索)
SERPAPI_API_KEY=your-serpapi-key
```

#### SearchTool 特性

| 特性 | 说明 |
|------|------|
| 多源支持 | hybrid/tavily/serpapi |
| 智能降级 | 主源失败自动切换备源 |
| AI 摘要 | Tavily 提供直接答案 |
| 模拟模式 | 无 API 时返回引导信息 |

#### AdvancedSearchTool

```typescript
import { AdvancedSearchTool } from './src';

const advancedSearch = new AdvancedSearchTool();
const results = await advancedSearch.search('React vs Vue', 5);
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

## 记忆系统

HelloAgents 提供了完整的记忆系统，支持多种记忆类型和存储后端。

### 记忆类型

| 类型 | 说明 | 存储 |
|------|------|------|
| Working (工作记忆) | 当前会话的短期记忆 | 内存 |
| Episodic (情景记忆) | 过往交互的经历 | 内存/持久化 |
| Semantic (语义记忆) | 结构化知识和概念 | Neo4j 图数据库 |
| Perceptual (感知记忆) | 图像、音频等感知数据 | 文档存储 |

### MemoryManager

```typescript
import { MemoryManager, MemoryType } from './src';

const memoryManager = new MemoryManager({
  storageType: 'memory',  // memory/qdrant/neo4j
  embedding: {
    provider: 'openai',
    model: 'text-embedding-ada-002'
  }
});

// 添加记忆
await memoryManager.addMemory({
  content: '用户喜欢蓝色的主题',
  memoryType: MemoryType.EPISODIC,
  importance: 0.8
});

// 搜索记忆
const results = await memoryManager.search('用户偏好', 5);

// 遗忘低重要性记忆
await memoryManager.forgetMemories({
  strategy: 'importance_based',
  threshold: 0.2
});
```

### MemoryTool

为 Agent 提供的记忆工具，支持搜索、添加、整合等操作。

```typescript
import { MemoryTool, MemoryManager } from './src';

const memoryManager = new MemoryManager();
const memoryTool = new MemoryTool(memoryManager);

agent.addTool(memoryTool);

// 使用工具操作记忆
// action: search/add/clear/stats/consolidate/forget
```

#### MemoryTool 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| action | string | 操作类型 |
| content | string | 记忆内容 |
| query | string | 搜索关键词 |
| memory_type | string | 记忆类型 |
| importance | number | 重要性 (0-1) |

### NoteTool

笔记管理工具，提供笔记的完整生命周期管理。

```typescript
import { NoteTool } from './src';

const notes = new NoteTool('./project_notes');

// 创建笔记
const noteId = await notes.execute({
  action: 'create',
  title: '重构项目 - 第一阶段',
  content: '## 完成情况\n已完成数据模型层重构',
  note_type: 'task_state',
  tags: ['refactoring', 'phase1']
});

// 搜索笔记
const results = await notes.execute({
  action: 'search',
  query: '重构'
});

// 列出笔记
const list = await notes.execute({
  action: 'list',
  note_type: 'blocker'
});

// 获取摘要
const summary = await notes.execute({ action: 'summary' });
```

#### NoteTool 操作

| 操作 | 说明 | 主要参数 |
|------|------|----------|
| create | 创建笔记 | title, content, note_type, tags |
| read | 读取笔记 | note_id |
| update | 更新笔记 | note_id, title, content |
| search | 搜索笔记 | query, note_type, tags |
| list | 列出笔记 | note_type, tags, limit |
| summary | 笔记统计 | - |
| delete | 删除笔记 | note_id |

#### 笔记类型

| 类型 | 说明 |
|------|------|
| task_state | 任务状态 |
| conclusion | 结论 |
| blocker | 阻碍/问题 |
| action | 行动项 |
| reference | 参考资料 |
| general | 通用 |

### TerminalTool

安全的终端命令执行工具，提供多层安全机制确保系统安全。

```typescript
import { TerminalTool } from './src';

// 创建工具实例
const terminal = new TerminalTool({
  workspace: './project',           // 工作目录（可选，默认当前目录）
  timeout: 30000,                  // 命令超时（毫秒，默认 30000）
  maxOutputSize: 10 * 1024 * 1024, // 最大输出大小（字节，默认 10MB）
  allowCd: true                    // 是否允许 cd 命令（默认 true）
});

// 执行命令
const result = await terminal.execute({ command: 'ls -la' });
console.log(result);

// 目录导航
await terminal.execute({ command: 'cd src' });
await terminal.execute({ command: 'pwd' });

// 查看文件
await terminal.execute({ command: 'cat README.md' });

// 搜索文件
await terminal.execute({ command: 'find . -name "*.ts"' });
```

#### 安全机制

| 层级 | 说明 |
|------|------|
| 命令白名单 | 只允许安全的只读命令 (ls, cat, find, grep 等) |
| 工作目录限制 | 只能在指定工作目录内操作，无法访问外部路径 |
| 超时控制 | 默认 30 秒超时，防止命令无限运行 |
| 输出大小限制 | 默认 10MB，防止内存溢出 |

#### 允许的命令

```
awk, cat, cd, cut, df, dir, du, echo, egrep, fgrep,
file, find, grep, head, less, ls, more, pwd, sed,
sort, stat, tail, tree, uniq, wc, whereis, which
```

#### 存储后端

#### 内存存储 (默认)

```typescript
const manager = new MemoryManager({
  storageType: 'memory'
});
```

#### Qdrant 向量存储

```typescript
const manager = new MemoryManager({
  storageType: 'qdrant',
  qdrant: {
    url: 'http://localhost:6333',
    collection: 'my-agent-memory'
  }
});
```

#### Neo4j 图存储

```typescript
const manager = new MemoryManager({
  storageType: 'neo4j',
  neo4j: {
    url: 'bolt://localhost:7687',
    username: 'neo4j',
    password: 'password'
  }
});
```

## RAG (检索增强生成)

RAG 模块提供文档检索和问答能力。

### RAGTool

```typescript
import { RAGTool, RAGPipeline } from './src';

// 创建 RAG pipeline
const ragPipeline = new RAGPipeline({
  embedding: {
    provider: 'openai',
    model: 'text-embedding-ada-002'
  },
  vectorStore: {
    provider: 'qdrant',
    url: 'http://localhost:6333'
  }
});

// 添加文档
await ragPipeline.addDocuments([
  { content: 'TypeScript 是微软开发的...' },
  { content: 'React 是 Facebook 开发的...' }
]);

// 问答
const answer = await ragPipeline.query('什么是 TypeScript?');
```

### RAGQAtTool

基于 RAG 的问答工具，可直接用于 Agent。

```typescript
import { RAGQATool } from './src';

const ragTool = new RAGQATool(ragPipeline);
agent.addTool(ragTool);
```

### 配置选项

| 选项 | 类型 | 说明 |
|------|------|------|
| embedding | object | 嵌入服务配置 |
| vectorStore | object | 向量存储配置 |
| retrieval | object | 检索参数 (topK, similarityThreshold) |
| reranker | object | 重排序模型配置 |

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

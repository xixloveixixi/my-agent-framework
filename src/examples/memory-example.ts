/**
 * Memory 模块使用示例
 * 展示记忆与检索功能
 */
import {
  MemoryManager,
  MemoryType,
  WorkingMemory,
  SemanticMemory,
  RAGPipeline,
  DocumentProcessor,
  TextDocumentLoader,
} from '../memory';

// ==================== 1. 工作记忆示例 ====================
async function demoWorkingMemory() {
  console.log('\n========== 1. 工作记忆示例 ==========');

  const memory = new WorkingMemory({ maxSize: 50, ttl: 3600000 });

  // 添加对话记录
  await memory.add('你好，我想了解一下 TypeScript', { role: 'user' });
  await memory.add('你好！TypeScript 是 JavaScript 的超集', { role: 'assistant' });
  await memory.add('TypeScript 有什么优势？', { role: 'user' });
  await memory.add('TypeScript 的优势包括类型安全', { role: 'assistant' });

  console.log(`记忆数量: ${memory.size()}`);

  // 获取最近
  const recent = await memory.getRecent(2);
  console.log('\n最近 2 条:');
  recent.forEach(item => {
    console.log(`  - ${item.content}`);
  });

  // 搜索
  const searchResults = await memory.search('优势');
  console.log('\n搜索 "优势":');
  searchResults.forEach(item => {
    console.log(`  - ${item.content}`);
  });

  // 统计
  const stats = memory.getStats();
  console.log('\n统计:', stats);
}

// ==================== 2. 语义记忆示例 ====================
async function demoSemanticMemory() {
  console.log('\n========== 2. 语义记忆示例 ==========');

  const memory = new SemanticMemory();

  // 添加概念
  await memory.addConcept({
    name: 'TypeScript',
    description: 'TypeScript 是 JavaScript 的类型化超集',
    category: '编程语言',
  });

  await memory.addConcept({
    name: 'React',
    description: 'React 是用于构建用户界面的 JavaScript 库',
    category: '前端框架',
  });

  console.log(`概念数量: ${memory.size()}`);

  // 添加关系
  const ts = memory.findConceptByName('TypeScript');
  const react = memory.findConceptByName('React');
  if (ts && react) {
    await memory.addRelation({
      source: ts.id,
      target: react.id,
      type: 'used_with',
    });
  }

  // 搜索
  const results = await memory.search('JavaScript');
  console.log('\n搜索 "JavaScript":');
  results.forEach(item => {
    console.log(`  - ${item.content}`);
  });

  // 统计
  const stats = memory.getStats();
  console.log('\n统计:', stats);
}

// ==================== 3. RAG 知识库示例 ====================
async function demoRAG() {
  console.log('\n========== 3. RAG 知识库示例 ==========');

  const pipeline = new RAGPipeline();
  const processor = new DocumentProcessor(pipeline);

  // 添加知识
  await processor.loadText(`
    HelloAgents Framework

    HelloAgents 是一个 TypeScript 编写的 Agent 框架。

    ## 特性
    - 支持多种 Agent 模式
    - 内置工具系统
    - 支持多提供商 LLM

    ## Agent 类型
    1. SimpleAgent - 简单对话
    2. ReActAgent - 推理+行动
    3. PlanAndSolveAgent - 计划执行
    4. ReflectionAgent - 自我反思
  `);

  console.log(`文档数量: ${pipeline.size()}`);

  // 检索
  const docs = pipeline.retrieve('Agent 类型');
  console.log('\n检索 "Agent 类型":');
  docs.forEach(doc => {
    console.log(`  - ${doc.content.slice(0, 60)}...`);
  });

  // RAG 生成
  const mockLLM = {
    async generate(prompt: string): Promise<string> {
      return '这是基于 RAG 检索增强生成的回答。相关知识已从知识库中检索。';
    },
  };

  const result = await pipeline.generate('Agent 类型有哪些？', mockLLM);
  console.log('\n回答:', result.answer);
}

// ==================== 4. 记忆管理器示例 ====================
async function demoMemoryManager() {
  console.log('\n========== 4. 记忆管理器示例 ==========');

  const manager = new MemoryManager({
    enableWorking: true,
    enableEpisodic: true,
    enableSemantic: true,
    enablePerceptual: false,
  });

  // 添加记忆
  await manager.addMemory({ content: '用户问好', memoryType: 'working' });
  await manager.addMemory({ content: 'AI 回复问好', memoryType: 'working' });
  await manager.addMemory({ content: '今天学习了 TypeScript', memoryType: 'episodic' });
  await manager.addMemory({ content: 'TypeScript 是类型化语言', memoryType: 'semantic' });

  // 搜索
  const results = await manager.search('TypeScript');
  console.log(`搜索 "TypeScript" (${results.length} 条结果):`);
  results.forEach(r => {
    console.log(`  - [${r.memory_type}] ${r.content} (重要性: ${r.importance})`);
  });

  // 统计
  const stats = manager.getStats();
  console.log('\n记忆统计:', JSON.stringify(stats, null, 2));
}

// ==================== 运行所有示例 ====================
async function main() {
  console.log('HelloAgents Memory 模块示例');
  console.log('============================');

  await demoWorkingMemory();
  await demoSemanticMemory();
  await demoRAG();
  await demoMemoryManager();

  console.log('\n============================');
  console.log('示例完成！');
}

main().catch(console.error);

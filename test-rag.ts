/**
 * RAG 功能测试脚本
 */

import { RAGPipeline, RAGDocument } from './src/memory/rag/pipeline';
import { SimpleVectorStore } from './src/memory/types/vector-store';

// 模拟 LLM（用于 MQE 和 HyDE）
const mockLLM = {
  async generate(prompt: string): Promise<string> {
    // 简单的关键词提取作为模拟
    if (prompt.includes('什么是向量存储')) {
      return `向量存储是一种专门用于存储高维向量数据的数据库系统
它通过计算向量之间的相似度来实现语义搜索
常见的向量数据库包括 Qdrant、Milvus、Faiss 等`;
    }
    if (prompt.includes('React')) {
      return `React 是一个用于构建用户界面的 JavaScript 库
它采用组件化开发模式
React 支持虚拟 DOM 和单向数据流`;
    }
    return '这是生成的扩展查询或假设文档';
  }
};

async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 开始测试 RAG 功能');
  console.log('='.repeat(60));

  // 创建向量存储和 RAG Pipeline
  const vectorStore = new SimpleVectorStore();
  const pipeline = new RAGPipeline(vectorStore, {
    topK: 3,
    mqeEnabled: false,  // 先测试基础功能
    hydeEnabled: false,
  });

  // 准备测试文档
  const docs: RAGDocument[] = [
    { id: '1', content: '向量存储是一种专门用于存储高维向量数据的数据库系统。', source: 'doc1' },
    { id: '2', content: 'Qdrant 是一个开源的向量相似度搜索引擎。', source: 'doc2' },
    { id: '3', content: 'Milvus 是云原生的向量数据库，支持亿级向量规模。', source: 'doc3' },
    { id: '4', content: 'Faiss 是 Facebook 开发的稠密向量检索库。', source: 'doc4' },
    { id: '5', content: 'Embedding（嵌入）是将文本转换为向量的技术。', source: 'doc5' },
    { id: '6', content: '余弦相似度是常用的向量相似度计算方法。', source: 'doc6' },
    { id: '7', content: 'React 是一个用于构建用户界面的 JavaScript 库。', source: 'doc7' },
    { id: '8', content: 'Vue 是渐进式 JavaScript 框架。', source: 'doc8' },
    { id: '9', content: 'Angular 是 Google 开发的前端框架。', source: 'doc9' },
    { id: '10', content: 'TypeScript 是 JavaScript 的超集，添加了类型系统。', source: 'doc10' },
  ];

  // 测试 1: 添加文档
  console.log('\n📝 测试 1: 添加文档');
  pipeline.addDocuments(docs);
  console.log(`✅ 已添加 ${pipeline.size()} 个文档`);

  // 测试 2: 普通检索
  console.log('\n🔍 测试 2: 普通检索');
  console.log('查询: "向量数据库"');
  const results1 = pipeline.retrieve('向量数据库');
  console.log(`✅ 找到 ${results1.length} 个结果:`);
  results1.forEach((doc, i) => {
    console.log(`   ${i + 1}. [${doc.source}] ${doc.content}`);
  });

  // 测试 3: 检索另一个查询
  console.log('\n🔍 测试 3: 普通检索');
  console.log('查询: "前端框架"');
  const results2 = pipeline.retrieve('前端框架');
  console.log(`✅ 找到 ${results2.length} 个结果:`);
  results2.forEach((doc, i) => {
    console.log(`   ${i + 1}. [${doc.source}] ${doc.content}`);
  });

  // 测试 4: MQE 多查询扩展
  console.log('\n🔍 测试 4: MQE 多查询扩展');
  const pipelineMQE = new RAGPipeline(new SimpleVectorStore(), {
    topK: 3,
    mqeEnabled: true,
    mqeCount: 3,
  });
  pipelineMQE.addDocuments(docs);

  const mqeResults = await pipelineMQE.searchWithExpansion('什么是向量存储', mockLLM, {
    enableMQE: true,
    enableHyDE: false,
    mqeCount: 3,
  });
  console.log(`✅ MQE 找到 ${mqeResults.length} 个结果:`);
  mqeResults.forEach((doc, i) => {
    console.log(`   ${i + 1}. [${doc.source}] ${doc.content}`);
  });

  // 测试 5: HyDE 假设文档嵌入
  console.log('\n🔍 测试 5: HyDE 假设文档嵌入');
  const pipelineHyDE = new RAGPipeline(new SimpleVectorStore(), {
    topK: 3,
    hydeEnabled: true,
  });
  pipelineHyDE.addDocuments(docs);

  const hydeResults = await pipelineHyDE.retrieveWithHyDE('什么是向量存储', mockLLM);
  console.log(`✅ HyDE 找到 ${hydeResults.documents.length} 个结果:`);
  hydeResults.documents.forEach((doc, i) => {
    console.log(`   ${i + 1}. [${doc.source}] ${doc.content}`);
  });
  console.log(`   📝 假设文档: ${hydeResults.hypotheticalDoc.slice(0, 50)}...`);

  // 测试 6: MQE + HyDE 组合
  console.log('\n🔍 测试 6: MQE + HyDE 组合扩展检索');
  const pipelineBoth = new RAGPipeline(new SimpleVectorStore(), {
    topK: 3,
    mqeEnabled: true,
    hydeEnabled: true,
    mqeCount: 3,
    candidatePoolMultiplier: 4,
  });
  pipelineBoth.addDocuments(docs);

  const bothResults = await pipelineBoth.searchWithExpansion('什么是向量存储', mockLLM, {
    enableMQE: true,
    enableHyDE: true,
    mqeCount: 3,
  });
  console.log(`✅ 组合扩展找到 ${bothResults.length} 个结果:`);
  bothResults.forEach((doc, i) => {
    const expansionCount = (doc.metadata?.expansionCount as number) || 1;
    console.log(`   ${i + 1}. [${doc.source}] ${doc.content}`);
    console.log(`      📊 扩展命中: ${expansionCount} 次`);
  });

  // 测试 7: 关键词搜索
  console.log('\n🔍 测试 7: 关键词搜索');
  const kwResults = vectorStore.searchByKeywords(['React', 'JavaScript'], 3);
  console.log(`✅ 关键词搜索找到 ${kwResults.length} 个结果:`);
  kwResults.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.content}`);
  });

  // 测试 8: 带嵌入的检索（异步）
  console.log('\n🔍 测试 8: 异步检索（需要嵌入服务）');
  // 注意：需要配置嵌入服务才能使用

  console.log('\n' + '='.repeat(60));
  console.log('🎉 RAG 功能测试完成!');
  console.log('='.repeat(60));
}

runTests().catch(console.error);

/**
 * ContextBuilder 测试示例
 */

import { ContextBuilder, ContextConfig, buildContext } from '../context';

// 模拟的记忆工具
const createMockMemoryTool = () => ({
  async run(params: Record<string, unknown>) {
    const action = params.action as string;
    if (action === 'search') {
      // 模拟返回记忆检索结果
      return JSON.stringify([
        {
          content: '用户正在开发数据分析工具,使用Python和Pandas',
          importance: 0.8,
        },
        {
          content: '已完成CSV读取模块的开发',
          importance: 0.7,
        },
      ]);
    }
    return '[]';
  },
});

// 模拟的 RAG 工具
const createMockRagTool = () => ({
  async run(params: Record<string, unknown>) {
    const action = params.action as string;
    if (action === 'search') {
      // 模拟返回 RAG 检索结果
      return JSON.stringify([
        {
          content: 'Pandas 优化内存占用技巧：1) 使用适当的数据类型 2) 使用 chunk 分块处理 3) 使用 eval() 进行向量化操作',
          score: 0.85,
        },
        {
          content: 'astype() 方法可以显著减少内存占用，例如将 float64 转换为 float32',
          score: 0.75,
        },
      ]);
    }
    return '[]';
  },
});

// 对话历史
const conversationHistory = [
  { role: 'user', content: '我正在开发一个数据分析工具', timestamp: new Date() },
  { role: 'assistant', content: '很好!数据分析工具通常需要处理大量数据。您计划使用什么技术栈?', timestamp: new Date() },
  { role: 'user', content: '我打算使用Python和Pandas,已经完成了CSV读取模块', timestamp: new Date() },
  { role: 'assistant', content: '不错的选择!Pandas在数据处理方面非常强大。接下来您可能需要考虑数据清洗和转换。', timestamp: new Date() },
];

async function main() {
  console.log('='.repeat(80));
  console.log('ContextBuilder 测试');
  console.log('='.repeat(80));

  // 1. 创建 ContextBuilder
  const config: Partial<ContextConfig> = {
    maxTokens: 3000,
    reserveRatio: 0.2,
    minRelevance: 0.2,
    enableCompression: true,
    recencyWeight: 0.3,
    relevanceWeight: 0.7,
  };

  const builder = new ContextBuilder(config);

  // 2. 构建上下文
  const result = await builder.build({
    userQuery: '如何优化Pandas的内存占用?',
    conversationHistory,
    systemInstructions: '你是一位资深的Python数据工程顾问。你的回答需要:1) 提供具体可行的建议 2) 解释技术原理 3) 给出代码示例',
    memoryTool: createMockMemoryTool(),
    ragTool: createMockRagTool(),
  });

  // 3. 输出结果
  console.log('\n--- 统计信息 ---');
  console.log(`总 Token 数: ${result.totalTokens}`);
  console.log(`利用率: ${(result.utilization * 100).toFixed(1)}%`);
  console.log(`保留空间: ${result.reservedTokens} tokens`);
  if (result.compressedTokens) {
    console.log(`压缩后: ${result.compressedTokens} tokens`);
  }
  console.log(`选中的信息包数量: ${result.packets.length}`);

  console.log('\n--- 结构化上下文 ---');
  console.log('='.repeat(80));
  console.log(result.structuredContext);
  console.log('='.repeat(80));

  // 4. 测试压缩功能 - 使用超长内容
  console.log('\n--- 压缩测试 ---');
  const longConfig: Partial<ContextConfig> = {
    maxTokens: 500,
    reserveRatio: 0.1,
    minRelevance: 0.1,
    enableCompression: true,
  };

  const longBuilder = new ContextBuilder(longConfig);

  // 创建一些很长的信息包
  const longPackets: Array<{
    content: string;
    timestamp: Date;
    tokenCount: number;
    relevanceScore: number;
    metadata: { type: string };
    source: 'memory' | 'conversation';
    priority: number;
  }> = Array(10).fill(null).map((_, i) => ({
    content: `这是第 ${i + 1} 条很长的内容，包含大量文本用于测试压缩功能。`.repeat(50),
    timestamp: new Date(),
    tokenCount: Math.ceil((`这是第 ${i + 1} 条很长的内容`.repeat(50)).length / 4),
    relevanceScore: 0.8 - i * 0.05,
    metadata: { type: i < 2 ? 'rag_result' : 'conversation_history' },
    source: i < 2 ? 'memory' : 'conversation',
    priority: 0.5,
  }));

  const longResult = await longBuilder.build({
    userQuery: '测试压缩功能',
    customPackets: longPackets,
  });

  console.log(`原始长度 ~${longResult.totalTokens} tokens`);
  console.log(`压缩后 ${longResult.compressedTokens || longResult.totalTokens} tokens`);
  console.log('压缩后的上下文:');
  console.log(longResult.structuredContext?.slice(0, 500) + '...');
}

main().catch(console.error);

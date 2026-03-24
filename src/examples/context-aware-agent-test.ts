/**
 * ContextAwareAgent 测试示例
 */

import { ContextAwareAgent, ContextAwareAgentConfig } from '../agents/context-aware-agent';
import { HelloAgentsLLM } from '../core/llm';
import { ContextConfig } from '../context';

// 模拟的记忆工具
const createMockMemoryTool = () => ({
  async run(params: Record<string, unknown>) {
    const action = params.action as string;
    if (action === 'search') {
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
      return JSON.stringify([
        {
          content: 'Pandas 优化内存占用技巧：1) 使用适当的数据类型 2) 使用 chunk 分块处理',
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

async function main() {
  console.log('='.repeat(80));
  console.log('ContextAwareAgent 测试');
  console.log('='.repeat(80));

  // 1. 创建 LLM (使用模拟或实际 LLM)
  const llm = new HelloAgentsLLM({
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
  });

  // 2. 配置
  const config: ContextAwareAgentConfig = {
    systemPrompt: '你是一位资深的Python数据工程顾问。你的回答需要:1) 提供具体可行的建议 2) 解释技术原理 3) 给出代码示例',
    contextConfig: {
      maxTokens: 3000,
      reserveRatio: 0.2,
      minRelevance: 0.2,
      enableCompression: true,
    } as Partial<ContextConfig>,
    memoryTool: createMockMemoryTool(),
    ragTool: createMockRagTool(),
    autoMemory: true,
  };

  // 3. 创建 ContextAwareAgent
  const agent = new ContextAwareAgent('数据分析顾问', llm, config);

  console.log('\n' + agent.toString());
  console.log('上下文配置:', agent.getContextStats());

  // 4. 运行测试
  console.log('\n--- 第一次对话 ---');
  const response1 = await agent.run('如何优化Pandas的内存占用?');
  console.log('\n📝 Agent 响应:');
  console.log(response1 || '(模拟响应 - 无实际 LLM)');

  console.log('\n--- 第二次对话 (测试上下文累积) ---');
  const response2 = await agent.run('除了内存优化，还有什么性能提升技巧？');
  console.log('\n📝 Agent 响应:');
  console.log(response2 || '(模拟响应 - 无实际 LLM)');

  // 5. 测试手动检索
  console.log('\n--- 手动记忆检索 ---');
  const memoryResults = await agent.searchMemory('Python');
  console.log('记忆检索结果:', memoryResults);

  console.log('\n--- 手动 RAG 检索 ---');
  const ragResults = await agent.searchKnowledge('数据分析');
  console.log('RAG 检索结果:', ragResults);

  console.log('\n' + '='.repeat(80));
  console.log('测试完成!');
  console.log('='.repeat(80));
}

main().catch(console.error);

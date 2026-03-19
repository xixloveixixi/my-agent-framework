/**
 * HelloAgents Framework 使用示例
 */
// 加载环境变量
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { HelloAgentsLLM, SimpleAgent, Message } from './index';
import { CalculatorTool, SearchTool } from './tools';

// 加载环境变量
dotenv.config();

async function main() {
  console.log('='.repeat(50));
  console.log('HelloAgents Framework Demo');
  console.log('='.repeat(50));

  // 1. 创建 LLM 实例
  console.log('\n📡 步骤1: 创建 LLM 客户端...');
  const llm = new HelloAgentsLLM({
    model: process.env.LLM_MODEL || 'gpt-3.5-turbo',
    temperature: 0.7,
  });

  console.log(`   Provider: ${llm.getProvider()}`);
  console.log(`   Model: ${llm.getModel()}`);

  // 2. 创建 SimpleAgent (无工具)
  console.log('\n🤖 步骤2: 创建 SimpleAgent (基础对话)...');
  const agent = new SimpleAgent('AI助手', llm, {
    systemPrompt: '你是一个友好的AI助手，用简洁的语言回答问题。',
  });

  // 3. 基础对话测试
  console.log('\n💬 步骤3: 基础对话测试...');
  const response1 = await agent.run('你好！请介绍一下你自己');
  console.log(`   回答: ${response1}`);

  // 4. 查看历史记录
  console.log('\n📜 步骤4: 查看对话历史...');
  const history = agent.getHistory();
  console.log(`   历史消息数: ${history.length}`);
  for (const msg of history) {
    console.log(`   ${msg.toString()}`);
  }

  // 5. 添加工具并测试
  console.log('\n🔧 步骤5: 添加工具...');
  const calculator = new CalculatorTool();
  const searchTool = new SearchTool();
  agent.addTool(calculator);
  agent.addTool(searchTool);

  // 6. 工具调用测试
  console.log('\n🧮 步骤6: 工具调用测试...');
  const response2 = await agent.run('请帮我计算 123 * 456 + 789');
  console.log(`   回答: ${response2}`);

  // 7. 搜索测试
  console.log('\n🔍 步骤7: 搜索测试...');
  const response3 = await agent.run('搜索一下 TypeScript 2024 年的新特性');
  console.log(`   回答: ${response3}`);

  // 8. 最终历史
  console.log('\n📚 最终对话历史:');
  const finalHistory = agent.getHistory();
  console.log(`   总消息数: ${finalHistory.length}`);

  console.log('\n' + '='.repeat(50));
  console.log('Demo 完成！');
  console.log('='.repeat(50));
}

main().catch(console.error);

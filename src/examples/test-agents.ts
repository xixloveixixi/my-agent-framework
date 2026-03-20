/**
 * Agent 框架测试文件
 */
import 'dotenv/config';
import { HelloAgentsLLM, SimpleAgent, ReActAgent } from '../index';
import { CalculatorTool, SearchTool, ToolRegistry } from '../tools';

async function testSimpleAgent() {
  console.log('\n========== 测试1: SimpleAgent 基础对话 ==========');

  const llm = new HelloAgentsLLM({
    model: 'deepseek-chat'
  });
  const agent = new SimpleAgent('AI助手', llm, {
    systemPrompt: '你是一个有用的AI助手'
  });

  const response = await agent.run('你好，请介绍一下自己');
  console.log('响应:', response);
}

async function testSimpleAgentWithTools() {
  console.log('\n========== 测试2: SimpleAgent + 工具 ==========');

  const llm = new HelloAgentsLLM({
    model: 'deepseek-chat'
  });
  const agent = new SimpleAgent('智能助手', llm);

  agent.addTool(new CalculatorTool());
  agent.addTool(new SearchTool());

  const response = await agent.run('请帮我计算 123 * 456 + 789');
  console.log('响应:', response);
}

/**
 * 测试案例：SimpleAgent 记忆功能
 * 对应 Python 示例：
 * agent = SimpleAgent(name="学习助手", llm=HelloAgentsLLM())
 * response1 = agent.run("我叫张三，正在学习Python，目前掌握了基础语法")
 * response2 = agent.run("你还记得我的学习进度吗？")
 */
async function testSimpleAgentMemory() {
  console.log('\n========== 测试3: SimpleAgent 记忆功能 ==========');

  const llm = new HelloAgentsLLM({
    model: 'deepseek-chat'
  });
  const agent = new SimpleAgent('学习助手', llm, {
    systemPrompt: '你是一个友好的学习助手，请记住用户告诉你的个人信息。'
  });

  console.log('\n--- 第一次对话 ---');
  const response1 = await agent.run('我叫张三，正在学习Python，目前掌握了基础语法');
  console.log('用户: 我叫张三，正在学习Python，目前掌握了基础语法');
  console.log('Agent:', response1);

  console.log('\n--- 第二次对话（同一会话，测试记忆） ---');
  const response2 = await agent.run('你还记得我的学习进度吗？');
  console.log('用户: 你还记得我的学习进度吗？');
  console.log('Agent:', response2);

  console.log('\n--- 第三次对话（测试更多信息回忆） ---');
  const response3 = await agent.run('我之前告诉你我叫什麼？');
  console.log('用户: 我之前告诉你我叫什么？');
  console.log('Agent:', response3);
}

async function testReActAgent() {
  console.log('\n========== 测试4: ReActAgent ==========');

  const llm = new HelloAgentsLLM({
    model: 'deepseek-chat'
  });
  const registry = new ToolRegistry();
  registry.register(new CalculatorTool());
  registry.register(new SearchTool());

  const agent = new ReActAgent('推理助手', llm, {
    toolRegistry: registry,
    maxSteps: 5,
    verbose: true
  });

  const response = await agent.run('计算 15 * 25 + 30 等于多少？');
  console.log('最终响应:', response);
}

async function main() {
  console.log('🚀 开始测试 HelloAgents 框架...\n');

  try {
    await testSimpleAgent();
    await testSimpleAgentWithTools();
    await testSimpleAgentMemory();
    await testReActAgent();

    console.log('\n✅ 所有测试完成！');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
  }
}

main();

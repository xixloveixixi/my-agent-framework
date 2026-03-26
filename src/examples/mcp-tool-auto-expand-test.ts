/**
 * MCPTool 自动展开测试
 * 模拟 Python 示例的效果
 */
import { SimpleAgent, HelloAgentsLLM, MCPTool } from '../index';

async function testMCPToolAutoExpand() {
  console.log('\n========== MCPTool 自动展开测试 ==========\n');

  // 检查是否有 API Key
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('⚠️ 未设置 API Key，将只测试工具展开功能');
    console.log('请设置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY');
  }

  // 创建 Agent
  const agent = new SimpleAgent('助手', new HelloAgentsLLM({ model: 'gpt-4o' }));

  // 创建 MCPTool（无需任何配置，自动使用内置演示服务器）
  const mcpTool = new MCPTool('calculator');

  // 添加到 Agent（会自动展开）
  agent.addTool(mcpTool);

  // 等待 MCP 工具初始化完成
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 列出 Agent 的工具
  console.log('\nAgent 工具列表:', agent.listTools());

  // 如果有 API Key，测试 Agent 运行
  if (apiKey) {
    console.log('\n--- Agent 运行测试 ---');
    const response = await agent.run('计算 25 乘以 16');
    console.log('响应:', response);
  } else {
    console.log('\n⚠️ 跳过 Agent 运行测试（需要 API Key）');
  }
}

// 运行
testMCPToolAutoExpand();
/**
 * MCP GitHub 服务测试
 * 需要设置环境变量: GITHUB_PERSONAL_ACCESS_TOKEN
 */
import { MCPClient } from '../mcp';

async function testGitHubMCP() {
  // 检查环境变量
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ 请设置环境变量 GITHUB_PERSONAL_ACCESS_TOKEN');
    console.log('Windows: $env:GITHUB_PERSONAL_ACCESS_TOKEN="your_token"');
    console.log('Linux/macOS: export GITHUB_PERSONAL_ACCESS_TOKEN="your_token"');
    return;
  }

  console.log('✅ 环境变量已设置，正在连接 GitHub MCP 服务器...\n');

  const client = new MCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: token,
    },
  });

  try {
    await client.connect();
    console.log(`✅ 已连接到: ${client.getServerInfo().name} v${client.getServerInfo().version}\n`);

    // 1. 列出可用工具
    console.log('📋 可用工具：');
    const tools = await client.listTools();
    for (const tool of tools) {
      console.log(`  - ${tool.name}: ${tool.description || ''}`);
    }

    // 2. 搜索仓库
    console.log('\n🔍 搜索仓库 (AI agents language:python):');
    const result = await client.callTool('search_repositories', {
      query: 'AI agents language:python',
      perPage: 3,
    });
    console.log(result);

    // 3. 获取用户信息
    console.log('\n👤 获取认证用户信息:');
    const userResult = await client.callTool('get_authenticated_user', {});
    console.log(userResult);

    client.disconnect();
    console.log('\n✅ 测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', (error as Error).message);
    client.disconnect();
  }
}

testGitHubMCP();
/**
 * MCP 工具自动展开测试
 * 展示将 MCP 服务器工具自动展开为框架工具的功能
 */
import { MCPClient, loadMCPTools } from '../mcp';
import { ToolRegistry } from '../tools/registry';

/**
 * 示例 1: MCP 工具自动展开
 * 模拟 Python 示例中的效果：MCPTool 自动展开为多个独立工具
 */
async function testAutoExpand() {
  console.log('\n========== MCP 工具自动展开测试 ==========\n');

  // 创建 MCP 客户端连接到计算器服务器
  const client = new MCPClient({
    command: 'node',
    args: ['dist/examples/mcp-calculator-server.js'],
  });

  try {
    await client.connect();
    console.log('✅ 已连接到计算器 MCP 服务器\n');

    // 创建工具注册表
    const registry = new ToolRegistry();

    // 加载 MCP 工具（自动展开）
    // 注意：namespace 为空，这样工具名保持原样
    await loadMCPTools(client, registry);

    console.log(`✅ MCP工具已展开为 ${registry.size()} 个独立工具`);
    console.log('\n展开后的工具列表:');
    const toolList = registry.listTools();
    for (const name of toolList) {
      const tool = registry.get(name);
      if (tool) {
        console.log(`  - ${name}: ${tool.description}`);
      }
    }

    // 测试各个工具
    console.log('\n--- 工具测试 ---');

    // 测试加法
    let result = await registry.executeTool('add', { a: 25, b: 16 });
    console.log(`add(25, 16): ${result}`);

    // 测试乘法
    result = await registry.executeTool('multiply', { a: 25, b: 16 });
    console.log(`multiply(25, 16): ${result}`);

    // 测试通用计算
    result = await registry.executeTool('calculate', { expression: '25 * 16' });
    console.log(`calculate("25 * 16"): ${result}`);

    // 测试除法
    result = await registry.executeTool('divide', { a: 100, b: 4 });
    console.log(`divide(100, 4): ${result}`);

    // 测试取模
    result = await registry.executeTool('modulo', { a: 17, b: 5 });
    console.log(`modulo(17, 5): ${result}`);

    client.disconnect();

  } catch (error) {
    console.error('❌ 测试失败:', (error as Error).message);
  }
}

/**
 * 示例 3: 带命名空间的展开
 */
async function testNamespacedExpand() {
  console.log('\n========== 带命名空间的工具展开 ==========\n');

  const client = new MCPClient({
    command: 'node',
    args: ['dist/examples/mcp-calculator-server.js'],
  });

  try {
    await client.connect();

    const registry = new ToolRegistry();

    // 使用命名空间前缀
    const toolCount = await loadMCPTools(client, registry, 'calc');

    console.log(`✅ 已展开 ${toolCount} 个工具（带 calc_ 前缀）\n`);
    console.log('工具列表:');
    for (const name of registry.listTools()) {
      console.log(`  - ${name}`);
    }

    // 测试带命名空间的工具调用
    const result = await registry.executeTool('calc_add', { a: 10, b: 20 });
    console.log(`\ncalc_add(10, 20): ${result}`);

    client.disconnect();

  } catch (error) {
    console.error('❌ 测试失败:', (error as Error).message);
  }
}

// 运行测试
async function main() {
  console.log('🔷 MCP 工具自动展开演示\n');

  // 依次运行测试
  await testAutoExpand();
  await testNamespacedExpand();
}

main();
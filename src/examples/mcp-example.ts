/**
 * MCP 模块使用示例
 * 展示如何连接到 MCP 服务器并使用其工具
 */
import { MCPClient, createMCPClient, loadMCPTools, registerMCPFunctions, MCPServerManager, MCPResourceManager } from '../mcp';
import { ToolRegistry } from '../tools/registry';

/**
 * 示例 1: 连接到文件系统 MCP 服务器
 * 使用 npx 启动 @modelcontextprotocol/server-filesystem
 */
async function connectFileSystemServer() {
  console.log('\n========== 示例 1: 连接到文件系统服务器 ==========\n');

  // 方式1: 使用 async with 模式
  const client = new MCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  });

  try {
    await client.connect();

    // 列出可用工具
    const tools = await client.listTools();
    console.log(`服务器提供了 ${tools.length} 个工具:`);
    for (const tool of tools) {
      console.log(`  - ${tool.name}: ${tool.description || '无描述'}`);
    }

    // 调用工具 - 列出当前目录
    const result = await client.callTool('list_directory', { path: '.' });
    console.log('\n当前目录内容:');
    console.log(result);

    // 列出可用资源
    const resources = await client.listResources();
    console.log(`\n可用资源: ${resources.length} 个`);

  } finally {
    client.disconnect();
  }
}

/**
 * 示例 2: 使用 createMCPClient 工厂函数
 */
async function useFactoryFunction() {
  console.log('\n========== 示例 2: 使用工厂函数 ==========\n');

  const client = await createMCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  });

  try {
    // 直接使用
    const result = await client.callTool('read_file', { path: 'package.json' });
    console.log('package.json 内容 (前500字符):');
    console.log(result.slice(0, 500));
  } finally {
    client.disconnect();
  }
}

/**
 * 示例 3: 加载 MCP 工具到 ToolRegistry
 */
async function loadToRegistry() {
  console.log('\n========== 示例 3: 加载工具到注册表 ==========\n');

  const registry = new ToolRegistry();
  const client = new MCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  });

  try {
    await client.connect();

    // 方式1: 使用 MCPToolAdapter
    await loadMCPTools(client, registry, 'mcp');

    // 方式2: 使用 registerMCPFunctions (简化版)
    // await registerMCPFunctions(client, registry, 'mcp');

    // 验证工具已注册
    console.log(`已注册工具: ${registry.size()}`);
    console.log('工具列表:', registry.listTools());

    // 执行工具
    const result = await registry.executeTool('mcp_list_directory', { path: '.' });
    console.log('\n执行结果:');
    console.log(result);

  } finally {
    client.disconnect();
  }
}

/**
 * 示例 4: 使用 MCP 资源管理器
 */
async function useResourceManager() {
  console.log('\n========== 示例 4: 使用资源管理器 ==========\n');

  const client = new MCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  });

  try {
    await client.connect();

    const resourceManager = new MCPResourceManager(client);

    // 列出资源
    const resources = await resourceManager.listResources();
    console.log('可用资源:');
    for (const r of resources) {
      console.log(`  - ${r.uri}: ${r.name || ''} ${r.description || ''}`);
    }

    // 列出提示模板
    const prompts = await resourceManager.listPrompts();
    console.log(`\n可用提示模板: ${prompts.length} 个`);
    for (const p of prompts) {
      console.log(`  - ${p.name}: ${p.description || ''}`);
    }

  } finally {
    client.disconnect();
  }
}

/**
 * 示例 5: 使用 MCPServerManager 管理多个服务器
 */
async function useServerManager() {
  console.log('\n========== 示例 5: 服务器管理器 ==========\n');

  const manager = new MCPServerManager();

  try {
    // 添加文件系统服务器
    await manager.addServer('filesystem', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    });

    // 可添加更多服务器...

    console.log('已连接服务器:', manager.listServers());
    console.log(`总工具数: ${await manager.getTotalToolsCount()}`);

    // 获取服务器
    const fs = manager.getServer('filesystem');
    if (fs) {
      const tools = await fs.listTools();
      console.log('\n文件系统服务器工具:');
      console.log((await fs.listTools()).map((t) => t.name).join(', '));
    }

  } finally {
    manager.disconnectAll();
  }
}

/**
 * 示例 6: 安全调用 - 带错误处理
 */
async function safeToolCall() {
  console.log('\n========== 示例 6: 安全调用 ==========\n');

  const client = new MCPClient({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  });

  try {
    await client.connect();

    try {
      // 尝试读取不存在的文件
      const result = await client.callTool('read_file', { path: 'nonexistent.txt' });
      console.log('结果:', result);
    } catch (error) {
      console.log('预期错误:', (error as Error).message);
    }

    // 读取存在的文件
    const content = await client.callTool('read_file', { path: 'package.json' });
    console.log('\npackage.json 读取成功!');

  } catch (error) {
    console.error('连接失败:', (error as Error).message);
  } finally {
    client.disconnect();
  }
}

// 运行示例
async function main() {
  console.log('🔷 MCP 模块示例\n');

  try {
    await connectFileSystemServer();
    // 取消注释以运行其他示例:
    // await useFactoryFunction();
    // await loadToRegistry();
    // await useResourceManager();
    // await useServerManager();
    // await safeToolCall();

  } catch (error) {
    console.error('❌ 示例执行失败:', error);
  }
}

main();
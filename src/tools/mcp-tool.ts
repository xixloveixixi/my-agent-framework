/**
 * MCPTool - 简化的 MCP 工具封装
 * 支持自动展开和内置服务器
 */
import { MCPClient } from '../mcp/client';
import { Tool } from '../types';
import { MCPTool as MCPToolType } from '../mcp/types';

// 内置服务器配置
const BUILTIN_SERVERS: Record<string, { command: string; args: string[] }> = {
  calculator: {
    command: 'node',
    args: ['dist/examples/mcp-calculator-server.js'],
  },
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  },
  github: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
  },
};

/**
 * MCPTool 类
 * 简化版：只需传入名称，自动连接和展开工具
 * 注意：此类不直接实现 Tool 接口，而是一个容器类，用于管理展开后的工具
 */
export class MCPTool {
  name: string;
  description: string;
  private client: MCPClient | null = null;
  private _tools: Tool[] = [];
  private _initialized = false;

  /**
   * 创建 MCPTool
   * @param name 内置服务器名称（如 "calculator"）或自定义名称
   * @param customConfig 自定义服务器配置（如果使用自定义 MCP 服务器）
   */
  constructor(
    name: string,
    customConfig?: { command: string; args?: string[]; env?: Record<string, string> }
  ) {
    this.name = name;
    this.description = `MCP 工具: ${name}`;

    // 保存配置
    this.serverConfig = customConfig || BUILTIN_SERVERS[name];
  }

  private serverConfig?: { command: string; args?: string[]; env?: Record<string, string> };

  /**
   * 初始化并连接 MCP 服务器
   */
  async init(): Promise<void> {
    if (this._initialized) {
      return;
    }

    if (!this.serverConfig) {
      throw new Error(`未知 MCP 服务器: ${this.name}，请提供自定义配置`);
    }

    this.client = new MCPClient(this.serverConfig);
    await this.client.connect();

    // 获取服务器上的所有工具
    const mcpTools = await this.client.listTools();

    // 为每个 MCP 工具创建适配器
    for (const mcpTool of mcpTools) {
      const adapter = this.createToolAdapter(mcpTool, this.client);
      this._tools.push(adapter);
    }

    this._initialized = true;
    console.log(`✅ MCP工具 '${this.name}' 已展开为 ${this._tools.length} 个独立工具`);
  }

  /**
   * 创建工具适配器
   */
  private createToolAdapter(mcpTool: MCPToolType, client: MCPClient): Tool {
    // 动态创建工具适配器
    const adapter: Tool = {
      name: mcpTool.name,
      description: mcpTool.description || `MCP 工具: ${mcpTool.name}`,
      parameters: mcpTool.inputSchema.properties,

      async execute(params: Record<string, unknown>): Promise<string> {
        return await client.callTool(mcpTool.name, params);
      },
    };

    return adapter;
  }

  /**
   * 获取展开后的工具列表
   */
  getExpandedTools(): Tool[] {
    return this._tools;
  }

  /**
   * 获取展开后的工具数量
   */
  getToolCount(): number {
    return this._tools.length;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
      this._tools = [];
      this._initialized = false;
    }
  }

  /**
   * 异步清理
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.disconnect();
  }
}

/**
 * 快速创建 MCPTool 的工厂函数
 */
export function createMCPTool(
  name: string,
  customConfig?: { command: string; args?: string[]; env?: Record<string, string> }
): MCPTool {
  return new MCPTool(name, customConfig);
}

/**
 * 获取支持的内置服务器列表
 */
export function listBuiltinServers(): string[] {
  return Object.keys(BUILTIN_SERVERS);
}
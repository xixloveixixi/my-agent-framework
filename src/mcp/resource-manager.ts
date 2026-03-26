/**
 * MCP 资源管理器 - 提供对 MCP 服务器资源和提示模板的访问
 */
import { MCPClient } from './client';
import { MCPResource, MCPPrompt } from './types';

export class MCPResourceManager {
  constructor(private client: MCPClient) {}

  /**
   * 获取所有可用资源的描述列表
   */
  async listResources(): Promise<Array<{ uri: string; name?: string; description?: string }>> {
    const resources = await this.client.listResources();
    return resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
    }));
  }

  /**
   * 读取指定资源的内容
   */
  async readResource(uri: string): Promise<string> {
    return await this.client.readResource(uri);
  }

  /**
   * 根据 URI 模式筛选资源
   */
  async listResourcesByPattern(pattern: string): Promise<MCPResource[]> {
    const resources = await this.client.listResources();
    const regex = new RegExp(pattern);
    return resources.filter((r) => regex.test(r.uri));
  }

  /**
   * 获取所有可用提示模板
   */
  async listPrompts(): Promise<Array<{ name: string; description?: string }>> {
    const prompts = await this.client.listPrompts();
    return prompts.map((p) => ({
      name: p.name,
      description: p.description,
    }));
  }

  /**
   * 获取提示模板内容
   */
  async getPrompt(name: string, args: Record<string, unknown> = {}): Promise<string> {
    return await this.client.getPrompt(name, args);
  }

  /**
   * 构建资源 URI
   */
  static buildFileURI(path: string): string {
    // 转换 Windows 路径到 file:// URI
    const normalizedPath = path.replace(/\\/g, '/');
    return `file://${normalizedPath}`;
  }

  /**
   * 解析资源 URI
   */
  static parseURI(uri: string): { scheme: string; path: string } {
    const match = uri.match(/^([a-z]+):\/\/(.*)$/);
    if (!match) {
      throw new Error(`无效的 URI: ${uri}`);
    }
    return {
      scheme: match[1],
      path: match[2],
    };
  }
}

/**
 * MCP 服务器管理器 - 管理多个 MCP 服务器连接
 */
export class MCPServerManager {
  private servers: Map<string, MCPClient> = new Map();

  /**
   * 添加 MCP 服务器
   */
  async addServer(name: string, config: { command: string; args?: string[] }): Promise<MCPClient> {
    const client = new MCPClient(config);
    await client.connect();
    this.servers.set(name, client);
    return client;
  }

  /**
   * 获取服务器
   */
  getServer(name: string): MCPClient | undefined {
    return this.servers.get(name);
  }

  /**
   * 获取所有服务器名称
   */
  listServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * 移除服务器
   */
  removeServer(name: string): boolean {
    const client = this.servers.get(name);
    if (client) {
      client.disconnect();
      this.servers.delete(name);
      return true;
    }
    return false;
  }

  /**
   * 断开所有服务器
   */
  disconnectAll(): void {
    for (const client of this.servers.values()) {
      client.disconnect();
    }
    this.servers.clear();
  }

  /**
   * 统计工具总数
   */
  async getTotalToolsCount(): Promise<number> {
    let count = 0;
    for (const client of this.servers.values()) {
      const tools = await client.listTools();
      count += tools.length;
    }
    return count;
  }
}
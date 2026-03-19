/**
 * Tool Registry - 工具注册表
 */
import { Tool } from '../types';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`⚠️ 工具 ${tool.name} 已存在，将被覆盖`);
    }
    this.tools.set(tool.name, tool);
    console.log(`🔧 已注册工具: ${tool.name}`);
  }

  /**
   * 注册工具（别名方法，兼容教程）
   */
  registerTool(tool: Tool): void {
    this.register(tool);
  }

  /**
   * 批量注册工具
   */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 移除工具
   */
  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 移除工具（别名方法）
   */
  unregister(name: string): boolean {
    return this.remove(name);
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * 获取工具描述
   */
  getDescription(): string {
    if (this.tools.size === 0) {
      return '暂无可用工具';
    }

    const descriptions: string[] = [];
    for (const [name, tool] of this.tools) {
      descriptions.push(`- ${name}: ${tool.description}`);
    }
    return descriptions.join('\n');
  }

  /**
   * 获取工具描述（别名方法）
   */
  getToolsDescription(): string {
    return this.getDescription();
  }

  /**
   * 获取工具列表（JSON格式）
   */
  getToolsList(): string {
    const toolsArray = this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
    return JSON.stringify(toolsArray, null, 2);
  }

  /**
   * 列出所有工具名称
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, params: Record<string, unknown> | string): Promise<string> {
    const tool = this.get(name);
    if (!tool) {
      return `❌ 错误: 未找到工具 '${name}'`;
    }

    try {
      // 如果是字符串，尝试解析为参数
      let parsedParams: Record<string, unknown>;
      if (typeof params === 'string') {
        parsedParams = this.parseToolParameters(name, params);
      } else {
        parsedParams = params;
      }

      const result = await tool.execute(parsedParams);
      return result;
    } catch (error) {
      return `❌ 工具执行失败: ${(error as Error).message}`;
    }
  }

  /**
   * 智能解析工具参数
   * 支持格式：
   * - {"key": "value"}
   * - key=value
   * - action=search,query=Python,limit=3
   * - plain text
   */
  parseToolParameters(toolName: string, params: string): Record<string, unknown> {
    // 1. 尝试 JSON 解析
    try {
      const parsed = JSON.parse(params);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      // JSON 解析失败，继续其他方式
    }

    // 2. 尝试 key=value 格式
    const paramDict: Record<string, unknown> = {};

    if (params.includes('=')) {
      if (params.includes(',')) {
        // 多个参数: action=search,query=Python,limit=3
        const pairs = params.split(',');
        for (const pair of pairs) {
          const [key, ...valueParts] = pair.split('=');
          if (key && valueParts.length > 0) {
            paramDict[key.trim()] = valueParts.join('=').trim();
          }
        }
      } else {
        // 单个参数: key=value
        const [key, ...valueParts] = params.split('=');
        if (key && valueParts.length > 0) {
          paramDict[key.trim()] = valueParts.join('=').trim();
        }
      }
      return paramDict;
    }

    // 3. 无格式，根据工具类型推断
    if (toolName === 'search') {
      return { query: params };
    } else if (toolName === 'calculator') {
      return { expression: params };
    } else if (toolName === 'memory') {
      return { action: 'search', query: params };
    }

    // 4. 默认作为 input 参数
    return { input: params };
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size;
  }
}

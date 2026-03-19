/**
 * Tool Registry - 工具注册表
 * 支持两种注册方式：Tool 对象注册 和 函数直接注册
 */
import { Tool } from '../types';
import { ToolParameter } from './base';

interface FunctionTool {
  description: string;
  func: (params: Record<string, unknown>) => Promise<string> | string;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private functions: Map<string, FunctionTool> = new Map();

  /**
   * 注册 Tool 对象
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`⚠️ 警告: 工具 '${tool.name}' 已存在，将被覆盖。`);
    }
    this.tools.set(tool.name, tool);
    console.log(`✅ 工具 '${tool.name}' 已注册。`);
  }

  /**
   * 注册 Tool 对象（别名方法，兼容教程）
   */
  registerTool(tool: Tool): void {
    this.register(tool);
  }

  /**
   * 直接注册函数作为工具（简便方式）
   * @param name 工具名称
   * @param description 工具描述
   * @param func 工具函数，接受参数对象，返回字符串结果
   */
  registerFunction(
    name: string,
    description: string,
    func: (params: Record<string, unknown>) => Promise<string> | string
  ): void {
    if (this.functions.has(name)) {
      console.warn(`⚠️ 警告: 工具 '${name}' 已存在，将被覆盖。`);
    }
    this.functions.set(name, { description, func });
    console.log(`✅ 工具 '${name}' 已注册。`);
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
   * 获取函数工具
   */
  getFunction(name: string): FunctionTool | undefined {
    return this.functions.get(name);
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
    const toolRemoved = this.tools.delete(name);
    const funcRemoved = this.functions.delete(name);
    return toolRemoved || funcRemoved;
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
    this.functions.clear();
  }

  /**
   * 获取工具描述
   */
  getDescription(): string {
    if (this.tools.size === 0 && this.functions.size === 0) {
      return '暂无可用工具';
    }

    const descriptions: string[] = [];

    // Tool 对象描述
    for (const tool of this.tools.values()) {
      descriptions.push(`- ${tool.name}: ${tool.description}`);
    }

    // 函数工具描述
    for (const [name, info] of this.functions) {
      descriptions.push(`- ${name}: ${info.description}`);
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
    const toolsArray: Record<string, unknown>[] = [];

    // Tool 对象
    for (const tool of this.tools.values()) {
      toolsArray.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      });
    }

    // 函数工具
    for (const [name, info] of this.functions) {
      toolsArray.push({
        name,
        description: info.description,
        type: 'function',
      });
    }

    return JSON.stringify(toolsArray, null, 2);
  }

  /**
   * 列出所有工具名称
   */
  listTools(): string[] {
    const names: string[] = [...this.tools.keys(), ...this.functions.keys()];
    return names;
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, params: Record<string, unknown> | string): Promise<string> {
    // 先尝试 Tool 对象
    const tool = this.tools.get(name);
    if (tool) {
      try {
        // 如果是字符串，尝试解析参数
        let parsedParams: Record<string, unknown>;
        if (typeof params === 'string') {
          parsedParams = this.parseToolParameters(name, params);
        } else {
          parsedParams = params;
        }

        return await tool.execute(parsedParams);
      } catch (error) {
        return `❌ 工具执行失败: ${(error as Error).message}`;
      }
    }

    // 再尝试函数工具
    const funcTool = this.functions.get(name);
    if (funcTool) {
      try {
        let parsedParams: Record<string, unknown>;
        if (typeof params === 'string') {
          parsedParams = this.parseToolParameters(name, params);
        } else {
          parsedParams = params;
        }

        const result = funcTool.func(parsedParams);
        if (result instanceof Promise) {
          return await result;
        }
        return result;
      } catch (error) {
        return `❌ 工具调用失败: ${(error as Error).message}`;
      }
    }

    return `❌ 错误: 未找到工具 '${name}'`;
  }

  /**
   * 智能解析工具参数
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
   * 转换为 OpenAI Function Calling 格式
   */
  toOpenAISchema(): Record<string, unknown>[] {
    const schemas: Record<string, unknown>[] = [];

    // Tool 对象的 schema
    for (const tool of this.tools.values()) {
      if ('toOpenAISchema' in tool && typeof tool.toOpenAISchema === 'function') {
        schemas.push(tool.toOpenAISchema());
      } else {
        // 手动构建
        schemas.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: {
              type: 'object',
              properties: tool.parameters || {},
            },
          },
        });
      }
    }

    // 函数工具的 schema
    for (const [name, info] of this.functions) {
      schemas.push({
        type: 'function',
        function: {
          name,
          description: info.description,
          parameters: {
            type: 'object',
            properties: {
              input: {
                type: 'string',
                description: '输入参数',
              },
            },
            required: ['input'],
          },
        },
      });
    }

    return schemas;
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name) || this.functions.has(name);
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size + this.functions.size;
  }
}

/**
 * MCP 工具适配器 - 将 MCP 服务器的工具转换为框架的 Tool 接口
 */
import { Tool } from '../types';
import { MCPClient } from './client';
import { MCPTool } from './types';

export interface MCPToolAdapterConfig {
  client: MCPClient;
  namespace?: string;
}

/**
 * MCP 工具适配器类
 * 将 MCP 服务器的工具封装为框架可用的 Tool
 */
export class MCPToolAdapter implements Tool {
  private _name: string;
  private _description: string;
  private _parameters: Record<string, unknown>;
  private client: MCPClient;

  constructor(client: MCPClient, mcpTool: MCPTool, namespace?: string) {
    this.client = client;
    this._name = namespace ? `${namespace}_${mcpTool.name}` : mcpTool.name;
    this._description = mcpTool.description || '';
    this._parameters = mcpTool.inputSchema.properties || {};
  }

  get name(): string {
    return this._name;
  }

  get description(): string {
    return this._description;
  }

  get parameters(): Record<string, unknown> | undefined {
    return Object.keys(this._parameters).length > 0 ? this._parameters : undefined;
  }

  /**
   * 执行 MCP 工具
   */
  async execute(params: Record<string, unknown>): Promise<string> {
    // 去除命名空间前缀
    const toolName = this._name.includes('_')
      ? this._name.split('_').slice(1).join('_')
      : this._name;

    return await this.client.callTool(toolName, params);
  }

  /**
   * 转换为 OpenAI Function Calling 格式
   */
  toOpenAISchema(): Record<string, unknown> {
    const properties: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(this._parameters)) {
      const paramInfo = value as Record<string, unknown>;
      properties[key] = {
        type: paramInfo.type || 'string',
        description: paramInfo.description || '',
        ...(paramInfo.enum ? { enum: paramInfo.enum } : {}),
      };
    }

    const mcpTool = this as MCPToolAdapter;
    const required = (mcpTool as unknown as { _required?: string[] })._required;

    return {
      type: 'function',
      function: {
        name: this._name,
        description: this._description,
        parameters: {
          type: 'object',
          properties,
          required: required || [],
        },
      },
    };
  }
}

/**
 * 从 MCP 服务器加载所有工具并注册到工具注册表
 */
export async function loadMCPTools(
  client: MCPClient,
  registry: {
    register: (tool: Tool) => void;
    registerFunction: (
      name: string,
      description: string,
      func: (params: Record<string, unknown>) => Promise<string>
    ) => void;
  },
  namespace?: string
): Promise<number> {
  const mcpTools = await client.listTools();
  let count = 0;

  for (const mcpTool of mcpTools) {
    const adapter = new MCPToolAdapter(client, mcpTool, namespace);
    registry.register(adapter);
    count++;
  }

  console.log(`✅ 已从 MCP 服务器加载 ${count} 个工具`);
  return count;
}

/**
 * 快速注册 MCP 工具为函数
 * 简化版，适合直接使用
 */
export async function registerMCPFunctions(
  client: MCPClient,
  registry: {
    registerFunction: (
      name: string,
      description: string,
      func: (params: Record<string, unknown>) => Promise<string>
    ) => void;
  },
  namespace?: string
): Promise<number> {
  const mcpTools = await client.listTools();
  let count = 0;

  for (const mcpTool of mcpTools) {
    const toolName = namespace ? `${namespace}_${mcpTool.name}` : mcpTool.name;

    registry.registerFunction(
      toolName,
      mcpTool.description || '',
      async (params: Record<string, unknown>) => {
        return await client.callTool(mcpTool.name, params);
      }
    );
    count++;
  }

  return count;
}
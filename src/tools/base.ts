/**
 * Tool 基类 - 所有工具的抽象基类
 */
import { Tool } from '../types';

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  parameters?: Record<string, unknown>;

  /**
   * 执行工具
   */
  abstract execute(params: Record<string, unknown>): Promise<string>;

  /**
   * 获取参数定义
   */
  getParameters(): ToolParameter[] {
    // 默认返回空数组，子类可以重写
    return [];
  }

  /**
   * 验证参数
   */
  protected validateParams(params: Record<string, unknown>, required: string[]): void {
    for (const key of required) {
      if (!(key in params)) {
        throw new Error(`Missing required parameter: ${key}`);
      }
    }
  }

  /**
   * 转换为 OpenAI Function Calling 格式
   */
  toOpenAISchema(): Record<string, unknown> {
    const params = this.getParameters();

    // 构建 properties
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of params) {
      const prop: Record<string, unknown> = {
        type: param.type,
        description: param.description,
      };

      if (param.default !== undefined) {
        prop['description'] = `${param.description} (默认: ${param.default})`;
      }

      properties[param.name] = prop;

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        },
      },
    };
  }
}

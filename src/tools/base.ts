/**
 * 工具基类
 */
import { Tool } from '../types';

export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters?: Record<string, unknown>;

  abstract execute(params: Record<string, unknown>): Promise<string>;

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
}

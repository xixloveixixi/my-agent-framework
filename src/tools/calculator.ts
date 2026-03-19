/**
 * Calculator Tool - 计算器工具
 */
import { BaseTool, ToolParameter } from './base';

export class CalculatorTool extends BaseTool {
  name = 'calculator';
  description = '执行数学计算，支持基本运算(+,-,*,/,%)和数学函数';

  /**
   * 获取参数定义
   */
  getParameters(): ToolParameter[] {
    return [
      {
        name: 'expression',
        type: 'string',
        description: '要计算的数学表达式，如 "2+3*4"',
        required: true,
      },
    ];
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const expression = params.expression as string;

    try {
      // 安全计算：只允许数字和运算符
      const sanitized = expression.replace(/[^0-9+\-*/().% ]/g, '');

      // 使用 Function 进行计算
      const result = new Function(`return ${sanitized}`)();

      return `计算结果: ${expression} = ${result}`;
    } catch (error) {
      return `计算错误: ${(error as Error).message}`;
    }
  }
}

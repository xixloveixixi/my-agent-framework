/**
 * 计算器 MCP 服务器
 * 基于 FastMCP 2.0 协议实现
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// 安全计算函数
function safeCalculate(expression: string): string {
  try {
    // 安全过滤：只允许数字和运算符
    const sanitized = expression.replace(/[^0-9+\-*/().% ]/g, '');
    const result = new Function(`return ${sanitized}`)();
    return `计算结果: ${expression} = ${result}`;
  } catch (error) {
    return `计算错误: ${(error as Error).message}`;
  }
}

// 定义工具
const tools = [
  {
    name: 'add',
    description: '加法运算，计算两个数的和',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: { type: 'number', description: '第一个数' },
        b: { type: 'number', description: '第二个数' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'subtract',
    description: '减法运算，计算两个数的差',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: { type: 'number', description: '被减数' },
        b: { type: 'number', description: '减数' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'multiply',
    description: '乘法运算，计算两个数的积',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: { type: 'number', description: '第一个数' },
        b: { type: 'number', description: '第二个数' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'divide',
    description: '除法运算，计算两个数的商',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: { type: 'number', description: '被除数' },
        b: { type: 'number', description: '除数' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'modulo',
    description: '取模运算，计算两个数相除的余数',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: { type: 'number', description: '被除数' },
        b: { type: 'number', description: '除数' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'calculate',
    description: '通用计算，支持任意数学表达式',
    inputSchema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: '数学表达式，如 "2+3*4"' },
      },
      required: ['expression'],
    },
  },
];

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'calculator-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理工具列表请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [{ type: 'text' as const, text: '错误: 缺少参数' }],
      isError: true,
    };
  }

  try {
    let result: string;

    switch (name) {
      case 'add': {
        const a = Number(args.a);
        const b = Number(args.b);
        result = `计算结果: ${a} + ${b} = ${a + b}`;
        break;
      }
      case 'subtract': {
        const a = Number(args.a);
        const b = Number(args.b);
        result = `计算结果: ${a} - ${b} = ${a - b}`;
        break;
      }
      case 'multiply': {
        const a = Number(args.a);
        const b = Number(args.b);
        result = `计算结果: ${a} × ${b} = ${a * b}`;
        break;
      }
      case 'divide': {
        const a = Number(args.a);
        const b = Number(args.b);
        if (b === 0) {
          result = '计算错误: 除数不能为零';
        } else {
          result = `计算结果: ${a} ÷ ${b} = ${a / b}`;
        }
        break;
      }
      case 'modulo': {
        const a = Number(args.a);
        const b = Number(args.b);
        if (b === 0) {
          result = '计算错误: 除数不能为零';
        } else {
          result = `计算结果: ${a} % ${b} = ${a % b}`;
        }
        break;
      }
      case 'calculate':
        result = safeCalculate(args.expression as string);
        break;
      default:
        result = `未知工具: ${name}`;
    }

    return {
      content: [{ type: 'text' as const, text: result }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: `工具执行错误: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Calculator MCP Server running on stdio');
}

main().catch(console.error);
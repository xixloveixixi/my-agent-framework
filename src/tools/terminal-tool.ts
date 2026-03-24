/**
 * TerminalTool - 终端命令执行工具
 * 提供安全的只读命令执行能力
 *
 * 安全机制:
 * 1. 命令白名单 - 只允许安全的只读命令
 * 2. 工作目录限制 - 只能在指定工作目录内操作
 * 3. 超时控制 - 防止命令无限运行
 * 4. 输出大小限制 - 防止内存溢出
 */

import { exec } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import { BaseTool, ToolParameter } from './base';

const execAsync = promisify(exec);

// 命令白名单
const ALLOWED_COMMANDS = new Set([
  // 文件列表与信息
  'ls', 'dir', 'tree',
  // 文件内容查看
  'cat', 'head', 'tail', 'less', 'more',
  // 文件搜索
  'find', 'grep', 'egrep', 'fgrep',
  // 文本处理
  'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
  // 目录操作
  'pwd', 'cd',
  // 文件信息
  'file', 'stat', 'du', 'df',
  // 其他
  'echo', 'which', 'whereis',
]);

export interface TerminalToolOptions {
  /** 工作目录，默认为当前目录 */
  workspace?: string;
  /** 命令超时时间（毫秒），默认 30000ms */
  timeout?: number;
  /** 最大输出大小（字节），默认 10MB */
  maxOutputSize?: number;
  /** 是否允许 cd 命令，默认 true */
  allowCd?: boolean;
}

export class TerminalTool extends BaseTool {
  name = 'terminal';
  description = '安全的终端命令执行工具，支持文件查看、目录导航和文本处理等只读操作';

  private workspace: string;
  private currentDir: string;
  private timeout: number;
  private maxOutputSize: number;
  private allowCd: boolean;

  constructor(options: TerminalToolOptions = {}) {
    super();
    this.workspace = options.workspace || process.cwd();
    this.currentDir = this.workspace;
    this.timeout = options.timeout || 30000;
    this.maxOutputSize = options.maxOutputSize || 10 * 1024 * 1024; // 10MB
    this.allowCd = options.allowCd !== false;
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'command',
        type: 'string',
        description: '要执行的终端命令',
        required: true,
      },
    ];
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const command = params.command as string;

    if (!command) {
      return '❌ 请提供要执行的命令';
    }

    // 检查命令是否在白名单中
    const commandCheck = this.checkCommand(command);
    if (!commandCheck.allowed) {
      return `❌ 不允许的命令: ${commandCheck.cmdName}\n` +
        `允许的命令: ${Array.from(ALLOWED_COMMANDS).sort().join(', ')}`;
    }

    // 处理 cd 命令
    if (commandCheck.cmdName === 'cd') {
      return this.handleCd(command);
    }

    // 执行其他命令
    return this.executeCommand(command);
  }

  /**
   * 检查命令是否在白名单中
   */
  private checkCommand(command: string): { allowed: boolean; cmdName: string } {
    const parts = command.trim().split(/\s+/);
    const cmdName = parts[0].toLowerCase();

    // 检查主命令是否在白名单
    if (!ALLOWED_COMMANDS.has(cmdName)) {
      return { allowed: false, cmdName };
    }

    return { allowed: true, cmdName };
  }

  /**
   * 处理 cd 命令
   */
  private handleCd(command: string): string {
    if (!this.allowCd) {
      return '❌ cd 命令已禁用';
    }

    const parts = command.trim().split(/\s+/);

    if (parts.length < 2 || parts[1] === '') {
      // cd 无参数，返回当前目录
      return `当前目录: ${this.currentDir}`;
    }

    const targetDir = parts[1];
    let newDir: string;

    try {
      // 处理特殊路径
      if (targetDir === '..') {
        // 返回上一级目录
        newDir = path.resolve(this.currentDir, '..');
      } else if (targetDir === '.') {
        // 当前目录
        newDir = this.currentDir;
      } else if (targetDir === '~') {
        // 工作目录根
        newDir = this.workspace;
      } else {
        // 相对路径
        newDir = path.resolve(this.currentDir, targetDir);
      }

      // 解析为绝对路径
      newDir = path.normalize(newDir);

      // 检查是否在工作目录内（防止通过 .. 逃逸）
      // 使用 path.relative 来检查路径是否在工作目录内
      const relativePath = path.relative(this.workspace, newDir);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return `❌ 不允许访问工作目录外的路径: ${newDir}`;
      }

      // 检查目录是否存在
      const fs = require('fs');
      if (!fs.existsSync(newDir)) {
        return `❌ 目录不存在: ${newDir}`;
      }

      const stats = fs.statSync(newDir);
      if (!stats.isDirectory()) {
        return `❌ 不是目录: ${newDir}`;
      }

      // 更新当前目录
      this.currentDir = newDir;
      return `✅ 切换到目录: ${this.currentDir}`;
    } catch (error) {
      return `❌ 切换目录失败: ${(error as Error).message}`;
    }
  }

  /**
   * 执行命令
   */
  private async executeCommand(command: string): Promise<string> {
    try {
      // 在当前目录下执行命令
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.currentDir,
        timeout: this.timeout,
        maxBuffer: this.maxOutputSize,
        windowsHide: true,
      });

      // 合并标准输出和标准错误
      let output = stdout;
      if (stderr) {
        output += `\n[stderr]\n${stderr}`;
      }

      // 检查输出大小
      if (output.length > this.maxOutputSize) {
        output = output.slice(0, this.maxOutputSize);
        output += `\n\n⚠️ 输出被截断（超过 ${this.maxOutputSize} 字节）`;
      }

      return output || '✅ 命令执行成功（无输出）';
    } catch (error) {
      const err = error as { code?: number; message?: string; killed?: boolean };

      // 超时错误
      if (err.killed || err.code === undefined) {
        return `❌ 命令执行超时（超过 ${this.timeout / 1000} 秒）`;
      }

      // 其他错误
      return `⚠️ 命令返回码: ${err.code}\n\n${err.message}`;
    }
  }

  /**
   * 获取当前工作目录
   */
  getCurrentDir(): string {
    return this.currentDir;
  }

  /**
   * 重置到工作目录
   */
  reset(): void {
    this.currentDir = this.workspace;
  }
}

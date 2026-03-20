/**
 * Memory Tool - 记忆工具
 * 为 Agent 提供记忆能力
 */

import { BaseTool, ToolParameter } from './base';
import { MemoryManager, MemoryType } from '../memory';

export class MemoryTool extends BaseTool {
  name = 'memory';
  description = '记忆管理系统，允许存储和检索对话历史、知识等';
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager) {
    super();
    this.memoryManager = memoryManager;
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'action',
        type: 'string',
        description: '操作类型: search(搜索), add(添加), clear(清空), stats(统计), consolidate(整合)',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: '要存储或搜索的内容',
        required: false,
      },
      {
        name: 'query',
        type: 'string',
        description: '搜索关键词（用于 search 操作）',
        required: false,
      },
      {
        name: 'memory_type',
        type: 'string',
        description: '记忆类型: working(工作), episodic(情景), semantic(语义), perceptual(感知), auto(自动分类)',
        required: false,
        default: 'working',
      },
      {
        name: 'memory_types',
        type: 'array',
        description: '多个记忆类型数组，如 ["working", "episodic"]',
        required: false,
      },
      {
        name: 'importance',
        type: 'number',
        description: '重要性 (0-1)，默认 0.5',
        required: false,
        default: 0.5,
      },
      {
        name: 'min_importance',
        type: 'number',
        description: '最小重要性过滤 (0-1)，默认 0.1',
        required: false,
        default: 0.1,
      },
      {
        name: 'limit',
        type: 'number',
        description: '返回结果数量限制，默认 5',
        required: false,
        default: 5,
      },
      {
        name: 'file_path',
        type: 'string',
        description: '感知记忆的文件路径',
        required: false,
      },
      {
        name: 'modality',
        type: 'string',
        description: '模态类型: image, audio, video, text',
        required: false,
      },
      {
        name: 'auto_classify',
        type: 'boolean',
        description: '是否自动分类记忆类型',
        required: false,
        default: false,
      },
      {
        name: 'strategy',
        type: 'string',
        description: '遗忘策略: importance_based(基于重要性), time_based(基于时间), capacity_based(基于容量)',
        required: false,
        default: 'importance_based',
      },
      {
        name: 'threshold',
        type: 'number',
        description: '重要性阈值 (0-1)，低于此值的记忆将被遗忘',
        required: false,
        default: 0.1,
      },
      {
        name: 'max_age_days',
        type: 'number',
        description: '最大天数，超过此时间的记忆将被遗忘',
        required: false,
        default: 30,
      },
      {
        name: 'max_capacity',
        type: 'number',
        description: '最大容量比例 (0-1)，超过此比例时删除最不重要的记忆',
        required: false,
        default: 0.8,
      },
    ];
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const action = params.action as string;
    const content = params.content as string;
    const query = params.query as string;
    const memoryType = (params.memory_type as string) || 'working';
    const memoryTypes = params.memory_types as string[] | undefined;
    const importance = (params.importance as number) || 0.5;
    const minImportance = (params.min_importance as number) || 0.1;
    const limit = (params.limit as number) || 5;
    const filePath = params.file_path as string;
    const modality = params.modality as string;
    const autoClassify = (params.auto_classify as boolean) || false;

    try {
      switch (action) {
        case 'search':
          // 参数标准化处理
          const finalMemoryTypes = memoryType && !memoryTypes
            ? [memoryType]
            : memoryTypes;

          return await this.search(query, limit, finalMemoryTypes, minImportance);

        case 'add':
          if (!content && !filePath) {
            return '❌ 添加操作需要提供 content 或 file_path 参数';
          }
          return await this.add(content || '', {
            memoryType,
            importance,
            filePath,
            modality,
            autoClassify,
          });

        case 'clear':
          const clearType = memoryType === 'auto' ? undefined : memoryType as MemoryType;
          return await this.clear(clearType);

        case 'stats':
          return this.getStats();

        case 'consolidate':
          return await this.consolidate();

        case 'new_session':
          return this.newSession();

        case 'forget':
          return await this.forget(
            params.strategy as string || 'importance_based',
            params.threshold as number || 0.1,
            params.max_age_days as number || 30,
            params.max_capacity as number || 0.8
          );

        default:
          return `❌ 未知操作: ${action}，支持的操作: search, add, clear, stats, consolidate, new_session, forget`;
      }
    } catch (error) {
      return `❌ 记忆工具执行错误: ${(error as Error).message}`;
    }
  }

  /**
   * 搜索记忆
   */
  private async search(
    query: string,
    limit: number,
    memoryTypes?: string[],
    minImportance: number = 0.1
  ): Promise<string> {
    if (!query) {
      return '❌ 搜索操作需要提供 query 参数';
    }

    const results = await this.memoryManager.search(query, limit, memoryTypes, minImportance);

    if (results.length === 0) {
      return `🔍 未找到与 '${query}' 相关的记忆`;
    }

    // 格式化结果
    const formattedResults: string[] = [];
    formattedResults.push(`🔍 找到 ${results.length} 条相关记忆:`);

    const typeLabelMap: Record<string, string> = {
      working: '工作记忆',
      episodic: '情景记忆',
      semantic: '语义记忆',
      perceptual: '感知记忆',
    };

    results.forEach((item, index) => {
      const typeLabel = typeLabelMap[item.memory_type] || item.memory_type;
      const contentPreview = item.content.length > 80
        ? item.content.slice(0, 80) + '...'
        : item.content;

      formattedResults.push(
        `${index + 1}. [${typeLabel}] ${contentPreview} (重要性: ${item.importance.toFixed(2)})`
      );
    });

    return formattedResults.join('\n');
  }

  /**
   * 添加记忆
   */
  private async add(content: string, options: {
    memoryType: string;
    importance: number;
    filePath?: string;
    modality?: string;
    autoClassify: boolean;
  }): Promise<string> {
    const memoryId = await this.memoryManager.addMemory({
      content,
      memoryType: options.memoryType as MemoryType,
      importance: options.importance,
      filePath: options.filePath,
      modality: options.modality,
      autoClassify: options.autoClassify,
    });

    const typeLabel = {
      working: '工作记忆',
      episodic: '情景记忆',
      semantic: '语义记忆',
      perceptual: '感知记忆',
      auto: '自动分类记忆',
    }[options.memoryType] || '记忆';

    return `✅ ${typeLabel}已添加 (ID: ${memoryId.slice(0, 8)}...)`;
  }

  /**
   * 清空记忆
   */
  private async clear(memoryType?: MemoryType): Promise<string> {
    if (memoryType) {
      await this.memoryManager.clear(memoryType);
      return `✅ ${memoryType} 记忆已清空`;
    }

    await this.memoryManager.clear();
    return '✅ 所有记忆已清空';
  }

  /**
   * 获取统计
   */
  private getStats(): string {
    const stats = this.memoryManager.getStats();

    return `📊 记忆统计:
- 💼 工作记忆: ${stats.working} 条
- 📜 情景记忆: ${stats.episodic} 条
- 🧠 语义记忆: ${stats.semantic.concepts} 概念, ${stats.semantic.relations} 关系
- 👁️ 感知记忆: ${Object.entries(stats.perceptual).map(([k, v]) => `${k}: ${v}`).join(', ')}
- 🔍 RAG 知识库: ${stats.rag} 条

📝 当前会话: ${this.memoryManager.getCurrentSessionId() || '无'}`;
  }

  /**
   * 记忆整合
   */
  private async consolidate(): Promise<string> {
    await this.memoryManager.consolidate();
    return '✅ 记忆整合完成';
  }

  /**
   * 遗忘记忆
   */
  private async forget(
    strategy: string = 'importance_based',
    threshold: number = 0.1,
    maxAgeDays: number = 30,
    maxCapacity: number = 0.8
  ): Promise<string> {
    try {
      const count = await this.memoryManager.forgetMemories({
        strategy: strategy as 'importance_based' | 'time_based' | 'capacity_based',
        threshold,
        maxAgeDays,
        maxCapacity,
      });

      const strategyLabel = {
        importance_based: '基于重要性',
        time_based: '基于时间',
        capacity_based: '基于容量',
      }[strategy] || strategy;

      return `🧹 已遗忘 ${count} 条记忆（策略: ${strategyLabel}）`;
    } catch (error) {
      return `❌ 遗忘记忆失败: ${(error as Error).message}`;
    }
  }

  /**
   * 创建新会话
   */
  private newSession(): string {
    const sessionId = this.memoryManager.createSession();
    return `✅ 新会话已创建: ${sessionId}`;
  }
}

/**
 * 长期记忆工具
 */
export class LongTermMemoryTool extends BaseTool {
  name = 'long_term_memory';
  description = '长期记忆系统，支持情景记忆和语义知识的存储与检索';
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager) {
    super();
    this.memoryManager = memoryManager;
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'action',
        type: 'string',
        description: '操作: remember(记住), recall(回忆), timeline(时间线), knowledge(知识图谱)',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: '要记忆的内容',
        required: false,
      },
      {
        name: 'query',
        type: 'string',
        description: '查询关键词',
        required: false,
      },
      {
        name: 'importance',
        type: 'number',
        description: '重要性 (0-1)',
        required: false,
        default: 0.5,
      },
    ];
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const action = params.action as string;
    const content = params.content as string;
    const query = params.query as string;
    const importance = (params.importance as number) || 0.5;

    switch (action) {
      case 'remember':
        return await this.remember(content, importance);

      case 'recall':
        return await this.recall(query);

      case 'timeline':
        return await this.getTimeline();

      case 'knowledge':
        return this.getKnowledgeStats();

      default:
        return `❌ 未知操作: ${action}`;
    }
  }

  private async remember(content: string, importance: number): Promise<string> {
    const memoryId = await this.memoryManager.addMemory({
      content,
      memoryType: MemoryType.EPISODIC,
      importance,
    });
    return `✅ 已记住 (ID: ${memoryId.slice(0, 8)}...): ${content.slice(0, 50)}...`;
  }

  private async recall(query: string): Promise<string> {
    const results = await this.memoryManager.search(query, 5);

    if (results.length === 0) {
      return `🔍 未找到与 '${query}' 相关的记忆`;
    }

    return results.map((r, i) => {
      const content = r.content.length > 80 ? r.content.slice(0, 80) + '...' : r.content;
      return `${i + 1}. [${r.memory_type}] ${content} (重要性: ${r.importance.toFixed(2)})`;
    }).join('\n');
  }

  private async getTimeline(): Promise<string> {
    const timeline = await this.memoryManager.getEpisodicTimeline();

    if (timeline.length === 0) {
      return '暂无时间线';
    }

    let output = '📜 记忆时间线:\n\n';
    timeline.slice(-10).forEach(item => {
      const date = new Date(item.time).toLocaleString();
      output += `- ${date}: ${item.event.slice(0, 60)}...\n`;
    });

    return output;
  }

  private getKnowledgeStats(): string {
    const stats = this.memoryManager.getKnowledgeStats();
    return `🧠 知识图谱: ${stats.concepts} 个概念, ${stats.relations} 个关系`;
  }
}

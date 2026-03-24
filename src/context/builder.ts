/**
 * ContextBuilder - 上下文构建器
 * 实现 GSSC (Gather-Select-Structure-Compress) 流水线
 */

import {
  ContextPacket,
  ContextConfig,
  DEFAULT_CONTEXT_CONFIG,
  validateContextConfig,
} from './types.js';

/**
 * 工具类型定义 (用于记忆和 RAG)
 */
export interface ContextTool {
  run(params: Record<string, unknown>): Promise<string>;
}

/**
 * Gather 阶段的输入参数
 */
export interface GatherParams {
  /** 用户查询 */
  userQuery: string;
  /** 对话历史 */
  conversationHistory?: Array<{
    role: string;
    content: string;
    timestamp?: Date;
  }>;
  /** 系统指令 */
  systemInstructions?: string;
  /** 自定义信息包 */
  customPackets?: ContextPacket[];
  /** 记忆工具 */
  memoryTool?: ContextTool;
  /** RAG 工具 */
  ragTool?: ContextTool;
}

/**
 * 上下文构建结果
 */
export interface ContextBuildResult {
  /** 选中的上下文项 */
  packets: ContextPacket[];
  /** 总 token 数量 */
  totalTokens: number;
  /** 使用率 (相对于 maxTokens) */
  utilization: number;
  /** 保留的空间 (用于系统指令) */
  reservedTokens: number;
  /** 压缩后的 token 数量 (如果启用了压缩) */
  compressedTokens?: number;
  /** 结构化的上下文字符串 */
  structuredContext?: string;
}

/**
 * 评分后的信息包
 */
interface ScoredPacket {
  packet: ContextPacket;
  combinedScore: number;
}

/**
 * ContextBuilder 类
 * 实现 GSSC 流水线: Gather -> Select -> Structure -> Compress
 */
export class ContextBuilder {
  private config: ContextConfig;

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = validateContextConfig(config);
  }

  /**
   * 主构建方法 - GSSC 流水线
   */
  async build(params: GatherParams): Promise<ContextBuildResult> {
    const { userQuery, conversationHistory, systemInstructions, customPackets, memoryTool, ragTool } = params;

    // ====== Stage 1: Gather - 多源信息汇集 ======
    const packets = await this._gather({
      userQuery,
      conversationHistory,
      systemInstructions,
      customPackets,
      memoryTool,
      ragTool,
    });

    if (packets.length === 0) {
      return this._emptyResult();
    }

    // ====== Stage 2: Select - 智能信息选择 ======
    const availableTokens = this.config.maxTokens - Math.floor(this.config.maxTokens * this.config.reserveRatio);
    const selectedPackets = this._select(packets, userQuery, availableTokens);

    if (selectedPackets.length === 0) {
      return this._emptyResult();
    }

    // ====== Stage 3: Structure - 结构化输出 ======
    const reservedTokens = Math.floor(this.config.maxTokens * this.config.reserveRatio);
    const structuredContext = this._structure(selectedPackets, userQuery);

    // ====== Stage 4: Compress - 兜底压缩 ======
    const finalContext = this._compress(structuredContext, this.config.maxTokens - reservedTokens);
    const finalTokens = this._countTokens(finalContext);

    return {
      packets: selectedPackets,
      totalTokens: finalTokens,
      utilization: finalTokens / (this.config.maxTokens - reservedTokens),
      reservedTokens,
      compressedTokens: finalTokens < this._countTokens(structuredContext) ? finalTokens : undefined,
      structuredContext: finalContext,
    };
  }

  /**
   * ====== Stage 1: Gather - 多源信息汇集 ======
   */
  private async _gather(params: GatherParams): Promise<ContextPacket[]> {
    const { userQuery, conversationHistory, systemInstructions, customPackets, memoryTool, ragTool } = params;
    const packets: ContextPacket[] = [];

    // 1. 添加系统指令 (最高优先级, 不参与评分)
    if (systemInstructions) {
      packets.push(this._createSystemPacket(systemInstructions));
    }

    // 2. 从记忆系统检索相关记忆
    if (memoryTool) {
      try {
        const memoryResults = await memoryTool.run({
          action: 'search',
          query: userQuery,
          limit: 10,
          min_importance: 0.3,
        });
        const memoryPackets = this._parseMemoryResults(memoryResults, userQuery);
        packets.push(...memoryPackets);
      } catch (e) {
        console.warn(`[ContextBuilder] 记忆检索失败: ${e}`);
      }
    }

    // 3. 从 RAG 系统检索相关知识
    if (ragTool) {
      try {
        const ragResults = await ragTool.run({
          action: 'search',
          query: userQuery,
          limit: 5,
          min_score: 0.3,
        });
        const ragPackets = this._parseRagResults(ragResults, userQuery);
        packets.push(...ragPackets);
      } catch (e) {
        console.warn(`[ContextBuilder] RAG 检索失败: ${e}`);
      }
    }

    // 4. 添加对话历史 (仅保留最近的 N 条)
    if (conversationHistory) {
      const recentHistory = conversationHistory.slice(-5); // 默认保留最近 5 条
      for (const msg of recentHistory) {
        packets.push(this._createConversationPacket(msg));
      }
    }

    // 5. 添加自定义信息包
    if (customPackets) {
      packets.push(...customPackets);
    }

    console.log(`[ContextBuilder] 汇集了 ${packets.length} 个候选信息包`);
    return packets;
  }

  /**
   * 创建系统指令包
   */
  private _createSystemPacket(content: string): ContextPacket {
    return {
      content,
      timestamp: new Date(),
      tokenCount: this._countTokens(content),
      relevanceScore: 1.0, // 系统指令始终保留
      metadata: { type: 'system_instruction', priority: 'high' },
      source: 'system',
      priority: 1.0,
    };
  }

  /**
   * 创建对话消息包
   */
  private _createConversationPacket(msg: { role: string; content: string; timestamp?: Date }): ContextPacket {
    return {
      content: `${msg.role}: ${msg.content}`,
      timestamp: msg.timestamp || new Date(),
      tokenCount: this._countTokens(msg.content),
      relevanceScore: 0.6, // 历史消息的基础相关性
      metadata: { type: 'conversation_history', role: msg.role },
      source: 'conversation',
      priority: 0.5,
    };
  }

  /**
   * 解析记忆检索结果
   */
  private _parseMemoryResults(results: string, _userQuery: string): ContextPacket[] {
    // 解析记忆结果 (实际实现中需要根据返回格式调整)
    try {
      const parsed = typeof results === 'string' ? JSON.parse(results) : results;
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: { content?: string; text?: string; importance?: number }) => ({
        content: item.content || item.text || '',
        timestamp: new Date(),
        tokenCount: this._countTokens(item.content || item.text || ''),
        relevanceScore: item.importance ?? 0.5,
        metadata: { type: 'memory', source: 'long_term_memory' },
        source: 'memory',
        priority: 0.6,
      }));
    } catch {
      console.warn('[ContextBuilder] 记忆结果解析失败');
      return [];
    }
  }

  /**
   * 解析 RAG 检索结果
   */
  private _parseRagResults(results: string, _userQuery: string): ContextPacket[] {
    // 解析 RAG 结果 (实际实现中需要根据返回格式调整)
    try {
      const parsed = typeof results === 'string' ? JSON.parse(results) : results;
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: { content?: string; text?: string; score?: number }) => ({
        content: item.content || item.text || '',
        timestamp: new Date(),
        tokenCount: this._countTokens(item.content || item.text || ''),
        relevanceScore: item.score ?? 0.5,
        metadata: { type: 'rag_result', source: 'knowledge_base' },
        source: 'memory',
        priority: 0.7,
      }));
    } catch {
      console.warn('[ContextBuilder] RAG 结果解析失败');
      return [];
    }
  }

  /**
   * ====== Stage 2: Select - 智能信息选择 ======
   */
  private _select(packets: ContextPacket[], userQuery: string, availableTokens: number): ContextPacket[] {
    // 1. 分离系统指令和其他信息
    const systemPackets = packets.filter(p => p.metadata?.type === 'system_instruction');
    const otherPackets = packets.filter(p => p.metadata?.type !== 'system_instruction');

    // 2. 计算系统指令占用的 token
    const systemTokens = systemPackets.reduce((sum, p) => sum + p.tokenCount, 0);
    const remainingTokens = availableTokens - systemTokens;

    if (remainingTokens <= 0) {
      console.warn('[ContextBuilder] 系统指令已占满所有 token 预算');
      return systemPackets;
    }

    // 3. 为其他信息计算综合分数
    const scoredPackets: ScoredPacket[] = [];

    for (const packet of otherPackets) {
      // 计算相关性分数
      let relevance = packet.relevanceScore;
      if (relevance === 0.5) {
        // 默认值,需要重新计算
        relevance = this._calculateRelevance(packet.content, userQuery);
        packet.relevanceScore = relevance;
      }

      // 计算新近性分数
      const recency = this._calculateRecency(packet.timestamp);

      // 综合分数 = 相关性权重 × 相关性 + 新近性权重 × 新近性
      const combinedScore =
        this.config.relevanceWeight * relevance +
        this.config.recencyWeight * recency;

      // 过滤低于最小相关性阈值的信息
      if (relevance >= this.config.minRelevance) {
        scoredPackets.push({ packet, combinedScore });
      }
    }

    // 4. 按分数降序排序
    scoredPackets.sort((a, b) => b.combinedScore - a.combinedScore);

    // 5. 贪心选择:按分数从高到低填充,直到达到 token 上限
    const selected: ContextPacket[] = [...systemPackets];
    let currentTokens = systemTokens;

    for (const { packet } of scoredPackets) {
      if (currentTokens + packet.tokenCount <= availableTokens) {
        selected.push(packet);
        currentTokens += packet.tokenCount;
      } else {
        // Token 预算已满,停止选择
        break;
      }
    }

    console.log(`[ContextBuilder] 选择了 ${selected.length} 个信息包,共 ${currentTokens} tokens`);
    return selected;
  }

  /**
   * 计算内容与查询的相关性 (基于关键词重叠)
   */
  private _calculateRelevance(content: string, query: string): number {
    const contentWords = new Set(content.toLowerCase().split(/\s+/));
    const queryWords = new Set(query.toLowerCase().split(/\s+/));

    if (queryWords.size === 0) return 0.0;

    // Jaccard 相似度
    const intersection = new Set([...contentWords].filter(x => queryWords.has(x)));
    const union = new Set([...contentWords, ...queryWords]);

    return union.size > 0 ? intersection.size / union.size : 0.0;
  }

  /**
   * 计算时间近因性分数 (指数衰减模型)
   */
  private _calculateRecency(timestamp: Date): number {
    const ageHours = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
    const decayFactor = 0.1; // 衰减系数

    // 指数衰减: 24小时内保持高分,之后逐渐衰减
    const recencyScore = Math.exp((-decayFactor * ageHours) / 24);

    return Math.max(0.1, Math.min(1.0, recencyScore)); // 限制在 [0.1, 1.0] 范围内
  }

  /**
   * ====== Stage 3: Structure - 结构化输出 ======
   */
  private _structure(selectedPackets: ContextPacket[], userQuery: string): string {
    // 按类型分组
    const systemInstructions: string[] = [];
    const evidence: string[] = [];
    const context: string[] = [];

    for (const packet of selectedPackets) {
      const packetType = packet.metadata?.type as string || 'general';

      if (packetType === 'system_instruction') {
        systemInstructions.push(packet.content);
      } else if (packetType === 'rag_result' || packetType === 'knowledge') {
        evidence.push(packet.content);
      } else {
        context.push(packet.content);
      }
    }

    // 构建结构化模板
    const sections: string[] = [];

    // [Role & Policies]
    if (systemInstructions.length > 0) {
      sections.push('[Role & Policies]\n' + systemInstructions.join('\n'));
    }

    // [Task]
    sections.push(`[Task]\n${userQuery}`);

    // [Evidence]
    if (evidence.length > 0) {
      sections.push('[Evidence]\n' + evidence.join('\n---\n'));
    }

    // [Context]
    if (context.length > 0) {
      sections.push('[Context]\n' + context.join('\n'));
    }

    // [Output]
    sections.push('[Output]\n请基于以上信息,提供准确、有据的回答。');

    return sections.join('\n\n');
  }

  /**
   * ====== Stage 4: Compress - 兜底压缩 ======
   */
  private _compress(context: string, maxTokens: number): string {
    const currentTokens = this._countTokens(context);

    if (currentTokens <= maxTokens) {
      return context; // 无需压缩
    }

    console.log(`[ContextBuilder] 上下文超限(${currentTokens} > ${maxTokens}),执行压缩`);

    // 分区压缩:保持结构完整性
    const sections = context.split('\n\n');
    const compressedSections: string[] = [];
    let currentTotal = 0;

    for (const section of sections) {
      const sectionTokens = this._countTokens(section);

      if (currentTotal + sectionTokens <= maxTokens) {
        // 完整保留
        compressedSections.push(section);
        currentTotal += sectionTokens;
      } else {
        // 部分保留
        const remainingTokens = maxTokens - currentTotal;
        if (remainingTokens > 50) {
          // 至少保留 50 tokens
          const truncated = this._truncateText(section, remainingTokens);
          compressedSections.push(truncated + '\n[... 内容已压缩 ...]');
        }
        break;
      }
    }

    const compressedContext = compressedSections.join('\n\n');
    const finalTokens = this._countTokens(compressedContext);
    console.log(`[ContextBuilder] 压缩完成: ${currentTokens} -> ${finalTokens} tokens`);

    return compressedContext;
  }

  /**
   * 截断文本到指定 token 数量
   */
  private _truncateText(text: string, maxTokens: number): string {
    const currentTokens = this._countTokens(text);
    if (currentTokens <= maxTokens) return text;

    // 按字符比例估算
    const charPerToken = currentTokens > 0 ? text.length / currentTokens : 4;
    const maxChars = Math.floor(maxTokens * charPerToken);

    return text.slice(0, maxChars);
  }

  /**
   * 估算文本的 token 数量
   * 中文 1 字符 ≈ 1 token, 英文 1 单词 ≈ 1.3 tokens
   */
  private _countTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;

    return Math.ceil(chineseChars + englishWords * 1.3);
  }

  /**
   * 返回空结果
   */
  private _emptyResult(): ContextBuildResult {
    const reservedTokens = Math.floor(this.config.maxTokens * this.config.reserveRatio);
    return {
      packets: [],
      totalTokens: 0,
      utilization: 0,
      reservedTokens,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ContextConfig>): void {
    this.config = validateContextConfig({ ...this.config, ...config });
  }

  /**
   * 获取当前配置
   */
  getConfig(): ContextConfig {
    return { ...this.config };
  }
}

/**
 * 便捷函数: 快速构建上下文
 */
export async function buildContext(params: GatherParams, config?: Partial<ContextConfig>): Promise<ContextBuildResult> {
  const builder = new ContextBuilder(config);
  return builder.build(params);
}

/**
 * 合并多个 ContextBuilder 的结果
 */
export function mergeContextResults(results: ContextBuildResult[]): ContextBuildResult {
  const allPackets = results.flatMap(r => r.packets);
  const totalTokens = allPackets.reduce((sum, p) => sum + p.tokenCount, 0);
  const reservedTokens = Math.max(...results.map(r => r.reservedTokens));

  return {
    packets: allPackets,
    totalTokens,
    utilization: totalTokens / (totalTokens + reservedTokens),
    reservedTokens,
  };
}
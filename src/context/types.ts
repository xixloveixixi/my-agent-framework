/**
 * Context Engineering - 上下文工程核心类型定义
 */

import { Message } from '../types/index.js';

/**
 * 候选信息包 - 系统中信息的基本单元
 * 用于封装每个候选信息，包含内容、时间戳、token数量和相关性分数
 */
export interface ContextPacket {
  /** 信息内容 */
  content: string;
  /** 时间戳 */
  timestamp: Date;
  /** Token 数量 */
  tokenCount: number;
  /** 相关性分数 (0.0-1.0) */
  relevanceScore: number;
  /** 可选的元数据 */
  metadata?: Record<string, unknown>;
  /** 来源类型 */
  source?: 'memory' | 'conversation' | 'system' | 'tool';
  /** 优先级权重 */
  priority?: number;
}

/**
 * 上下文构建配置
 */
export interface ContextConfig {
  /** 最大 token 数量 */
  maxTokens: number;
  /** 为系统指令预留的比例 (0.0-1.0) */
  reserveRatio: number;
  /** 最低相关性阈值 */
  minRelevance: number;
  /** 是否启用压缩 */
  enableCompression: boolean;
  /** 新近性权重 (0.0-1.0) */
  recencyWeight: number;
  /** 相关性权重 (0.0-1.0) */
  relevanceWeight: number;
  /** 最大消息数限制 */
  maxMessages?: number;
  /** 压缩阈值 (当超过此token数时启用压缩) */
  compressionThreshold?: number;
}

/**
 * 默认配置
 */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxTokens: 3000,
  reserveRatio: 0.2,
  minRelevance: 0.1,
  enableCompression: true,
  recencyWeight: 0.3,
  relevanceWeight: 0.7,
  maxMessages: 50,
  compressionThreshold: 2000,
};

/**
 * 验证配置参数
 */
export function validateContextConfig(config: Partial<ContextConfig>): ContextConfig {
  const defaultConfig = { ...DEFAULT_CONTEXT_CONFIG, ...config };

  if (defaultConfig.reserveRatio < 0 || defaultConfig.reserveRatio > 1) {
    throw new Error('reserveRatio 必须在 [0, 1] 范围内');
  }

  if (defaultConfig.minRelevance < 0 || defaultConfig.minRelevance > 1) {
    throw new Error('minRelevance 必须在 [0, 1] 范围内');
  }

  const weightSum = defaultConfig.recencyWeight + defaultConfig.relevanceWeight;
  if (Math.abs(weightSum - 1.0) > 1e-6) {
    throw new Error('recency_weight + relevance_weight 必须等于 1.0');
  }

  return defaultConfig;
}

/**
 * 从 Message 转换为 ContextPacket
 */
export function messageToContextPacket(message: Message, source: ContextPacket['source'] = 'conversation'): ContextPacket {
  return {
    content: message.content,
    timestamp: message.timestamp || new Date(),
    tokenCount: estimateTokenCount(message.content),
    relevanceScore: 0.5,
    metadata: message.metadata,
    source,
    priority: message.role === 'system' ? 1.0 : 0.5,
  };
}

/**
 * 简单的 token 估算函数
 * 实际项目中可以替换为更精确的 tokenizer
 */
export function estimateTokenCount(text: string): number {
  // 粗略估算: 平均每个 token 约 4 个字符
  return Math.ceil(text.length / 4);
}

/**
 * 创建 ContextPacket 的工厂函数
 */
export function createContextPacket(
  content: string,
  options?: Partial<Omit<ContextPacket, 'content'>>
): ContextPacket {
  return {
    content,
    timestamp: options?.timestamp || new Date(),
    tokenCount: options?.tokenCount || estimateTokenCount(content),
    relevanceScore: options?.relevanceScore ?? 0.5,
    metadata: options?.metadata,
    source: options?.source || 'conversation',
    priority: options?.priority ?? 0.5,
  };
}
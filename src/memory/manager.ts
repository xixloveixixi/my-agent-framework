/**
 * Memory Manager - 记忆管理器
 * 统一协调调度所有类型的记忆
 * 与 Python 版本对齐：统一 Store/Retriever 架构
 */

import { WorkingMemory } from './types/working';
import { EpisodicMemory } from './types/episodic';
import { SemanticMemory } from './types/semantic';
import { PerceptualMemory } from './types/perceptual';
import { MemoryConfig, MemoryType, MemoryItem, BaseMemory } from './base';
import { MemoryStore, IMemoryStore, StoreConfig } from './store';
import { MemoryRetriever, RetrievalOptions, RetrievalResult } from './retriever';
import { RAGPipeline } from './rag/pipeline';

export interface MemoryManagerConfig {
  enableWorking?: boolean;
  enableEpisodic?: boolean;
  enableSemantic?: boolean;
  enablePerceptual?: boolean;
  workingConfig?: MemoryConfig;
  episodicConfig?: MemoryConfig;
  semanticConfig?: MemoryConfig;
  perceptualConfig?: MemoryConfig;
}

export interface AddMemoryOptions {
  content: string;
  memoryType?: MemoryType | 'working' | 'episodic' | 'semantic' | 'perceptual';
  importance?: number;
  filePath?: string;
  modality?: string;
  autoClassify?: boolean;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 记忆管理器 - 统一接口
 * 与 Python 版本的 MemoryManager 对齐
 */
export class MemoryManager {
  private memoryTypes: Map<string, BaseMemory> = new Map();
  private store: IMemoryStore;
  private retriever: MemoryRetriever;
  private ragPipeline?: RAGPipeline;
  private config: MemoryConfig;
  private userId: string;
  private currentSessionId: string | null = null;

  constructor(
    config?: MemoryManagerConfig,
    userId: string = 'default_user'
  ) {
    // 提取 MemoryConfig 属性
    this.config = {
      maxSize: config?.workingConfig?.maxSize,
      ttl: config?.workingConfig?.ttl,
      enablePersistence: config?.workingConfig?.enablePersistence,
    };
    this.userId = userId;

    // 初始化统一存储
    const storeConfig: StoreConfig = {
      maxSize: this.config.maxSize,
      ttl: this.config.ttl,
      enablePersistence: this.config.enablePersistence,
      userId: this.userId,
    };
    this.store = new MemoryStore(storeConfig, this.userId);

    // 初始化统一检索器
    this.retriever = new MemoryRetriever(this.store);

    // 初始化各类型记忆
    this.initMemoryTypes(config);

    // 初始化 RAG 管道
    this.ragPipeline = new RAGPipeline();
  }

  /**
   * 初始化各类型记忆
   */
  private initMemoryTypes(config?: MemoryManagerConfig): void {
    const enableWorking = config?.enableWorking ?? true;
    const enableEpisodic = config?.enableEpisodic ?? true;
    const enableSemantic = config?.enableSemantic ?? true;
    const enablePerceptual = config?.enablePerceptual ?? false;

    if (enableWorking) {
      const working = new WorkingMemory(
        config?.workingConfig,
        this.store
      );
      this.memoryTypes.set('working', working);
      console.log('🧠 Working Memory 已初始化');
    }

    if (enableEpisodic) {
      const episodic = new EpisodicMemory(
        config?.episodicConfig,
        this.store
      );
      this.memoryTypes.set('episodic', episodic);
      console.log('🧠 Episodic Memory 已初始化');
    }

    if (enableSemantic) {
      const semantic = new SemanticMemory(
        config?.semanticConfig,
        this.store
      );
      this.memoryTypes.set('semantic', semantic);
      console.log('🧠 Semantic Memory 已初始化');
    }

    if (enablePerceptual) {
      const perceptual = new PerceptualMemory(
        config?.perceptualConfig,
        this.store
      );
      this.memoryTypes.set('perceptual', perceptual);
      console.log('🧠 Perceptual Memory 已初始化');
    }
  }

  /**
   * 切换用户
   */
  setUserId(userId: string): void {
    this.userId = userId;
    this.store.setUserId(userId);
    console.log(`👤 切换用户: ${userId}`);
  }

  /**
   * 获取当前用户ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * 创建新会话
   */
  createSession(): string {
    const now = new Date();
    this.currentSessionId = `session_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate()}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    return this.currentSessionId;
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * 设置当前会话
   */
  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * 推断文件类型
   */
  private inferModality(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop() || '';

    const modalityMap: Record<string, string> = {
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image',
      'bmp': 'image', 'webp': 'image', 'svg': 'image',
      'mp3': 'audio', 'wav': 'audio', 'flac': 'audio', 'aac': 'audio', 'ogg': 'audio',
      'mp4': 'video', 'avi': 'video', 'mov': 'video', 'mkv': 'video', 'webm': 'video',
      'txt': 'text', 'md': 'text', 'json': 'text', 'xml': 'text', 'html': 'text',
    };

    return modalityMap[ext] || 'text';
  }

  /**
   * 自动分类记忆类型
   */
  private autoClassifyMemory(content: string, metadata: Record<string, unknown>): MemoryType {
    if (metadata.memoryType) {
      return metadata.memoryType as MemoryType;
    }

    const contentLower = content.toLowerCase();

    if (metadata.filePath || contentLower.includes('image') || contentLower.includes('audio') || contentLower.includes('video')) {
      return MemoryType.PERCEPTUAL;
    }

    if (contentLower.includes('是关于') || contentLower.includes('定义') || contentLower.includes('概念') ||
        contentLower.includes('指的是') || contentLower.includes('知识')) {
      return MemoryType.SEMANTIC;
    }

    if (contentLower.includes('今天') || contentLower.includes('昨天') || contentLower.includes('发生') ||
        contentLower.includes('去了') || contentLower.includes('做了')) {
      return MemoryType.EPISODIC;
    }

    return MemoryType.WORKING;
  }

  /**
   * 添加记忆（完整版）
   */
  async addMemory(options: AddMemoryOptions): Promise<string> {
    const {
      content,
      memoryType,
      importance = 0.5,
      filePath,
      modality,
      autoClassify = false,
      sessionId,
      metadata = {},
    } = options;

    const finalSessionId = sessionId || this.currentSessionId || this.createSession();
    const finalModality = modality || (filePath ? this.inferModality(filePath) : undefined);

    const finalMetadata = {
      ...metadata,
      importance,
      session_id: finalSessionId,
      timestamp: new Date().toISOString(),
      modality: finalModality,
      raw_data: filePath,
    };

    let finalMemoryType: MemoryType;
    if (autoClassify) {
      finalMemoryType = this.autoClassifyMemory(content, finalMetadata);
    } else if (memoryType) {
      finalMemoryType = memoryType as MemoryType;
    } else {
      finalMemoryType = MemoryType.WORKING;
    }

    // 添加到对应记忆
    const memoryTypeKey = finalMemoryType;
    const memory = this.memoryTypes.get(memoryTypeKey);

    if (memory) {
      await memory.add(content, finalMetadata);
    }

    // 同时添加到 RAG（情景和语义记忆）
    if (finalMemoryType === MemoryType.EPISODIC || finalMemoryType === MemoryType.SEMANTIC) {
      this.ragPipeline?.addDocument({
        id: `${memoryTypeKey}_${Date.now()}`,
        content,
        metadata: finalMetadata,
      });
    }

    return `memory_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * 搜索记忆（使用统一检索器）
   */
  async search(
    query: string,
    limit: number = 5,
    memoryTypes?: string[],
    minImportance: number = 0.1
  ): Promise<Array<{
    id: string;
    content: string;
    memory_type: string;
    importance: number;
    timestamp?: number;
    metadata?: Record<string, unknown>;
  }>> {
    const options: RetrievalOptions = {
      query,
      limit,
      memoryTypes,
      minImportance,
    };

    const results = await this.retriever.retrieve(options);

    return results.map(r => ({
      id: r.id,
      content: r.content,
      memory_type: r.memory_type,
      importance: r.importance,
      timestamp: r.timestamp,
      metadata: r.metadata,
    }));
  }

  /**
   * 使用统一检索器检索
   */
  async retrieve(options: RetrievalOptions): Promise<RetrievalResult[]> {
    return this.retriever.retrieve(options);
  }

  /**
   * 获取最近记忆
   */
  async getRecent(memoryType: string, count: number = 10): Promise<RetrievalResult[]> {
    return this.retriever.getRecent(memoryType, count);
  }

  /**
   * RAG 检索增强生成
   */
  async ragGenerate(
    query: string,
    llm: { generate(prompt: string): Promise<string> }
  ): Promise<{ answer: string; sources: Array<{ content: string; source?: string }> }> {
    if (!this.ragPipeline) {
      throw new Error('RAG Pipeline 未初始化');
    }

    return this.ragPipeline.generate(query, llm);
  }

  /**
   * 获取所有工作记忆
   */
  async getWorkingMemory(): Promise<Array<{ content: string; timestamp: number }>> {
    const memory = this.memoryTypes.get('working');
    if (!memory) return [];

    const items = await memory.getAll();
    return items.map(item => ({
      content: item.content,
      timestamp: item.timestamp,
    }));
  }

  /**
   * 获取情景记忆时间线
   */
  async getEpisodicTimeline(): Promise<Array<{ time: number; event: string }>> {
    const memory = this.memoryTypes.get('episodic') as EpisodicMemory | undefined;
    if (!memory || !memory.reconstructTimeline) return [];

    return memory.reconstructTimeline();
  }

  /**
   * 获取语义知识图谱统计
   */
  getKnowledgeStats(): { concepts: number; relations: number } {
    const memory = this.memoryTypes.get('semantic') as SemanticMemory | undefined;
    if (!memory || !memory.getStats) {
      return { concepts: 0, relations: 0 };
    }

    const stats = memory.getStats();
    return { concepts: stats.concepts, relations: stats.relations };
  }

  /**
   * 获取感知记忆统计
   */
  getPerceptualStats(): Record<string, number> {
    const memory = this.memoryTypes.get('perceptual') as PerceptualMemory | undefined;
    if (!memory || !memory.getStats) {
      return { text: 0, image: 0, audio: 0, video: 0 };
    }

    return memory.getStats();
  }

  /**
   * 获取总体统计
   */
  getStats(): {
    working: number;
    episodic: number;
    semantic: { concepts: number; relations: number };
    perceptual: Record<string, number>;
    rag: number;
  } {
    return {
      working: this.memoryTypes.get('working')?.size() || 0,
      episodic: this.memoryTypes.get('episodic')?.size() || 0,
      semantic: this.getKnowledgeStats(),
      perceptual: this.getPerceptualStats(),
      rag: this.ragPipeline?.size() || 0,
    };
  }

  /**
   * 清空所有记忆
   */
  async clear(type?: MemoryType): Promise<void> {
    if (!type) {
      // 清空所有
      for (const memory of this.memoryTypes.values()) {
        await memory.clear();
      }
      this.ragPipeline?.clear();
      console.log('🧠 所有记忆已清空');
    } else {
      const memory = this.memoryTypes.get(type);
      if (memory) {
        await memory.clear();
      }
    }
  }

  /**
   * 遗忘记忆（支持多种策略）
   */
  async forgetMemories(params: {
    strategy?: 'importance_based' | 'time_based' | 'capacity_based';
    threshold?: number;
    maxAgeDays?: number;
    maxCapacity?: number;
  }): Promise<number> {
    const {
      strategy = 'importance_based',
      threshold = 0.1,
      maxAgeDays = 30,
      maxCapacity = 0.8,
    } = params;

    let totalForgotten = 0;
    const timeThreshold = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    // 对每种记忆类型执行遗忘策略
    for (const [typeKey, memory] of this.memoryTypes.entries()) {
      const items = await memory.getAll();

      for (const item of items) {
        let shouldDelete = false;

        if (strategy === 'importance_based') {
          const importance = (item.metadata?.importance as number) ?? 0.5;
          shouldDelete = importance < threshold;
        } else if (strategy === 'time_based') {
          shouldDelete = item.timestamp < timeThreshold;
        } else if (strategy === 'capacity_based') {
          const maxSize = this.config.maxSize || 100;
          if (this.memoryTypes.size > maxSize * maxCapacity) {
            const importance = (item.metadata?.importance as number) ?? 0.5;
            shouldDelete = importance < threshold;
          }
        }

        if (shouldDelete && memory.delete) {
          await memory.delete(item.id);
          totalForgotten++;
        }
      }
    }

    console.log(`🧹 遗忘完成: 共删除 ${totalForgotten} 条记忆 (策略: ${strategy})`);
    return totalForgotten;
  }

  /**
   * 记忆降级处理（工作记忆 -> 情景记忆）
   */
  async consolidate(): Promise<void> {
    const working = this.memoryTypes.get('working');
    const episodic = this.memoryTypes.get('episodic') as EpisodicMemory | undefined;

    if (!working || !episodic) return;

    const items = await working.getAll();

    for (const item of items) {
      await episodic.add(item.content, item.metadata);
    }

    await working.clear();

    console.log(`🧠 记忆整合完成: ${items.length} 条工作记忆已转移到情景记忆`);
  }

  /**
   * 获取统一存储
   */
  getStore(): IMemoryStore {
    return this.store;
  }

  /**
   * 获取统一检索器
   */
  getRetriever(): MemoryRetriever {
    return this.retriever;
  }

  /**
   * 获取 RAG 管道
   */
  getRAGPipeline(): RAGPipeline | undefined {
    return this.ragPipeline;
  }
}

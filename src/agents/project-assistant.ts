/**
 * ProjectAssistant - 长期项目助手
 * 集成 NoteTool 和 ContextBuilder，提供项目生命周期管理
 */

import { SimpleAgent } from './simple-agent';
import { HelloAgentsLLM } from '../core/llm';
import { NoteTool, NoteType } from '../tools/note-tool';
import { MemoryTool } from '../tools/memory-tool';
import { RAGTool } from '../tools/rag-tool';
import { ContextBuilder } from '../context/builder';
import { ContextConfig, ContextPacket, createContextPacket } from '../context/types';
import { MessageRole } from '../types';
import { MemoryManager } from '../memory/manager';

/**
 * 笔记检索结果
 */
interface NoteSearchResult {
  note_id: string;
  title: string;
  type: NoteType;
  tags: string[];
  content: string;
  updated_at: string;
}

/**
 * 项目助手配置
 */
export interface ProjectAssistantConfig {
  /** 项目名称 */
  projectName: string;
  /** 最大上下文 token 数 */
  maxContextTokens?: number;
  /** 每次检索的笔记数量 */
  noteLimit?: number;
  /** 是否自动保存交互为笔记 */
  autoNote?: boolean;
  /** 工具配置 */
  toolConfig?: {
    notePath?: string;
    memoryUserId?: string;
    ragPath?: string;
  };
}

/**
 * ProjectAssistant - 长期项目助手
 * 功能：
 * - 记录项目的阶段性进展
 * - 追踪待解决的问题
 * - 自动回顾相关笔记
 * - 基于历史笔记提供连贯的建议
 */
export class ProjectAssistant extends SimpleAgent {
  private projectName: string;
  private noteTool: NoteTool;
  private memoryTool: MemoryTool;
  private memoryManager: MemoryManager;
  private ragTool?: RAGTool;
  private contextBuilder: ContextBuilder;
  private conversationHistory: Array<{ role: MessageRole; content: string; timestamp: Date }> = [];
  private noteLimit: number;
  private autoNote: boolean;

  constructor(
    name: string,
    config: ProjectAssistantConfig
  ) {
    // 初始化 LLM
    const llm = new HelloAgentsLLM();

    const systemPrompt = ProjectAssistant.buildSystemInstructions(config.projectName);

    super(name, llm, {
      systemPrompt,
    });

    this.projectName = config.projectName;
    this.noteLimit = config.noteLimit || 3;
    this.autoNote = config.autoNote ?? true;

    // 初始化工具
    const toolConfig = config.toolConfig || {};

    // 初始化 MemoryManager 和 MemoryTool
    this.memoryManager = new MemoryManager(
      { workingConfig: { maxSize: 1000, ttl: 3600000 } },
      toolConfig.memoryUserId || config.projectName
    );
    this.memoryTool = new MemoryTool(this.memoryManager);

    // 初始化 NoteTool
    this.noteTool = new NoteTool(toolConfig.notePath || `./${config.projectName}_notes`);

    // 初始化 RAG 工具
    if (toolConfig.ragPath) {
      this.ragTool = new RAGTool({
        namespace: config.projectName,
      });
    }

    // 初始化上下文构建器
    this.contextBuilder = new ContextBuilder({
      maxTokens: config.maxContextTokens || 4000,
      reserveRatio: 0.2,
      minRelevance: 0.1,
      enableCompression: true,
      recencyWeight: 0.3,
      relevanceWeight: 0.7,
    });

    console.log(`📁 项目助手初始化完成: ${config.projectName}`);
  }

  /**
   * 构建系统指令
   */
  private static buildSystemInstructions(projectName: string): string {
    return `你是 ${projectName} 项目的长期助手。

你的职责:
1. 基于历史笔记提供连贯的建议
2. 追踪项目进展和待解决问题
3. 在回答时引用相关的历史笔记
4. 提供具体、可操作的下一步建议

注意:
- 优先关注标记为 blocker 的问题
- 在建议中说明依据来源(笔记、记忆或知识库)
- 保持对项目整体进度的认识
- 如果用户描述了进展或问题，主动建议保存为笔记`;
  }

  /**
   * 运行助手
   * @param userInput 用户输入
   * @param options.autoSaveNote 是否自动保存为笔记
   */
  async chat(
    userInput: string,
    options?: { autoSaveNote?: boolean }
  ): Promise<string> {
    const shouldSaveNote = options?.autoSaveNote ?? this.autoNote;

    console.log(`\n📋 ${this.projectName} 助手处理: ${userInput.slice(0, 50)}...`);

    // 1. 从 NoteTool 检索相关笔记
    const relevantNotes = await this.retrieveRelevantNotes(userInput);

    // 2. 将笔记转换为 ContextPacket
    const notePackets = await this.notesToPackets(relevantNotes);

    // 3. 构建优化的上下文
    const contextResult = await this.contextBuilder.build({
      userQuery: userInput,
      conversationHistory: this.conversationHistory,
      systemInstructions: this.systemPrompt || '',
      customPackets: notePackets,
      memoryTool: this.memoryTool as unknown as { run: (params: Record<string, unknown>) => Promise<string> },
      ragTool: this.ragTool as unknown as { run: (params: Record<string, unknown>) => Promise<string> },
    });

    // 4. 构建消息列表
    const messages = this.buildMessagesWithContext(userInput, contextResult.structuredContext || '');

    // 5. 调用 LLM
    const response = await this.llm.invoke(messages);

    // 6. 如果需要，保存为笔记
    if (shouldSaveNote) {
      await this.saveAsNote(userInput, response);
    }

    // 7. 更新对话历史
    this.updateHistory(userInput, response);

    console.log(`✅ ${this.name} 响应完成`);
    return response;
  }

  /**
   * 检索相关笔记
   */
  private async retrieveRelevantNotes(query: string): Promise<NoteSearchResult[]> {
    try {
      // 优先检索 blocker 和 action 类型的笔记
      const blockersResult = await this.noteTool.execute({
        action: 'list',
        note_type: 'blocker',
        limit: 2,
      });

      const actionsResult = await this.noteTool.execute({
        action: 'list',
        note_type: 'action',
        limit: 2,
      });

      // 通用搜索
      const searchResult = await this.noteTool.execute({
        action: 'search',
        query: query,
        limit: this.noteLimit,
      });

      // 解析搜索结果
      const allNotes = this.parseNoteResults(blockersResult, actionsResult, searchResult);

      // 去重
      const uniqueNotes = new Map<string, NoteSearchResult>();
      for (const note of allNotes) {
        uniqueNotes.set(note.note_id, note);
      }

      return Array.from(uniqueNotes.values()).slice(0, this.noteLimit);
    } catch (error) {
      console.warn(`[ProjectAssistant] 笔记检索失败: ${error}`);
      return [];
    }
  }

  /**
   * 解析笔记结果
   */
  private parseNoteResults(...results: string[]): NoteSearchResult[] {
    const notes: NoteSearchResult[] = [];

    for (const result of results) {
      // 尝试从格式化输出中提取笔记信息
      const noteIdMatches = result.match(/🆔 (note_\w+)/g);
      const titleMatches = result.match(/\d+\. \[(\w+)\] (.+)/g);

      if (noteIdMatches && titleMatches) {
        for (let i = 0; i < noteIdMatches.length && i < titleMatches.length; i++) {
          const noteId = noteIdMatches[i].replace('🆔 ', '');
          const titleMatch = titleMatches[i].match(/\d+\. \[(\w+)\] (.+)/);
          if (titleMatch) {
            notes.push({
              note_id: noteId,
              title: titleMatch[2],
              type: titleMatch[1] as NoteType,
              tags: [],
              content: '',
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    return notes;
  }

  /**
   * 将笔记转换为 ContextPacket
   */
  private async notesToPackets(notes: NoteSearchResult[]): Promise<ContextPacket[]> {
    const packets: ContextPacket[] = [];

    for (const note of notes) {
      // 读取完整笔记内容
      try {
        const readResult = await this.noteTool.execute({
          action: 'read',
          note_id: note.note_id,
        });

        // 从输出中提取内容
        const contentMatch = readResult.match(/━━━\n\n([\s\S]+)$/);
        const content = contentMatch ? contentMatch[1] : `[笔记: ${note.title}]`;

        packets.push(createContextPacket(
          `[笔记: ${note.title}]\n类型: ${note.type}\n${content}`,
          {
            timestamp: new Date(note.updated_at),
            relevanceScore: 0.75,
            metadata: {
              type: 'note',
              noteType: note.type,
              noteId: note.note_id,
            },
            source: 'tool',
            priority: note.type === 'blocker' ? 0.9 : 0.7,
          }
        ));
      } catch (error) {
        console.warn(`[ProjectAssistant] 读取笔记 ${note.note_id} 失败: ${error}`);
      }
    }

    return packets;
  }

  /**
   * 构建带上下文的消息列表
   */
  private buildMessagesWithContext(userInput: string, context: string): Array<{ role: MessageRole; content: string }> {
    const messages: Array<{ role: MessageRole; content: string }> = [];

    // 添加系统消息
    messages.push({
      role: 'system',
      content: `${this.systemPrompt || ''}\n\n---\n\n${context ? `[上下文]\n${context}` : ''}`,
    });

    // 添加历史消息
    for (const msg of this.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: userInput });

    return messages;
  }

  /**
   * 将交互保存为笔记
   */
  private async saveAsNote(userInput: string, response: string): Promise<void> {
    try {
      // 判断笔记类型
      let noteType: NoteType = 'general';
      if (userInput.includes('问题') || userInput.includes('阻塞') || userInput.includes('困难')) {
        noteType = 'blocker';
      } else if (userInput.includes('计划') || userInput.includes('下一步') || userInput.includes('完成')) {
        noteType = 'action';
      } else if (userInput.includes('结论') || userInput.includes('总结')) {
        noteType = 'conclusion';
      }

      // 生成标题
      const title = userInput.length > 30 ? userInput.slice(0, 30) + '...' : userInput;

      await this.noteTool.execute({
        action: 'create',
        title,
        content: `## 用户问题\n${userInput}\n\n## 分析与回答\n${response}`,
        note_type: noteType,
        tags: [this.projectName, 'auto_generated'],
      });

      console.log(`📝 已自动保存为笔记 (${noteType})`);
    } catch (error) {
      console.warn(`[ProjectAssistant] 保存笔记失败: ${error}`);
    }
  }

  /**
   * 更新对话历史
   */
  private updateHistory(userInput: string, response: string): void {
    this.conversationHistory.push({
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    });

    this.conversationHistory.push({
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    });

    // 限制历史长度
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }
  }

  // ==================== 公开方法 ====================

  /**
   * 获取笔记工具实例
   */
  getNoteTool(): NoteTool {
    return this.noteTool;
  }

  /**
   * 获取记忆工具实例
   */
  getMemoryTool(): MemoryTool {
    return this.memoryTool;
  }

  /**
   * 获取笔记摘要
   */
  async getSummary(): Promise<string> {
    return await this.noteTool.execute({ action: 'summary' });
  }

  /**
   * 创建笔记
   */
  async createNote(
    title: string,
    content: string,
    noteType: NoteType = 'general',
    tags?: string[]
  ): Promise<string> {
    return await this.noteTool.execute({
      action: 'create',
      title,
      content,
      note_type: noteType,
      tags: tags || [this.projectName],
    });
  }

  /**
   * 搜索笔记
   */
  async searchNotes(query: string, limit?: number): Promise<string> {
    return await this.noteTool.execute({
      action: 'search',
      query,
      limit: limit || this.noteLimit,
    });
  }

  /**
   * 列出所有笔记
   */
  async listNotes(noteType?: NoteType): Promise<string> {
    return await this.noteTool.execute({
      action: 'list',
      note_type: noteType,
    });
  }

  /**
   * 获取当前项目名称
   */
  getProjectName(): string {
    return this.projectName;
  }
}

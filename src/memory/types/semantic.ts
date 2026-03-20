/**
 * Semantic Memory - 语义记忆
 * 特点：
 * - 使用预训练模型进行文本嵌入
 * - 向量检索进行快速相似度匹配
 * - 知识图谱存储实体和关系
 * - 混合检索策略：向量+图+语义推理
 */

import { BaseMemory, MemoryItem, MemoryConfig, TFIDFEmbedding } from '../base';
import { SimpleVectorStore, SearchResult } from './vector-store';
import { IMemoryStore } from '../store';

export interface Entity {
  id: string;
  name: string;
  type?: string;
  category?: string;
  description?: string;
  properties?: Record<string, unknown>;
}

// 兼容旧API
export type Concept = Entity;

export interface Relation {
  id: string;
  source: string;    // 源实体 ID
  target: string;    // 目标实体 ID
  type: string;      // 关系类型 (如 "is_a", "part_of", "related_to")
  weight?: number;
  properties?: Record<string, unknown>;
}

/**
 * 语义记忆 - 知识图谱存储
 */
export class SemanticMemory implements BaseMemory {
  private entities: Map<string, Entity> = new Map();
  private relations: Map<string, Relation> = new Map();
  private vectorStore: SimpleVectorStore;
  private store?: IMemoryStore;
  private maxSize: number;
  private tfidf: TFIDFEmbedding;
  private useExternalStore: boolean;

  constructor(
    config?: MemoryConfig,
    store?: IMemoryStore
  ) {
    this.maxSize = config?.maxSize || 5000;
    this.vectorStore = new SimpleVectorStore();
    this.tfidf = new TFIDFEmbedding();
    this.store = store;
    this.useExternalStore = !!store;

    if (this.useExternalStore) {
      console.log('📦 Semantic Memory 使用外部存储');
    }
  }

  /**
   * 添加实体
   */
  async addEntity(entity: Omit<Entity, 'id'>): Promise<string> {
    const id = `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newEntity: Entity = { id, ...entity };

    if (this.useExternalStore && this.store) {
      const item: MemoryItem = {
        id,
        content: `${entity.name}: ${entity.description || ''}`,
        timestamp: Date.now(),
        metadata: { ...entity, __type: 'entity' } as Record<string, unknown>,
      };
      await this.store.add('semantic', item);
    } else {
      this.entities.set(id, newEntity);

      // 添加到向量存储用于语义检索
      const content = `${entity.name} ${entity.type || ''} ${entity.description || ''}`;
      this.vectorStore.add({
        id,
        content,
        metadata: { type: entity.type, name: entity.name },
      });
    }

    return id;
  }

  /**
   * 添加关系
   */
  async addRelation(relation: Omit<Relation, 'id'>): Promise<string> {
    const id = `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newRelation: Relation = { id, ...relation };

    this.relations.set(id, newRelation);
    return id;
  }

  /**
   * 添加记忆（实体形式）
   */
  async add(content: string, metadata?: Record<string, unknown>): Promise<void> {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      await this.addEntity({
        name: lines[0].substring(0, 50),
        description: content,
        type: metadata?.category as string,
        properties: metadata,
      });
    }
  }

  /**
   * 混合检索：向量 + 图 + 语义推理
   */
  async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
    if (this.useExternalStore && this.store) {
      return this.store.search('semantic', query, limit);
    }

    // 1. 向量检索
    const vectorResults = this.vectorStore.searchWithScores(query, limit * 2);

    // 2. 图检索（查找相关实体）
    const graphResults = this.graphSearch(query, limit);

    // 3. 综合评分
    const combinedMap = new Map<string, { score: number; item: MemoryItem }>();

    // 向量结果
    for (const result of vectorResults) {
      const entity = this.entities.get(result.item.id);
      if (entity) {
        combinedMap.set(result.item.id, {
          score: result.score || 0,
          item: {
            id: entity.id,
            content: `${entity.name}: ${entity.description || ''}`,
            timestamp: Date.now(),
            metadata: entity as unknown as Record<string, unknown>,
          },
        });
      }
    }

    // 图结果（增加权重）
    for (const result of graphResults) {
      const existing = combinedMap.get(result.id);
      if (existing) {
        existing.score += 0.5;
      } else {
        const entity = this.entities.get(result.id);
        if (entity) {
          combinedMap.set(result.id, {
            score: 0.5,
            item: {
              id: entity.id,
              content: `${entity.name}: ${entity.description || ''}`,
              timestamp: Date.now(),
              metadata: entity as unknown as Record<string, unknown>,
            },
          });
        }
      }
    }

    // 排序返回
    const results = Array.from(combinedMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.item);

    return results;
  }

  /**
   * 图检索：查找相关实体
   */
  private graphSearch(query: string, limit: number): Array<{ id: string; score: number }> {
    const results: Array<{ id: string; score: number }> = [];

    // 1. 查找名称匹配的实体
    const queryLower = query.toLowerCase();
    this.entities.forEach((entity, id) => {
      if (entity.name.toLowerCase().includes(queryLower)) {
        results.push({ id, score: 1.0 });
      } else if (entity.type?.toLowerCase().includes(queryLower)) {
        results.push({ id, score: 0.8 });
      }
    });

    // 2. 查找通过关系连接的实体
    this.relations.forEach(relation => {
      const sourceEntity = this.entities.get(relation.source);
      const targetEntity = this.entities.get(relation.target);

      if (sourceEntity && sourceEntity.name.toLowerCase().includes(queryLower)) {
        results.push({ id: relation.target, score: 0.6 });
      }
      if (targetEntity && targetEntity.name.toLowerCase().includes(queryLower)) {
        results.push({ id: relation.source, score: 0.6 });
      }
    });

    // 去重并返回
    const seen = new Set<string>();
    return results
      .filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 语义推理：基于路径的推理
   */
  async semanticInfer(
    sourceEntityId: string,
    targetEntityType: string,
    maxDepth: number = 3
  ): Promise<Entity[]> {
    const results: Entity[] = [];
    const visited = new Set<string>();

    const dfs = (entityId: string, depth: number) => {
      if (depth > maxDepth || visited.has(entityId)) return;
      visited.add(entityId);

      const entity = this.entities.get(entityId);
      if (!entity) return;

      if (entity.type === targetEntityType) {
        results.push(entity);
      }

      const relatedIds: string[] = [];
      this.relations.forEach(relation => {
        if (relation.source === entityId) {
          relatedIds.push(relation.target);
        } else if (relation.target === entityId) {
          relatedIds.push(relation.source);
        }
      });

      for (const relatedId of relatedIds) {
        dfs(relatedId, depth + 1);
      }
    };

    dfs(sourceEntityId, 0);
    return results;
  }

  /**
   * 获取所有记忆
   */
  async getAll(): Promise<MemoryItem[]> {
    if (this.useExternalStore && this.store) {
      return this.store.getAll('semantic');
    }

    return Array.from(this.entities.values()).map(e => ({
      id: e.id,
      content: `${e.name}: ${e.description || ''}`,
      timestamp: Date.now(),
      metadata: e as unknown as Record<string, unknown>,
    }));
  }

  /**
   * 清空语义记忆
   */
  async clear(): Promise<void> {
    if (this.useExternalStore && this.store) {
      await this.store.clear('semantic');
    } else {
      this.entities.clear();
      this.relations.clear();
      this.vectorStore.clear();
    }
  }

  /**
   * 获取记忆数量
   */
  size(): number {
    if (this.useExternalStore && this.store) {
      return this.store.count('semantic');
    }
    return this.entities.size;
  }

  /**
   * 获取实体
   */
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * 根据名称查找实体
   */
  findEntityByName(name: string): Entity | undefined {
    return Array.from(this.entities.values())
      .find(e => e.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * 获取实体的所有关系
   */
  getEntityRelations(id: string): Relation[] {
    return Array.from(this.relations.values())
      .filter(r => r.source === id || r.target === id);
  }

  /**
   * 获取指定类型的实体
   */
  getEntitiesByType(type: string): Entity[] {
    return Array.from(this.entities.values())
      .filter(e => e.type?.toLowerCase() === type.toLowerCase());
  }

  /**
   * 获取两个实体之间的关系
   */
  findRelation(sourceId: string, targetId: string): Relation | undefined {
    return Array.from(this.relations.values())
      .find(r =>
        (r.source === sourceId && r.target === targetId) ||
        (r.source === targetId && r.target === sourceId)
      );
  }

  /**
   * 构建子图
   */
  buildSubgraph(entityId: string): {
    entity: Entity;
    relations: Relation[];
    relatedEntities: Entity[];
  } {
    const entity = this.entities.get(entityId);
    if (!entity) {
      throw new Error('实体不存在');
    }

    const relations = this.getEntityRelations(entityId);
    const relatedEntityIds = new Set<string>();

    relations.forEach(r => {
      if (r.source !== entityId) relatedEntityIds.add(r.source);
      if (r.target !== entityId) relatedEntityIds.add(r.target);
    });

    const relatedEntities = Array.from(relatedEntityIds)
      .map(id => this.entities.get(id))
      .filter((e): e is Entity => e !== undefined);

    return { entity, relations, relatedEntities };
  }

  /**
   * 获取知识图谱统计
   */
  getStats(): { concepts: number; relations: number; categories: number } {
    const categories = new Set<string>();
    this.entities.forEach(e => {
      if (e.type) categories.add(e.type);
    });

    return {
      concepts: this.entities.size,
      relations: this.relations.size,
      categories: categories.size,
    };
  }

  /**
   * 批量添加实体
   */
  async addEntitiesBatch(entities: Array<Omit<Entity, 'id'>>): Promise<string[]> {
    const ids: string[] = [];
    for (const entity of entities) {
      const id = await this.addEntity(entity);
      ids.push(id);
    }
    return ids;
  }

  /**
   * 批量添加关系
   */
  async addRelationsBatch(relations: Array<Omit<Relation, 'id'>>): Promise<string[]> {
    const ids: string[] = [];
    for (const relation of relations) {
      const id = await this.addRelation(relation);
      ids.push(id);
    }
    return ids;
  }

  /**
   * 删除指定记忆
   */
  async delete(id: string): Promise<boolean> {
    if (this.useExternalStore && this.store) {
      return this.store.delete('semantic', id);
    }

    this.relations.forEach((relation, relId) => {
      if (relation.source === id || relation.target === id) {
        this.relations.delete(relId);
      }
    });

    return this.entities.delete(id);
  }

  // 兼容旧API
  getConcept(id: string): Entity | undefined {
    return this.getEntity(id);
  }

  findConceptByName(name: string): Entity | undefined {
    return this.findEntityByName(name);
  }

  getConceptRelations(id: string): Relation[] {
    return this.getEntityRelations(id);
  }

  getConceptsByCategory(category: string): Entity[] {
    return this.getEntitiesByType(category);
  }

  addConcept(concept: Omit<Entity, 'id'>): Promise<string> {
    return this.addEntity(concept);
  }

  addConceptsBatch(concepts: Array<Omit<Entity, 'id'>>): Promise<string[]> {
    return this.addEntitiesBatch(concepts);
  }
}

/**
 * Neo4j Store - 图存储后端
 * 知识图谱存储接口（需要 Neo4j 服务）
 */

export interface Neo4jNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface Neo4jRelationship {
  id: string;
  type: string;
  startNode: string;
  endNode: string;
  properties?: Record<string, unknown>;
}

export interface Neo4jConfig {
  url: string;
  username: string;
  password: string;
  database?: string;
}

/**
 * Neo4j 图存储客户端
 */
export class Neo4jStore {
  private url: string;
  private username: string;
  private password: string;
  private database: string;
  private initialized: boolean = false;

  constructor(config: Neo4jConfig) {
    this.url = config.url;
    this.username = config.username;
    this.password = config.password;
    this.database = config.database || 'neo4j';
  }

  /**
   * 初始化连接
   */
  async init(): Promise<void> {
    try {
      // 测试连接
      const response = await fetch(`${this.url}/tx/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
        },
        body: JSON.stringify({
          statements: [{ statement: 'RETURN 1' }],
        }),
      });

      if (response.ok) {
        this.initialized = true;
        console.log('✅ Neo4j 连接成功');
      }
    } catch (error) {
      console.warn(`⚠️ Neo4j 连接失败: ${error}`);
      console.warn('⚠️ 将使用内存存储作为后备');
    }
  }

  /**
   * 执行 Cypher 查询
   */
  private async query(statements: Array<{ statement: string; parameters?: Record<string, unknown> }>): Promise<unknown> {
    if (!this.initialized) {
      throw new Error('Neo4j 未初始化');
    }

    const response = await fetch(`${this.url}/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
      },
      body: JSON.stringify({ statements }),
    });

    if (!response.ok) {
      throw new Error(`Neo4j query error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 创建节点
   */
  async createNode(labels: string[], properties: Record<string, unknown>): Promise<string> {
    const labelStr = labels.map(l => `:${l}`).join('');
    const props = Object.entries(properties)
      .map(([k, v]) => `${k}: $${k}`)
      .join(', ');

    const result = await this.query([{
      statement: `CREATE (n${labelStr} { ${props} }) RETURN id(n) as nodeId`,
      parameters: properties,
    }]);

    const data = result as { results?: Array<{ data: Array<{ row: number[] }> }> };
    return String(data.results?.[0]?.data?.[0]?.row?.[0] || '');
  }

  /**
   * 创建关系
   */
  async createRelationship(
    startNodeId: string,
    endNodeId: string,
    type: string,
    properties?: Record<string, unknown>
  ): Promise<string> {
    const props = properties
      ? `{ ${Object.keys(properties).map(k => `${k}: $${k}`).join(', ')} }`
      : '';

    const result = await this.query([{
      statement: `
        MATCH (a), (b)
        WHERE id(a) = $startId AND id(b) = $endId
        CREATE (a)-[r:${type} ${props}]->(b)
        RETURN id(r) as relId
      `,
      parameters: { startId: parseInt(startNodeId), endId: parseInt(endNodeId), ...properties },
    }]);

    const data = result as { results?: Array<{ data: Array<{ row: number[] }> }> };
    return String(data.results?.[0]?.data?.[0]?.row?.[0] || '');
  }

  /**
   * 查询节点
   */
  async findNodes(labels: string[], properties: Record<string, unknown>): Promise<Neo4jNode[]> {
    const labelStr = labels.map(l => `:${l}`).join('');
    const props = Object.entries(properties)
      .map(([k, v]) => `${k}: $${k}`)
      .join(' AND ');

    const result = await this.query([{
      statement: `MATCH (n${labelStr} { ${props} }) RETURN id(n) as id, labels(n) as labels, properties(n) as properties`,
      parameters: properties,
    }]);

    const data = result as { results?: Array<{ data: Array<{ row: [string, string[], Record<string, unknown>] }> }> };
    return data.results?.[0]?.data?.map(row => ({
      id: String(row.row[0]),
      labels: row.row[1],
      properties: row.row[2],
    })) || [];
  }

  /**
   * 查询关系
   */
  async findRelationships(
    startNodeId?: string,
    endNodeId?: string,
    type?: string
  ): Promise<Neo4jRelationship[]> {
    let match = 'MATCH (a)-[r';

    if (type) {
      match += `:${type}`;
    }

    match += ']->(b)';

    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (startNodeId) {
      where.push('id(a) = $startId');
      params.startId = parseInt(startNodeId);
    }

    if (endNodeId) {
      where.push('id(b) = $endId');
      params.endId = parseInt(endNodeId);
    }

    const whereStr = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const result = await this.query([{
      statement: `${match} ${whereStr} RETURN id(r) as id, type(r) as type, id(a) as startNode, id(b) as endNode, properties(r) as properties`,
      parameters: params,
    }]);

    const data = result as { results?: Array<{ data: Array<{ row: [string, string, string, string, Record<string, unknown>] }> }> };
    return data.results?.[0]?.data?.map(row => ({
      id: String(row.row[0]),
      type: row.row[1],
      startNode: String(row.row[2]),
      endNode: String(row.row[3]),
      properties: row.row[4],
    })) || [];
  }

  /**
   * 删除节点及其关系
   */
  async deleteNode(nodeId: string): Promise<void> {
    await this.query([{
      statement: 'MATCH (n) WHERE id(n) = $id DETACH DELETE n',
      parameters: { id: parseInt(nodeId) },
    }]);
  }

  /**
   * 清空数据库
   */
  async clear(): Promise<void> {
    await this.query([{
      statement: 'MATCH (n) DETACH DELETE n',
    }]);
  }
}

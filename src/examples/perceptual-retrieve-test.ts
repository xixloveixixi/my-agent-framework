/**
 * 感知记忆检索功能测试
 * 测试跨模态检索和融合排序
 */
import { PerceptualMemory, ScoredMemoryItem } from '../memory/types/perceptual';

async function testRetrieve() {
  console.log('========== 感知记忆检索测试 ==========\n');

  const memory = new PerceptualMemory({ maxSize: 100 });

  // 添加不同模态的数据（带不同时间戳和重要性）
  console.log('📥 添加测试数据:');

  // 文本 - 较旧
  await memory.add('Python是一种高级编程语言', { type: 'text', importance: 0.9, timestamp: Date.now() - 86400000 * 2 });
  console.log('  ✅ text (旧, importance=0.9)');

  // 图像 - 较新
  await memory.add('一张风景照片，蓝天白云', { type: 'image', importance: 0.7, timestamp: Date.now() - 3600000 });
  console.log('  ✅ image (新, importance=0.7)');

  // 音频 - 中等
  await memory.add('用户说想要学习JavaScript教程', { type: 'audio', importance: 0.8, timestamp: Date.now() - 3600000 * 5 });
  console.log('  ✅ audio (中, importance=0.8)');

  // 图像 - 另一个
  await memory.add('一只可爱的橘猫在窗台上晒太阳', { type: 'image', importance: 0.6, timestamp: Date.now() });
  console.log('  ✅ image (最新, importance=0.6)');

  // 视频
  await memory.add('烹饪红烧肉的教程视频', { type: 'video', importance: 0.5, timestamp: Date.now() - 7200000 });
  console.log('  ✅ video (中, importance=0.5)');

  // 测试1: 基本检索（所有模态）
  console.log('\n🔍 基本检索 "学习":');
  const basicResults = await memory.retrieve('学习', 5);
  console.log(`  找到 ${basicResults.length} 条结果:`);
  basicResults.forEach((r: ScoredMemoryItem) => {
    console.log(`    - [${r.metadata?.type}] 分数:${r.combinedScore.toFixed(3)} (向量:${r.vectorScore.toFixed(2)}, 近因:${r.recencyScore.toFixed(2)}, 重要:${r.importance})`);
    console.log(`      内容: ${r.content}`);
  });

  // 测试2: 只搜索图像模态
  console.log('\n🔍 只搜索图像模态 "猫":');
  const imageResults = await memory.retrieve('猫', 5, { targetModality: 'image' });
  console.log(`  找到 ${imageResults.length} 条结果:`);
  imageResults.forEach((r: ScoredMemoryItem) => {
    console.log(`    - [${r.metadata?.type}] 分数:${r.combinedScore.toFixed(3)} 内容: ${r.content}`);
  });

  // 测试3: 跨模态检索（用文本查询图像）
  console.log('\n🔍 跨模态检索: 文本查询图像模态 "风景":');
  const crossModalResults = await memory.retrieveCrossModal('风景', 'image', 5);
  console.log(`  找到 ${crossModalResults.length} 条结果:`);
  crossModalResults.forEach((r: ScoredMemoryItem) => {
    console.log(`    - [${r.metadata?.type}] 分数:${r.combinedScore.toFixed(3)} 内容: ${r.content}`);
  });

  // 测试4: 指定用户ID过滤
  console.log('\n🔍 指定用户ID过滤 "Python":');
  const userResults = await memory.retrieve('Python', 5, { userId: 'user_001' });
  console.log(`  找到 ${userResults.length} 条结果:`);
  userResults.forEach((r: ScoredMemoryItem) => {
    console.log(`    - [${r.metadata?.type}] 用户:${r.metadata?.userId} 内容: ${r.content}`);
  });

  // 测试5: 对比不同权重
  console.log('\n🔍 不同权重配置 "教程":');

  // 高向量权重
  const highVectorResults = await memory.retrieve('教程', 3, {
    vectorWeight: 0.9,
    recencyWeight: 0.1,
    importanceWeight: 0.2,
  });
  console.log('  高向量权重 (0.9/0.1/0.2):');
  highVectorResults.forEach((r: ScoredMemoryItem) => {
    console.log(`    - ${r.content.slice(0, 20)}... 分数:${r.combinedScore.toFixed(3)}`);
  });

  // 高时间权重
  const highRecencyResults = await memory.retrieve('教程', 3, {
    vectorWeight: 0.3,
    recencyWeight: 0.7,
    importanceWeight: 0.2,
  });
  console.log('  高时间权重 (0.3/0.7/0.2):');
  highRecencyResults.forEach((r: ScoredMemoryItem) => {
    console.log(`    - ${r.content.slice(0, 20)}... 分数:${r.combinedScore.toFixed(3)}`);
  });

  // 测试6: 搜索音频模态
  console.log('\n🔍 搜索音频模态 "JavaScript":');
  const audioResults = await memory.retrieve('JavaScript', 5, { targetModality: 'audio' });
  console.log(`  找到 ${audioResults.length} 条结果:`);
  audioResults.forEach((r: ScoredMemoryItem) => {
    console.log(`    - [${r.metadata?.type}] ${r.content}`);
  });

  console.log('\n========== 测试完成 ==========');
}

testRetrieve().catch(console.error);

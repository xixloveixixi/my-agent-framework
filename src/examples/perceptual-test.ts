/**
 * 感知记忆模态分离测试
 */
import { PerceptualMemory, MODAL_VECTOR_DIMS, PerceptualDataType } from '../memory/types/perceptual';

async function testPerceptualMemory() {
  console.log('========== 感知记忆模态分离测试 ==========\n');

  const memory = new PerceptualMemory({ maxSize: 100 });

  // 测试1: 添加不同模态的数据
  console.log('📥 添加各模态数据:');

  await memory.add('这是一段文本内容', { type: 'text' });
  console.log('  ✅ 添加 text');

  await memory.addImage('/path/to/image.png', '一只可爱的猫咪在阳光下睡觉');
  console.log('  ✅ 添加 image');

  await memory.addAudio('/path/to/audio.mp3', '用户说今天天气很好想去公园');
  console.log('  ✅ 添加 audio');

  await memory.addVideo('/path/to/video.mp4', '用户在厨房做晚餐的过程');
  console.log('  ✅ 添加 video');

  await memory.addImageFromURL('https://example.com/chart.png', '销售数据图表显示增长趋势');
  console.log('  ✅ 添加 image_url');

  // 测试2: 查看各模态向量维度
  console.log('\n📐 各模态向量维度:');
  (Object.keys(MODAL_VECTOR_DIMS) as PerceptualDataType[]).forEach(type => {
    console.log(`  ${type}: ${MODAL_VECTOR_DIMS[type]}`);
  });

  // 测试3: 获取各模态数量
  console.log('\n📊 各模态记忆数量:');
  const sizes = memory.getSizeByModalities();
  Object.entries(sizes).forEach(([type, size]) => {
    console.log(`  ${type}: ${size}`);
  });

  // 测试4: 搜索所有模态
  console.log('\n🔍 搜索 "猫咪" (所有模态):');
  const allResults = await memory.search('猫咪', 10);
  console.log(`  找到 ${allResults.length} 条结果`);
  allResults.forEach(r => console.log(`    - [${r.metadata?.type}] ${r.content.slice(0, 30)}...`));

  // 测试5: 只搜索图像模态
  console.log('\n🔍 搜索 "猫咪" (仅图像模态):');
  const imageResults = await memory.search('猫咪', 10, ['image']);
  console.log(`  找到 ${imageResults.length} 条结果`);
  imageResults.forEach(r => console.log(`    - [${r.metadata?.type}] ${r.content}`));

  // 测试6: 只搜索音频模态
  console.log('\n🔍 搜索 "天气" (仅音频模态):');
  const audioResults = await memory.search('天气', 10, ['audio']);
  console.log(`  找到 ${audioResults.length} 条结果`);
  audioResults.forEach(r => console.log(`    - [${r.metadata?.type}] ${r.content}`));

  // 测试7: 获取统计信息
  console.log('\n📈 统计信息:');
  const stats = memory.getStats();
  console.log(`  ${JSON.stringify(stats)}`);

  // 测试8: 按类型获取
  console.log('\n📋 获取所有图像:');
  const images = await memory.getByType('image');
  console.log(`  图像数量: ${images.length}`);
  images.forEach(img => console.log(`    - ${img.content}`));

  // 测试9: 清空指定模态
  console.log('\n🗑️ 清空图像模态:');
  await memory.clear('image');
  console.log('  已清空图像');

  const sizesAfterClear = memory.getSizeByModalities();
  console.log('  清空后各模态数量:', JSON.stringify(sizesAfterClear));

  // 测试10: 清空所有
  console.log('\n🗑️ 清空所有:');
  await memory.clear();
  console.log('  已清空所有');

  const sizesAfterAllClear = memory.getSizeByModalities();
  console.log('  清空后各模态数量:', JSON.stringify(sizesAfterAllClear));

  console.log('\n========== 测试完成 ==========');
}

testPerceptualMemory().catch(console.error);

#!/usr/bin/env node

import { KillScreenDetector } from './detection/detector';
import sharp from 'sharp';

async function testSingleImage(imagePath: string): Promise<void> {
  console.log('🔍 Kill-Screen 検出テストを開始...');
  console.log(`📂 対象画像: ${imagePath}`);
  
  try {
    // 画像の基本情報を表示
    const metadata = await sharp(imagePath).metadata();
    console.log(`📏 画像サイズ: ${metadata.width}x${metadata.height}`);
    
    const detector = new KillScreenDetector();
    const result = await detector.detectKillScreen(imagePath, 0);
    
    console.log('\n🎯 検出結果:');
    console.log(`   Kill-Screen判定: ${result.isKillScreen ? '✅ YES' : '❌ NO'}`);
    console.log(`   信頼度スコア: ${Math.round(result.confidence * 100)}%`);
    console.log(`   閾値70%以上: ${result.confidence >= 0.7 ? '✅ PASS' : '❌ FAIL'}`);
    
    // 詳細分析
    console.log('\n🔬 詳細分析を実行中...');
    const detailedAnalysis = await getDetailedAnalysis(imagePath);
    
    console.log('\n📊 詳細スコア:');
    console.log(`   赤・オレンジ色スコア: ${Math.round(detailedAnalysis.colorScore * 100)}%`);
    console.log(`   全体明度スコア: ${Math.round(detailedAnalysis.brightnessScore * 100)}%`);
    console.log(`   中央集中スコア: ${Math.round(detailedAnalysis.centerScore * 100)}%`);
    
    console.log('\n💡 推奨閾値:');
    if (result.confidence >= 0.7) {
      console.log('   現在の設定(0.7)で検出可能です');
    } else if (result.confidence >= 0.5) {
      console.log('   閾値を0.5に下げれば検出可能です');
    } else if (result.confidence >= 0.3) {
      console.log('   閾値を0.3に下げれば検出可能です');
    } else {
      console.log('   検出アルゴリズムの調整が必要です');
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  }
}

async function getDetailedAnalysis(imagePath: string): Promise<{
  colorScore: number;
  brightnessScore: number;
  centerScore: number;
}> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  // 色彩分析
  const { width, height, channels } = info;
  const totalPixels = width * height;
  let redOrangePixels = 0;
  let totalBrightness = 0;
  
  for (let i = 0; i < totalPixels; i++) {
    const pixelOffset = i * channels;
    const r = data[pixelOffset];
    const g = data[pixelOffset + 1];
    const b = data[pixelOffset + 2];
    
    // 赤・オレンジ判定
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    
    if (r > 100 && r > g && r > b && saturation > 0.4) {
      redOrangePixels++;
    }
    
    totalBrightness += (r + g + b) / 3;
  }
  
  // 中央部の明度分析
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const radius = Math.min(width, height) * 0.2;
  
  let centerBrightness = 0;
  let pixelCount = 0;
  
  for (let y = Math.max(0, centerY - radius); y < Math.min(height, centerY + radius); y++) {
    for (let x = Math.max(0, centerX - radius); x < Math.min(width, centerX + radius); x++) {
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (distance <= radius) {
        const pixelOffset = (y * width + x) * channels;
        const r = data[pixelOffset];
        const g = data[pixelOffset + 1];
        const b = data[pixelOffset + 2];
        
        centerBrightness += (r + g + b) / 3;
        pixelCount++;
      }
    }
  }
  
  const colorScore = Math.min(1.0, (redOrangePixels / totalPixels) * 4);
  const brightnessScore = Math.min(1.0, (totalBrightness / totalPixels - 100) / 155);
  const centerScore = pixelCount > 0 ? Math.min(1.0, (centerBrightness / pixelCount - 150) / 105) : 0;
  
  return { colorScore, brightnessScore, centerScore };
}

// コマンドライン引数から画像パスを取得
const imagePath = process.argv[2];

if (!imagePath) {
  console.log('使用方法: npm run test-image <画像ファイルパス>');
  console.log('例: npm run test-image assets/kill-screen-sample.png');
  process.exit(1);
}

testSingleImage(imagePath);
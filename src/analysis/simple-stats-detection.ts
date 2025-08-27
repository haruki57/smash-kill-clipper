#!/usr/bin/env node

import sharp from 'sharp';

interface SimpleStatsResult {
  filename: string;
  isKillScreen: boolean;
  killScore: number;
  details: {
    averageBrightness: number;
    brightnessScore: number;
    whitePixelRatio: number;
    whitePixelScore: number;
    colorVariance: number;
    colorVarianceScore: number;
    redDominance: number;
    redDominanceScore: number;
  };
}

export async function detectWithSimpleStats(imagePath: string): Promise<SimpleStatsResult> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  const totalPixels = width * height;
  
  // 基本統計を計算
  let totalBrightness = 0;
  let whitePixels = 0;
  let redPixels = 0;
  const brightnesses: number[] = [];
  
  for (let i = 0; i < totalPixels; i++) {
    const pixelOffset = i * channels;
    const r = data[pixelOffset];
    const g = data[pixelOffset + 1];
    const b = data[pixelOffset + 2];
    
    const brightness = (r + g + b) / 3;
    totalBrightness += brightness;
    brightnesses.push(brightness);
    
    // 白っぽいピクセル（明度200以上）
    if (brightness > 200) {
      whitePixels++;
    }
    
    // 赤っぽいピクセル（赤が他の色より大きい）
    if (r > g && r > b && r > 120) {
      redPixels++;
    }
  }
  
  // 1. 平均明度スコア
  const averageBrightness = totalBrightness / totalPixels;
  const brightnessScore = Math.min(1.0, Math.max(0, (averageBrightness - 80) / 120));
  
  // 2. 白いピクセルの割合スコア
  const whitePixelRatio = whitePixels / totalPixels;
  const whitePixelScore = Math.min(1.0, whitePixelRatio * 10); // 10%以上で満点
  
  // 3. 明度の分散（コントラスト）
  let varianceSum = 0;
  for (const brightness of brightnesses) {
    varianceSum += (brightness - averageBrightness) ** 2;
  }
  const colorVariance = Math.sqrt(varianceSum / totalPixels);
  const colorVarianceScore = Math.min(1.0, colorVariance / 80); // 分散80以上で満点
  
  // 4. 赤の支配度
  const redDominance = redPixels / totalPixels;
  const redDominanceScore = Math.min(1.0, redDominance * 5); // 20%以上で満点
  
  // 総合スコア（シンプルな重み付け）
  const killScore = 
    brightnessScore * 0.3 +      // 明度
    whitePixelScore * 0.3 +      // 白ピクセル
    colorVarianceScore * 0.2 +   // コントラスト
    redDominanceScore * 0.2;     // 赤の割合
  
  return {
    filename: imagePath.split('/').pop() || '',
    isKillScreen: killScore > 0.7, // 閾値を0.7に調整
    killScore,
    details: {
      averageBrightness,
      brightnessScore,
      whitePixelRatio,
      whitePixelScore,
      colorVariance,
      colorVarianceScore,
      redDominance,
      redDominanceScore
    }
  };
}

// コマンドライン実行
if (require.main === module) {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.log('使用方法: npx ts-node simple-stats-detection.ts <画像パス>');
    process.exit(1);
  }

  detectWithSimpleStats(imagePath).then(result => {
    console.log('\n📊 シンプル統計検出結果:');
    console.log(`📂 ファイル: ${result.filename}`);
    console.log(`🎯 撃墜シーン: ${result.isKillScreen ? '✅ YES' : '❌ NO'}`);
    console.log(`📊 撃墜スコア: ${(result.killScore * 100).toFixed(1)}%`);
    console.log('\n📋 詳細分析:');
    console.log(`   平均明度: ${result.details.averageBrightness.toFixed(1)} (${(result.details.brightnessScore * 100).toFixed(1)}%)`);
    console.log(`   白ピクセル割合: ${(result.details.whitePixelRatio * 100).toFixed(1)}% (${(result.details.whitePixelScore * 100).toFixed(1)}%)`);
    console.log(`   明度分散: ${result.details.colorVariance.toFixed(1)} (${(result.details.colorVarianceScore * 100).toFixed(1)}%)`);
    console.log(`   赤の支配度: ${(result.details.redDominance * 100).toFixed(1)}% (${(result.details.redDominanceScore * 100).toFixed(1)}%)`);
  }).catch(error => {
    console.error('エラー:', error);
    process.exit(1);
  });
}
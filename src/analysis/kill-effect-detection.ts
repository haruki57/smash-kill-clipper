#!/usr/bin/env node

import sharp from 'sharp';

interface KillEffectResult {
  filename: string;
  isKillScreen: boolean;
  killScore: number;
  details: {
    centerBrightness: number;
    centerBrightnessScore: number;
    edgeContrast: number;
    edgeContrastScore: number;
    radialPattern: number;
    radialPatternScore: number;
    colorSaturation: number;
    colorSaturationScore: number;
  };
}

export async function detectKillEffect(imagePath: string): Promise<KillEffectResult> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  
  // 1. 中心部の明度集中度
  const centerBrightnessScore = analyzeCenterBrightness(data, width, height, channels);
  
  // 2. エッジと中心のコントラスト
  const edgeContrastScore = analyzeEdgeContrast(data, width, height, channels);
  
  // 3. 放射状パターン検出
  const radialPatternScore = analyzeRadialPattern(data, width, height, channels);
  
  // 4. 色の彩度・鮮やかさ
  const colorSaturationScore = analyzeColorSaturation(data, width, height, channels);
  
  // 総合スコア計算
  const killScore = 
    centerBrightnessScore * 0.35 +    // 中心の明るさが最重要
    edgeContrastScore * 0.25 +        // エッジとのコントラスト
    radialPatternScore * 0.25 +       // 放射状パターン
    colorSaturationScore * 0.15;      // 色の鮮やかさ
  
  return {
    filename: imagePath.split('/').pop() || '',
    isKillScreen: killScore > 0.4, // 閾値0.4に下げる
    killScore,
    details: {
      centerBrightness: centerBrightnessScore,
      centerBrightnessScore,
      edgeContrast: edgeContrastScore,
      edgeContrastScore,
      radialPattern: radialPatternScore,
      radialPatternScore,
      colorSaturation: colorSaturationScore,
      colorSaturationScore
    }
  };
}

/**
 * 中心部の明度集中度分析
 * 撃墜エフェクトは画面中心が非常に明るくなる
 */
function analyzeCenterBrightness(data: Buffer, width: number, height: number, channels: number): number {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const radius = Math.min(width, height) * 0.2; // 中心20%領域
  
  let centerBrightness = 0;
  let centerPixels = 0;
  let totalBrightness = 0;
  let totalPixels = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      const brightness = (r + g + b) / 3;
      
      totalBrightness += brightness;
      totalPixels++;
      
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (distance <= radius) {
        centerBrightness += brightness;
        centerPixels++;
      }
    }
  }
  
  if (centerPixels === 0 || totalPixels === 0) return 0;
  
  const avgCenterBrightness = centerBrightness / centerPixels;
  const avgTotalBrightness = totalBrightness / totalPixels;
  
  // 中心の明度が全体より大幅に高い場合に高スコア
  const brightnessRatio = avgCenterBrightness / (avgTotalBrightness + 1);
  
  // 中心が明るく（120+）、かつ全体より1.2倍以上明るい場合
  if (avgCenterBrightness > 120 && brightnessRatio > 1.2) {
    return Math.min(1.0, (avgCenterBrightness - 120) / 130 * 0.7 + (brightnessRatio - 1.2) / 1.3 * 0.3);
  }
  
  return 0;
}

/**
 * エッジと中心のコントラスト分析
 * 撃墜エフェクトは中心から外側に向かって明度が急激に変化
 */
function analyzeEdgeContrast(data: Buffer, width: number, height: number, channels: number): number {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  
  // 中心領域（10%）の平均明度
  const centerRadius = Math.min(width, height) * 0.1;
  let centerBrightness = 0;
  let centerPixels = 0;
  
  // エッジ領域（外側10%）の平均明度
  let edgeBrightness = 0;
  let edgePixels = 0;
  const edgeThreshold = Math.min(width, height) * 0.1;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelOffset = (y * width + x) * channels;
      const brightness = (data[pixelOffset] + data[pixelOffset + 1] + data[pixelOffset + 2]) / 3;
      
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      
      // 中心領域
      if (distance <= centerRadius) {
        centerBrightness += brightness;
        centerPixels++;
      }
      
      // エッジ領域（画面端から一定距離内）
      const minDistToEdge = Math.min(x, y, width - x, height - y);
      if (minDistToEdge <= edgeThreshold) {
        edgeBrightness += brightness;
        edgePixels++;
      }
    }
  }
  
  if (centerPixels === 0 || edgePixels === 0) return 0;
  
  const avgCenterBrightness = centerBrightness / centerPixels;
  const avgEdgeBrightness = edgeBrightness / edgePixels;
  
  // 中心とエッジの明度差が大きいほど高スコア
  const contrastDiff = avgCenterBrightness - avgEdgeBrightness;
  
  return Math.min(1.0, Math.max(0, contrastDiff - 50) / 150);
}

/**
 * 放射状パターン分析
 * 撃墜エフェクトは中心から放射状に広がる光の筋がある
 */
function analyzeRadialPattern(data: Buffer, width: number, height: number, channels: number): number {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  
  const numRays = 16; // 16方向でサンプリング
  let radialScore = 0;
  
  for (let rayIndex = 0; rayIndex < numRays; rayIndex++) {
    const angle = (rayIndex * 2 * Math.PI) / numRays;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    
    // 中心から外側に向かってサンプリング
    const samples = [];
    const maxDistance = Math.min(width, height) * 0.4;
    
    for (let dist = 20; dist < maxDistance; dist += 15) {
      const x = Math.floor(centerX + dx * dist);
      const y = Math.floor(centerY + dy * dist);
      
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const pixelOffset = (y * width + x) * channels;
        const brightness = (data[pixelOffset] + data[pixelOffset + 1] + data[pixelOffset + 2]) / 3;
        samples.push(brightness);
      }
    }
    
    // この方向での明度勾配を計算
    if (samples.length >= 3) {
      let gradientSum = 0;
      for (let i = 1; i < samples.length; i++) {
        gradientSum += Math.max(0, samples[i-1] - samples[i]); // 中心から外側への減衰
      }
      
      const avgGradient = gradientSum / (samples.length - 1);
      radialScore += Math.min(1.0, avgGradient / 50);
    }
  }
  
  return radialScore / numRays;
}

/**
 * 色の彩度・鮮やかさ分析
 * 撃墜エフェクトは鮮やかな色（赤、黄、白）が多い
 */
function analyzeColorSaturation(data: Buffer, width: number, height: number, channels: number): number {
  let highSaturationPixels = 0;
  let brightColorfulPixels = 0;
  let totalPixels = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      totalPixels++;
      
      // HSV計算
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = max;
      const saturation = max === 0 ? 0 : (max - min) / max;
      
      // 高彩度ピクセル
      if (saturation > 0.4 && brightness > 100) {
        highSaturationPixels++;
        
        // 撃墜エフェクトでよく見る色（赤・黄・白系）
        if (brightness > 180 && (r > 150 || (r > 120 && g > 120))) {
          brightColorfulPixels++;
        }
      }
    }
  }
  
  if (totalPixels === 0) return 0;
  
  const saturationRatio = highSaturationPixels / totalPixels;
  const brightColorRatio = brightColorfulPixels / totalPixels;
  
  return Math.min(1.0, saturationRatio * 2 + brightColorRatio * 3);
}

// コマンドライン実行
if (require.main === module) {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.log('使用方法: npx ts-node kill-effect-detection.ts <画像パス>');
    process.exit(1);
  }

  detectKillEffect(imagePath).then(result => {
    console.log('\n⚡ 撃墜エフェクト検出結果:');
    console.log(`📂 ファイル: ${result.filename}`);
    console.log(`🎯 撃墜シーン: ${result.isKillScreen ? '✅ YES' : '❌ NO'}`);
    console.log(`📊 撃墜スコア: ${(result.killScore * 100).toFixed(1)}%`);
    console.log('\n📋 詳細分析:');
    console.log(`   中心明度: ${(result.details.centerBrightnessScore * 100).toFixed(1)}%`);
    console.log(`   エッジコントラスト: ${(result.details.edgeContrastScore * 100).toFixed(1)}%`);
    console.log(`   放射パターン: ${(result.details.radialPatternScore * 100).toFixed(1)}%`);
    console.log(`   色彩度: ${(result.details.colorSaturationScore * 100).toFixed(1)}%`);
  }).catch(error => {
    console.error('エラー:', error);
    process.exit(1);
  });
}
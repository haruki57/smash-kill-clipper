#!/usr/bin/env node

import sharp from 'sharp';

interface SimpleUIResult {
  filename: string;
  uiPresent: boolean;
  uiScore: number;
  details: {
    bottomUIActivity: number;    // 下部のUI活動度
    whiteTextDensity: number;    // 白文字密度
    coloredElementsDensity: number; // 色付き要素密度
    edgeDensity: number;         // エッジ密度
  };
}

export async function detectUISimple(imagePath: string): Promise<SimpleUIResult> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  
  // 下部30%領域に集中（UIが集中している領域）
  const uiRegion = {
    x: 0,
    y: Math.floor(height * 0.7),
    w: width,
    h: Math.floor(height * 0.3)
  };
  
  const details = {
    bottomUIActivity: calculateUIActivity(data, width, height, channels, uiRegion),
    whiteTextDensity: calculateWhiteTextDensity(data, width, height, channels, uiRegion),
    coloredElementsDensity: calculateColoredElementsDensity(data, width, height, channels, uiRegion),
    edgeDensity: calculateEdgeDensity(data, width, height, channels, uiRegion)
  };
  
  // シンプルな統合スコア
  const uiScore = 
    details.bottomUIActivity * 0.3 +
    details.whiteTextDensity * 0.3 +
    details.coloredElementsDensity * 0.2 +
    details.edgeDensity * 0.2;
    
  return {
    filename: imagePath.split('/').pop() || '',
    uiPresent: uiScore > 0.15, // 現実的な閾値
    uiScore,
    details
  };
}

/**
 * UI活動度：下部領域の色の多様性とコントラストで判定
 */
function calculateUIActivity(data: Buffer, width: number, height: number, channels: number, region: any): number {
  let totalVariance = 0;
  let pixelCount = 0;
  
  for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      // 色の分散（UI要素は色が変化に富む）
      const colorVariance = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
      totalVariance += colorVariance;
      pixelCount++;
      
      // 隣接ピクセルとの差（エッジ）
      if (x < width - 1) {
        const nextOffset = (y * width + (x + 1)) * channels;
        const nextR = data[nextOffset];
        const colorDiff = Math.abs(r - nextR);
        totalVariance += colorDiff;
      }
    }
  }
  
  return pixelCount > 0 ? Math.min(1.0, totalVariance / pixelCount / 100) : 0;
}

/**
 * 白文字密度：明るい低彩度ピクセルの密度
 */
function calculateWhiteTextDensity(data: Buffer, width: number, height: number, channels: number, region: any): number {
  let whitePixels = 0;
  let totalPixels = 0;
  
  for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      totalPixels++;
      
      const brightness = (r + g + b) / 3;
      const colorDiff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
      
      // 明るくて彩度が低い = 白い文字の可能性
      if (brightness > 140 && colorDiff < 60) {
        whitePixels++;
      }
    }
  }
  
  return totalPixels > 0 ? whitePixels / totalPixels : 0;
}

/**
 * 色付き要素密度：高彩度ピクセルの密度
 */
function calculateColoredElementsDensity(data: Buffer, width: number, height: number, channels: number, region: any): number {
  let coloredPixels = 0;
  let totalPixels = 0;
  
  for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      totalPixels++;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      
      // 彩度が高い = UI要素（赤青のプレイヤー色など）
      if (saturation > 0.4 && max > 80) {
        coloredPixels++;
      }
    }
  }
  
  return totalPixels > 0 ? coloredPixels / totalPixels : 0;
}

/**
 * エッジ密度：境界線の多さ
 */
function calculateEdgeDensity(data: Buffer, width: number, height: number, channels: number, region: any): number {
  let edges = 0;
  let totalComparisons = 0;
  
  for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      
      // 右隣との比較
      if (x < width - 1) {
        const rightOffset = (y * width + (x + 1)) * channels;
        const rightR = data[rightOffset];
        const diff = Math.abs(r - rightR);
        if (diff > 30) edges++;
        totalComparisons++;
      }
      
      // 下隣との比較
      if (y < height - 1) {
        const belowOffset = ((y + 1) * width + x) * channels;
        const belowR = data[belowOffset];
        const diff = Math.abs(r - belowR);
        if (diff > 30) edges++;
        totalComparisons++;
      }
    }
  }
  
  return totalComparisons > 0 ? edges / totalComparisons : 0;
}

// コマンドライン実行
if (require.main === module) {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.log('使用方法: npx ts-node simple-ui-detection.ts <画像パス>');
    process.exit(1);
  }

  detectUISimple(imagePath).then(result => {
    console.log('\n🔍 シンプルUI検出結果:');
    console.log(`📂 ファイル: ${result.filename}`);
    console.log(`🎯 UI存在: ${result.uiPresent ? '✅ YES' : '❌ NO'}`);
    console.log(`📊 総合スコア: ${(result.uiScore * 100).toFixed(1)}%`);
    console.log('\n📋 詳細:');
    console.log(`   UI活動度: ${(result.details.bottomUIActivity * 100).toFixed(1)}%`);
    console.log(`   白文字密度: ${(result.details.whiteTextDensity * 100).toFixed(1)}%`);
    console.log(`   色付き要素: ${(result.details.coloredElementsDensity * 100).toFixed(1)}%`);
    console.log(`   エッジ密度: ${(result.details.edgeDensity * 100).toFixed(1)}%`);
  }).catch(error => {
    console.error('エラー:', error);
    process.exit(1);
  });
}
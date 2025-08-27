#!/usr/bin/env node

import sharp from 'sharp';

interface CharacterLogoResult {
  filename: string;
  uiPresent: boolean;
  logoScore: number;
  details: {
    leftLogo: {
      detected: boolean;
      score: number;
      dominantColor: string;
      squareScore: number;
    };
    rightLogo: {
      detected: boolean;
      score: number;
      dominantColor: string;
      squareScore: number;
    };
  };
}

export async function detectCharacterLogos(imagePath: string): Promise<CharacterLogoResult> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  
  // キャラクターロゴの固定位置（720p基準）
  const leftLogoRegion = {
    x: Math.floor(width * 0.03),  // 左端から3%
    y: Math.floor(height * 0.78), // 上から78%（下から22%）
    w: Math.floor(width * 0.08),  // 幅8%
    h: Math.floor(width * 0.08)   // 正方形（高さも8%相当）
  };
  
  const rightLogoRegion = {
    x: Math.floor(width * 0.89),  // 左端から89%
    y: Math.floor(height * 0.78), // 上から78%
    w: Math.floor(width * 0.08),  // 幅8%
    h: Math.floor(width * 0.08)   // 正方形
  };
  
  const leftLogo = analyzeLogoRegion(data, width, height, channels, leftLogoRegion);
  const rightLogo = analyzeLogoRegion(data, width, height, channels, rightLogoRegion);
  
  // 両方のロゴスコアを統合
  const logoScore = Math.max(leftLogo.score, rightLogo.score);
  
  return {
    filename: imagePath.split('/').pop() || '',
    uiPresent: logoScore > 0.4, // ロゴ検出の閾値
    logoScore,
    details: {
      leftLogo,
      rightLogo
    }
  };
}

/**
 * ロゴ領域を分析
 */
function analyzeLogoRegion(data: Buffer, width: number, height: number, channels: number, region: any) {
  // 1. 色彩多様性スコア（キャラクターロゴは色彩豊富）
  const colorDiversityScore = calculateColorDiversity(data, width, height, channels, region);
  
  // 2. 正方形構造スコア（枠の検出）
  const squareStructureScore = calculateSquareStructure(data, width, height, channels, region);
  
  // 3. 適度な明度スコア（暗すぎず明るすぎず）
  const brightnessScore = calculateOptimalBrightness(data, width, height, channels, region);
  
  // 4. エッジ密度スコア（ロゴの輪郭）
  const edgeScore = calculateLogoEdges(data, width, height, channels, region);
  
  const totalScore = 
    colorDiversityScore * 0.3 +    // 色の多様性
    squareStructureScore * 0.25 +  // 正方形構造
    brightnessScore * 0.25 +       // 適切な明度
    edgeScore * 0.2;               // エッジ密度
  
  const dominantColor = getDominantColor(data, width, height, channels, region);
  
  return {
    detected: totalScore > 0.4,
    score: totalScore,
    dominantColor,
    squareScore: squareStructureScore
  };
}

/**
 * 色彩多様性計算：キャラクターロゴは様々な色を含む
 */
function calculateColorDiversity(data: Buffer, width: number, height: number, channels: number, region: any): number {
  const colorBuckets = new Array(8).fill(0); // HSV色相を8分割
  let totalPixels = 0;
  let colorfulPixels = 0;
  
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
      
      // 彩度の高いピクセルをカウント
      if (saturation > 0.3 && max > 60) {
        colorfulPixels++;
        
        // 色相バケットに分類
        let hue = 0;
        if (max === r) {
          hue = ((g - b) / (max - min)) * 60;
        } else if (max === g) {
          hue = (2.0 + (b - r) / (max - min)) * 60;
        } else {
          hue = (4.0 + (r - g) / (max - min)) * 60;
        }
        if (hue < 0) hue += 360;
        
        const bucketIndex = Math.floor(hue / 45) % 8;
        colorBuckets[bucketIndex]++;
      }
    }
  }
  
  if (totalPixels === 0) return 0;
  
  // 色の多様性：複数の色相バケットに分散しているほど高スコア
  const usedBuckets = colorBuckets.filter(count => count > 0).length;
  const colorfulRatio = colorfulPixels / totalPixels;
  
  return Math.min(1.0, (usedBuckets / 8) * 0.7 + colorfulRatio * 0.3);
}

/**
 * 正方形構造検出：角の検出と直線エッジ
 */
function calculateSquareStructure(data: Buffer, width: number, height: number, channels: number, region: any): number {
  let cornerEdges = 0;
  let straightEdges = 0;
  let totalChecked = 0;
  
  // 正方形の境界線付近をチェック
  const centerX = region.x + region.w / 2;
  const centerY = region.y + region.h / 2;
  const halfSize = Math.min(region.w, region.h) / 2;
  
  // 上下左右の境界線をサンプリング
  const borderPositions = [
    // 上辺
    { x: centerX - halfSize * 0.5, y: region.y + 2 },
    { x: centerX, y: region.y + 2 },
    { x: centerX + halfSize * 0.5, y: region.y + 2 },
    // 下辺
    { x: centerX - halfSize * 0.5, y: region.y + region.h - 2 },
    { x: centerX, y: region.y + region.h - 2 },
    { x: centerX + halfSize * 0.5, y: region.y + region.h - 2 },
    // 左辺
    { x: region.x + 2, y: centerY - halfSize * 0.5 },
    { x: region.x + 2, y: centerY },
    { x: region.x + 2, y: centerY + halfSize * 0.5 },
    // 右辺
    { x: region.x + region.w - 2, y: centerY - halfSize * 0.5 },
    { x: region.x + region.w - 2, y: centerY },
    { x: region.x + region.w - 2, y: centerY + halfSize * 0.5 }
  ];
  
  for (const pos of borderPositions) {
    const x = Math.floor(pos.x);
    const y = Math.floor(pos.y);
    
    if (x >= 0 && x < width && y >= 0 && y < height) {
      totalChecked++;
      
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      
      // 内側と外側の明度差を確認（境界線検出）
      const inwardX = x + (x < centerX ? 3 : -3);
      const inwardY = y + (y < centerY ? 3 : -3);
      
      if (inwardX >= 0 && inwardX < width && inwardY >= 0 && inwardY < height) {
        const inwardOffset = (inwardY * width + inwardX) * channels;
        const inwardR = data[inwardOffset];
        
        const brightnessDiff = Math.abs(r - inwardR);
        if (brightnessDiff > 40) {
          straightEdges++;
        }
      }
    }
  }
  
  // 角の検出（4角をチェック）
  const corners = [
    { x: region.x + 2, y: region.y + 2 },         // 左上
    { x: region.x + region.w - 2, y: region.y + 2 }, // 右上
    { x: region.x + 2, y: region.y + region.h - 2 }, // 左下
    { x: region.x + region.w - 2, y: region.y + region.h - 2 } // 右下
  ];
  
  for (const corner of corners) {
    if (corner.x >= 0 && corner.x < width && corner.y >= 0 && corner.y < height) {
      // 角付近のエッジ強度をチェック
      const edgeStrength = calculateLocalEdgeStrength(data, width, height, channels, corner.x, corner.y);
      if (edgeStrength > 0.3) {
        cornerEdges++;
      }
    }
  }
  
  const straightEdgeRatio = totalChecked > 0 ? straightEdges / totalChecked : 0;
  const cornerRatio = cornerEdges / 4;
  
  return Math.min(1.0, (straightEdgeRatio * 0.6) + (cornerRatio * 0.4));
}

/**
 * 局所エッジ強度計算
 */
function calculateLocalEdgeStrength(data: Buffer, width: number, height: number, channels: number, x: number, y: number): number {
  const pixelOffset = (y * width + x) * channels;
  const centerBrightness = (data[pixelOffset] + data[pixelOffset + 1] + data[pixelOffset + 2]) / 3;
  
  let totalDiff = 0;
  let count = 0;
  
  // 3x3近傍との差を計算
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const neighborOffset = (ny * width + nx) * channels;
        const neighborBrightness = (data[neighborOffset] + data[neighborOffset + 1] + data[neighborOffset + 2]) / 3;
        totalDiff += Math.abs(centerBrightness - neighborBrightness);
        count++;
      }
    }
  }
  
  return count > 0 ? Math.min(1.0, totalDiff / count / 100) : 0;
}

/**
 * 適切な明度スコア：暗すぎず明るすぎない
 */
function calculateOptimalBrightness(data: Buffer, width: number, height: number, channels: number, region: any): number {
  let totalBrightness = 0;
  let pixelCount = 0;
  
  for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      pixelCount++;
    }
  }
  
  if (pixelCount === 0) return 0;
  
  const avgBrightness = totalBrightness / pixelCount;
  
  // 適切な明度範囲（80-200）でスコア計算
  if (avgBrightness < 60 || avgBrightness > 220) {
    return 0;
  } else if (avgBrightness >= 80 && avgBrightness <= 180) {
    return 1.0;
  } else {
    // 範囲外は線形減衰
    const distance = Math.min(Math.abs(avgBrightness - 80), Math.abs(avgBrightness - 180));
    return Math.max(0, 1.0 - distance / 40);
  }
}

/**
 * ロゴエッジ検出
 */
function calculateLogoEdges(data: Buffer, width: number, height: number, channels: number, region: any): number {
  let edgePixels = 0;
  let totalPixels = 0;
  
  for (let y = region.y; y < Math.min(height - 1, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width - 1, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      
      const rightOffset = (y * width + (x + 1)) * channels;
      const belowOffset = ((y + 1) * width + x) * channels;
      
      const rightR = data[rightOffset];
      const belowR = data[belowOffset];
      
      const gradientMagnitude = Math.sqrt(
        Math.pow(r - rightR, 2) + Math.pow(r - belowR, 2)
      );
      
      if (gradientMagnitude > 25) {
        edgePixels++;
      }
      
      totalPixels++;
    }
  }
  
  return totalPixels > 0 ? Math.min(1.0, edgePixels / totalPixels * 3) : 0;
}

/**
 * 支配的色の取得
 */
function getDominantColor(data: Buffer, width: number, height: number, channels: number, region: any): string {
  const colorCounts: { [key: string]: number } = {};
  
  for (let y = region.y; y < Math.min(height, region.y + region.h); y += 3) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x += 3) {
      const pixelOffset = (y * width + x) * channels;
      const r = Math.floor(data[pixelOffset] / 32) * 32;
      const g = Math.floor(data[pixelOffset + 1] / 32) * 32;
      const b = Math.floor(data[pixelOffset + 2] / 32) * 32;
      
      const colorKey = `${r},${g},${b}`;
      colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
    }
  }
  
  let maxCount = 0;
  let dominantColor = '0,0,0';
  
  for (const [color, count] of Object.entries(colorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantColor = color;
    }
  }
  
  return dominantColor;
}

// コマンドライン実行
if (require.main === module) {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.log('使用方法: npx ts-node character-logo-detection.ts <画像パス>');
    process.exit(1);
  }

  detectCharacterLogos(imagePath).then(result => {
    console.log('\n🎮 キャラクターロゴ検出結果:');
    console.log(`📂 ファイル: ${result.filename}`);
    console.log(`🎯 UI存在: ${result.uiPresent ? '✅ YES' : '❌ NO'}`);
    console.log(`📊 ロゴスコア: ${(result.logoScore * 100).toFixed(1)}%`);
    console.log('\n📋 詳細分析:');
    console.log('   左ロゴ:');
    console.log(`     検出: ${result.details.leftLogo.detected ? '✅' : '❌'}`);
    console.log(`     スコア: ${(result.details.leftLogo.score * 100).toFixed(1)}%`);
    console.log(`     支配的色: RGB(${result.details.leftLogo.dominantColor})`);
    console.log(`     正方形度: ${(result.details.leftLogo.squareScore * 100).toFixed(1)}%`);
    console.log('   右ロゴ:');
    console.log(`     検出: ${result.details.rightLogo.detected ? '✅' : '❌'}`);
    console.log(`     スコア: ${(result.details.rightLogo.score * 100).toFixed(1)}%`);
    console.log(`     支配的色: RGB(${result.details.rightLogo.dominantColor})`);
    console.log(`     正方形度: ${(result.details.rightLogo.squareScore * 100).toFixed(1)}%`);
  }).catch(error => {
    console.error('エラー:', error);
    process.exit(1);
  });
}
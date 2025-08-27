#!/usr/bin/env node

import sharp from 'sharp';
// import { promises as fs } from 'fs'; // 未使用のため削除

interface UIAnalysisResult {
  filename: string;
  bottomUIPresent: boolean;
  bottomUIScore: number;
  edgeDensity: number;
  averageBrightness: number;
  colorVariance: number;
}

export async function analyzeUIRegion(imagePath: string): Promise<UIAnalysisResult> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  
  // 新しいUI検出：ダイヤモンド形台座に特化
  const results = {
    filename: imagePath.split('/').pop() || '',
    bottomUIPresent: false,
    bottomUIScore: 0,
    edgeDensity: 0,
    averageBrightness: 0,
    colorVariance: 0
  };
  
  // キャラクターアイコンのダイヤモンド形台座を検出
  const diamondScore = detectCharacterIconDiamond(data, width, height, channels);
  
  results.bottomUIScore = diamondScore;
  results.bottomUIPresent = diamondScore > 0.10; // さらに現実的な閾値
  results.edgeDensity = diamondScore;
  results.averageBrightness = calculateAverageBrightness(data, width, height, channels);
  results.colorVariance = calculateColorVariance(data, width, height, channels);
  
  return results;
}

function detectCharacterIconDiamond(data: Buffer, width: number, height: number, channels: number): number {
  // キャラクターアイコンは左下の固定位置にダイヤモンド形台座と共に表示
  // 解像度に依存しない相対座標を使用
  const region = {
    x: Math.floor(width * 0.01), // 左端から1%
    y: Math.floor(height * 0.75), // 上から75%（下から25%）
    w: Math.floor(width * 0.15), // 幅15%
    h: Math.floor(height * 0.22)  // 高さ22%
  };
  
  let diamondEdges = 0;
  let colorfulPixels = 0;
  let geometricPatterns = 0;
  let totalPixels = 0;
  
  const centerX = region.x + region.w / 2;
  const centerY = region.y + region.h / 2;
  
  for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      totalPixels++;
      
      // 1. ダイヤモンド形の対角線エッジを検出
      const relX = x - centerX;
      const relY = y - centerY;
      const manhattanDistance = Math.abs(relX) + Math.abs(relY);
      const diamondRadius = Math.min(region.w, region.h) * 0.3;
      
      // ダイヤモンド境界近くの強いエッジを検出
      if (Math.abs(manhattanDistance - diamondRadius) < 3) {
        if (x < width - 1 && y < height - 1) {
          const nextPixelOffset = (y * width + (x + 1)) * channels;
          const belowPixelOffset = ((y + 1) * width + x) * channels;
          
          const edgeStrength = Math.abs(r - data[nextPixelOffset]) + 
                             Math.abs(r - data[belowPixelOffset]);
          
          if (edgeStrength > 80) {
            diamondEdges++;
          }
        }
      }
      
      // 2. キャラクターアイコンの彩度の高い色を検出
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      
      if (saturation > 0.4 && max > 80) {
        colorfulPixels++;
      }
      
      // 3. ダイヤモンド内部の幾何学的パターン
      if (manhattanDistance < diamondRadius * 0.8) {
        const brightness = (r + g + b) / 3;
        if (brightness > 120 || saturation > 0.3) {
          geometricPatterns++;
        }
      }
    }
  }
  
  if (totalPixels === 0) return 0;
  
  const edgeRatio = diamondEdges / totalPixels;
  const colorRatio = colorfulPixels / totalPixels;
  const patternRatio = geometricPatterns / totalPixels;
  
  // 統合スコア：エッジ、色彩、パターンの組み合わせ
  return (edgeRatio * 0.4) + (colorRatio * 0.35) + (patternRatio * 0.25);
}

function detectDamagePercentage(data: Buffer, width: number, height: number, channels: number): number {
  // ダメージ%は通常画面下部の左右角に表示
  const regions = [
    // 左下角
    { x: 0, y: Math.floor(height * 0.8), w: Math.floor(width * 0.15), h: Math.floor(height * 0.2) },
    // 右下角  
    { x: Math.floor(width * 0.85), y: Math.floor(height * 0.8), w: Math.floor(width * 0.15), h: Math.floor(height * 0.2) }
  ];
  
  let maxScore = 0;
  
  for (const region of regions) {
    let whitePixels = 0;
    let totalPixels = 0;
    let sharpEdges = 0;
    
    for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
      for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
        const pixelOffset = (y * width + x) * channels;
        const r = data[pixelOffset];
        const g = data[pixelOffset + 1];
        const b = data[pixelOffset + 2];
        
        totalPixels++;
        
        // 白っぽい（テキスト色）ピクセルを検出
        if (r > 200 && g > 200 && b > 200) {
          whitePixels++;
        }
        
        // シャープなエッジ（文字の輪郭）を検出
        if (x < width - 1) {
          const nextPixelOffset = (y * width + (x + 1)) * channels;
          const nextR = data[nextPixelOffset];
          if (Math.abs(r - nextR) > 100) {
            sharpEdges++;
          }
        }
      }
    }
    
    if (totalPixels > 0) {
      const whiteRatio = whitePixels / totalPixels;
      const edgeRatio = sharpEdges / totalPixels;
      const regionScore = (whiteRatio * 0.6) + (edgeRatio * 0.4);
      maxScore = Math.max(maxScore, regionScore);
    }
  }
  
  return maxScore;
}

function detectStockIcons(data: Buffer, width: number, height: number, channels: number): number {
  // ストックアイコンは通常プレイヤー名の近くに表示
  const regions = [
    // 左下
    { x: 0, y: Math.floor(height * 0.85), w: Math.floor(width * 0.2), h: Math.floor(height * 0.15) },
    // 右下
    { x: Math.floor(width * 0.8), y: Math.floor(height * 0.85), w: Math.floor(width * 0.2), h: Math.floor(height * 0.15) }
  ];
  
  let maxScore = 0;
  
  for (const region of regions) {
    let colorfulPixels = 0;
    let totalPixels = 0;
    let circularPatterns = 0;
    
    for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
      for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
        const pixelOffset = (y * width + x) * channels;
        const r = data[pixelOffset];
        const g = data[pixelOffset + 1];
        const b = data[pixelOffset + 2];
        
        totalPixels++;
        
        // 彩度の高いピクセル（キャラクターアイコン色）
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        
        if (saturation > 0.3 && max > 100) {
          colorfulPixels++;
        }
        
        // 円形パターンの検出（簡易）
        const centerX = region.x + region.w / 2;
        const centerY = region.y + region.h / 2;
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        const radius = Math.min(region.w, region.h) / 4;
        
        if (distance < radius && saturation > 0.4) {
          circularPatterns++;
        }
      }
    }
    
    if (totalPixels > 0) {
      const colorRatio = colorfulPixels / totalPixels;
      const circularRatio = circularPatterns / totalPixels;
      const regionScore = (colorRatio * 0.7) + (circularRatio * 0.3);
      maxScore = Math.max(maxScore, regionScore);
    }
  }
  
  return maxScore;
}

function detectPlayerNames(data: Buffer, width: number, height: number, channels: number): number {
  // プレイヤー名は通常画面上部に表示されるが、kill-screen時に消失の可能性
  const region = {
    x: Math.floor(width * 0.2),
    y: 0,
    w: Math.floor(width * 0.6),
    h: Math.floor(height * 0.15)
  };
  
  let textPixels = 0;
  let totalPixels = 0;
  let rectangularEdges = 0;
  
  for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      totalPixels++;
      
      // テキスト色（白または高コントラスト）
      const brightness = (r + g + b) / 3;
      if (brightness > 180 || brightness < 50) {
        textPixels++;
      }
      
      // 矩形のエッジ（名前表示枠）
      if (x < width - 5) {
        let edgeStrength = 0;
        for (let dx = 1; dx <= 5; dx++) {
          const compareOffset = (y * width + (x + dx)) * channels;
          const compareR = data[compareOffset];
          edgeStrength += Math.abs(r - compareR);
        }
        if (edgeStrength > 200) {
          rectangularEdges++;
        }
      }
    }
  }
  
  if (totalPixels > 0) {
    const textRatio = textPixels / totalPixels;
    const edgeRatio = rectangularEdges / totalPixels;
    return (textRatio * 0.5) + (edgeRatio * 0.5);
  }
  
  return 0;
}

function detectGeneralUI(data: Buffer, width: number, height: number, channels: number): number {
  // 従来の一般的UI検出（下部20%）
  const uiRegionHeight = Math.floor(height * 0.2);
  const uiStartY = height - uiRegionHeight;
  
  let edgeCount = 0;
  let pixelCount = 0;
  
  for (let y = uiStartY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      
      pixelCount++;
      
      if (x < width - 1 && y < height - 1) {
        const nextPixelOffset = (y * width + (x + 1)) * channels;
        const belowPixelOffset = ((y + 1) * width + x) * channels;
        
        const nextR = data[nextPixelOffset];
        const belowR = data[belowPixelOffset];
        
        const gradientX = Math.abs(r - nextR);
        const gradientY = Math.abs(r - belowR);
        
        if (gradientX + gradientY > 50) {
          edgeCount++;
        }
      }
    }
  }
  
  return pixelCount > 0 ? edgeCount / pixelCount : 0;
}

function calculateAverageBrightness(data: Buffer, width: number, height: number, channels: number): number {
  const uiRegionHeight = Math.floor(height * 0.2);
  const uiStartY = height - uiRegionHeight;
  
  let totalBrightness = 0;
  let pixelCount = 0;
  
  for (let y = uiStartY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      totalBrightness += (r + g + b) / 3;
      pixelCount++;
    }
  }
  
  return pixelCount > 0 ? totalBrightness / pixelCount : 0;
}

function calculateColorVariance(data: Buffer, width: number, height: number, channels: number): number {
  const uiRegionHeight = Math.floor(height * 0.2);
  const uiStartY = height - uiRegionHeight;
  
  const colorValues: number[] = [];
  
  for (let y = uiStartY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelOffset = (y * width + x) * channels;
      colorValues.push(data[pixelOffset], data[pixelOffset + 1], data[pixelOffset + 2]);
    }
  }
  
  if (colorValues.length === 0) return 0;
  
  const avgColor = colorValues.reduce((sum, val) => sum + val, 0) / colorValues.length;
  const variance = colorValues.reduce((sum, val) => sum + Math.pow(val - avgColor, 2), 0) / colorValues.length;
  return Math.sqrt(variance);
}

async function analyzeMultipleImages(imagePaths: string[]): Promise<void> {
  console.log('🔍 UI領域分析を開始...\n');
  
  const results: UIAnalysisResult[] = [];
  
  for (const imagePath of imagePaths) {
    try {
      const result = await analyzeUIRegion(imagePath);
      results.push(result);
      
      console.log(`📊 ${result.filename}:`);
      console.log(`   UI存在: ${result.bottomUIPresent ? '✅ YES' : '❌ NO'}`);
      console.log(`   UIスコア: ${(result.bottomUIScore * 100).toFixed(1)}%`);
      console.log(`   エッジ密度: ${(result.edgeDensity * 1000).toFixed(1)}/1000`);
      console.log(`   平均明度: ${result.averageBrightness.toFixed(1)}`);
      console.log(`   色分散: ${result.colorVariance.toFixed(1)}\n`);
      
    } catch (error) {
      console.error(`❌ ${imagePath} の分析でエラー:`, error);
    }
  }
  
  // サマリー統計
  const uiPresentCount = results.filter(r => r.bottomUIPresent).length;
  const uiAbsentCount = results.length - uiPresentCount;
  
  console.log('📊 分析サマリー:');
  console.log(`   UI存在: ${uiPresentCount}/${results.length} (${Math.round(uiPresentCount/results.length*100)}%)`);
  console.log(`   UI消失: ${uiAbsentCount}/${results.length} (${Math.round(uiAbsentCount/results.length*100)}%)`);
  console.log(`   平均UIスコア: ${(results.reduce((sum, r) => sum + r.bottomUIScore, 0) / results.length * 100).toFixed(1)}%`);
}

// コマンドライン実行時
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('使用方法: ts-node ui-analysis.ts <画像パス1> [画像パス2] ...');
    process.exit(1);
  }
  
  analyzeMultipleImages(args).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
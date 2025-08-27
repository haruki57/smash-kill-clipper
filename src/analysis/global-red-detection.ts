#!/usr/bin/env node

import sharp from 'sharp';

interface GlobalRedResult {
  filename: string;
  isKillScreen: boolean;
  killScore: number;
  details: {
    globalRedCoverage: number;
    globalRedCoverageScore: number;
    redUniformity: number;
    redUniformityScore: number;
    redIntensity: number;
    redIntensityScore: number;
    nonRedArea: number;
    nonRedAreaScore: number;
  };
}

export async function detectGlobalRed(imagePath: string): Promise<GlobalRedResult> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  const totalPixels = width * height;
  
  // 画面を9つの領域に分割して全体的な赤色分布を確認
  const gridSize = 3;
  const cellWidth = Math.floor(width / gridSize);
  const cellHeight = Math.floor(height / gridSize);
  const redCells = [];
  
  let totalRedPixels = 0;
  const redIntensities = [];
  
  // 各セルで赤色の分析
  for (let gridY = 0; gridY < gridSize; gridY++) {
    for (let gridX = 0; gridX < gridSize; gridX++) {
      const startX = gridX * cellWidth;
      const startY = gridY * cellHeight;
      const endX = Math.min(startX + cellWidth, width);
      const endY = Math.min(startY + cellHeight, height);
      
      let cellRedPixels = 0;
      let cellTotalPixels = 0;
      let cellRedIntensity = 0;
      
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const pixelOffset = (y * width + x) * channels;
          const r = data[pixelOffset];
          const g = data[pixelOffset + 1];
          const b = data[pixelOffset + 2];
          
          cellTotalPixels++;
          
          // 赤色判定：赤が他の色より大きく、かつ一定以上の明度
          if (r > g && r > b && r > 100) {
            cellRedPixels++;
            totalRedPixels++;
            const redIntensity = r - Math.max(g, b);
            cellRedIntensity += redIntensity;
            redIntensities.push(redIntensity);
          }
        }
      }
      
      const cellRedRatio = cellTotalPixels > 0 ? cellRedPixels / cellTotalPixels : 0;
      redCells.push({
        x: gridX,
        y: gridY,
        redRatio: cellRedRatio,
        avgRedIntensity: cellRedPixels > 0 ? cellRedIntensity / cellRedPixels : 0
      });
    }
  }
  
  // 1. 全体的な赤色カバー率
  const globalRedCoverage = totalRedPixels / totalPixels;
  const globalRedCoverageScore = Math.min(1.0, globalRedCoverage * 2); // 50%以上で満点
  
  // 2. 赤色の均一性（全セルが赤い場合に高スコア）
  const redCellCount = redCells.filter(cell => cell.redRatio > 0.3).length;
  const redUniformity = redCellCount / (gridSize * gridSize);
  const redUniformityScore = redUniformity;
  
  // 3. 赤色の強度（赤色ピクセルがどの程度鮮やかな赤か）
  const avgRedIntensity = redIntensities.length > 0 ? 
    redIntensities.reduce((sum, intensity) => sum + intensity, 0) / redIntensities.length : 0;
  const redIntensityScore = Math.min(1.0, avgRedIntensity / 100); // 強度100以上で満点
  
  // 4. 非赤色領域の少なさ（撃墜シーンでは画面のほとんどが赤くなる）
  const nonRedArea = 1 - globalRedCoverage;
  const nonRedAreaScore = Math.max(0, 1 - nonRedArea * 3); // 非赤色が33%以下で満点
  
  // 総合スコア：全体の赤色化を最重視
  const killScore = 
    globalRedCoverageScore * 0.4 +  // 全体赤色カバー率が最重要
    redUniformityScore * 0.3 +      // 均一な赤色分布
    redIntensityScore * 0.2 +       // 赤色の強度
    nonRedAreaScore * 0.1;          // 非赤色領域の少なさ
  
  return {
    filename: imagePath.split('/').pop() || '',
    isKillScreen: killScore > 0.8, // より厳しい閾値
    killScore,
    details: {
      globalRedCoverage,
      globalRedCoverageScore,
      redUniformity,
      redUniformityScore,
      redIntensity: avgRedIntensity,
      redIntensityScore,
      nonRedArea,
      nonRedAreaScore
    }
  };
}

// コマンドライン実行
if (require.main === module) {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.log('使用方法: npx ts-node global-red-detection.ts <画像パス>');
    process.exit(1);
  }

  detectGlobalRed(imagePath).then(result => {
    console.log('\n🔴 全体赤色化検出結果:');
    console.log(`📂 ファイル: ${result.filename}`);
    console.log(`🎯 撃墜シーン: ${result.isKillScreen ? '✅ YES' : '❌ NO'}`);
    console.log(`📊 撃墜スコア: ${(result.killScore * 100).toFixed(1)}%`);
    console.log('\n📋 詳細分析:');
    console.log(`   全体赤色カバー率: ${(result.details.globalRedCoverage * 100).toFixed(1)}% (${(result.details.globalRedCoverageScore * 100).toFixed(1)}%)`);
    console.log(`   赤色均一性: ${(result.details.redUniformity * 100).toFixed(1)}% (${(result.details.redUniformityScore * 100).toFixed(1)}%)`);
    console.log(`   赤色強度: ${result.details.redIntensity.toFixed(1)} (${(result.details.redIntensityScore * 100).toFixed(1)}%)`);
    console.log(`   非赤色領域: ${(result.details.nonRedArea * 100).toFixed(1)}% (${(result.details.nonRedAreaScore * 100).toFixed(1)}%)`);
  }).catch(error => {
    console.error('エラー:', error);
    process.exit(1);
  });
}
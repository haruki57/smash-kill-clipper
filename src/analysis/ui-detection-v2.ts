#!/usr/bin/env node

import sharp from 'sharp';

interface UIDetectionResult {
  filename: string;
  uiPresent: boolean;
  uiScore: number;
  components: {
    damageNumbers: number;    // ダメージ数値（最重要）
    stockIcons: number;       // ストックアイコン
    playerFrames: number;     // プレイヤー枠・背景
    timer: number;            // タイマー表示
    bottomHUD: number;        // 下部HUD全体
  };
  analysis: {
    totalUIPixels: number;
    expectedUIPixels: number;
    uiDensity: number;
  };
}

export async function detectUI(imagePath: string): Promise<UIDetectionResult> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  
  const components = {
    damageNumbers: detectDamageNumbers(data, width, height, channels),
    stockIcons: detectStockIcons(data, width, height, channels), 
    playerFrames: detectPlayerFrames(data, width, height, channels),
    timer: detectTimer(data, width, height, channels),
    bottomHUD: detectBottomHUD(data, width, height, channels)
  };

  // 重み付き統合スコア
  const weights = {
    damageNumbers: 0.4,    // ダメージ数値は最も重要
    stockIcons: 0.2,       
    playerFrames: 0.2,     
    timer: 0.1,           
    bottomHUD: 0.1        
  };

  const uiScore = 
    components.damageNumbers * weights.damageNumbers +
    components.stockIcons * weights.stockIcons +
    components.playerFrames * weights.playerFrames +
    components.timer * weights.timer +
    components.bottomHUD * weights.bottomHUD;

  const analysis = analyzeUIPixels(data, width, height, channels);
  
  return {
    filename: imagePath.split('/').pop() || '',
    uiPresent: uiScore > 0.2, // 現実的な閾値
    uiScore,
    components,
    analysis
  };
}

/**
 * ダメージ数値検出（最重要）
 * 白い数字 + % マークの検出
 */
function detectDamageNumbers(data: Buffer, width: number, height: number, channels: number): number {
  // ダメージ表示領域（下部中央付近を広めに）
  const regions = [
    { x: Math.floor(width * 0.1), y: Math.floor(height * 0.7), w: Math.floor(width * 0.35), h: Math.floor(height * 0.25) },
    { x: Math.floor(width * 0.55), y: Math.floor(height * 0.7), w: Math.floor(width * 0.35), h: Math.floor(height * 0.25) }
  ];

  let maxScore = 0;

  for (const region of regions) {
    let whiteTextPixels = 0;
    let coloredBackgrounds = 0;  
    let strongContrast = 0;
    let percentSymbols = 0;
    let totalPixels = 0;

    for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
      for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
        const pixelOffset = (y * width + x) * channels;
        const r = data[pixelOffset];
        const g = data[pixelOffset + 1];
        const b = data[pixelOffset + 2];
        
        totalPixels++;
        
        const brightness = (r + g + b) / 3;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        
        // 高輝度の白い文字（ダメージ数値）- 閾値を下げて柔軟に
        if (brightness > 150) {
          const colorVariance = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
          if (colorVariance < 80) { // より柔軟な白色判定
            whiteTextPixels++;
          }
        }
        
        // 彩度の高い背景色（赤・青のプレイヤー色）
        if (saturation > 0.6 && brightness > 50) {
          coloredBackgrounds++;
        }
        
        // 強いコントラスト（文字と背景の境界）
        if (x < width - 1) {
          const nextPixelOffset = (y * width + (x + 1)) * channels;
          const nextBrightness = (data[nextPixelOffset] + data[nextPixelOffset + 1] + data[nextPixelOffset + 2]) / 3;
          if (Math.abs(brightness - nextBrightness) > 120) {
            strongContrast++;
          }
        }
        
        // % 記号検出（より柔軟に）
        if (brightness > 150) {
          // 周辺との明度差が大きい場合
          let contrastCount = 0;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (dx === 0 && dy === 0) continue;
              if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
                const neighborOffset = ((y + dy) * width + (x + dx)) * channels;
                const neighborBrightness = (data[neighborOffset] + data[neighborOffset + 1] + data[neighborOffset + 2]) / 3;
                if (Math.abs(brightness - neighborBrightness) > 80) {
                  contrastCount++;
                }
              }
            }
          }
          if (contrastCount >= 4) percentSymbols++;
        }
      }
    }

    if (totalPixels > 0) {
      const textRatio = whiteTextPixels / totalPixels;
      const backgroundRatio = coloredBackgrounds / totalPixels;
      const contrastRatio = strongContrast / totalPixels;
      const symbolRatio = percentSymbols / totalPixels;
      
      // ダメージ表示スコア（白文字+色背景+コントラスト）
      const score = (textRatio * 0.3) + (backgroundRatio * 0.3) + (contrastRatio * 0.3) + (symbolRatio * 0.1);
      maxScore = Math.max(maxScore, score);
    }
  }

  return Math.min(1.0, maxScore * 2); // スコア調整
}

/**
 * ストックアイコン検出
 * 小さな円形キャラクターアイコンの検出
 */
function detectStockIcons(data: Buffer, width: number, height: number, channels: number): number {
  const regions = [
    { x: Math.floor(width * 0.0), y: Math.floor(height * 0.82), w: Math.floor(width * 0.25), h: Math.floor(height * 0.15) },
    { x: Math.floor(width * 0.75), y: Math.floor(height * 0.82), w: Math.floor(width * 0.25), h: Math.floor(height * 0.15) }
  ];

  let maxScore = 0;

  for (const region of regions) {
    let coloredCircles = 0;
    let totalPixels = 0;
    
    const centerX = region.x + region.w / 2;
    const centerY = region.y + region.h / 2;
    const radius = Math.min(region.w, region.h) / 8;

    for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
      for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
        const pixelOffset = (y * width + x) * channels;
        const r = data[pixelOffset];
        const g = data[pixelOffset + 1];
        const b = data[pixelOffset + 2];
        
        totalPixels++;
        
        // 円形領域内の彩度の高い色を検出
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (distance < radius * 2) {
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          
          if (saturation > 0.5 && max > 100) {
            coloredCircles++;
          }
        }
      }
    }

    if (totalPixels > 0) {
      maxScore = Math.max(maxScore, coloredCircles / totalPixels);
    }
  }

  return Math.min(1.0, maxScore * 8); // スコア強調
}

/**
 * プレイヤー枠検出
 * キャラクター背景の角丸矩形枠
 */
function detectPlayerFrames(data: Buffer, width: number, height: number, channels: number): number {
  const regions = [
    { x: 0, y: Math.floor(height * 0.75), w: Math.floor(width * 0.25), h: Math.floor(height * 0.25) },
    { x: Math.floor(width * 0.75), y: Math.floor(height * 0.75), w: Math.floor(width * 0.25), h: Math.floor(height * 0.25) }
  ];

  let maxScore = 0;

  for (const region of regions) {
    let frameEdges = 0;
    let totalPixels = 0;

    // 枠の境界線を検出
    for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
      for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
        const pixelOffset = (y * width + x) * channels;
        totalPixels++;

        // 枠らしいエッジ検出
        if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
          const current = (data[pixelOffset] + data[pixelOffset + 1] + data[pixelOffset + 2]) / 3;
          const right = (data[(y * width + (x + 1)) * channels] + 
                        data[(y * width + (x + 1)) * channels + 1] + 
                        data[(y * width + (x + 1)) * channels + 2]) / 3;
          const below = (data[((y + 1) * width + x) * channels] + 
                        data[((y + 1) * width + x) * channels + 1] + 
                        data[((y + 1) * width + x) * channels + 2]) / 3;

          if (Math.abs(current - right) > 50 || Math.abs(current - below) > 50) {
            frameEdges++;
          }
        }
      }
    }

    if (totalPixels > 0) {
      maxScore = Math.max(maxScore, frameEdges / totalPixels);
    }
  }

  return Math.min(1.0, maxScore * 4);
}

/**
 * タイマー検出
 * 上部中央の時間表示
 */
function detectTimer(data: Buffer, width: number, height: number, channels: number): number {
  const region = {
    x: Math.floor(width * 0.4),
    y: 0,
    w: Math.floor(width * 0.2),
    h: Math.floor(height * 0.15)
  };

  let whiteText = 0;
  let colonSymbol = 0;
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
      
      // 白いテキスト検出
      if (brightness > 200 && colorDiff < 20) {
        whiteText++;
      }

      // コロン(:)検出（垂直に並んだ2つの点）
      if (brightness > 180 && y < height - 4) {
        const below2 = ((y + 2) * width + x) * channels;
        const below4 = ((y + 4) * width + x) * channels;
        const belowBright2 = (data[below2] + data[below2 + 1] + data[below2 + 2]) / 3;
        const belowBright4 = (data[below4] + data[below4 + 1] + data[below4 + 2]) / 3;
        
        if (belowBright2 < 100 && belowBright4 > 180) {
          colonSymbol++;
        }
      }
    }
  }

  if (totalPixels > 0) {
    const textRatio = whiteText / totalPixels;
    const colonRatio = colonSymbol / totalPixels;
    return Math.min(1.0, (textRatio * 0.8) + (colonRatio * 0.2));
  }

  return 0;
}

/**
 * 下部HUD全体検出
 * UI密度による判定
 */
function detectBottomHUD(data: Buffer, width: number, height: number, channels: number): number {
  const region = {
    x: 0,
    y: Math.floor(height * 0.8),
    w: width,
    h: Math.floor(height * 0.2)
  };

  let uiLikePixels = 0;
  let totalPixels = 0;

  for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
    for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
      const pixelOffset = (y * width + x) * channels;
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      
      totalPixels++;
      
      // UIらしい特徴：高輝度、低彩度、または強いエッジ
      const brightness = (r + g + b) / 3;
      const colorDiff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
      
      // 白っぽいUI要素
      if (brightness > 180 && colorDiff < 40) {
        uiLikePixels++;
      }
      
      // 強いエッジ（UI境界）
      if (x < width - 1) {
        const nextPixel = (y * width + (x + 1)) * channels;
        const nextBrightness = (data[nextPixel] + data[nextPixel + 1] + data[nextPixel + 2]) / 3;
        if (Math.abs(brightness - nextBrightness) > 80) {
          uiLikePixels++;
        }
      }
    }
  }

  return totalPixels > 0 ? Math.min(1.0, uiLikePixels / totalPixels) : 0;
}

/**
 * UI密度分析
 */
function analyzeUIPixels(data: Buffer, width: number, height: number, channels: number) {
  const totalPixels = width * height;
  let uiPixels = 0;

  // 全画面のUI密度計算
  for (let i = 0; i < totalPixels; i++) {
    const pixelOffset = i * channels;
    const r = data[pixelOffset];
    const g = data[pixelOffset + 1];
    const b = data[pixelOffset + 2];
    
    const brightness = (r + g + b) / 3;
    const colorDiff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
    
    // UIらしいピクセル（白っぽい、または強いコントラスト）
    if ((brightness > 180 && colorDiff < 50) || brightness < 30) {
      uiPixels++;
    }
  }

  // 通常時のUI要素は画面の5-15%程度を占める
  const expectedUIPixels = totalPixels * 0.1; // 10%を期待値とする
  const uiDensity = uiPixels / totalPixels;

  return {
    totalUIPixels: uiPixels,
    expectedUIPixels: Math.floor(expectedUIPixels),
    uiDensity
  };
}

// コマンドライン実行
if (require.main === module) {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.log('使用方法: npx ts-node ui-detection-v2.ts <画像パス>');
    process.exit(1);
  }

  detectUI(imagePath).then(result => {
    console.log('\n🔍 高精度UI検出結果:');
    console.log(`📂 ファイル: ${result.filename}`);
    console.log(`🎯 UI存在: ${result.uiPresent ? '✅ YES' : '❌ NO'}`);
    console.log(`📊 総合スコア: ${(result.uiScore * 100).toFixed(1)}%`);
    console.log('\n📋 詳細コンポーネント:');
    console.log(`   ダメージ数値: ${(result.components.damageNumbers * 100).toFixed(1)}%`);
    console.log(`   ストックアイコン: ${(result.components.stockIcons * 100).toFixed(1)}%`);
    console.log(`   プレイヤー枠: ${(result.components.playerFrames * 100).toFixed(1)}%`);
    console.log(`   タイマー: ${(result.components.timer * 100).toFixed(1)}%`);
    console.log(`   下部HUD: ${(result.components.bottomHUD * 100).toFixed(1)}%`);
    console.log('\n🔬 UI密度分析:');
    console.log(`   UI密度: ${(result.analysis.uiDensity * 100).toFixed(1)}%`);
    console.log(`   期待UI密度: ${(result.analysis.expectedUIPixels / (result.analysis.totalUIPixels + result.analysis.expectedUIPixels) * 100).toFixed(1)}%`);
  }).catch(error => {
    console.error('エラー:', error);
    process.exit(1);
  });
}
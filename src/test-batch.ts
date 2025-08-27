#!/usr/bin/env node

import { KillScreenDetector } from './detection/detector';
import { promises as fs } from 'fs';
import path from 'path';

interface TestResult {
  filename: string;
  isKillScreen: boolean;
  confidence: number;
}

async function testAllImages(): Promise<void> {
  console.log('🔍 全画像の Kill-Screen 検出バッチテストを開始...\n');
  
  const templatesDir = path.join(process.cwd(), 'assets', 'kill-screen-templates');
  
  try {
    const files = await fs.readdir(templatesDir);
    const pngFiles = files.filter(f => f.endsWith('.png')).sort();
    
    console.log(`📂 対象ファイル数: ${pngFiles.length}\n`);
    
    const detector = new KillScreenDetector();
    const results: TestResult[] = [];
    
    for (let i = 0; i < pngFiles.length; i++) {
      const filename = pngFiles[i];
      const imagePath = path.join(templatesDir, filename);
      
      console.log(`[${i + 1}/${pngFiles.length}] ${filename}`);
      
      try {
        const result = await detector.detectKillScreen(imagePath, i);
        results.push({
          filename,
          isKillScreen: result.isKillScreen,
          confidence: result.confidence
        });
        
        const status = result.isKillScreen ? '✅ KILL-SCREEN' : '❌ NORMAL';
        const confidencePercent = Math.round(result.confidence * 100);
        console.log(`    ${status} (信頼度: ${confidencePercent}%)\n`);
        
      } catch (error) {
        console.error(`    ❌ エラー: ${error}\n`);
        results.push({
          filename,
          isKillScreen: false,
          confidence: 0
        });
      }
    }
    
    // 結果サマリー
    console.log('📊 テスト結果サマリー:');
    console.log('='.repeat(50));
    
    const killScreenCount = results.filter(r => r.isKillScreen).length;
    const normalCount = results.length - killScreenCount;
    
    console.log(`Kill-Screen検出: ${killScreenCount}/${results.length} (${Math.round(killScreenCount/results.length*100)}%)`);
    console.log(`通常画面: ${normalCount}/${results.length} (${Math.round(normalCount/results.length*100)}%)\n`);
    
    // 信頼度別分析
    const highConfidence = results.filter(r => r.confidence >= 0.7).length;
    const mediumConfidence = results.filter(r => r.confidence >= 0.5 && r.confidence < 0.7).length;
    const lowConfidence = results.filter(r => r.confidence >= 0.3 && r.confidence < 0.5).length;
    const veryLowConfidence = results.filter(r => r.confidence < 0.3).length;
    
    console.log('信頼度分布:');
    console.log(`  高信頼度 (70%+): ${highConfidence}件`);
    console.log(`  中信頼度 (50-69%): ${mediumConfidence}件`);
    console.log(`  低信頼度 (30-49%): ${lowConfidence}件`);
    console.log(`  極低信頼度 (<30%): ${veryLowConfidence}件\n`);
    
    // Kill-Screen検出されたファイル一覧
    const killScreenFiles = results.filter(r => r.isKillScreen);
    if (killScreenFiles.length > 0) {
      console.log('🎯 Kill-Screen検出ファイル:');
      killScreenFiles
        .sort((a, b) => b.confidence - a.confidence)
        .forEach(result => {
          console.log(`  ${result.filename}: ${Math.round(result.confidence * 100)}%`);
        });
      console.log();
    }
    
    // 検出されなかったファイル一覧
    const normalFiles = results.filter(r => !r.isKillScreen);
    if (normalFiles.length > 0) {
      console.log('📋 通常画面ファイル:');
      normalFiles
        .sort((a, b) => b.confidence - a.confidence)
        .forEach(result => {
          console.log(`  ${result.filename}: ${Math.round(result.confidence * 100)}%`);
        });
    }
    
  } catch (error) {
    console.error('❌ バッチテストでエラーが発生しました:', error);
  }
}

testAllImages();
#!/usr/bin/env node

import { detectCharacterLogos } from './analysis/character-logo-detection';
import { detectKillEffect } from './analysis/kill-effect-detection';
import { detectWithSimpleStats } from './analysis/simple-stats-detection';
import { detectGlobalRed } from './analysis/global-red-detection';
import path from 'path';
import fs from 'fs-extra';
import * as glob from 'glob';

interface TestResult {
  filename: string;
  predicted: boolean;
  actual: boolean;
  score: number;
  correct: boolean;
}

interface PerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  total: number;
}

async function runPerformanceTest(method: string = 'character-logo'): Promise<void> {
  console.log(`🧪 撃墜画面検出システム - 性能テスト開始 (${method})`);
  
  // 撃墜シーン画像を取得（true cases）
  const killScreens = glob.sync('assets/test-images/kill-screens/*.png');
  console.log(`📊 撃墜シーン画像: ${killScreens.length}枚`);
  
  // 非撃墜シーン画像を取得（false cases）
  const nonKillScreens = glob.sync('assets/test-images/non-kill-screens/*.png');
  console.log(`📊 非撃墜シーン画像: ${nonKillScreens.length}枚`);
  
  const results: TestResult[] = [];
  
  // 撃墜シーンをテスト
  console.log('\n🎯 撃墜シーンテスト中...');
  for (const imagePath of killScreens) {
    try {
      let predicted: boolean;
      let score: number;
      
      if (method === 'kill-effect') {
        const detection = await detectKillEffect(imagePath);
        predicted = detection.isKillScreen;
        score = detection.killScore;
      } else if (method === 'simple-stats') {
        const detection = await detectWithSimpleStats(imagePath);
        predicted = detection.isKillScreen;
        score = detection.killScore;
      } else if (method === 'global-red') {
        const detection = await detectGlobalRed(imagePath);
        predicted = detection.isKillScreen;
        score = detection.killScore;
      } else {
        const detection = await detectCharacterLogos(imagePath);
        predicted = !detection.uiPresent; // UI不在 = 撃墜シーン
        score = detection.logoScore;
      }
      
      const filename = path.basename(imagePath);
      
      results.push({
        filename,
        predicted,
        actual: true,
        score,
        correct: predicted === true
      });
      
      process.stdout.write('.');
    } catch (error) {
      console.error(`\n❌ エラー: ${imagePath}`, error);
    }
  }
  
  // 非撃墜シーンをテスト
  console.log('\n🚫 非撃墜シーンテスト中...');
  for (const imagePath of nonKillScreens) {
    try {
      let predicted: boolean;
      let score: number;
      
      if (method === 'kill-effect') {
        const detection = await detectKillEffect(imagePath);
        predicted = detection.isKillScreen;
        score = detection.killScore;
      } else if (method === 'simple-stats') {
        const detection = await detectWithSimpleStats(imagePath);
        predicted = detection.isKillScreen;
        score = detection.killScore;
      } else if (method === 'global-red') {
        const detection = await detectGlobalRed(imagePath);
        predicted = detection.isKillScreen;
        score = detection.killScore;
      } else {
        const detection = await detectCharacterLogos(imagePath);
        predicted = !detection.uiPresent; // UI不在 = 撃墜シーン
        score = detection.logoScore;
      }
      
      const filename = path.basename(imagePath);
      
      results.push({
        filename,
        predicted,
        actual: false,
        score,
        correct: predicted === false
      });
      
      process.stdout.write('.');
    } catch (error) {
      console.error(`\n❌ エラー: ${imagePath}`, error);
    }
  }
  
  console.log('\n\n📈 結果集計中...');
  
  // 性能指標を計算
  const metrics = calculateMetrics(results);
  
  // 結果表示
  displayResults(results, metrics);
  
  // 詳細結果をJSONに保存
  const outputPath = 'test-results.json';
  await fs.writeJSON(outputPath, { results, metrics }, { spaces: 2 });
  console.log(`\n💾 詳細結果を ${outputPath} に保存しました`);
}

function calculateMetrics(results: TestResult[]): PerformanceMetrics {
  const truePositives = results.filter(r => r.actual === true && r.predicted === true).length;
  const falsePositives = results.filter(r => r.actual === false && r.predicted === true).length;
  const trueNegatives = results.filter(r => r.actual === false && r.predicted === false).length;
  const falseNegatives = results.filter(r => r.actual === true && r.predicted === false).length;
  const total = results.length;
  
  const accuracy = (truePositives + trueNegatives) / total;
  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  
  return {
    accuracy,
    precision,
    recall,
    f1Score,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    total
  };
}

function displayResults(results: TestResult[], metrics: PerformanceMetrics): void {
  console.log('='.repeat(50));
  console.log('📊 性能テスト結果');
  console.log('='.repeat(50));
  
  console.log(`\n🎯 基本統計:`);
  console.log(`   総テスト数: ${metrics.total}`);
  console.log(`   正解数: ${metrics.truePositives + metrics.trueNegatives}`);
  console.log(`   不正解数: ${metrics.falsePositives + metrics.falseNegatives}`);
  
  console.log(`\n📈 性能指標:`);
  console.log(`   精度 (Accuracy):  ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`   適合率 (Precision): ${(metrics.precision * 100).toFixed(1)}%`);
  console.log(`   再現率 (Recall):    ${(metrics.recall * 100).toFixed(1)}%`);
  console.log(`   F1スコア:          ${(metrics.f1Score * 100).toFixed(1)}%`);
  
  console.log(`\n🔍 混同行列:`);
  console.log(`                    予測`);
  console.log(`               撃墜   非撃墜`);
  console.log(`   実際 撃墜   ${metrics.truePositives.toString().padStart(3)}    ${metrics.falseNegatives.toString().padStart(3)}`);
  console.log(`      非撃墜   ${metrics.falsePositives.toString().padStart(3)}    ${metrics.trueNegatives.toString().padStart(3)}`);
  
  // 誤分類の詳細
  const misclassified = results.filter(r => !r.correct);
  if (misclassified.length > 0) {
    console.log(`\n❌ 誤分類された画像 (${misclassified.length}件):`);
    misclassified.forEach(result => {
      const type = result.actual ? '撃墜→非撃墜' : '非撃墜→撃墜';
      console.log(`   ${result.filename} (${type}, スコア: ${(result.score * 100).toFixed(1)}%)`);
    });
  }
}

// 実行
if (require.main === module) {
  const method = process.argv[2] || 'character-logo';
  runPerformanceTest(method).catch(error => {
    console.error('テスト実行エラー:', error);
    process.exit(1);
  });
}
# Assets Directory Structure

## Overview

このディレクトリは、撃墜画面検出システムのテスト・検証用画像とサンプルファイルを整理して格納します。

## Directory Structure

```
assets/
├── README.md                     # このファイル
├── test-images/                  # テスト用画像（分類済み）
│   ├── kill-screens/             # 撃墜シーン（検出したい画像）
│   ├── non-kill-screens/         # 撃墜シーン以外（検出したくない画像）
│   └── unverified/               # 未分類・検証待ち
├── kill-screen-templates/        # 既存のサンプル画像（整理対象）
└── sample-videos/                # テスト用動画ファイル
```

## Test Images Categories

### 1. Kill Screens (`test-images/kill-screens/`)

**目的**: 撃墜シーン - 検出システムが「YES」と判定すべき画像

**含まれるもの**:
- ✅ スマブラの撃墜演出画面
- ✅ 派手な撃墜エフェクト
- ✅ 画面全体が明るいエフェクトで覆われている
- ✅ UI要素が消失/隠れている撃墜瞬間

**ファイル命名規則**:
```
kill_{index}.png
例: kill_001.png, kill_002.png
```

### 2. Non-Kill Screens (`test-images/non-kill-screens/`)

**目的**: 撃墜シーン以外 - 検出システムが「NO」と判定すべき画像

**含まれるもの**:
- ✅ 通常のスマブラゲームプレイ画面
- ✅ 実況者・解説者の映像
- ✅ 観客席・大会ロゴ・スポンサー画像
- ✅ リプレイ・ポーズ画面・メニュー画面
- ✅ キャラクター選択・結果発表画面
- ✅ その他すべての非撃墜シーン

**ファイル命名規則**:
```
non_kill_{type}_{index}.png
例: non_kill_gameplay_001.png
    non_kill_commentator_001.png
    non_kill_menu_001.png
```

### 3. Unverified (`test-images/unverified/`)

**目的**: 新しく追加された画像の一時的な格納場所。手動での分類待ち。

**用途**:
- 動画から抽出された新しいフレーム
- 他ディレクトリからの移行待ち画像
- 分類が不明確な画像

## Current Status & Migration Plan

### 既存ファイルの現状

**`kill-screen-templates/`** に以下のファイルが存在:
- `kagaribi13_screenshot_*.png` (34枚) - 撃墜シーン連続フレーム
- `false/false_positive_*.png` (31枚) - False positive用サンプル

### Migration Tasks

#### Phase 1: Manual Classification (手動分類)
1. **`kagaribi13_screenshot_*.png` の分類**
   - 各画像を目視確認
   - UI要素の存在/消失を判定  
   - 適切なカテゴリに移動

2. **`false_positive_*.png` の検証**
   - 実際にfalse positiveなのか確認
   - UIが存在する場合は `ui-present/` へ移動
   - UIが消失している場合は `ui-absent/` へ移動

#### Phase 2: Gap Analysis (不足分析)
1. **各カテゴリの必要数チェック**
   - ui-present: 最低10枚（様々なキャラクター・ステージ）
   - ui-absent: 最低10枚（確実なUI消失）
   - boundary-cases: 5枚以上

2. **不足分の新規収集**
   - 実動画からの追加抽出
   - 多様なキャラクター組み合わせ
   - 異なるステージでのサンプル

## Quality Standards

### Image Requirements
- **解像度**: 1280x720 (HD) または 1920x1080 (Full HD)
- **フォーマット**: PNG（非圧縮）
- **色深度**: 24bit RGB
- **UI可視性**: 目視で明確に判別可能

### Metadata Requirements
各画像には以下の情報をファイル名またはメタデータに含める:
- キャラクター組み合わせ
- ステージ名（分かる場合）
- UI状態の分類
- 抽出元動画の情報（タイムスタンプ等）

## Testing Workflow

### 1. Algorithm Testing
```bash
# 単体画像テスト
npx ts-node src/analysis/character-logo-detection.ts assets/test-images/ui-present/sample.png

# カテゴリ別バッチテスト  
npx ts-node src/test-batch.ts "assets/test-images/ui-present/*.png"
npx ts-node src/test-batch.ts "assets/test-images/ui-absent/*.png"
```

### 2. Performance Evaluation
- **Precision**: ui-absent画像での正解率
- **Recall**: ui-present画像での正解率  
- **F1-Score**: 総合的な性能指標
- **Boundary Accuracy**: 境界線ケースでの適切な処理

### 3. Cross-Validation
- 異なるキャラクター組み合わせでの性能
- 様々なステージ背景での安定性
- 解像度の違いによる影響

## Contribution Guidelines

### 新しい画像の追加
1. 適切なカテゴリに分類
2. 命名規則に従ったファイル名
3. 品質基準を満たすことを確認
4. 既存画像との重複チェック

### 画像の品質チェック
```bash
# 画像情報確認
identify assets/test-images/ui-present/*.png

# バッチでの品質チェック
npx ts-node scripts/validate-test-images.ts
```

## Next Steps

1. **既存画像の手動分類** (Priority: High)
2. **不足分の特定と収集** (Priority: High)  
3. **品質基準の自動チェックスクリプト作成** (Priority: Medium)
4. **メタデータ管理システムの構築** (Priority: Low)

---

**Note**: このディレクトリ構造は、撃墜画面検出アルゴリズムの精度向上のために設計されています。適切な分類とサンプルの多様性が、システムの性能に直接影響します。
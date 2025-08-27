# Smash Kill Clipper

スマブラSPの動画からkill-screen（撃墜演出）シーンを自動抽出し、ハイライト動画を作成するTypeScript製CLIツールです。

## 特徴

- 🎯 **高精度なkill-screen検出**（全体赤色化検出アルゴリズム - F1スコア76.5%）
- ✂️ **2段階ワークフロー**（検出→確認・編集→動画生成）
- 🖼️ **検出結果可視化**（検出された画像を保存して確認可能）
- 🎛️ **柔軟な設定オプション**（前後の秒数、信頼度閾値など）
- 🚀 **高速処理**（Sharp画像処理 + 並列処理対応）

## インストール

```bash
npm install
```

## 使用方法

### Step 1: Kill-screen検出（検出された画像も確認可能）

```bash
npx ts-node src/detect-only.ts input_video.mp4 --save-images
```

### Step 2: 検出結果を確認・編集

生成されたJSONファイルと `detected_kill_screens/` フォルダ内の画像を確認し、必要に応じて編集。

### Step 3: 動画生成

```bash
npx ts-node src/generate-video.ts input_video_detections.json
```

## コマンドオプション

### detect-only.ts

- `-o, --output <path>`: 出力JSONファイルパス
- `-t, --threshold <value>`: 検出の信頼度閾値 0-1（デフォルト: 0.8）
- `-b, --before <seconds>`: kill-screen前に含める秒数（デフォルト: 3秒）
- `-a, --after <seconds>`: kill-screen後に含める秒数（デフォルト: 2秒）
- `--save-images`: 検出された撃墜シーン画像を保存
- `--min-detections <value>`: 最小連続検出数（デフォルト: 2）

### generate-video.ts

- `-i, --input <path>`: 入力動画パスを上書き
- `-o, --output <path>`: 出力動画ファイルパス

## 検出アルゴリズム

**全体赤色化検出アルゴリズム**を使用し、kill-screenの「画面全体が赤くなる」特徴を活用：

1. **グリッド分析**: 画面を9領域に分割し、各領域の赤色分布を分析
2. **全体赤色カバー率**: 画面全体での赤色ピクセルの割合（40%重み）
3. **赤色均一性**: 全領域での赤色分布の一様性（30%重み）
4. **赤色強度**: 赤色ピクセルの鮮やかさ（20%重み）
5. **非赤色領域の少なさ**: 赤以外の色の領域の少なさ（10%重み）

**性能指標:**
- 精度: 80.4%
- F1スコア: 76.5%
- 再現率: 91.2%（撃墜シーンの91%を検出）
- 適合率: 66.0%（検出の2/3が正確）

## 必要な依存関係

- Node.js (v16以上)
- FFmpeg（システムにインストールされている必要があります）
- Sharp（高速画像処理ライブラリ）

## プロジェクト構造

```
src/
├── detect-only.ts              # 検出専用コマンド
├── generate-video.ts           # 動画生成コマンド
├── test-performance.ts         # 性能テストツール
├── video/
│   └── processor.ts           # 動画処理クラス（FFmpeg操作）
├── detection/
│   └── detector.ts            # kill-screen検出クラス
├── analysis/                  # 検出アルゴリズム
│   ├── global-red-detection.ts    # 全体赤色化検出（最新）
│   ├── simple-stats-detection.ts # シンプル統計検出
│   ├── kill-effect-detection.ts  # エフェクト検出
│   └── character-logo-detection.ts # UIロゴ検出
├── utils/
│   └── deduplication.ts       # 重複検出除去
├── types/
│   └── detection.ts          # 検出結果の型定義
└── types/
    └── index.ts              # 基本型定義
```

## テストデータセット

```
assets/test-images/
├── kill-screens/          # 撃墜シーン画像（34枚）
├── non-kill-screens/      # 非撃墜シーン画像（63枚）
└── unverified/           # 未分類画像
```
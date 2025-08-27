# Kill-Screen 検出・編集ワークフロー

全体赤色化検出アルゴリズムを使用した高精度な撃墜シーン検出ワークフローです。

## 🚀 最新ワークフロー

### Step 1: Kill-screen検出 + 画像保存

```bash
npx ts-node src/detect-only.ts ~/Downloads/video.mp4 --save-images
```

**オプション:**
- `-o, --output <path>`: 出力JSONファイルパス
- `-t, --threshold <value>`: 信頼度閾値 (default: 0.8)
- `-b, --before <seconds>`: kill-screen前秒数 (default: 3)
- `-a, --after <seconds>`: kill-screen後秒数 (default: 2)
- `--min-detections <value>`: 最小連続検出数 (default: 2)
- `--save-images`: 🆕 検出された画像を保存

### Step 2: 検出結果を視覚的に確認・編集

1. **画像で確認**: `detected_kill_screens/` フォルダ内の画像を確認
2. **JSONで編集**: 生成されたJSONファイルを開き、必要に応じて編集：

```json
{
  "version": "1.0.0",
  "inputVideo": "/path/to/video.mp4",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "processingOptions": {
    "confidenceThreshold": 0.68,
    "beforeSeconds": 3,
    "afterSeconds": 2,
    "frameRate": 5
  },
  "detections": [
    {
      "id": 1,
      "timeInSeconds": 305.2,
      "frameNumber": 1526,
      "confidence": 0.74,
      "enabled": true,
      "note": "自動検出 (信頼度: 74%)"
    }
  ]
}
```

**編集可能な項目:**
- `enabled`: `false`に変更すると動画生成時に除外
- `note`: メモを追加・編集
- `timeInSeconds`: タイムスタンプを微調整

### Step 3: 動画生成

```bash
npx ts-node src/generate-video.ts detections.json -o final_clips.mp4
```

**オプション:**
- `-i, --input <path>`: 入力動画パスを上書き
- `-o, --output <path>`: 出力動画ファイルパス

## 📝 編集例

### 不要な検出を除外
```json
{
  "id": 3,
  "enabled": false,  // falseに変更
  "note": "誤検出のため除外"
}
```

### タイムスタンプを微調整
```json
{
  "id": 1,
  "timeInSeconds": 305.0,  // 305.2から305.0に調整
  "note": "タイミングを0.2秒前に調整"
}
```

### メモを追加
```json
{
  "id": 2,
  "note": "素晴らしいコンボ決め！"
}
```

## 🔄 アルゴリズム改善の成果

| 指標 | 旧システム | 新システム（全体赤色化検出） |
|------|------------|------------------------------|
| **精度** | 50.7% | **80.4%** (+29.7%) |
| **F1スコア** | 0% | **76.5%** |
| **再現率** | 0% | **91.2%** |
| **実動画誤検出** | 26個/26個 | **1個/26個** |
| **検出特徴** | UI要素分析 | **画面全体の赤色化** |

## 💡 活用テクニック

### 1. 複数の閾値で比較
```bash
npx ts-node src/detect-only.ts video.mp4 -o strict.json -t 0.85 --save-images
npx ts-node src/detect-only.ts video.mp4 -o loose.json -t 0.75 --save-images
```

### 2. 画像での確認を活用
```bash
npx ts-node src/detect-only.ts video.mp4 --save-images
# detected_kill_screens/ フォルダ内の画像を確認してから編集
```

### 3. 性能テストツールを活用
```bash
npx ts-node src/test-performance.ts global-red  # 新しい検出システムをテスト
```

## 🛠️ トラブルシューティング

### 検出が少なすぎる場合
```bash
npx ts-node src/detect-only.ts video.mp4 -t 0.75 --min-detections 1
```

### 検出が多すぎる場合
```bash
npx ts-node src/detect-only.ts video.mp4 -t 0.85 --min-detections 3
```

### 動画パスが変わった場合
```bash
npx ts-node src/generate-video.ts detections.json -i /new/path/video.mp4
```

## 🧪 開発者向け

### アルゴリズムの比較テスト
```bash
npx ts-node src/test-performance.ts global-red      # 最新（推奨）
npx ts-node src/test-performance.ts simple-stats   # 統計ベース
npx ts-node src/test-performance.ts character-logo # UIベース
```
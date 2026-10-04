# 選果場DX

選果場における出荷情報表示、仕切り、在庫管理、出荷時入力を
kintoneを中心にデジタル化するプロジェクト。

## 主な対象

- 大型モニター用「本日出荷」ビュー
- 仕切り管理
- 在庫管理
- タブレットによる出荷処理
- 送り状番号入力
- 出荷ロット入力

## 技術構成

- kintone
- JavaScript / CSS
- Claude Code

## ドキュメント

- docs/00_project/PROJECT_OVERVIEW.md
  - プロジェクト概要
- docs/00_project/BASIC_ARCHITECTURE.md
  - 基本設計
- docs/00_project/DECISION_LOG.md
  - 確定した意思決定
- CLAUDE.md
  - Claude Code向けプロジェクト指示

## 開発方針

業務要件・基本設計はChatGPTで整理し、
技術詳細設計と実装はClaude Codeを使用する。

大きな変更はClaude CodeのPlan Modeで調査・設計してから実装する。

## データ取扱い

local-data/ には既存kintoneアプリのエクスポートや
現状確認用の業務データを配置する。

local-data/ はGit管理対象外とする。

# GitHub Actions の Claude 使用モデルの制限

## 発端と現在の判定

2026-10-31 の [実行 41187312208](https://github.com/ryo02suzu/real-estate-agent-Yuuri/actions/runs/41187312208/job/124496745785) は GitHub 上では成功だが、終了時の `modelUsage` に `claude-opus-5-5` と **禁止されている `claude-haiku-5-5`** があった。ユーザー指定に従い、この実行はモデル要件の失敗として扱う。親・一部サブエージェントの記録だけでは、全モデル呼び出しの適合を証明できない。

補助処理の既定モデルが未固定だったことは設定上の不足であり、今回 Haiku を呼び出した具体的な機能はまだ特定できていない。制限の反映・検証までは新たな Claude 依頼を開始しない。

## 制限の適用

- 許可 ID は `claude-opus-5-5` と `claude-fable-5-1` のみ。親は Opus、許可する代替は Fable。利用不可なら指定外モデルで継続しない。
- `.github/claude-managed-settings.json` を、使い捨ての Ubuntu runner の `/etc/claude-code/managed-settings.json` に配置する。`availableModelsMatch: exact` と `deniedModels` は managed 設定専用であり、Action の `settings` に書くだけでは効かない。
- `requiredMinimumVersion: 2.1.316`、許可リストの厳密化、Sonnet/Haiku ファミリー禁止を併用する。背景処理に使われる Haiku の別名も **Opus の ID に解決**する。Haiku モデルの使用を許可する設定ではない。
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` とモデル ID を併用し、Workflow 内の担当を含む子エージェントに適用する。`CLAUDE_CODE_EFFORT_LEVEL=max` と既存の `--effort max` を維持する。もし auto mode が使われる場合のクライアント側分類モデルも Opus に固定するが、権限モードやサーバー側審査は変更しない。
- 既存の `ultracode: true`、`enableWorkflows: true`、`workflowSizeGuideline: small`、`Workflow` 実行許可は維持する。担当数を増やす変更はしない。

## 実行後の検査

Action の `execution_file` にある構造化された初期化モデル、assistant のモデル、終了結果の `modelUsage` を検査する。禁止モデルが 1 件でも記録されれば、トークン数にかかわらずジョブを失敗にする。ファイルなし、不正な形式、初期化・終了・使用モデルの記録欠落、Claude の失敗も検査失敗にする。

検査スクリプトは Claude 起動前に runner の一時ディレクトリにコピーするため、Claude が UI 開発ブランチへ移動しても同じ検査を実行する。ログには検査結果とモデル ID、Workflow/Agent の呼び出し数だけを出し、会話・住所・ツールの入出力を表示・公開 artifact 化しない。

これは **実行後の検査**であり、既に行われた禁止モデルの呼び出しを取り消すものではない。呼び出し前の制限は managed 設定が担い、その有効性は次の承認済み実行の実測で確かめる。Workflow/Agent の呼び出し数は、担当の起動完了・並列実行の証拠にはならない。`execution_file` だけで全リクエストの実効 effort を検証したとは扱わない。

## 検証と反映の条件

モデルを呼ばない検査は `python3 -m unittest discover -s .github/scripts -p 'test_*.py'`。許可モデル、許可された代替、背景 Haiku 混入、Sonnet・未許可バージョン、記録欠落、不正データ、ログへの情報漏えいを確認する。通常の CI にもこの検査を追加する。

この設定 PR は main に反映されるまで Issue/PR コメント経由の Claude 実行には適用されない。main への反映はユーザーの明示承認を待つ。承認後の最初の小さな実行で、managed 設定の適用・CLI バージョン・`modelUsage`・親と担当の model/effort・Workflow の開始終了を再確認する。新しい実行での実証が済むまでは「完全に防止できた」と報告しない。

MICHILU UI の完成判定とは別であり、Draft PR #23、最新 Vercel Preview の実画面、全機能・端末幅・PC 回帰の確認を継続する。設定 PR に UI の差分は含めない。

## 参照した公式仕様

- [モデル制限と背景処理](https://code.claude.com/docs/en/model-config#block-specific-models-or-versions)
- [設定キーと適用範囲](https://code.claude.com/docs/en/settings-reference)
- [managed 設定の配置](https://code.claude.com/docs/en/managed-settings)
- [サブエージェントのモデル強制と effort](https://code.claude.com/docs/en/sub-agents#run-every-subagent-on-one-model)
- [環境変数](https://code.claude.com/docs/en/env-vars)
- [Action の実行記録出力](https://github.com/anthropics/claude-code-action/blob/v1/base-action/src/execution-file.ts)

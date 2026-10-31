# MICHILUのClaude Code Agent Skills

`/plugin` が使えないClaude Code Web/Remote環境でも、リポジトリの `.claude/skills/<skill-name>/SKILL.md` に置いたSkillsは、対応するClaude Codeセッションで利用できます。プラグインのインストールは不要です。

## 収録Skills

| Skill | 使いどころ |
| --- | --- |
| `michilu-ui` | ホーム、検索、カード、iPhone/PC、アニメーション |
| `michilu-map` | 既存の地点移動、MapLibre、PMTiles、地図レイヤー（地球演出は明示依頼時のみ） |
| `michilu-property-data` | 道路、都市計画、ハザード、地番、建物、地価等 |
| `michilu-privacy` | 住所情報、localStorage、公開API、Secrets、ライセンス |
| `michilu-regression` | リグレッション、コードレビュー、テスト、ビルド |
| `michilu-issue-delivery` | GitHub IssueからPRまでの開発運用 |

## 使い方

1. このPRがmainにマージされた後、MICHILUリポジトリで新しいClaude Codeセッションを開始します。リモートのGitHub Actionsから使う場合も、当該commitをcheckoutする必要があります。
2. 自動選択を促すには通常の日本語で依頼します。例：「MICHILUのホームを改善して。michilu-uiの手順に沿って、PCの見た目は変えないで」。
3. Claude Code CLI/デスクトップの対応環境では、`/michilu-ui`、`/michilu-map`、`/michilu-regression` などを明示的に呼び出すこともできます。Web/Remoteでスラッシュコマンドを使えない場合は通常文でSkill名を指定します。
4. Claudeが実際にSkill本文を参照したか、報告で使用Skillと確認したファイルを示してもらいます。

## 境界と注意点

- `CLAUDE.md` / `AGENTS.md` は従来どおり有効。Skillsは追加の専門手順であり、アプリ本体の機能や外部APIを導入するものではありません。地球から物件への連続ズームは未実装の構想であり、別のIssue等で明示的に依頼されるまで既存UI・地図の作業範囲には含めません。
- Skillsは品質・手順の一貫性を助けますが、実行環境のツール権限やテスト機能は増えません。
- リポジトリの `.claude/skills/` はAIへの指示として読み込まれるため、外部からのPRで編集されたときはコードと同様にレビューしてください。
- 導入後の動作確認：Claude Codeで「MICHILUの使用可能なSkillsを列挙し、michilu-uiのルールを要約して」と指示してください。利用可能な環境では `/skills` で確認できます。

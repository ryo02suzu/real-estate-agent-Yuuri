# MICHILU: 外部エンジニアリングAgent Skills

この文書はMICHILU専用の6つのスキル（`.claude/skills/michilu-*/`）に追加する外部スキルの管理台帳です。Claude Codeに対する**プロジェクト単位**のインストールで、Claude.ai/iPhoneの一般的なSkills一覧には自動同期されません。

## 導入元・対象

| 提供元 | リポジトリ | 導入Skill |
| --- | --- | --- |
| Vercel Engineering | https://github.com/vercel-labs/agent-skills | vercel-react-best-practices, web-design-guidelines, vercel-react-view-transitions |
| Google | https://github.com/google/skills | google-cloud-solution-architecture, google-cloud-waf-security, google-cloud-waf-performance-optimization, google-cloud-waf-cost-optimization |
| Google Labs Code (Stitch) | https://github.com/google-labs-code/stitch-skills | Stitchのすべての公開Skills（コマンド実行時点で検出されるもの） |
| Addy Osmani | https://github.com/addyosmani/agent-skills | browser-testing-with-devtools, source-driven-development |
| Jesse Vincent / Superpowers | https://github.com/obra/superpowers | brainstorming, writing-plans, executing-plans, systematic-debugging, test-driven-development, verification-before-completion, requesting-code-review, finishing-a-development-branch |

これは紹介した**5系統をすべて導入する**MICHILU向け実用セットです。Google Cloudの数百の製品別SkillやAddy Osmaniの全25本を無条件に追加する構成ではありません。使わないSkillを増やすとモデルの選択が複雑になり、誤発動や矛盾した運用ルールの原因になるためです。

## 特別な前提条件

- **Stitch**：Skillの設置だけでは生成機能は使えません。Google Stitch MCPサーバーの設定・認証が別途必要です。有料APIやトークンを勝手に追加しないでください。
- **Chrome DevTools MCP**：ブラウザ検証のSkillにはChrome DevTools MCPとブラウザ実行環境が必要です。無いときは未実施と明示し、スクリーンショットを見たふりをしないでください。
- **Google Cloud**：Google Cloudスキルの実運用には対象のGoogle Cloudプロジェクトと適切な権限が必要です。MICHILUの現在のVercel構成を勝手にGCPへ移行しないでください。
- **Superpowers**：今回のリポジトリ配布では通常のSKILL.mdだけを追加します。Claude plugin marketplaceのhookやセッション開始時bootstrapの完全な機能は含みません。必要なSkillを明示して使ってください。
- **優先順位**：`CLAUDE.md`、`AGENTS.md`、MICHILU専用Skillsの個人情報保護・PC表示保護・法的断定禁止・PR運用ルールを優先します。外部のSkillに任意の操作権限やアクセス権を付与するものではありません。
- **セキュリティ**：第三者のSKILL.mdは実行指示になり得ます。新規追加や更新は必ずPRレビューし、無断外部送信・破壊的コマンド・不明なライセンス・Secrets要求がないことを確認してください。

## 著作権・ライセンス

外部のコンテンツはそれぞれの作者が管理し、各リポジトリのライセンス・帰属表示が適用されます。各Skillや参照資料の著作権・ライセンス表示を削除せず、改変時は出典と変更点を明示してください。参照元：VercelのSkills内MIT表示、Google/Google LabsのApache-2.0、Addy OsmaniとSuperpowersのMITライセンス。

## 確認方法

1. `.claude/skills/` に各Skillの `SKILL.md` と必要なreferences/rulesがあることを確認する。
2. 新しいMICHILUリポジトリを開いたClaude Codeセッションで「利用可能なAgent Skillsを列挙し、vercel-react-best-practicesとmichilu-uiを読み、役割を説明して。コードは変更しないで」と依頼する。
3. セットアップ済みのMCPが無い場合、StitchやChrome DevToolsの使用は未検証と報告させる。
4. 変更時はlint・typecheck・Vitest・buildを実施。実画面はブラウザが使えるときだけ確認する。

## 更新

外部Skillは自動更新しません。更新はGitHubで差分を監査してから別のPRで行ってください。

## 自動選択を15個に制限

外部Skillsを含む39個のうち、普段使う15個（MICHILU専用6 / Vercel 3 / Addy Osmani 2 / Superpowersのsystematic-debugging、test-driven-development、verification-before-completion、requesting-code-review）は自動選択可能にしています。

残り24個（Google Cloud 4 / Stitch 16 / Superpowersのbrainstorming、writing-plans、executing-plans、finishing-a-development-branch）は `.claude/settings.json` の `skillOverrides` で `user-invocable-only` に設定しています。インストール済みのままなので、必要なときにClaude Code環境で `/stitch-generate-design` のように明示して利用できます。Web/Remoteでスラッシュコマンドが使えない場合は、対応するインターフェースと設定の制約を確認してください。

この制限は、不要なスキル説明のコンテキスト占有と無関係な自動発動を抑えるためのものです。スクリプトの安全性を保証したり、MCPの設定を代替するものではありません。Claude Codeの `/doctor` や `/skills` で認識・利用状況を検証してください。

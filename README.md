# ジェンダーリビール ケーキ

赤ちゃんの性別を、ケーキを切って発表するサービス。

- `site/` … Netlify で配るWebサイト（受け取る人の画面 `/r#…` と説明ページ）
- `index.html` と `src/` … 作る人用の iPhone アプリの画面（Capacitor）
- `ios/` … iPhone アプリの Xcode プロジェクト（Codemagic がビルド）
- （次の段階）`netlify/functions/` … 100円「CMなし」の署名を付ける処理

## 進め方
1. Webサイトを公開する（済み：webkuuta.com）
2. AdSense を申し込む
3. iPhone アプリ（性別選択 → サンプル体験 → CMあり/なし → 課金 → 共有）（今ここ：課金以外）
4. CMなしの署名、オファーウォールの組み込み

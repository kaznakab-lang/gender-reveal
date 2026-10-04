import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iPhoneアプリとして包むための設定。
 * appId（バンドルID）はアプリの住所で、あとから変更できません。
 * webDir は npm run build で出てくるフォルダです。
 */
const config: CapacitorConfig = {
  appId: 'com.webkuuta.reveal',
  appName: 'ジェンダーリビール ケーキ',
  webDir: 'dist',
  backgroundColor: '#fffaf6',
  ios: {
    preferredContentMode: 'mobile',
    contentInset: 'never',
    backgroundColor: '#fffaf6',
  },
}

export default config

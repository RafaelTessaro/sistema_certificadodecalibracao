import type { CapacitorConfig } from '@capacitor/cli'

// App BC Calibração (celular): a folha de campo FOR-CAL-01 no celular do técnico. A interface vai dentro do APK; o
// servidor da empresa só troca dados, por HTTP na rede interna.
const config: CapacitorConfig = {
  appId: 'br.com.balancas.calibracao',
  appName: 'BC Calibração',
  webDir: 'dist',
  server: {
    // https://localhost (o padrão): contexto seguro (WebCrypto, randomUUID). NUNCA trocar depois de publicado: a origem
    // muda e o armazenamento do WebView "some".
    androidScheme: 'https',
  },
  android: {
    // O app só fala com o servidor pelo HTTP nativo (CapacitorHttp); o WebView não carrega nada de http://
    allowMixedContent: false,
  },
  plugins: {
    // O HTTP para http://192.168.x.x sai pelo código nativo: sem mixed content e sem CORS no servidor
    CapacitorHttp: { enabled: true },
    CapacitorSQLite: { androidIsEncryption: false },
    LocalNotifications: { smallIcon: 'ic_stat_bc', iconColor: '#078541' },
  },
}

export default config

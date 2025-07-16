const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const fetch = require('node-fetch'); // ★ 追加 (または他のHTTPクライアント)
const multer = require('multer'); // ★ 今回はメモリにファイルを保持するため、diskStorageは不要
const fs = require('fs'); // uploadsディレクトリ作成のため、またはfs-extraなど

const app = express();
const PORT = process.env.PORT || 3000;

// GitHub API 設定（**本番環境では環境変数から読み込むべきです**）
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'YOUR_GITHUB_PERSONAL_ACCESS_TOKEN'; // ★ 非常に重要
const GITHUB_REPO_OWNER = 'YOUR_GITHUB_USERNAME_OR_ORG'; // ★ 例: 'kakaomame'
const GITHUB_REPO_NAME = 'YOUR_GITHUB_REPO_NAME';       // ★ 例: 'pwa-apps'
const GITHUB_BRANCH = 'main'; // または 'master'

// Multerの設定: ファイルをメモリに保持 (GitHubに直接アップロードするためディスクには保存しない)
const upload = multer({ storage: multer.memoryStorage() });

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));
// app.use('/uploads', express.static('uploads')); // アップロード先がGitHubになるため不要

// --- ルーティング ---

// /home を / にマッピング
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// / (ルート)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// /upload ページの表示
app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// /upload へのファイルアップロード処理 (POSTリクエスト)
app.post('/upload', upload.single('appFile'), async (req, res) => { // 'appFile' はinputタグのname属性
  if (!req.file) {
    return res.status(400).send('ファイルがアップロードされていません。');
  }

  const file = req.file;
  const fileName = file.originalname;
  const fileContentBase64 = file.buffer.toString('base64'); // ファイルコンテンツをBase64エンコード

  // 簡易的なアプリ名とバージョン抽出 (実際にはAPK/APKS解析が必要)
  const appName = path.parse(fileName).name;
  // ファイル名からバージョンを推測する簡易ロジック（例: myapp-v1.2.3.apk -> v1.2.3）
  const versionMatch = fileName.match(/v?(\d+\.\d+\.\d+)/);
  const appVersion = versionMatch ? versionMatch[1] : 'unknown-version';

  const filePathInRepo = `apps/${appName}/${appVersion}/${fileName}`; // GitHubリポジトリ内のパス

  try {
    const githubApiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePathInRepo}`;

    const response = await fetch(githubApiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Node.js Server' // GitHub APIにはUser-Agentが必要
      },
      body: JSON.stringify({
        message: `Upload ${fileName} for ${appName} v${appVersion}`,
        content: fileContentBase64,
        branch: GITHUB_BRANCH
        // sha: Existing file's SHA if updating an existing file. (初回作成時は不要)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('GitHub API Error:', errorData);
      return res.status(response.status).send(`GitHubへのアップロードに失敗しました: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('File uploaded to GitHub:', result.content.html_url);

    // アップロードが成功したら /install にリダイレクト
    res.redirect(`/install?n=${encodeURIComponent(appName)}&v=${encodeURIComponent(appVersion)}`);

  } catch (error) {
    console.error('Error uploading to GitHub:', error);
    res.status(500).send('サーバー内部エラー: GitHubへのアップロードに失敗しました。');
  }
});

// /install ページの表示とインストールシミュレーション (変更なし)
app.get('/install', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'install.html'));
});

// /app ページの表示とアプリ実行シミュレーション (変更なし)
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// 外部サイトへのリクエスト (既存のロジックを維持)
// **注意: ここでのGitHubへのcurlリクエストは依然として許可されません。**
// **アップロードはGitHub APIを介して行われます。**
app.get('/fetch-external', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('URLパラメータが必要です。');
  }

  if (targetUrl.includes('github.com')) {
    return res.status(403).send('GitHubへのリクエストは許可されていません。');
  }

  const command = `curl -v -L "${targetUrl}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).send(`外部リクエストの実行中にエラーが発生しました: ${stderr}`);
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr (curl verbose output): ${stderr}`);
    res.type('text/plain').send(stdout);
  });
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
  console.log(`PWAアプリケーションが http://localhost:${PORT} で利用可能です。`);
});

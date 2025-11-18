# Node.js 16.17.1を使用
FROM node:16.17.1-alpine

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# ソースコードをコピー
COPY . .

# TypeScriptをビルド
RUN npm run build

# アプリケーションを起動
CMD ["npm", "run", "dev"]

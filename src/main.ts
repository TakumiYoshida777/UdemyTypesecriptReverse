import express from 'express';
import morgan from 'morgan';
import 'express-async-errors';
import mysql from 'mysql2/promise';
import { GameGateway } from './dataaccess/gameGateway';
import { TurnGateway } from './dataaccess/turnGateway';
import { MoveGateway } from './dataaccess/moveGateway';
import { SquareGateway } from './dataaccess/squareGateway';

const EMPTY = 0;
const DARK = 1;
const LIGHT = 2;

const INITIAL_BOARD = [
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, DARK, LIGHT, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, LIGHT, DARK, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
];

const PORT = 3000;

const app = express();

app.use(morgan('dev'));
app.use(express.static('static', { extensions: ['html'] }));
app.use(express.json()); // フロントエンドから送信されたデータを受け取るせて値

const gameGateway = new GameGateway();
const turnGateway = new TurnGateway();
const moveGateway = new MoveGateway();
const squareGateway = new SquareGateway();

app.get('/api/hello', async (req, res) => {
  res.json({
    message: 'Hello Express',
  });
});

app.get('/api/error', async (req, res) => {
  throw new Error('Error endpoint');
});

// ゲーム開始
app.post('/api/games', async (req, res) => {
  const now = new Date();
  const conn = await connectMySql();

  try {
    await conn.beginTransaction();

    const gameRecord = await gameGateway.insert(conn, now);

    const turnRecord = await turnGateway.insert(
      conn,
      gameRecord.id,
      0,
      DARK,
      now
    );

    // マス目の数を計算
    await squareGateway.insertAll(conn, turnRecord.id, INITIAL_BOARD);

    await conn.commit();
  } finally {
    await conn.end();
  }

  res.status(201).end();
});

app.get('/api/games/latest/turns/:turnCount', async (req, res) => {
  const turnCount = parseInt(req.params.turnCount);

  const conn = await connectMySql();
  try {
    // 最新のゲームを取得する
    const gameRecord = await gameGateway.findLatest(conn);
    if (!gameRecord) {
      throw new Error('Latest game not found');
    }

    // 現在のターン情報を取得する
    const turnRecord = await turnGateway.findForGameIdAndTurnCount(
      conn,
      gameRecord.id,
      turnCount
    );

    if (!turnRecord) {
      throw new Error('Specified turn not found');
    }

    // 選択したマスの状態を取得
    const squareRecord = await squareGateway.findForTurnId(conn, turnRecord.id);

    // ８*8の多重配列を作成（ボード）
    const board = Array.from(Array(8)).map(() => Array.from(Array(8)));

    // 盤面全体の状態を配列に格納
    squareRecord.forEach((s) => {
      board[s.y][s.x] = s.disc;
    });

    const responseBody = {
      turnCount,
      board,
      nextDisc: turnRecord.nextDisc,
      // TODO 決着がついている場合、game_resultsテーブルから取得する
      winnerDisc: null,
    };

    res.json(responseBody);
  } finally {
    await conn.end();
  }
});

app.post('/api/games/latest/turns', async (req, res) => {
  const turnCount = parseInt(req.body.turnCount);
  const disc = parseInt(req.body.move.disc);
  const x = parseInt(req.body.move.x);
  const y = parseInt(req.body.move.y);

  // 一つ前のターンを取得する
  const conn = await connectMySql();
  try {
    // 最新のゲームを取得する
    // 最新のゲームを取得する
    const gameRecord = await gameGateway.findLatest(conn);
    if (!gameRecord) {
      throw new Error('Latest game not found');
    }
    // 一つ前ののターン情報を取得する
    const previousTurnCount = turnCount - 1;
    const previousTurnRecord = await turnGateway.findForGameIdAndTurnCount(
      conn,
      gameRecord.id,
      previousTurnCount
    );

    if (!previousTurnRecord) {
      throw new Error('Specified turn not found');
    }

    // 選択したマスの状態を取得
    const squareRecord = await squareGateway.findForTurnId(
      conn,
      previousTurnRecord.id
    );

    // ８*8の多重配列を作成（ボード）
    const board = Array.from(Array(8)).map(() => Array.from(Array(8)));

    // 盤面全体の状態を配列に格納
    squareRecord.forEach((s) => {
      board[s.y][s.x] = s.disc;
    });

    // 盤面に置けるかチェック

    // 石を置く
    board[y][x] = disc;
    console.log(board);

    // ひっくり返す

    // ターンを保存する
    const nextDisc = disc === DARK ? LIGHT : DARK;
    const now = new Date();
    const turnRecord = await turnGateway.insert(
      conn,
      gameRecord.id,
      turnCount,
      nextDisc,
      now
    );

    await squareGateway.insertAll(conn, turnRecord.id, board);

    await moveGateway.insert(conn, turnRecord.id, disc, x, y);

    await conn.commit();
  } finally {
    await conn.end();
  }

  console.log(`turnCount = ${turnCount}, disc = ${disc}, x = ${x}, y = ${y}`);

  res.status(201).end();
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Reversi application started: http://localhost:${PORT}`);
});

function errorHandler(
  err: any,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  console.error('Unexpected error occurred', err);
  res.status(500).send({
    message: 'Unexpected error occurred',
  });
}

async function connectMySql() {
  return await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    database: 'reversi',
    user: 'reversi',
    password: 'password',
  });
}

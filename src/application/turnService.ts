import { connectMySql } from '../dataaccess/connection';
import { GameGateway } from '../dataaccess/gameGateway';
import { TurnGateway } from '../dataaccess/turnGateway';
import { SquareGateway } from '../dataaccess/squareGateway';
import { MoveGateway } from '../dataaccess/moveGateway';
import { DARK, LIGHT } from '../application/constants';

const gameGateway = new GameGateway();
const turnGateway = new TurnGateway();
const squareGateway = new SquareGateway();
const moveGateway = new MoveGateway();

export class TurnService {
  async findLatestGameTurnByTurnCount(turnCount: number) {
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
      const squareRecord = await squareGateway.findForTurnId(
        conn,
        turnRecord.id
      );

      // ８*8の多重配列を作成（ボード）
      const board = Array.from(Array(8)).map(() => Array.from(Array(8)));

      // 盤面全体の状態を配列に格納
      squareRecord.forEach((s) => {
        board[s.y][s.x] = s.disc;
      });

      return {
        turnCount,
        board,
        nextDisc: turnRecord.nextDisc,
        // TODO 決着がついている場合、game_resultsテーブルから取得する
        winnerDisc: null,
      };
    } finally {
      await conn.end();
    }
  }

  async registerTurn(turnCount: number, disc: number, x: number, y: number) {
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
  }
}

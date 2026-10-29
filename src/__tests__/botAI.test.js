import { describe, expect, it } from 'vitest';
import { chooseBotAction, playBotTurn } from '../engine/botAI.js';
const card=(value,suit,uid)=>({value,suit,uid,kind:'standard'});
describe('bot turn decisions',()=>{
 it('ATURAN AS: bot tidak membuang As bila belum punya kombinasi',()=>{
   const hand=[card('A','♠','as'),card(7,'♦','7d'),card(9,'♣','9c')];
   const result=playBotTurn({hand,drawPile:[],discardPile:[card(2,'♥','d2')],maxDepth:5});
   const discarded=result.discardPile[result.discardPile.length-1];
   expect(result.melds.flat().map(item=>item.uid)).not.toContain('as');
   expect(discarded.uid).not.toBe('as');
   expect(result.hand.map(item=>item.uid)).toContain('as');
 });

 it('digs an available discard if it makes an immediate legal run',()=>{const hand=[card(4,'♥','4h'),card(5,'♥','5h'),card(10,'♣','10c')];expect(chooseBotAction({hand,discardPile:[card(3,'♥','3h')]}).type).toBe('dig')});
 it('draws when no discard forms a complete meld',()=>{expect(chooseBotAction({hand:[card(2,'♠','2s')],discardPile:[card(8,'♦','8d')]}).type).toBe('draw')});
 it('melds valid run then discards one card',()=>{const result=playBotTurn({hand:[card(2,'♦','2d'),card(3,'♦','3d'),card(4,'♦','4d'),card('K','♣','Kc')],drawPile:[card(9,'♥','9h')],discardPile:[]});expect(result.melds).toHaveLength(1);expect(result.hand).toHaveLength(1);expect(result.discardPile).toHaveLength(1)});
 it('draws one card per turn',()=>{const result=playBotTurn({hand:[card(2,'♠','2s'),card('A','♦','ad')],drawPile:[card(3,'♠','3s'),card(7,'♣','7c')],discardPile:[]});expect(result.drawPile).toHaveLength(1);expect(result.discardPile).toHaveLength(1)});
 it('bot menurunkan deret lebih dari 3 kartu bila ada',()=>{const result=playBotTurn({hand:[card(2,'♦','2d'),card(3,'♦','3d'),card(4,'♦','4d'),card(5,'♦','5d'),card('K','♣','Kc')],drawPile:[card(9,'♥','9h')],discardPile:[]});expect(result.melds[0]).toHaveLength(4);expect(result.hand).toHaveLength(1)});
 it('hasil giliran bot mencatat kartu buangannya',()=>{const result=playBotTurn({hand:[card(2,'♦','2d'),card(3,'♦','3d'),card(4,'♦','4d'),card('K','♣','Kc')],drawPile:[card(9,'♥','9h')],discardPile:[]});expect(result.discarded?.uid).toBe('Kc')});
 it('bot menggali dengan kombinasi terpanjang, bukan hanya 3 kartu',()=>{const result=playBotTurn({hand:[card(4,'♦','4d'),card(5,'♦','5d'),card(6,'♦','6d'),card('A','♠','as'),card(9,'♠','9s')],drawPile:[],discardPile:[card(3,'♦','d3')],maxDepth:5});expect(result.melds[0]).toHaveLength(4);expect(result.discarded?.uid).toBe('as');expect(result.hand.map(item=>item.uid)).toEqual(['9s'])});
});

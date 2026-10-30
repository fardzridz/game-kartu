export const SUITS=['♠','♥','♦','♣'];
export const VALUES=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const rankOf=value=>typeof value==='number'?value:VALUES.indexOf(String(value));
const shuffle=(cards,random)=>{for(let i=cards.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}return cards};
export const createDeck=(players=2,random=Math.random)=>{const cards=[];for(let deck=0;deck<(players>4?2:1);deck++){for(const suit of SUITS)for(const value of VALUES)cards.push({uid:`${deck}-${value}-${suit}`,suit,value,kind:'standard'});for(let joker=0;joker<3;joker++)cards.push({uid:`${deck}-joker-${joker}`,suit:null,value:'JOKER',kind:'joker'})}return shuffle(cards,random)};
export function expandDeckForPlayerCount(state,random=Math.random){if(state.players.length!==4)return state;const extras=[];for(const suit of SUITS)for(const value of VALUES)extras.push({uid:`1-${value}-${suit}`,suit,value,kind:'standard'});for(let index=0;index<3;index++)extras.push({uid:`1-joker-${index}`,suit:null,value:'JOKER',kind:'joker'});return{...state,drawPile:shuffle([...state.drawPile,...extras],random)}}
export function validateMeld(cards){if(!Array.isArray(cards)||cards.length<3||new Set(cards.map(card=>card.uid)).size!==cards.length)return{valid:false,reason:'Pilih minimal tiga kartu berbeda.'};const jokers=cards.filter(card=>card.kind==='joker'||card.value==='JOKER'),natural=cards.filter(card=>!jokers.includes(card));if(!natural.length)return{valid:false,reason:'Joker harus menggantikan angka dalam urutan.'};if(jokers.length>1)return{valid:false,reason:'Maksimal satu Joker per kombinasi.'};if(natural.every(card=>card.value==='A'))return jokers.length===0?{valid:true,type:'ace'}:{valid:false,reason:'As tidak dapat memakai Joker.'};if(natural.every(card=>['J','Q','K'].includes(String(card.value)))){const sorted=[...natural].sort((a,b)=>rankOf(a.value)-rankOf(b.value));const valid=!jokers.length&&cards.length===3&&sorted.map(card=>card.value).join(',')==='J,Q,K'&&sorted.every(card=>card.suit===sorted[0].suit);return valid?{valid:true,type:'face'}:{valid:false,reason:'Kasta huruf harus J-Q-K sejenis tanpa Joker.'}}if(!natural.every(card=>Number(card.value)>=2&&Number(card.value)<=10)||natural.some(card=>card.suit!==natural[0].suit))return{valid:false,reason:'Urutan angka harus satu kembang.'};const values=natural.map(card=>Number(card.value));if(new Set(values).size!==values.length)return{valid:false,reason:'Angka urutan tidak boleh kembar.'};for(let start=2;start<=11-cards.length;start++){const sequence=Array.from({length:cards.length},(_,i)=>start+i),missing=sequence.filter(value=>!values.includes(value)).length;if(missing===jokers.length&&values.every(value=>sequence.includes(value)))return{valid:true,type:'run',suit:natural[0].suit,sequence}}return{valid:false,reason:'Angka harus berurutan dari 2 sampai 10.'}}
// Cari SEMUA kombinasi sah yang bisa dibentuk dari kartu galian + pool kartu
// (tangan + kartu yang ikut terangkut). Kandidat dikelompokkan dulu per
// kembang/kasta yang relevan dengan kartu target, sehingga TIDAK ada batasan
// jumlah kartu di tangan (dulu terpotong di 7 kartu natural). Semua variasi
// panjang 3..maxLength dikembalikan — bukan hanya yang terpanjang — selama
// opsi itu menyisakan minimal `reserve` kartu untuk Kartu Tutupan. Kombinasi
// MURNI (tanpa Joker) selalu didahulukan; varian Joker dicantumkan terpisah
// di belakangnya, dan Joker dari tangan TIDAK pernah diselipkan otomatis.
export function findDigMelds(target, pool = [], maxLength = 8, reserve = 1) {
	if (!target) return [];
	const others = pool.filter(card => card.uid !== target.uid);
	const jokers = others.filter(card => card.kind === 'joker' || card.value === 'JOKER');
	const found = [];
	const seen = new Set();
	const tryCombo = combo => {
		if (combo.length < 3 || combo.length > maxLength) return;
		if (!validateMeld(combo).valid) return;
		const used = new Set(combo.map(card => card.uid));
		if (pool.filter(card => !used.has(card.uid)).length < reserve) return;
		const key = combo.map(card => card.uid).sort().join('|');
		if (seen.has(key)) return;
		seen.add(key);
		found.push({ key, cards: combo, length: combo.length, usesJoker: combo.some(isJokerCard) });
	};
	const isNumberCard = card => Number(card.value) >= 2 && Number(card.value) <= 10;
	if (target.kind !== 'joker' && target.value !== 'JOKER' && isNumberCard(target)) {
		// Kasta Angka: hanya kartu SEKEMBANG 2-10 yang relevan (dedup per nilai,
		// karena deret sah tidak boleh ada angka kembar).
		const tv = Number(target.value);
		const byValue = new Map();
		for (const card of others) {
			if (card.kind === 'joker' || card.value === 'JOKER' || card.suit !== target.suit || !isNumberCard(card)) continue;
			const value = Number(card.value);
			if (!byValue.has(value)) byValue.set(value, card);
		}
		for (let len = 3; len <= Math.min(maxLength, 9); len++) {
			for (let start = Math.max(2, tv - len + 1); start <= Math.min(tv, 11 - len); start++) {
				const cards = [];
				let missing = 0;
				for (let value = start; value < start + len; value++) {
					if (value === tv) continue; // slot ini diisi kartu target
					const card = byValue.get(value);
					if (card) cards.push(card);
					else missing += 1;
				}
				if (missing === 0) tryCombo([target, ...cards]);
				else if (missing === 1 && jokers.length) tryCombo([target, ...cards, jokers[0]]);
			}
		}
	} else if (target.kind !== 'joker' && target.value !== 'JOKER' && ['J', 'Q', 'K'].includes(String(target.value))) {
		// Kasta Huruf: satu-satunya opsi adalah J-Q-K sejenis lengkap tanpa Joker.
		const picks = [];
		let complete = true;
		for (const value of ['J', 'Q', 'K']) {
			if (String(target.value) === value) continue;
			const card = others.find(item => item.kind !== 'joker' && item.value !== 'JOKER' && item.suit === target.suit && String(item.value) === value);
			if (!card) { complete = false; break; }
			picks.push(card);
		}
		if (complete) tryCombo([target, ...picks]);
	} else if (target.kind !== 'joker' && target.value !== 'JOKER' && String(target.value) === 'A') {
		// Kasta As: 3 As atau lebih (sampai 8 As pada dua deck), bebas kembang,
		// tanpa Joker — semua variasi jumlah kartu jadi opsi.
		const aces = others.filter(card => card.kind !== 'joker' && card.value !== 'JOKER' && String(card.value) === 'A');
		for (let mask = 0; mask < (1 << aces.length); mask++) {
			const combo = [target];
			for (let i = 0; i < aces.length; i++) if (mask & (1 << i)) combo.push(aces[i]);
			tryCombo(combo);
		}
	} else {
		// Target Joker: ia mengisi SATU nomor bolong dalam deret sejenis 2-10.
		for (const suit of SUITS) {
			const byValue = new Map();
			for (const card of others) {
				if (card.kind === 'joker' || card.value === 'JOKER' || card.suit !== suit || !isNumberCard(card)) continue;
				const value = Number(card.value);
				if (!byValue.has(value)) byValue.set(value, card);
			}
			for (let len = 3; len <= Math.min(maxLength, 9); len++) {
				for (let start = 2; start + len - 1 <= 10; start++) {
					const cards = [];
					let missing = 0;
					for (let value = start; value < start + len; value++) {
						const card = byValue.get(value);
						if (card) cards.push(card);
						else missing += 1;
					}
					if (missing === 1) tryCombo([target, ...cards]);
				}
			}
		}
	}
	// Urutan: kombinasi murni dulu, lalu varian Joker; di dalamnya dari yang
	// terpendek ke terpanjang supaya pemain bebas memilih panjang yang aman.
	return found.sort((a, b) => (a.usesJoker - b.usesJoker) || (a.length - b.length) || a.key.localeCompare(b.key));
}
export function validateDig(discardPile,index,hand,maxDepth=5){const depth=discardPile.length-index;if(index<0||index>=discardPile.length||depth>maxDepth)return{valid:false,reason:'Kartu berada di luar batas gali.'};const target=discardPile[index];const carried=discardPile.slice(index+1);if(hand.length-2+carried.length<1)return{valid:false,reason:'Gali itu akan menghabiskan kartu tanganmu. Wajib menyisakan minimal 1 kartu untuk dibuang!'};for(let a=0;a<hand.length;a++)for(let b=a+1;b<hand.length;b++){const meld=[target,hand[a],hand[b]];if(validateMeld(meld).valid)return{valid:true,meld,handIndices:[a,b],carried,targetIndex:index}}return{valid:false,reason:'Kartu itu belum membentuk kombinasi sah dengan dua kartu di tangan.'}}
export const pointsFor=card=>card.kind==='joker'||card.value==='JOKER'?15:card.value==='A'?15:['J','Q','K'].includes(String(card.value))?10:5;
// Nilai kartu di TANGAN (minus). Joker yang DIBUANG -150 (sangat mahal), tapi
// Joker yang masih di tangan (belum masuk kombinasi) hanya -50 — tetap mendorong
// pemain memakainya di kombinasi tanpa menghukum keberuntungan terlalu berat.
export const penaltyFor=card=>(card.kind==='joker'||card.value==='JOKER')?150:pointsFor(card);
export const handPenaltyFor=card=>(card.kind==='joker'||card.value==='JOKER')?50:pointsFor(card);
const isJokerCard=card=>card?.kind==='joker'||card?.value==='JOKER';
// Semua kombinasi sah dari sekumpulan kartu, terpanjang dulu & deterministik:
// deret 2-10 sejenis (boleh 1 Joker pengisi), J-Q-K sejenis, 3-4 As kembang bebas.
// Dipakai untuk penilaian akhir tangan dan pilihan meld bot.
export function findHandMelds(pool=[]){const naturals=pool.filter(card=>card.kind!=='joker'&&card.value!=='JOKER'),jokers=pool.filter(card=>card.kind==='joker'||card.value==='JOKER'),found=[];
const push=cards=>{const key=cards.map(card=>card.uid).sort().join('|');if(!found.some(item=>item.key===key))found.push({key,cards,length:cards.length,points:cards.reduce((sum,card)=>sum+(isJokerCard(card)?5:pointsFor(card)),0)})};
// Kasta As: minimal 3 As (sampai 8 As pada dua deck), kembang bebas (campur
// pun sah), tanpa Joker.
const aces=naturals.filter(card=>card.value==='A').sort((a,b)=>String(a.uid).localeCompare(String(b.uid)));
if(aces.length>=3)push(aces);
for(const suit of SUITS){const byValue=new Map();for(const card of naturals)if(card.suit===suit&&Number(card.value)>=2&&Number(card.value)<=10&&!byValue.has(Number(card.value)))byValue.set(Number(card.value),card);
// Deret tanpa Joker: setiap jendela berurutan maksimal satu kembang.
for(let start=2;start<=9;start++){if(!byValue.has(start))continue;let end=start;while(byValue.has(end+1))end+=1;if(end-start+1>=3)push(Array.from({length:end-start+1},(_,i)=>byValue.get(start+i)));start=end;}
// Deret dengan 1 Joker: satu jendela yang tinggal satu nomor bolong.
if(jokers.length)for(let len=3;len<=9;len++)for(let start=2;start+len-1<=10;start++){const seq=Array.from({length:len},(_,i)=>start+i);if(seq.filter(value=>!byValue.has(value)).length===1)push([...seq.filter(value=>byValue.has(value)).map(value=>byValue.get(value)),jokers[0]]);}}
// Kasta Huruf: pas J-Q-K satu kembang tanpa Joker.
for(const suit of SUITS){const byValue=new Map();for(const card of naturals)if(card.suit===suit&&['J','Q','K'].includes(String(card.value))&&!byValue.has(String(card.value)))byValue.set(String(card.value),card);if(byValue.size===3)push(['J','Q','K'].map(value=>byValue.get(value)));}
return found.sort((a,b)=>b.length-a.length||b.points-a.points||a.key.localeCompare(b.key)).map(item=>item.cards)}
// Pecah kartu tangan menjadi kombinasi sah vs kartu sisa. Kombinasi yang SUDAH
// JADI tapi belum sempat diturunkan tetap dihitung plus (+), bukan minus (−),
// berapa pun panjangnya (3, 4, atau lebih).
export function splitHandMelds(hand=[]){const pool=[...hand],melds=[];for(;;){const best=findHandMelds(pool)[0];if(!best)break;const used=new Set(best.map(card=>card.uid));for(let i=pool.length-1;i>=0;i--)if(used.has(pool[i].uid))pool.splice(i,1);melds.push(best)}return{melds,rest:pool}}
// Bonus kartu penutup ("Mati Sampah"): poin kartu terakhir x2, Joker istimewa +150.
export const closerBonusFor=card=>{if(!card)return 0;return isJokerCard(card)?150:pointsFor(card)*2};
export function calculateScores(players,options={}){const closerCard=options.closerCard||null,closerId=options.winnerId||null;return players.map(player=>{const meldCards=(player.melds||[]).flat();const handSplit=splitHandMelds(player.hand||[]);const handMelds=handSplit.melds;const restCards=handSplit.rest;const positive=meldCards.reduce((sum,card)=>sum+(isJokerCard(card)?5:pointsFor(card)),0)+handMelds.flat().reduce((sum,card)=>sum+(isJokerCard(card)?5:pointsFor(card)),0),negative=restCards.reduce((sum,card)=>sum+handPenaltyFor(card),0)+(player.discardedJokers||0)*penaltyFor({kind:'joker',value:'JOKER'}),closerBonus=closerId===player.id?closerBonusFor(closerCard):0,jokersInHand=restCards.filter(isJokerCard).length,discardedJokers=(player.discardedJokers||0),discardedAces=(player.discardedAces||0);return{playerId:player.id,name:player.name,positive,negative,closerBonus,handMelds,restCards,jokersInHand,discardedJokers,discardedAces,total:positive+closerBonus-negative}})}
export function startRound(players,opts,legacyRandom){const random=typeof opts==='function'?opts:(opts?.random||legacyRandom||Math.random);const shufflerIndex=typeof opts==='function'?0:(opts?.shufflerIndex||0);if(players.length<2||players.length>8)throw new Error('Room harus memiliki 2 hingga 8 pemain.');const deck=createDeck(players.length,random),seats=players.map(player=>({...player,hand:deck.splice(0,6),melds:[]}));return{players:seats,drawPile:deck,discardPile:[],turn:shufflerIndex,phase:'draw',status:'playing',turnTimerResetFor:null}}
export function digDiscard(state,playerIndex,discardIndex,maxDepth=5){const player=state.players[playerIndex],curDiscard=state.discardPile||[],result=validateDig(curDiscard,discardIndex,player.hand,maxDepth);if(!result.valid)return{state,error:result.reason};const paired=new Set(result.handIndices.map(index=>player.hand[index].uid));const players=state.players.map((seat,index)=>index===playerIndex?{...seat,hand:[...seat.hand.filter(card=>!paired.has(card.uid)),...result.carried],melds:[...seat.melds,result.meld]}:seat);return{state:{...state,players,discardPile:curDiscard.slice(0,discardIndex),phase:'discard'},meld:result.meld}}
export function drawCard(state,playerIndex){if(state.phase!=='draw'||state.turn!==playerIndex||state.status!=='playing')return{state,error:'Bukan giliran mengambil kartu.'};if(!state.drawPile.length)return{state,error:'Tumpukan minum habis.'};const card=state.drawPile[0];return{state:{...state,players:state.players.map((player,index)=>index===playerIndex?{...player,hand:[...player.hand,card]}:player),drawPile:state.drawPile.slice(1),phase:'play'}}}
export function meldToTable(state,playerIndex,cards){const player=state.players[playerIndex];if(!player)return{state,error:'Pemain tidak ditemukan.'};if(state.status!=='playing'||state.turn!==playerIndex)return{state,error:'Bukan giliranmu untuk menurunkan kartu.'};if(state.phase==='draw')return{state,error:'Ambil kartu dari minum atau gali buangan terlebih dahulu.'};if(!Array.isArray(cards)||cards.length<3)return{state,error:'Pilih minimal tiga kartu.'};const val=validateMeld(cards);if(!val.valid)return{state,error:val.reason};const ids=new Set(cards.map(card=>card.uid));if(cards.some(card=>!player.hand.some(item=>item.uid===card.uid)))return{state,error:'Kartu itu tidak ada di tanganmu.'};const remaining=player.hand.filter(card=>!ids.has(card.uid));if(!remaining.length)return{state,error:'Wajib menyisakan minimal 1 kartu di tangan untuk Kartu Tutupan!'};const players=state.players.map((seat,index)=>index===playerIndex?{...seat,hand:remaining,melds:[...seat.melds,cards]}:seat);return{state:{...state,players},meldType:val.type}}
export function discardCard(state,playerIndex,cardUid){const player=state.players[playerIndex];if(!player)return{state,error:'Pemain tidak ditemukan.'};if(state.status!=='playing'||state.turn!==playerIndex)return{state,error:'Bukan giliranmu untuk membuang kartu.'};if(state.phase==='draw')return{state,error:'Ambil atau gali kartu terlebih dahulu sebelum membuang.'};const card=player.hand.find(item=>item.uid===cardUid);if(!card)return{state,error:'Kartu itu tidak ada di tanganmu.'};// ATURAN AS: boleh dibuang hanya bila pemain sudah punya minimal satu kombinasi di meja.
// As yang sudah dibuang TIDAK dihitung di skor akhir (netral, tidak minus).
if(String(card.value)==='A'&&!(player.melds||[]).length)return{state,error:'Kartu As hanya boleh dibuang setelah kamu punya minimal satu kombinasi di meja.'};const remaining=player.hand.filter(item=>item.uid!==cardUid);const isClosing=!remaining.length;const isJoker=card.kind==='joker'||card.value==='JOKER';const isAce=String(card.value)==='A';const players=state.players.map((seat,index)=>index===playerIndex?{...seat,hand:remaining,
// Joker/As PENUTUP (Mati Sampah) dikecualikan dari pencatatan buangan agar
// bonus penutup benar-benar utuh (Joker +150, As +30 via poin ×2); kartu itu
// adalah Kartu Tutupan, bukan buangan biasa. Buangan di tengah ronde tetap
// dicatat: Joker -150, As netral (hanya untuk penjelasan layar skor).
discardedJokers:(seat.discardedJokers||0)+((isJoker&&!isClosing)?1:0),discardedAces:(seat.discardedAces||0)+((isAce&&!isClosing)?1:0)}:seat);const discardPile=[...(state.discardPile||[]),card];if(!remaining.length)return{state:{...state,players,discardPile,status:'finished',phase:'draw',winnerId:player.id,finishReason:'tutup',closerCard:card}};if(!state.drawPile.length)return{state:{...state,players,discardPile,status:'finished',phase:'draw',finishReason:'deck-habis'}};return{state:{...state,players,discardPile,turn:(playerIndex+1)%state.players.length,phase:'draw',turnTimerResetFor:null}}}
export function digWithCards(state,playerIndex,discardIndex,chosenUids,maxDepth=5){const player=state.players[playerIndex];if(!player)return{state,error:'Pemain tidak ditemukan.'};if(state.status!=='playing'||state.turn!==playerIndex)return{state,error:'Bukan giliranmu untuk menggali buangan.'};if(state.phase!=='draw')return{state,error:'Gali buangan hanya boleh sebelum menurunkan atau membuang kartu.'};const curDiscard=state.discardPile||[];const depth=curDiscard.length-discardIndex;if(discardIndex<0||discardIndex>=curDiscard.length||depth>maxDepth)return{state,error:'Kartu berada di luar batas gali.'};const target=curDiscard[discardIndex];const carried=curDiscard.slice(discardIndex+1);// Kartu terangkut adalah milik penuh pemain: boleh langsung ikut turun di
// dalam kombinasi gali, atau disimpan di tangan. Pool = tangan + terangkut,
// dan sisa pool setelah kombinasi WAJIB >= 1 untuk Kartu Tutupan.
const pool=[...player.hand,...carried];const options=(chosenUids&&chosenUids.length)?[]:findDigMelds(target,pool,8,1);// Jalur otomatis memilih kombinasi TERPANJANG yang sah (varian Joker hanya
// bila lebih panjang dari opsi murni) — sama seperti pilihan bot.
const autoMeld=options.length?options.reduce((best,option)=>(option.length>best.length||(option.length===best.length&&best.usesJoker&&!option.usesJoker))?option:best):null;const chosenSet=new Set((chosenUids&&chosenUids.length)?chosenUids:(autoMeld?.cards||[]).map(card=>card.uid));const chosen=pool.filter(card=>chosenSet.has(card.uid));if(!autoMeld&&chosen.length!==chosenSet.size)return{state,error:'Kartu gali itu tidak ada di tangan atau buanganmu.'};if(chosen.length<2)return{state,error:'Kartu buangan itu belum membentuk kombinasi sah dengan kartu lain.'};const meld=[target,...chosen];const val=validateMeld(meld);if(!val.valid)return{state,error:val.reason};const remaining=pool.filter(card=>!chosenSet.has(card.uid));if(remaining.length<1)return{state,error:'Wajib menyisakan minimal 1 kartu di tangan untuk Kartu Tutupan!'};const players=state.players.map((seat,index)=>index===playerIndex?{...seat,hand:remaining,melds:[...seat.melds,meld]}:seat);return{state:{...state,players,discardPile:curDiscard.slice(0,discardIndex),phase:'discard'},meld,carried}}
export const expectedDeckTotal=playerCount=>playerCount>4?110:55;
export function countTableCards(state){return (state.drawPile||[]).length+(state.discardPile||[]).length+state.players.reduce((sum,seat)=>sum+(seat.hand?.length||0)+(seat.melds||[]).reduce((meldSum,meld)=>meldSum+meld.length,0),0)}

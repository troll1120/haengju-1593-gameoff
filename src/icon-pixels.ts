import { color, PALETTE } from "./presentation";

/** UI pictures use the same one-cell navy outline and palette as the units. */
export const ICON_TONES: Record<string, string> = {
  N: color(PALETTE.outline), G: color(PALETTE.gold), B: color(PALETTE.brass),
  W: color(PALETTE.white), S: color(PALETTE.steelLight), D: color(PALETTE.steelDeep),
  R: color(PALETTE.danger), T: color(PALETTE.leather), H: color(PALETTE.bark),
  F: color(PALETTE.flame), P: color(PALETTE.paper),
};
export const ICON_PIXELS = {
  supply: [
    "................", ".....NN..NN.....", "....NPPNNPPN....", "....NPTNNTPN....",
    "...NPPPNNPPPN...", "...NPPPNNPPPN...", "....NNNNNNNN....", "..NNNNNNNNNNNN..",
    "..NTTTTTTTTTTN..", "..NTHHHHHHHHTN..", "...NTTTTTTTTN...", "...NNNNNNNNNNNN.",
    "....NSSN.NSSN...", "....NSDN.NSDN...", ".....NN...NN....", "................",
  ],
  "unit-cap": [
    "..NNNNNNNNNNNN..", ".NGGGGGGGGGGGBN.", ".NGNNNNNNNNNGBN.", ".NGN..N.N..NGBN.",
    ".NGN.NSSSN.NGBN.", ".NGNNSSSSSNNGBN.", ".NGN.NTTTN.NGBN.", ".NGN..NNN..NGBN.",
    ".NGNNNNNNNNNGBN.", ".NGN.P.P.P.NGBN.", ".NGN.P.P.P.NGBN.", ".NGN.P.P.P.NGBN.",
    ".NGNNNNNNNNNGBN.", ".NBBBBBBBBBBBBN.", "..NNNNNNNNNNNN..", "................",
  ],
  reserve: [
    "................", "....NNN.........", "...NSSSN........", "..NSSSSSN.......",
    "...NTTTN........", "...NPTPN........", "....NNN.........", "..NNDDSNN.......",
    ".NSDDSSSSN......", ".NSDDSSSSN..NN..", "..NNNNNNN..NGGN.",
    "...NDNDN..NGGGGN", "...NDNDN...NGGN.", "...NNNNN....NN..",
    "................", "................",
  ],
  reinforce: [
    "....NNN.........", "...NSSSN........", "..NSSSSSN.......", "...NTTTN........",
    "...NNNNN..NNN...", "..NDDDSNNNSSSN..", ".NDDDSSSNSSSSSN.",
    "..NNNNNN.NTTTN..", "...NDNDN.NPTPN..", "...NNNNN..NNN...",
    "........NNDDSSN.", "..NN...NSDDSSSSN", ".NGGN..NSDDSSSSN",
    "NGGGGN..NNNNNNN.", ".NGGN....NDNDN..", "..NN.....NNNNN..",
  ],
  "wall-archer": [
    "....NNN.........", "...NDDDN....NN..", "..NDDDDDN..NTN..", "...NTTTN..NT.N..",
    "...NPTPN..NT.N..", "...NNNNNNNT..N..", "..NDDSSSTNSSSSNN",
    "..NDDSSSNNT..N..", "...NNNNN..NT.N..", "...........NTN..",
    ".NNN..NNN..NNN..", ".NSSNNNSSNNNSSN.", ".NWWSSSSSSSSSDN.",
    ".NSNNNSSNNNSSDN.", ".NSSSSSSSSSSSDN.", ".NNNNNNNNNNNNNN.",
  ],
  "wall-hwacha": [
    "...F..F..F......", "..NG.NG.NG......", "..NS.NS.NS......", "..NS.NS.NS......",
    "..NS.NS.NS......", ".NNNNNNNNNNNN...", ".NTTTTTTTTTTN...",
    "..NTHTHTHTTN....", "...NNNNNNNN.....", "..NDDN..NDDN....",
    ".NNN..NNN..NNN..", ".NSSNNNSSNNNSSN.", ".NWWSSSSSSSSSDN.",
    ".NSNNNSSNNNSSDN.", ".NSSSSSSSSSSSDN.", ".NNNNNNNNNNNNNN.",
  ],
  coin: [
    "...NNNNNN...", "..NGBBBBGN..", ".NGGGGGGBBN.", "NGGNNNNNNBBN",
    "NGGN....NBBN", "NGGN....NBBN", "NGGN....NBBN", "NGGN....NBBN",
    "NGBNNNNNNBBN", ".NGBBBBBBBN.", "..NGBBBBGN..", "...NNNNNN...",
  ],
  star: [
    ".....NN.....", "....NGGN....", "....NGGN....", ".NNNNGGNNNN.",
    "NGGGGGGGGGBN", ".NGGGGGGGBN.", "..NGGGGGBN..", "..NGGGGGBN..",
    ".NGGGBBGGBN.", ".NGGN..NGBN.", ".NNN....NNN.", "............",
  ],
  "star-empty": [
    ".....NN.....", "....NSSN....", "....NDDN....", ".NNNNDDNNNN.",
    "NSSDDDDDDDDN", ".NDDDDDDDDN.", "..NDDDDDDN..", "..NDDDDDDN..",
    ".NDDDDDDDDN.", ".NDDN..NDDN.", ".NNN....NNN.", "............",
  ],
  shield: [
    "..NNNNNNNNNN....", ".NWSSSSSSSSDN...", ".NWWSSSSSSSDN...",
    ".NWSNSSNSSSDN...", ".NWSNSSNSSSDN...", ".NWSNNNNSSSDN...",
    ".NWSSSSSSSSDN...", ".NWSSSSSSSSDN...", ".NWSSSSSSSSDN...",
    "..NWSSSSSSDN....", "..NWSSSSSSDN....", "...NWSSSSDN.....",
    "....NWSSDN......", ".....NWDN.......", "......NN........", "................",
  ],
  sword: [
    "............NN..", "...........NWN..", "..........NWSN..", ".........NWSDN..",
    "........NWSDN...", ".......NWSDN....", "......NWSDN.....", "..N..NWSDN......",
    ".NGNNWSDN.......", "..NGNSDN........", "...NGDN.........", "...NTGN.........",
    "..NTN.GN........", ".NTN...N........", ".NN.............", "................",
  ],
  pierce: [
    "......NN...NN...", ".....NSN..NSN...", ".....NSN..NSN...", ".....NSN..NSN...",
    ".....NSN..NSN...", "..N..NSN..NSN.N.", ".NWNNNNNNNNNNNWN", "NWWWWWWWWWWWWWWN",
    ".NDNNNNNNNNNNNDN", "..N..NDN..NDN.N.", ".....NDN..NDN...", ".....NDN..NDN...",
    ".....NDN..NDN...", ".....NDN..NDN...", "......NN...NN...", "................",
  ],
  rift: [
    ".NNNN...NNNNNN..", ".NSSN...NSSSSN..", "..NSN..NSSSSN...", "..NSN...NSSSN...",
    "...NSN.NSSSN....", "....NN..NSN.....", ".....N..NN......", "................",
    ".....FF...FF....", "....FGF..FGF....", "...NNNF.NNNF....", "..NWSDNNWSDN....",
    "..NSSDNSSSDN....", "...NDN.NDDN.....", "....N...NN......", "................",
  ],
  jackpot: [
    "................", "...NNNNNNNNNN...", "..NTHHHHHHHHTN..", ".NTTTTTTTTTTTTN.",
    ".NTHHNNNNNNHHTN.", ".NTTTNPPPPNTTTN.", "..NNNNNNNNNNNN..", "...GNGGNGGNGG...",
    "..NGNGGNGGNGGN..", ".NGGNGGNGGNGGGN.", "NBBBBBBBBBBBBBBN", "NTTTTTTGGTTTTTTN",
    "NTHHHHTGGTHHHHTN", "NTTTTTTBBTTTTTTN", ".NNNNNNNNNNNNNN.", "................",
  ],
  crossbow: [
    "....N..N..N.....", "...NW.NW.NW.....",
    "....S..S..S.....", "....S..S..S.....", "..NNNNNNNNNNNN..", ".NTTTTTTTTTTTTN.",
    "NTN.S..S..S.NTN.", "NN..S..S..S..NN.", "....S..S..S.....", "....S..S..S.....",
    "...NNNNNNNNN....", "...NTTTTTTTN....", "....NTHHTN......", "....NTHHTN......",
    "...NTHHHHTN.....", "...NNNNNNNN.....",
  ],
  "rocket-cart": [
    "...F..F..F......", "..FG.FG.FG......", "..NN.NN.NN......", "..NW.NW.NW......",
    "..NS.NS.NS......", "..NS.NS.NS......", "..NS.NS.NS......", "..NS.NS.NS......",
    ".NNNNNNNNNNNN...", ".NTTTTTTTTTTN...", "..NTHHHHHHTN....", "..NTTTTTTTTN....",
    "...NNNNNNNN.....", "..NSSN..NSSN....", "..NDDN..NDDN....", "...NN....NN.....",
  ],
  "skill-up": [
    "...........NN...", "..........NGGN..", ".........NGGGGN.", "..........NGGN..",
    "..........NGGN..", ".NNNNNNN..NNNN..", "NPPPPPPPN.......", "NPSSSSSPN.......",
    "NPSNNNSPN.......", "NPSNGNSPN.......", "NPSNNNSPN.......", "NPSSSSSPN.......",
    "NPPPPPPPN.......", ".NNNNNNN........", "................", "................",
  ],
  card: [
    "..NNNNNNNNNN....", "..NPPPPPPPPN....", "..NPGGGGGGPN....", "..NPGNNNGGPN....",
    "..NPGNGNGGPN....", "..NPGNNNGGPN....", "..NPGGGGGGPN....", "..NPPPPPPPPN....",
    "..NPPPPPPPPN....", "..NPPPPPPPPN....", "..NNNNNNNNNN....", "................",
    "................", "................", "................", "................",
  ],
} satisfies Record<string, string[]>;

export interface Rating {
  id: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface LadderMatch {
  seed: number;
  p1: string;
  p2: string;
  winner: "p1" | "p2";
  p1Wins: number;
  p2Wins: number;
}

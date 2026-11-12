// src/spectator/pixelArt.ts
// 100% Original Procedural Pixel-Art Fighter, Portrait & Stage Renderer
// License: CC0-1.0 / MIT (Original work for galactic-ai-team/ai-fight-club)

export type CanonicalFighterId = 'ion' | 'quark' | 'vexel' | 'cadence9';

export type FighterPose =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'crouch'
  | 'attack'
  | 'block'
  | 'hit'
  | 'ko';

export interface EngineFighterInput {
  id?: string;
  name?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  vx?: number;
  vy?: number;
  hp?: number;
  health?: number;
  maxHp?: number;
  maxHealth?: number;
  color?: string;
  facing?: 'left' | 'right' | number; // -1 or 'left', +1 or 'right'
  state?: string;
  action?: string;
  attacking?: boolean;
  isAttacking?: boolean;
  blocking?: boolean;
  isBlocking?: boolean;
  hit?: boolean;
  isHit?: boolean;
  hurt?: boolean;
}

export interface FighterPalette {
  outline: string;
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  visor: string;
  effect: string;
}

export const FIGHTER_PALETTES: Record<CanonicalFighterId, FighterPalette> = {
  ion: {
    outline: '#09101D',
    primary: '#00B4D8',   // Plasma Cyan
    secondary: '#1D3557', // Cobalt Plating
    accent: '#90E0EF',    // High-Voltage Trim
    glow: '#00F5D4',      // Arc Core
    visor: '#CAF0F8',     // White-Hot Optic
    effect: '#00F5D4',    // Plasma Discharge
  },
  quark: {
    outline: '#1A0B1E',
    primary: '#F72585',   // Quantum Magenta
    secondary: '#3A0CA3', // Hadron Violet
    accent: '#FF9E00',    // Spin-Up Gold
    glow: '#B5179E',      // Strange-Loop Aura
    visor: '#FFEE32',     // Cherenkov Optic
    effect: '#FF6D00',    // Collider Burst
  },
  vexel: {
    outline: '#0D1117',
    primary: '#1E2638',   // Matte Obsidian Polyhedra
    secondary: '#00F5D4', // Hyper Cyan Ribbon
    accent: '#FF2A85',    // Magenta Tensor Edge
    glow: '#72EFDD',      // Hard-Light Prism
    visor: '#F0F7FF',     // Singular Optic
    effect: '#00BBF9',    // Prism Shear Blade
  },
  cadence9: {
    outline: '#14120E',
    primary: '#E09F3E',   // Anodized Brass
    secondary: '#2B303A', // Carbon-Fiber Chassis
    accent: '#FFBE0B',    // Amber Resonance Ring
    glow: '#FB5607',      // Subwoofer Turbine Glow
    visor: '#3A86FF',     // Equalizer Visor
    effect: '#FFBE0B',    // Seismic Waveform
  },
};

const SPRITE_MATRICES: Record<
  CanonicalFighterId,
  { idle: string[]; walk: string[]; attack: string[]; hit: string[] }
> = {
  // ION: Plasma-coil synth-strider with twin dorsal arc pylons
  ion: {
    idle: [
      '..OO........OO..',
      '.OAAO..OOOO.OAAO',
      '.OGGO.OPPPPO.GGO',
      '..OO.OPVVVVPO.O.',
      '.....OPVVVVPO...',
      '.....OOOOOOOO...',
      '...OOPPPPPPPPOO.',
      '..OPPSSGGGGSSPPO',
      '..OPPSGGGGGGSPPO',
      '..OPPSSGGGGSSPPO',
      '..OO.OPPPPPPO.OO',
      '.....OSSSSSSO...',
      '....OSSO..OSSO..',
      '....OPPO..OPPO..',
      '...OPPOO..OOPPO.',
      '...OAAO....OAAO.',
      '...OOOO....OOOO.',
      '................',
    ],
    walk: [
      '..OO........OO..',
      '.OAAO..OOOO.OAAO',
      '.OGGO.OPPPPO.GGO',
      '..OO.OPVVVVPO.O.',
      '.....OPVVVVPO...',
      '.....OOOOOOOO...',
      '...OOPPPPPPPPOO.',
      '..OPPSSGGGGSSPPO',
      '..OPPSGGGGGGSPPO',
      '..OO.OPPPPPPO.OO',
      '.....OSSSSSSO...',
      '...OOSSO..OSSO..',
      '..OPPO.....OPPO.',
      '.OPPOO......OPPO',
      '.OAAO.......OAAO',
      '.OOOO.......OOOO',
      '................',
      '................',
    ],
    attack: [
      '..OO............',
      '.OAAO..OOOO.....',
      '.OGGO.OPPPPO....',
      '..OO.OPVVVVPO...',
      '.....OPVVVVPO...',
      '.....OOOOOOOO...',
      '...OOPPPPPPPPEEE',
      '..OPPSSGGGGPEEEE',
      '..OPPSGGGGGPEEEE',
      '..OO.OPPPPPPOEEE',
      '.....OSSSSSSO...',
      '....OSSO..OSSO..',
      '...OPPO....OPPO.',
      '..OPPOO.....OPPO',
      '..OAAO......OAAO',
      '..OOOO......OOOO',
      '................',
      '................',
    ],
    hit: [
      '....OO........OO',
      '...OAAO.OOOO.OAA',
      '...OGGOPPPPPO.GG',
      '....OOPVVVVPO..O',
      '......OOOOOOOO..',
      '....OOPPPPPPPPOO',
      '...OPPSSGGGGSSPP',
      '...OPPSGGGGGGSPP',
      '....OO.OPPPPPPO.',
      '......OSSSSSSO..',
      '.....OSSO..OSSO.',
      '....OPPO....OPPO',
      '...OAAO.....OAAO',
      '...OOOO.....OOOO',
      '................',
      '................',
      '................',
      '................',
    ],
  },

  // QUARK: Asymmetric quantum-collider construct with spin rings
  quark: {
    idle: [
      '.....OOOOOO.....',
      '...OAAAPPPAAAO..',
      '..OAPPPVVVPPPAO.',
      '..OPPPVVVVVPPPO.',
      '...OOOPPPPPPOOO.',
      '.OO...OOOOOO..OO',
      'OGGO.OPPPPPPOOGG',
      'OGGOOPSSGGSSPOGG',
      '.OO.OPSSGGSSPOOO',
      '....OPPPPPPPPO..',
      '.....OSSSSSSO...',
      '....OSSOOOOSSO..',
      '...OPPO....OPPO.',
      '...OPPO....OPPO.',
      '..OAAOO....OOAAO',
      '..OOOO......OOOO',
      '................',
      '................',
    ],
    walk: [
      '.....OOOOOO.....',
      '...OAAAPPPAAAO..',
      '..OAPPPVVVPPPAO.',
      '..OPPPVVVVVPPPO.',
      '...OOOPPPPPPOOO.',
      '.OO...OOOOOO..OO',
      'OGGO.OPPPPPPOOGG',
      'OGGOOPSSGGSSPOGG',
      '.OO.OPPPPPPPPOOO',
      '.....OSSSSSSO...',
      '...OOSSO..OSSO..',
      '..OPPO.....OPPO.',
      '.OPPO.......OPPO',
      '.OAAO.......OAAO',
      '.OOOO.......OOOO',
      '................',
      '................',
      '................',
    ],
    attack: [
      '.....OOOOOO.....',
      '...OAAAPPPAAAO..',
      '..OAPPPVVVPPPAO.',
      '..OPPPVVVVVPPPO.',
      '...OOOPPPPPPOOO.',
      '......OOOOOOEEEE',
      '....OPPPPPPPEEEE',
      '...OPSSGGSSPEEEE',
      '...OPPPPPPPPEEEE',
      '.....OSSSSSSO...',
      '....OSSO..OSSO..',
      '...OPPO....OPPO.',
      '..OPPO......OPPO',
      '.OAAO.......OAAO',
      '.OOOO.......OOOO',
      '................',
      '................',
      '................',
    ],
    hit: [
      '.......OOOOOO...',
      '.....OAAAPPPAAAO',
      '....OAPPPVVVPPPA',
      '.....OOOPPPPPPOO',
      '.......OOOOOO...',
      '.....OPPPPPPPPO.',
      '....OPSSGGSSPO..',
      '....OPPPPPPPPO..',
      '......OSSSSSSO..',
      '.....OSSO..OSSO.',
      '....OPPO....OPPO',
      '...OAAO.....OAAO',
      '...OOOO.....OOOO',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  },

  // VEXEL: Floating polyhedral tensor-weaver with hard-light ribbons
  vexel: {
    idle: [
      '......OOOO......',
      '....OOPPPPOO....',
      '...OPPVVVVPPO...',
      '..OPPPVVVVPPPO..',
      '...OOPPPPPPOO...',
      '.OO..OOOOOO..OO.',
      'OSSO.OPGGPPO.OSS',
      'OAAOOPGGGGPPOAAO',
      '.OO.OPGGGGPPO.OO',
      '.....OPGGPPO....',
      '...OO.OOOO.OO...',
      '..OSSO....OSSO..',
      '.OAAO......OAAO.',
      '..OO........OO..',
      '.....OG..GO.....',
      '................',
      '................',
      '................',
    ],
    walk: [
      '......OOOO......',
      '....OOPPPPOO....',
      '...OPPVVVVPPO...',
      '..OPPPVVVVPPPO..',
      '...OOPPPPPPOO...',
      '..OO.OOOOOO.OO..',
      '.OSSOOPGGPPOOSSO',
      '.OAAOPGGGGPPOAAO',
      '..OO.OPGGPPO.OO.',
      '......OOOO......',
      '...OSSO..OSSO...',
      '..OAAO....OAAO..',
      '...OO......OO...',
      '....OG....GO....',
      '................',
      '................',
      '................',
      '................',
    ],
    attack: [
      '......OOOO......',
      '....OOPPPPOO....',
      '...OPPVVVVPPO...',
      '...OOPPPPPPOO...',
      '.....OOOOOO.EEEE',
      '..OO.OPGGPPEEEEE',
      '.OSSOPGGGGPEEEEE',
      '.OAAOPGGGGPEEEEE',
      '..OO.OPGGPPEEEEE',
      '......OOOO..EEEE',
      '...OSSO..OSSO...',
      '..OAAO....OAAO..',
      '...OO......OO...',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    hit: [
      '........OOOO....',
      '......OOPPPPOO..',
      '.....OPPVVVVPPO.',
      '......OOPPPPPPOO',
      '.......OOOOOO...',
      '......OPGGPPO...',
      '.....OPGGGGPPO..',
      '......OPGGPPO...',
      '.......OOOO.....',
      '....OSSO..OSSO..',
      '...OAAO....OAAO.',
      '....OO......OO..',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  },

  // CADENCE-9: Heavy brass & carbon acoustic percussion mech
  cadence9: {
    idle: [
      '.OOOO......OOOO.',
      'OGGGGGO..OGGGGGO',
      'OGAAAGO..OGAAAGO',
      '.OOOOOPPPPOOOOO.',
      '...OPPVVVVPPO...',
      '...OPPPPPPPPO...',
      '.OOPPSSSSSSPPOO.',
      'OPPPSSAAAASSPPPO',
      'OPPPSSAGGGSSPPPO',
      'OAAASSAAAASSAAAO',
      'OAAAOSSSSSSOAAAO',
      '.OO.OSSSSSSO.OO.',
      '...OPPPOOPPPO...',
      '..OPPP....PPPO..',
      '..OAAO....OAAO..',
      '.OOOOO....OOOOO.',
      '................',
      '................',
    ],
    walk: [
      '.OOOO......OOOO.',
      'OGGGGGO..OGGGGGO',
      'OGAAAGO..OGAAAGO',
      '.OOOOOPPPPOOOOO.',
      '...OPPVVVVPPO...',
      '...OPPPPPPPPO...',
      '.OOPPSSSSSSPPOO.',
      'OPPPSSAAAASSPPPO',
      'OAAASSAGGGSSAAAO',
      '.OO.OSSSSSSO.OO.',
      '...OPPPOOPPPO...',
      '..OPPP....PPPO..',
      '.OAAO......OAAO.',
      '.OOOOO.....OOOOO',
      '................',
      '................',
      '................',
      '................',
    ],
    attack: [
      '.OOOO......OOOO.',
      'OGGGGGO..OGGGGGO',
      '.OOOOOPPPPOOOOO.',
      '...OPPVVVVPPO...',
      '...OPPPPPPPPO...',
      '.OOPPSSSSSSPPEEE',
      'OPPPSSAAAASSPEEE',
      'OPPPSSAGGGSSPEEE',
      'OAAAOSSSSSSOAEEE',
      '.OO.OSSSSSSO.EEE',
      '...OPPPOOPPPO...',
      '..OPPP....PPPO..',
      '..OAAO....OAAO..',
      '.OOOOO....OOOOO.',
      '..........EEEEEE',
      '.........EEEEEEE',
      '................',
      '................',
    ],
    hit: [
      '...OOOO....OOOO.',
      '..OGGGGGOOGGGGGO',
      '...OOOOOPPPPOOOO',
      '.....OPPVVVVPPO.',
      '.....OPPPPPPPPO.',
      '...OOPPSSSSSSPPO',
      '..OPPPSSAAAASSPP',
      '..OAAAOSSSSSSOAA',
      '....OPPPOOPPPO..',
      '...OPPP....PPPO.',
      '...OAAO....OAAO.',
      '..OOOOO....OOOOO',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  },
};

const PORTRAIT_GRIDS: Record<CanonicalFighterId, string[]> = {
  ion: [
    '.OO......OO.',
    'OAAO.OO.OAAO',
    'OGGOPPPPOGGO',
    '.OOPPPPPPOO.',
    '..OPVVVVPO..',
    '..OPVVVVPO..',
    '..OPGGGGPO..',
    '...OPPPPO...',
    '.OOPSSSSPOO.',
    'OPPSGGGGSPPO',
    'OPPSSGGSSPPO',
    'OOOOOOOOOOOO',
  ],
  quark: [
    '...OOOOOO...',
    '.OOAAAPAAOO.',
    '.OAPPPPPPPAO',
    '.OPPVVVVVPPO',
    '.OPPVGGGGPPO',
    '..OOPPPPPOO.',
    '.OO.OOOO.OO.',
    'OGGOPPPPPOGG',
    'OGGOPSSGPOGG',
    '.OOOPPPPPOOO',
    '..OSSSSSSSO.',
    '..OOOOOOOOO.',
  ],
  vexel: [
    '....OOOO....',
    '..OOPPPPOO..',
    '.OPPSSSSPPO.',
    'OPPVVVVVVPPO',
    'OPPVGGGGVPPO',
    '.OPPPPPPPO..',
    '..OOPGGPOO..',
    '.OO.OOOO.OO.',
    'OSSOOPPPPOAA',
    'OAAOPGGGPOSS',
    '.OO.OPPPO.OO',
    '....OOOO....',
  ],
  cadence9: [
    'OOOO....OOOO',
    'OGGGO..OGGGO',
    'OGAAGOOGAAGO',
    'OOOOOPPPOOOO',
    '..OPVVVVPO..',
    '..OPVAAVPO..',
    '..OPPPPPPO..',
    '.OOPSSSSPOO.',
    'OPPSAAAASPPO',
    'OAASAGGGSAAO',
    'OAAOSSSSOAAO',
    'OOOOOOOOOOOO',
  ],
};

export function resolveCanonicalFighterId(raw?: string): CanonicalFighterId {
  const s = (raw ?? 'ion').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.includes('quark')) return 'quark';
  if (s.includes('vexel')) return 'vexel';
  if (s.includes('cadence')) return 'cadence9';
  if (s.includes('ion')) return 'ion';
  // Deterministic hash fallback for any future AI fighter names
  const order: CanonicalFighterId[] = ['ion', 'quark', 'vexel', 'cadence9'];
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return order[hash % order.length] ?? 'ion';
}

export function getFighterColorChip(rawIdOrName?: string, explicitColor?: string): string {
  if (explicitColor && explicitColor.startsWith('#')) return explicitColor;
  const id = resolveCanonicalFighterId(rawIdOrName);
  return id === 'vexel'
    ? '#00F5D4'
    : id === 'cadence9'
    ? '#E09F3E'
    : FIGHTER_PALETTES[id].primary;
}

export function resolveFighterPose(f: EngineFighterInput): FighterPose {
  const hp = f.hp ?? f.health ?? 100;
  const rawState = (f.state ?? f.action ?? '').toLowerCase();
  if (hp <= 0 || rawState === 'ko' || rawState === 'dead' || rawState === 'defeated') {
    return 'ko';
  }
  if (f.isHit || f.hit || f.hurt || rawState.includes('hit') || rawState.includes('hurt') || rawState.includes('stun')) {
    return 'hit';
  }
  if (f.isAttacking || f.attacking || rawState.includes('attack') || rawState.includes('punch') || rawState.includes('kick') || rawState.includes('special') || rawState.includes('strike')) {
    return 'attack';
  }
  if (f.isBlocking || f.blocking || rawState.includes('block') || rawState.includes('guard')) {
    return 'block';
  }
  if (rawState.includes('jump') || rawState.includes('air') || (f.vy !== undefined && Math.abs(f.vy) > 0.05)) {
    return 'jump';
  }
  if (rawState.includes('walk') || rawState.includes('move') || rawState.includes('run') || (f.vx !== undefined && Math.abs(f.vx) > 0.05)) {
    return 'walk';
  }
  return 'idle';
}

/**
 * Pure sprite-frame lookup used by the renderer and tests.
 * Walk/jump alternate walk vs idle every 6 ticks; attack uses the attack
 * matrix; hit and ko use the hit matrix; other poses use idle.
 */
export function lookupSpriteFrame(
  idOrName: string,
  pose: FighterPose,
  tick = 0,
): string[] {
  const id = resolveCanonicalFighterId(idOrName);
  const matrices = SPRITE_MATRICES[id];
  if (pose === 'walk' || pose === 'jump') {
    return Math.floor(tick / 6) % 2 === 0 ? matrices.walk : matrices.idle;
  }
  if (pose === 'attack') return matrices.attack;
  if (pose === 'hit' || pose === 'ko') return matrices.hit;
  return matrices.idle;
}

/**
 * Renders the cyber-arcade stage background and perspective grid driven by `tick`.
 */
export function drawArenaBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tick: number,
  floorYRatio = 0.78
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const floorY = Math.floor(height * floorYRatio);

  // Deep arcade sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, floorY);
  sky.addColorStop(0, '#050711');
  sky.addColorStop(0.65, '#0C1226');
  sky.addColorStop(1, '#162040');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Tick-driven distant skyline towers
  const pulse = 0.3 + 0.18 * Math.sin(tick * 0.07);
  const cols = 14;
  const colW = Math.ceil(width / cols);
  for (let i = 0; i < cols; i++) {
    const h = ((i * 41 + 23) % 52) + 24;
    const x = i * colW;
    const y = floorY - h;
    ctx.fillStyle = '#090E1E';
    ctx.fillRect(x + 2, y, colW - 4, h);

    ctx.fillStyle =
      i % 2 === 0
        ? `rgba(0, 245, 212, ${pulse.toFixed(2)})`
        : `rgba(247, 37, 133, ${pulse.toFixed(2)})`;
    for (let wy = y + 5; wy < floorY - 4; wy += 7) {
      ctx.fillRect(x + 6, wy, Math.max(4, colW - 12), 2);
    }
  }

  // Horizon laser rail
  ctx.fillStyle = '#00F5D4';
  ctx.fillRect(0, floorY - 2, width, 2);

  // Stage floor deck
  ctx.fillStyle = '#080B16';
  ctx.fillRect(0, floorY, width, height - floorY);

  // Perspective grid lines
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.22)';
  ctx.lineWidth = 1;
  const cx = width / 2;
  for (let g = -9; g <= 9; g++) {
    ctx.beginPath();
    ctx.moveTo(cx + g * (width / 16), floorY);
    ctx.lineTo(cx + g * (width / 5.5), height);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws a single fighter using 100% original procedural pixel matrices.
 * Automatically handles both normalized (0..1) and canvas pixel coordinates.
 */
export function drawFighterSprite(
  ctx: CanvasRenderingContext2D,
  fighter: EngineFighterInput,
  tick: number,
  canvasWidth: number,
  canvasHeight: number,
  floorYRatio = 0.78
): void {
  const id = resolveCanonicalFighterId(fighter.id ?? fighter.name);
  const basePalette = FIGHTER_PALETTES[id];
  const palette: FighterPalette = fighter.color
    ? { ...basePalette, primary: fighter.color }
    : basePalette;

  const pose = resolveFighterPose(fighter);
  const matrices = SPRITE_MATRICES[id];

  // Select frame matrix purely from engine tick
  let grid = matrices.idle;
  if (pose === 'walk' || pose === 'jump') {
    grid = Math.floor(tick / 6) % 2 === 0 ? matrices.walk : matrices.idle;
  } else if (pose === 'attack') {
    grid = matrices.attack;
  } else if (pose === 'hit' || pose === 'ko') {
    grid = matrices.hit;
  }

  // Scale pixel size proportionally to canvas dimensions
  const pixelScale = Math.max(2, Math.round(canvasHeight / 90));
  const firstRow = grid[0] ?? '';
  const cols = firstRow.length;
  const rows = grid.length;
  const spriteW = cols * pixelScale;
  const spriteH = rows * pixelScale;

  // Normalize coordinates: works if x is [0..1] or pixel coordinates [0..canvasWidth]
  const rawX = fighter.x;
  const rawY = fighter.y;
  const screenX = rawX <= 1.5 && rawX >= 0 ? rawX * canvasWidth : rawX;
  const floorY = canvasHeight * floorYRatio;
  let screenFootY = floorY;
  if (rawY !== undefined) {
    if (rawY <= 1.5 && rawY >= 0) {
      // Normalized Y
      screenFootY = rawY > 0.1 ? rawY * canvasHeight : floorY - rawY * canvasHeight;
    } else {
      // Pixel Y (if fighter.height is present, anchor at bottom of box)
      screenFootY = fighter.height ? rawY + fighter.height : rawY;
    }
  }

  // Tick-driven idle/walk vertical oscillation
  const bobPx =
    pose === 'idle'
      ? Math.round(Math.sin(tick * 0.15)) * pixelScale
      : pose === 'walk'
      ? (Math.floor(tick / 4) % 2) * pixelScale
      : 0;

  const facingLeft =
    fighter.facing === 'left' || fighter.facing === -1;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(
    Math.round(screenX - spriteW * 0.38),
    Math.round(floorY - pixelScale),
    Math.round(spriteW * 0.76),
    pixelScale * 2
  );

  ctx.translate(Math.round(screenX), Math.round(screenFootY + bobPx));
  if (facingLeft) {
    ctx.scale(-1, 1);
  }

  if (pose === 'ko') {
    ctx.translate(0, -pixelScale * 3);
    ctx.rotate(-Math.PI / 2);
  }

  const startX = -Math.floor(spriteW / 2);
  const startY = -spriteH;
  const hitFlash = pose === 'hit' && Math.floor(tick / 2) % 2 === 0;

  for (let r = 0; r < rows; r++) {
    const rowStr = grid[r];
    if (!rowStr) continue;
    for (let c = 0; c < cols; c++) {
      const ch = rowStr[c];
      if (!ch || ch === '.') continue;

      if (hitFlash) {
        ctx.fillStyle = '#FFFFFF';
      } else {
        switch (ch) {
          case 'O':
            ctx.fillStyle = palette.outline;
            break;
          case 'P':
            ctx.fillStyle = palette.primary;
            break;
          case 'S':
            ctx.fillStyle = palette.secondary;
            break;
          case 'A':
            ctx.fillStyle = palette.accent;
            break;
          case 'G':
            ctx.fillStyle =
              Math.floor(tick / 8) % 2 === 0 ? palette.glow : palette.accent;
            break;
          case 'V':
            ctx.fillStyle = palette.visor;
            break;
          case 'E':
            ctx.fillStyle = palette.effect;
            break;
          default:
            ctx.fillStyle = palette.primary;
        }
      }

      ctx.fillRect(
        startX + c * pixelScale,
        startY + r * pixelScale,
        pixelScale,
        pixelScale
      );
    }
  }

  // Tick-driven Attack Arc / Seismic Blade
  if (pose === 'attack') {
    const phase = tick % 6;
    ctx.fillStyle = palette.effect;
    const reachX = startX + spriteW;
    const midY = startY + Math.floor(spriteH * 0.4);
    for (let s = 0; s < 4; s++) {
      const bladeLen = (4 - s + (phase % 2)) * pixelScale;
      ctx.fillRect(
        reachX + s * pixelScale,
        midY + (s - 1) * pixelScale * 2,
        bladeLen,
        pixelScale
      );
    }
  }

  // Tick-driven Hex Guard Shield
  if (pose === 'block') {
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = Math.max(2, pixelScale * 0.6);
    const gx = startX + spriteW * 0.78;
    ctx.beginPath();
    ctx.moveTo(gx, startY + pixelScale * 2);
    ctx.lineTo(gx + pixelScale * 3, startY + spriteH * 0.35);
    ctx.lineTo(gx + pixelScale * 3, startY + spriteH * 0.65);
    ctx.lineTo(gx, startY + spriteH - pixelScale * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders a 12x12 original pixel-art mugshot into a <canvas>.
 */
export function drawPortraitToCanvas(
  canvas: HTMLCanvasElement,
  fighterIdOrName?: string,
  pixelScale = 3,
  colorOverride?: string
): void {
  const id = resolveCanonicalFighterId(fighterIdOrName);
  const basePalette = FIGHTER_PALETTES[id];
  const palette = colorOverride
    ? { ...basePalette, primary: colorOverride }
    : basePalette;
  const grid = PORTRAIT_GRIDS[id];
  const size = 12 * pixelScale;

  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#070B16';
  ctx.fillRect(0, 0, size, size);

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (!ch || ch === '.') continue;
      switch (ch) {
        case 'O':
          ctx.fillStyle = palette.outline;
          break;
        case 'P':
          ctx.fillStyle = palette.primary;
          break;
        case 'S':
          ctx.fillStyle = palette.secondary;
          break;
        case 'A':
          ctx.fillStyle = palette.accent;
          break;
        case 'G':
          ctx.fillStyle = palette.glow;
          break;
        case 'V':
          ctx.fillStyle = palette.visor;
          break;
        default:
          ctx.fillStyle = palette.primary;
      }
      ctx.fillRect(c * pixelScale, r * pixelScale, pixelScale, pixelScale);
    }
  }
  ctx.restore();
}
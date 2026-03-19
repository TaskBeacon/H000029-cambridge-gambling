export const COLOR_RED = "red";
export const COLOR_BLUE = "blue";
export const ORDER_ASCENDING = "ascending";
export const ORDER_DESCENDING = "descending";

const DEFAULT_BET_OPTIONS = [5, 25, 50, 75, 95] as const;
const DEFAULT_RATIO_PAIRS = [
  [9, 1],
  [8, 2],
  [7, 3],
  [6, 4]
] as const;
const DEFAULT_BLOCK_ORDER = [ORDER_ASCENDING, ORDER_DESCENDING] as const;

export type ColorToken = typeof COLOR_RED | typeof COLOR_BLUE;
export type BetOrder = typeof ORDER_ASCENDING | typeof ORDER_DESCENDING;

export interface TrialSpec {
  order: BetOrder;
  ratio_label: string;
  red_boxes: number;
  blue_boxes: number;
  majority_color: ColorToken;
  minority_color: ColorToken;
  token_color: ColorToken;
  bet_options: number[];
  red_left: boolean;
}

export interface BetOutcome {
  points_before: number;
  bet_amount: number;
  delta: number;
  points_after: number;
}

function makeSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value: unknown, fallback: number): number {
  return Math.round(toNumber(value, fallback));
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

function normalizeRatios(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) {
    return DEFAULT_RATIO_PAIRS.map((pair) => [pair[0], pair[1]]);
  }
  const clean: Array<[number, number]> = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length < 2) {
      continue;
    }
    let a = toInt(raw[0], 0);
    let b = toInt(raw[1], 0);
    if (a <= 0 || b <= 0) {
      continue;
    }
    const total = a + b;
    if (total <= 0) {
      continue;
    }
    if (total !== 10) {
      const scale = 10 / total;
      a = Math.max(1, Math.round(a * scale));
      b = Math.max(1, Math.round(b * scale));
      const drift = a + b - 10;
      if (drift !== 0) {
        if (a >= b) {
          a = Math.max(1, a - drift);
        } else {
          b = Math.max(1, b - drift);
        }
      }
      if (a + b !== 10) {
        continue;
      }
    }
    const major = Math.max(a, b);
    const minor = Math.min(a, b);
    clean.push([major, minor]);
  }
  if (clean.length === 0) {
    return DEFAULT_RATIO_PAIRS.map((pair) => [pair[0], pair[1]]);
  }
  return clean;
}

function normalizeBetOptions(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_BET_OPTIONS];
  }
  const unique = new Set<number>();
  const clean: number[] = [];
  for (const raw of value) {
    const pct = clamp(toInt(raw, 0), 1, 95);
    if (!Number.isFinite(pct) || unique.has(pct)) {
      continue;
    }
    unique.add(pct);
    clean.push(pct);
  }
  if (clean.length < 3) {
    return [...DEFAULT_BET_OPTIONS];
  }
  return [...clean].sort((a, b) => a - b);
}

function normalizeBlockOrder(value: unknown): BetOrder[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_BLOCK_ORDER];
  }
  const clean: BetOrder[] = [];
  for (const raw of value) {
    const token = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (token === ORDER_ASCENDING || token === ORDER_DESCENDING) {
      clean.push(token);
    }
  }
  if (clean.length === 0) {
    return [...DEFAULT_BLOCK_ORDER];
  }
  return clean;
}

export class Controller {
  readonly initial_points: number;
  readonly enable_logging: boolean;
  readonly box_ratios: Array<[number, number]>;
  readonly bet_options: number[];
  readonly block_order: BetOrder[];
  readonly random_seed: number | null;
  private readonly rng: () => number;
  current_points: number;
  block_idx: number;
  trial_count_total: number;
  trial_count_block: number;

  constructor(args: {
    initial_points?: number;
    box_ratios?: unknown;
    bet_options?: unknown;
    block_order?: unknown;
    random_seed?: number | null;
    enable_logging?: boolean;
  }) {
    this.initial_points = Math.max(1, toInt(args.initial_points, 100));
    this.enable_logging = args.enable_logging !== false;
    this.box_ratios = normalizeRatios(args.box_ratios);
    this.bet_options = normalizeBetOptions(args.bet_options);
    this.block_order = normalizeBlockOrder(args.block_order);
    this.random_seed =
      args.random_seed == null || Number.isNaN(Number(args.random_seed))
        ? null
        : toInt(args.random_seed, 0);
    this.rng = makeSeededRandom(this.random_seed ?? Math.floor(Date.now() % 2147483647));
    this.current_points = this.initial_points;
    this.block_idx = -1;
    this.trial_count_total = 0;
    this.trial_count_block = 0;
  }

  static from_dict(config: Record<string, unknown>): Controller {
    const cfg = config ?? {};
    return new Controller({
      initial_points: toInt(cfg.initial_points, 100),
      box_ratios: cfg.box_ratios,
      bet_options: cfg.bet_options,
      block_order: cfg.block_order,
      random_seed: cfg.random_seed == null ? null : toInt(cfg.random_seed, 0),
      enable_logging: Boolean(cfg.enable_logging ?? true)
    });
  }

  start_block(block_idx: number): void {
    this.block_idx = Math.trunc(block_idx);
    this.trial_count_block = 0;
  }

  current_order(block_idx?: number): BetOrder {
    const idx = Math.max(0, Math.trunc(block_idx ?? this.block_idx));
    return this.block_order[idx % this.block_order.length] ?? ORDER_ASCENDING;
  }

  next_trial_id(): number {
    return this.trial_count_total + 1;
  }

  private sample_ratio(): [number, number] {
    const index = Math.floor(this.rng() * this.box_ratios.length);
    return this.box_ratios[index] ?? [9, 1];
  }

  private sample_majority_color(): ColorToken {
    return this.rng() < 0.5 ? COLOR_RED : COLOR_BLUE;
  }

  private sample_token_color(red_boxes: number, blue_boxes: number): ColorToken {
    const pRed = red_boxes / Math.max(1, red_boxes + blue_boxes);
    return this.rng() < pRed ? COLOR_RED : COLOR_BLUE;
  }

  build_trial(args: { block_idx?: number } = {}): TrialSpec {
    const order = this.current_order(args.block_idx);
    const [major, minor] = this.sample_ratio();
    const majority_color = this.sample_majority_color();
    const red_boxes = majority_color === COLOR_RED ? major : minor;
    const blue_boxes = majority_color === COLOR_RED ? minor : major;
    const token_color = this.sample_token_color(red_boxes, blue_boxes);
    const minority_color = majority_color === COLOR_RED ? COLOR_BLUE : COLOR_RED;
    const ratio_label = `${major}:${minor}`;
    const bet_options =
      order === ORDER_ASCENDING ? [...this.bet_options] : [...this.bet_options].reverse();
    return {
      order,
      ratio_label,
      red_boxes,
      blue_boxes,
      majority_color,
      minority_color,
      token_color,
      bet_options,
      red_left: this.rng() < 0.5
    };
  }

  apply_bet_outcome(args: { bet_percent: number; won: boolean }): BetOutcome {
    const points_before = Math.max(0, Math.round(this.current_points));
    const pct = clamp(Math.round(args.bet_percent), 1, 95);
    let bet_amount = Math.round(points_before * (pct / 100));
    if (points_before > 0 && bet_amount <= 0) {
      bet_amount = 1;
    }
    const delta = args.won ? bet_amount : -bet_amount;
    const points_after = Math.max(0, points_before + delta);
    this.current_points = points_after;
    return {
      points_before,
      bet_amount,
      delta,
      points_after
    };
  }

  no_bet_update(): BetOutcome {
    const points = Math.max(0, Math.round(this.current_points));
    return {
      points_before: points,
      bet_amount: 0,
      delta: 0,
      points_after: points
    };
  }

  record_trial(args: {
    order: string;
    ratio_label: string;
    chosen_color: string;
    token_color: string;
    bet_percent: number | null;
    delta: number;
    color_timed_out: boolean;
    bet_timed_out: boolean;
  }): void {
    this.trial_count_total += 1;
    this.trial_count_block += 1;
    if (!this.enable_logging) {
      return;
    }
    console.debug(
      [
        "[CGT]",
        `block=${this.block_idx}`,
        `trial_block=${this.trial_count_block}`,
        `trial_total=${this.trial_count_total}`,
        `order=${args.order}`,
        `ratio=${args.ratio_label}`,
        `chosen=${args.chosen_color || "none"}`,
        `token=${args.token_color || "none"}`,
        `bet=${args.bet_percent == null ? "none" : args.bet_percent}`,
        `delta=${args.delta}`,
        `points=${this.current_points}`,
        `color_timeout=${args.color_timed_out}`,
        `bet_timeout=${args.bet_timed_out}`
      ].join(" ")
    );
  }
}

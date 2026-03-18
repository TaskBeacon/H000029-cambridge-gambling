import type { ReducedTrialRow } from "psyflow-web";

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const token = String(value ?? "")
    .trim()
    .toLowerCase();
  return token === "1" || token === "true" || token === "yes" || token === "y";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInt(value: unknown, fallback = 0): number {
  const parsed = asNumber(value);
  return parsed == null ? fallback : Math.round(parsed);
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value01: number): string {
  return `${(value01 * 100).toFixed(1)}%`;
}

function formatSignedInt(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

function formatSignedFixed(value: number, digits = 1): string {
  return value >= 0 ? `+${value.toFixed(digits)}` : value.toFixed(digits);
}

function summarizeTrials(rows: ReducedTrialRow[], fallbackPoints: number): {
  total_trials: number;
  quality_rate: string;
  win_rate: string;
  mean_bet_pct: string;
  mean_color_rt_ms: string;
  mean_bet_rt_ms: string;
  color_timeout_count: number;
  bet_timeout_count: number;
  net_sum: number;
  net_sum_signed: string;
  points_end: number;
  delay_aversion: number;
  delay_aversion_signed: string;
  ascending_mean_bet: string;
  descending_mean_bet: string;
} {
  if (rows.length === 0) {
    return {
      total_trials: 0,
      quality_rate: "0.0%",
      win_rate: "0.0%",
      mean_bet_pct: "0.0",
      mean_color_rt_ms: "0",
      mean_bet_rt_ms: "0",
      color_timeout_count: 0,
      bet_timeout_count: 0,
      net_sum: 0,
      net_sum_signed: "+0",
      points_end: Math.max(0, Math.round(fallbackPoints)),
      delay_aversion: 0,
      delay_aversion_signed: "+0.0",
      ascending_mean_bet: "0.0",
      descending_mean_bet: "0.0"
    };
  }

  const qualityValues = rows
    .map((row) => row.chose_majority)
    .filter((value) => value !== null && value !== undefined)
    .map(asBool);
  const winValues = rows
    .map((row) => row.won)
    .filter((value) => value !== null && value !== undefined)
    .map(asBool);
  const betValues = rows.map((row) => asNumber(row.bet_percent)).filter((value): value is number => value != null);
  const colorRtValues = rows
    .map((row) => asNumber(row.color_rt_s ?? row.color_rt))
    .filter((value): value is number => value != null);
  const betRtValues = rows
    .map((row) => asNumber(row.bet_rt_s ?? row.bet_rt))
    .filter((value): value is number => value != null);
  const ascendingBetValues = rows
    .filter((row) => String(row.bet_order ?? "").trim().toLowerCase() === "ascending")
    .map((row) => asNumber(row.bet_percent))
    .filter((value): value is number => value != null);
  const descendingBetValues = rows
    .filter((row) => String(row.bet_order ?? "").trim().toLowerCase() === "descending")
    .map((row) => asNumber(row.bet_percent))
    .filter((value): value is number => value != null);

  const colorTimeoutCount = rows.filter((row) => asBool(row.color_timed_out)).length;
  const betTimeoutCount = rows.filter((row) => asBool(row.bet_timed_out)).length;
  const netSum = rows.reduce((sum, row) => sum + asInt(row.net_change, 0), 0);

  let pointsEnd = Math.max(0, Math.round(fallbackPoints));
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const parsed = asNumber(rows[index].points_after);
    if (parsed != null) {
      pointsEnd = Math.max(0, Math.round(parsed));
      break;
    }
  }

  const qualityRate = qualityValues.length > 0 ? formatPercent(qualityValues.filter(Boolean).length / qualityValues.length) : "0.0%";
  const winRate = winValues.length > 0 ? formatPercent(winValues.filter(Boolean).length / winValues.length) : "0.0%";
  const meanBet = mean(betValues);
  const meanColorRtMs = mean(colorRtValues) * 1000;
  const meanBetRtMs = mean(betRtValues) * 1000;
  const ascendingMeanBet = mean(ascendingBetValues);
  const descendingMeanBet = mean(descendingBetValues);
  const delayAversion = descendingMeanBet - ascendingMeanBet;

  return {
    total_trials: rows.length,
    quality_rate: qualityRate,
    win_rate: winRate,
    mean_bet_pct: meanBet.toFixed(1),
    mean_color_rt_ms: Math.round(meanColorRtMs).toString(),
    mean_bet_rt_ms: Math.round(meanBetRtMs).toString(),
    color_timeout_count: colorTimeoutCount,
    bet_timeout_count: betTimeoutCount,
    net_sum: netSum,
    net_sum_signed: formatSignedInt(netSum),
    points_end: pointsEnd,
    delay_aversion: delayAversion,
    delay_aversion_signed: formatSignedFixed(delayAversion, 1),
    ascending_mean_bet: ascendingMeanBet.toFixed(1),
    descending_mean_bet: descendingMeanBet.toFixed(1)
  };
}

export function summarizeBlock(
  rows: ReducedTrialRow[],
  blockId: string,
  fallbackPoints: number
): {
  quality_rate: string;
  win_rate: string;
  mean_bet_pct: string;
  mean_color_rt_ms: string;
  mean_bet_rt_ms: string;
  color_timeout_count: number;
  bet_timeout_count: number;
  net_sum: number;
  net_sum_signed: string;
  points_end: number;
  delay_aversion: number;
  delay_aversion_signed: string;
  ascending_mean_bet: string;
  descending_mean_bet: string;
} {
  const blockRows = rows.filter((row) => String(row.block_id ?? "") === blockId);
  return summarizeTrials(blockRows, fallbackPoints);
}

export function summarizeOverall(
  rows: ReducedTrialRow[],
  fallbackPoints: number
): {
  total_trials: number;
  quality_rate: string;
  win_rate: string;
  mean_bet_pct: string;
  mean_color_rt_ms: string;
  mean_bet_rt_ms: string;
  color_timeout_count: number;
  bet_timeout_count: number;
  net_sum: number;
  net_sum_signed: string;
  points_end: number;
  delay_aversion: number;
  delay_aversion_signed: string;
  ascending_mean_bet: string;
  descending_mean_bet: string;
} {
  return summarizeTrials(rows, fallbackPoints);
}


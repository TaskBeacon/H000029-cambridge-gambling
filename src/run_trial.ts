import {
  set_trial_context,
  type StimBank,
  type StimSpec,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import { COLOR_BLUE, COLOR_RED, type Controller, type TrialSpec } from "./controller";

interface TrialOutcome {
  color_timed_out: boolean;
  bet_timed_out: boolean;
  chosen_color: string;
  chosen_color_cn: string;
  token_color: string;
  token_color_cn: string;
  bet_response_key: string;
  bet_percent: number | null;
  won: boolean | null;
  net_change: number;
  net_change_signed: string;
  points_before: number;
  points_after: number;
  bet_amount: number;
  feedback_type: "feedback_outcome" | "feedback_auto_bet" | "feedback_color_timeout";
  feedback_auto_bet: boolean;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function sampleDuration(controller: Controller, value: unknown, fallback: number): number {
  return controller.sample_duration(value, fallback);
}

function colorName(colorToken: string, labels: Record<string, unknown>): string {
  const token = normalizeKey(colorToken);
  if (token === COLOR_RED) {
    return String(labels.red ?? "red");
  }
  if (token === COLOR_BLUE) {
    return String(labels.blue ?? "blue");
  }
  return token || "none";
}

function formatSignedInt(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

function boxPositions(): Array<[number, number]> {
  return new Array(10).fill(null).map((_, index) => [-450 + index * 100, 150]);
}

function betPositions(): Array<[number, number]> {
  return [
    [-320, -70],
    [-160, -70],
    [0, -70],
    [160, -70],
    [320, -70]
  ];
}

function drawBoxes(stimBank: StimBank, spec: TrialSpec): StimSpec[] {
  const leftColor = spec.red_left ? COLOR_RED : COLOR_BLUE;
  const rightColor = spec.red_left ? COLOR_BLUE : COLOR_RED;
  const leftCount = spec.red_left ? spec.red_boxes : spec.blue_boxes;
  const rightCount = spec.red_left ? spec.blue_boxes : spec.red_boxes;
  const colorTokens = [
    ...new Array(leftCount).fill(leftColor),
    ...new Array(rightCount).fill(rightColor)
  ] as string[];
  const positions = boxPositions();
  const stims: StimSpec[] = [];
  for (let index = 0; index < 10; index += 1) {
    const colorToken = colorTokens[index] ?? rightColor;
    stims.push(
      stimBank.rebuild("box_token_template", {
        pos: positions[index],
        fillColor: colorToken === COLOR_RED ? "#eb3a3a" : "#3f6df2",
        lineColor: "#f5f5f5"
      })
    );
  }
  return stims;
}

function drawBetOptions(
  stimBank: StimBank,
  betOptions: number[],
  betKeys: string[]
): {
  stims: StimSpec[];
  legend: string;
  key_to_percent: Record<string, number>;
  active_keys: string[];
  fallback_key: string;
  fallback_percent: number;
} {
  const positions = betPositions();
  const keyCount = Math.max(1, Math.min(betOptions.length, betKeys.length, positions.length));
  const activeKeys = betKeys.slice(0, keyCount);
  const activeBets = betOptions.slice(0, keyCount);
  const stims: StimSpec[] = [];
  const legendParts: string[] = [];
  const map: Record<string, number> = {};
  for (let index = 0; index < keyCount; index += 1) {
    const key = normalizeKey(activeKeys[index]);
    const percent = Math.round(activeBets[index]);
    map[key] = percent;
    legendParts.push(`${key}=${percent}%`);
    stims.push(
      stimBank.rebuild("bet_option_template", {
        text: `${percent}%`,
        pos: positions[index]
      })
    );
  }
  return {
    stims,
    legend: legendParts.join(" / "),
    key_to_percent: map,
    active_keys: activeKeys.map((key) => normalizeKey(key)),
    fallback_key: normalizeKey(activeKeys[activeKeys.length - 1]),
    fallback_percent: Math.round(activeBets[activeBets.length - 1])
  };
}

function computeOutcome(
  snapshot: TrialSnapshot,
  args: {
    controller: Controller;
    spec: TrialSpec;
    color_labels: Record<string, unknown>;
    red_key: string;
    blue_key: string;
    key_to_percent: Record<string, number>;
    fallback_key: string;
    fallback_percent: number;
  }
): TrialOutcome {
  const {
    controller,
    spec,
    color_labels: colorLabels,
    red_key: redKey,
    blue_key: blueKey,
    key_to_percent: keyToPercent,
    fallback_key: fallbackKey,
    fallback_percent: fallbackPercent
  } = args;
  const colorResponseKey = normalizeKey(
    snapshot.units.color_choice?.color_response_key ?? snapshot.units.color_choice?.response
  );
  const colorTimedOut = colorResponseKey !== redKey && colorResponseKey !== blueKey;
  const tokenColor = spec.token_color;
  const tokenColorCn = colorName(tokenColor, colorLabels);

  if (colorTimedOut) {
    const noBet = controller.no_bet_update();
    return {
      color_timed_out: true,
      bet_timed_out: false,
      chosen_color: "none",
      chosen_color_cn: "none",
      token_color: tokenColor,
      token_color_cn: tokenColorCn,
      bet_response_key: "",
      bet_percent: null,
      won: null,
      net_change: noBet.delta,
      net_change_signed: formatSignedInt(noBet.delta),
      points_before: noBet.points_before,
      points_after: noBet.points_after,
      bet_amount: noBet.bet_amount,
      feedback_type: "feedback_color_timeout",
      feedback_auto_bet: false
    };
  }

  const chosenColor = colorResponseKey === redKey ? COLOR_RED : COLOR_BLUE;
  const chosenColorCn = colorName(chosenColor, colorLabels);
  const betResponseRaw = normalizeKey(
    snapshot.units.bet_choice?.bet_response_key ?? snapshot.units.bet_choice?.response
  );
  const betTimedOut = keyToPercent[betResponseRaw] == null;
  const betResponseKey = betTimedOut ? fallbackKey : betResponseRaw;
  const betPercent = betTimedOut ? fallbackPercent : Math.round(keyToPercent[betResponseRaw]);
  const won = chosenColor === tokenColor;
  const outcome = controller.apply_bet_outcome({
    bet_percent: betPercent,
    won
  });

  return {
    color_timed_out: false,
    bet_timed_out: betTimedOut,
    chosen_color: chosenColor,
    chosen_color_cn: chosenColorCn,
    token_color: tokenColor,
    token_color_cn: tokenColorCn,
    bet_response_key: betResponseKey,
    bet_percent: betPercent,
    won,
    net_change: outcome.delta,
    net_change_signed: formatSignedInt(outcome.delta),
    points_before: outcome.points_before,
    points_after: outcome.points_after,
    bet_amount: outcome.bet_amount,
    feedback_type: betTimedOut ? "feedback_auto_bet" : "feedback_outcome",
    feedback_auto_bet: betTimedOut
  };
}

function getOutcome(snapshot: TrialSnapshot): TrialOutcome | null {
  const value = snapshot.units.trial_outcome?.outcome_payload;
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as TrialOutcome;
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    controller: Controller;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, controller, block_id, block_idx } = context;
  const conditionName = normalizeKey(condition) || "gambling";
  const spec = controller.build_trial({
    block_idx
  });

  const triggerMap = (settings.triggers ?? {}) as Record<string, unknown>;
  const redKey = normalizeKey(settings.red_key ?? "f");
  const blueKey = normalizeKey(settings.blue_key ?? "j");
  const colorKeys = [redKey, blueKey];
  const majorityKey = spec.majority_color === COLOR_RED ? redKey : blueKey;
  const minorityKey = majorityKey === redKey ? blueKey : redKey;

  const betKeysRaw = toStringList(settings.bet_keys).map((value) => normalizeKey(value));
  const betKeys = betKeysRaw.length > 0 ? betKeysRaw : ["1", "2", "3", "4", "5"];
  const betOptionView = drawBetOptions(stimBank, spec.bet_options, betKeys);

  const colorLabels = toRecord(settings.color_labels);
  const orderLabels = toRecord(settings.order_labels);
  const orderLabel = String(orderLabels[spec.order] ?? spec.order);

  const fixationDuration = sampleDuration(controller, settings.fixation_duration, 0.45);
  const colorDeadline = Math.max(
    0.2,
    Number(settings.color_choice_deadline ?? controller.color_choice_deadline)
  );
  const betDeadline = Math.max(
    0.2,
    Number(settings.bet_choice_deadline ?? controller.bet_choice_deadline)
  );
  const feedbackDuration = Math.max(
    0.1,
    Number(settings.feedback_duration ?? controller.feedback_duration)
  );
  const itiDuration = sampleDuration(controller, settings.iti_duration, 0.45);

  const fixation = trial.unit("fixation").addStim(stimBank.get("fixation"));
  set_trial_context(fixation, {
    trial_id: trial.trial_id,
    phase: "fixation",
    deadline_s: fixationDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "fixation",
      bet_order: spec.order,
      ratio_label: spec.ratio_label,
      red_boxes: spec.red_boxes,
      blue_boxes: spec.blue_boxes,
      block_idx
    },
    stim_id: "fixation"
  });
  fixation.show({ duration: fixationDuration }).to_dict();

  const colorChoice = trial
    .unit("color_choice")
    .addStim(stimBank.get("trial_prompt"))
    .addStim(() =>
      stimBank.get_and_format("score_text", {
        current_points: Math.round(controller.current_points)
      })
    )
    .addStim(
      stimBank.get_and_format("ratio_text", {
        red_boxes: spec.red_boxes,
        blue_boxes: spec.blue_boxes,
        ratio_label: spec.ratio_label
      })
    )
    .addStim(...drawBoxes(stimBank, spec))
    .addStim(
      stimBank.get_and_format("color_key_hint", {
        red_key: redKey.toUpperCase(),
        blue_key: blueKey.toUpperCase()
      })
    );
  set_trial_context(colorChoice, {
    trial_id: trial.trial_id,
    phase: "color_choice",
    deadline_s: colorDeadline,
    valid_keys: colorKeys,
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "color_choice",
      bet_order: spec.order,
      ratio_label: spec.ratio_label,
      red_boxes: spec.red_boxes,
      blue_boxes: spec.blue_boxes,
      majority_key: majorityKey,
      minority_key: minorityKey,
      block_idx
    },
    stim_id: "trial_prompt+score_text+ratio_text+box_token_template*10+color_key_hint"
  });
  colorChoice
    .captureResponse({
      keys: colorKeys,
      correct_keys: colorKeys,
      duration: colorDeadline,
      response_trigger: {
        [redKey]: Number(triggerMap.choice_red ?? 31),
        [blueKey]: Number(triggerMap.choice_blue ?? 32)
      },
      timeout_trigger: Number(triggerMap.color_timeout ?? 33)
    })
    .set_state({
      color_response_key: (snapshot: TrialSnapshot) =>
        normalizeKey(snapshot.units.color_choice?.response),
      color_timed_out: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.color_choice?.response);
        return key !== redKey && key !== blueKey;
      },
      color_rt_s: (snapshot: TrialSnapshot) => {
        const rt = Number(snapshot.units.color_choice?.rt);
        return Number.isFinite(rt) ? rt : null;
      },
      chosen_color: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.color_choice?.response);
        if (key === redKey) {
          return COLOR_RED;
        }
        if (key === blueKey) {
          return COLOR_BLUE;
        }
        return "none";
      },
      chosen_color_cn: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.color_choice?.response);
        if (key === redKey) {
          return colorName(COLOR_RED, colorLabels);
        }
        if (key === blueKey) {
          return colorName(COLOR_BLUE, colorLabels);
        }
        return "none";
      },
      chose_majority: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.color_choice?.response);
        if (key !== redKey && key !== blueKey) {
          return null;
        }
        const chosen = key === redKey ? COLOR_RED : COLOR_BLUE;
        return chosen === spec.majority_color;
      }
    })
    .to_dict();

  const betResponseTrigger: Record<string, number> = {};
  betOptionView.active_keys.forEach((key, index) => {
    betResponseTrigger[key] = Number(triggerMap[`bet_key_${index + 1}`] ?? 41 + index);
  });

  const betChoice = trial
    .unit("bet_choice")
    .addStim(() =>
      stimBank.get_and_format("score_text", {
        current_points: Math.round(controller.current_points)
      })
    )
    .addStim(
      stimBank.get_and_format("ratio_text", {
        red_boxes: spec.red_boxes,
        blue_boxes: spec.blue_boxes,
        ratio_label: spec.ratio_label
      })
    )
    .addStim(...drawBoxes(stimBank, spec))
    .addStim(
      stimBank.get_and_format("bet_prompt", {
        order_label: orderLabel
      })
    )
    .addStim(...betOptionView.stims)
    .addStim(
      stimBank.get_and_format("bet_key_hint", {
        bet_legend: betOptionView.legend
      })
    );
  set_trial_context(betChoice, {
    trial_id: trial.trial_id,
    phase: "bet_choice",
    deadline_s: betDeadline,
    valid_keys: betOptionView.active_keys,
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "bet_choice",
      bet_order: spec.order,
      ratio_label: spec.ratio_label,
      red_boxes: spec.red_boxes,
      blue_boxes: spec.blue_boxes,
      block_idx
    },
    stim_id: "score_text+ratio_text+box_token_template*10+bet_prompt+bet_option_template*5+bet_key_hint"
  });
  betChoice
    .captureResponse({
      keys: betOptionView.active_keys,
      correct_keys: betOptionView.active_keys,
      duration: betDeadline,
      response_trigger: betResponseTrigger,
      timeout_trigger: Number(triggerMap.bet_timeout ?? 46)
    })
    .when((snapshot: TrialSnapshot) => snapshot.units.color_choice?.color_timed_out !== true)
    .set_state({
      bet_response_key: (snapshot: TrialSnapshot) => normalizeKey(snapshot.units.bet_choice?.response),
      bet_timed_out: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.bet_choice?.response);
        return betOptionView.key_to_percent[key] == null;
      },
      bet_percent: (snapshot: TrialSnapshot) => {
        const key = normalizeKey(snapshot.units.bet_choice?.response);
        return betOptionView.key_to_percent[key] == null
          ? betOptionView.fallback_percent
          : betOptionView.key_to_percent[key];
      },
      bet_rt_s: (snapshot: TrialSnapshot) => {
        const rt = Number(snapshot.units.bet_choice?.rt);
        return Number.isFinite(rt) ? rt : null;
      }
    })
    .to_dict();

  const trialOutcome = trial.unit("trial_outcome");
  set_trial_context(trialOutcome, {
    trial_id: trial.trial_id,
    phase: "trial_outcome",
    deadline_s: 0,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "trial_outcome",
      bet_order: spec.order,
      ratio_label: spec.ratio_label,
      block_idx
    },
    stim_id: "trial_outcome"
  });
  trialOutcome
    .show({ duration: 0 })
    .set_state({
      outcome_payload: (snapshot: TrialSnapshot) =>
        computeOutcome(snapshot, {
          controller,
          spec,
          color_labels: colorLabels,
          red_key: redKey,
          blue_key: blueKey,
          key_to_percent: betOptionView.key_to_percent,
          fallback_key: betOptionView.fallback_key,
          fallback_percent: betOptionView.fallback_percent
        })
    });

  const feedback = trial.unit("feedback").addStim((snapshot: TrialSnapshot) => {
    const outcome = getOutcome(snapshot);
    if (!outcome || outcome.feedback_type === "feedback_color_timeout") {
      return stimBank.get_and_format("feedback_color_timeout", {
        token_color_cn: outcome?.token_color_cn ?? colorName(spec.token_color, colorLabels),
        points_after: Math.round(outcome?.points_after ?? controller.current_points)
      });
    }
    const feedbackStimName =
      outcome.feedback_type === "feedback_auto_bet" ? "feedback_auto_bet" : "feedback_outcome";
    return stimBank.get_and_format(feedbackStimName, {
      chosen_color_cn: outcome.chosen_color_cn,
      token_color_cn: outcome.token_color_cn,
      bet_percent: outcome.bet_percent ?? betOptionView.fallback_percent,
      bet_amount: outcome.bet_amount,
      net_change_signed: outcome.net_change_signed,
      points_after: outcome.points_after
    });
  });
  set_trial_context(feedback, {
    trial_id: trial.trial_id,
    phase: "feedback",
    deadline_s: feedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "feedback",
      bet_order: spec.order,
      ratio_label: spec.ratio_label,
      block_idx
    },
    stim_id: "feedback"
  });
  feedback
    .show({ duration: feedbackDuration })
    .set_state({
      chosen_color: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.chosen_color ?? "none",
      chosen_color_cn: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.chosen_color_cn ?? "none",
      token_color_cn: (snapshot: TrialSnapshot) =>
        getOutcome(snapshot)?.token_color_cn ?? colorName(spec.token_color, colorLabels),
      bet_percent: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.bet_percent ?? null,
      bet_amount: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.bet_amount ?? 0,
      won: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.won ?? null,
      net_change: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.net_change ?? 0,
      points_before: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.points_before ?? null,
      points_after: (snapshot: TrialSnapshot) =>
        Math.round(getOutcome(snapshot)?.points_after ?? controller.current_points),
      feedback_auto_bet: (snapshot: TrialSnapshot) => getOutcome(snapshot)?.feedback_auto_bet ?? false,
      feedback_type: (snapshot: TrialSnapshot) =>
        getOutcome(snapshot)?.feedback_type ?? "feedback_color_timeout"
    })
    .to_dict();

  const iti = trial.unit("iti").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trial.trial_id,
    phase: "iti",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "iti",
      block_idx
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration }).to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    const outcome = getOutcome(snapshot);
    const chosenColor = outcome?.chosen_color ?? "none";
    const choseMajority =
      chosenColor === "none" ? null : chosenColor === spec.majority_color;
    const colorRt = snapshot.units.color_choice?.color_rt_s ?? null;
    const betRt = snapshot.units.bet_choice?.bet_rt_s ?? null;
    const betPercent = outcome?.bet_percent ?? null;
    const colorTimedOut = outcome?.color_timed_out ?? true;
    const betTimedOut = outcome?.bet_timed_out ?? false;

    helpers.setTrialState("condition", conditionName);
    helpers.setTrialState("condition_id", conditionName);
    helpers.setTrialState("bet_order", spec.order);
    helpers.setTrialState("ratio_label", spec.ratio_label);
    helpers.setTrialState("red_boxes", spec.red_boxes);
    helpers.setTrialState("blue_boxes", spec.blue_boxes);
    helpers.setTrialState("majority_color", spec.majority_color);
    helpers.setTrialState("minority_color", spec.minority_color);
    helpers.setTrialState("token_color", outcome?.token_color ?? spec.token_color);
    helpers.setTrialState("token_color_cn", outcome?.token_color_cn ?? colorName(spec.token_color, colorLabels));
    helpers.setTrialState("red_left", spec.red_left);
    helpers.setTrialState(
      "color_response_key",
      normalizeKey(snapshot.units.color_choice?.color_response_key ?? "")
    );
    helpers.setTrialState("color_timed_out", colorTimedOut);
    helpers.setTrialState("color_rt", colorRt);
    helpers.setTrialState("color_rt_s", colorRt);
    helpers.setTrialState("chosen_color", chosenColor);
    helpers.setTrialState("chosen_color_cn", outcome?.chosen_color_cn ?? "none");
    helpers.setTrialState("chose_majority", choseMajority);
    helpers.setTrialState("bet_response_key", outcome?.bet_response_key ?? "");
    helpers.setTrialState("bet_percent", betPercent);
    helpers.setTrialState("bet_timed_out", betTimedOut);
    helpers.setTrialState("bet_rt", colorTimedOut ? null : betRt);
    helpers.setTrialState("bet_rt_s", colorTimedOut ? null : betRt);
    helpers.setTrialState("won", outcome?.won ?? null);
    helpers.setTrialState("net_change", outcome?.net_change ?? 0);
    helpers.setTrialState("points_before", outcome?.points_before ?? Math.round(controller.current_points));
    helpers.setTrialState("points_after", outcome?.points_after ?? Math.round(controller.current_points));
    helpers.setTrialState("bet_amount", outcome?.bet_amount ?? 0);
    helpers.setTrialState("feedback_auto_bet", outcome?.feedback_auto_bet ?? false);
    helpers.setTrialState("feedback_type", outcome?.feedback_type ?? "feedback_color_timeout");

    controller.record_trial({
      order: spec.order,
      ratio_label: spec.ratio_label,
      chosen_color: chosenColor,
      token_color: outcome?.token_color ?? spec.token_color,
      bet_percent: betPercent,
      delta: outcome?.net_change ?? 0,
      color_timed_out: colorTimedOut,
      bet_timed_out: betTimedOut
    });
  });

  return trial;
}


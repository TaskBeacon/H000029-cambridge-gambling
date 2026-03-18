import {
  BlockUnit,
  StimBank,
  SubInfo,
  TaskSettings,
  TrialBuilder,
  count_down,
  mountTaskApp,
  next_trial_id,
  parsePsyflowConfig,
  reset_trial_counter,
  type CompiledTrial,
  type Resolvable,
  type RuntimeView,
  type StimRef,
  type StimSpec,
  type TrialSnapshot
} from "psyflow-web";

import configText from "./config/config.yaml?raw";
import { Controller } from "./src/controller";
import { run_trial } from "./src/run_trial";
import { summarizeBlock, summarizeOverall } from "./src/utils";

function buildWaitTrial(
  meta: { trial_id: string; condition: string; trial_index: number },
  blockId: string | null,
  unitLabel: string,
  stimInputs: Array<Resolvable<StimRef | StimSpec | null>>
): CompiledTrial {
  const trial = new TrialBuilder({
    trial_id: meta.trial_id,
    block_id: blockId,
    trial_index: meta.trial_index,
    condition: meta.condition
  });
  trial.unit(unitLabel).addStim(...stimInputs).waitAndContinue();
  return trial.build();
}

export async function run(root: HTMLElement): Promise<void> {
  const parsed = parsePsyflowConfig(configText, import.meta.url);
  const settings = TaskSettings.from_dict(parsed.task_config);
  const subInfo = new SubInfo(parsed.subform_config);
  const stimBank = new StimBank(parsed.stim_config);
  const controller = Controller.from_dict(parsed.controller_config);

  settings.triggers = parsed.trigger_config;
  settings.controller = parsed.controller_config;

  if (settings.voice_enabled) {
    stimBank.convert_to_voice("instruction_text", {
      voice: String(settings.voice_name ?? "zh-CN-YunyangNeural"),
      rate: 1
    });
  }

  await mountTaskApp({
    root,
    task_id: "H000029-cambridge-gambling",
    task_name: "Cambridge Gambling Task",
    task_description:
      "HTML preview aligned to local psyflow Cambridge Gambling procedure and parameters.",
    settings,
    subInfo,
    stimBank,
    buildTrials: (): CompiledTrial[] => {
      reset_trial_counter();
      const compiledTrials: CompiledTrial[] = [];
      const totalBlocks = Math.max(1, Number(settings.total_blocks ?? 1));
      const trialPerBlock = Math.max(
        1,
        Number(settings.trial_per_block ?? settings.trials_per_block ?? 1)
      );

      const instructionInputs: Array<Resolvable<StimRef | StimSpec | null>> = [
        stimBank.get("instruction_text")
      ];
      if (settings.voice_enabled) {
        instructionInputs.push(stimBank.get("instruction_text_voice"));
      }
      compiledTrials.push(
        buildWaitTrial(
          {
            trial_id: "instruction",
            condition: "instruction",
            trial_index: -1
          },
          null,
          "instruction_text",
          instructionInputs
        )
      );

      for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
        const blockId = `block_${blockIndex}`;
        controller.start_block(blockIndex);

        compiledTrials.push(
          ...count_down({
            seconds: 3,
            block_id: blockId,
            trial_id_prefix: `countdown_${blockId}`,
            stim: {
              color: "white",
              height: 3.5
            }
          })
        );

        const block = new BlockUnit({
          block_id: blockId,
          block_idx: blockIndex,
          settings,
          n_trials: trialPerBlock
        }).generate_conditions();

        block.conditions.forEach((condition, trialIndex) => {
          const trial = new TrialBuilder({
            trial_id: next_trial_id(),
            block_id: blockId,
            trial_index: trialIndex,
            condition: String(condition)
          });
          run_trial(trial, String(condition), {
            settings,
            stimBank,
            controller,
            block_id: blockId,
            block_idx: blockIndex
          });
          compiledTrials.push(trial.build());
        });

        if (blockIndex < totalBlocks - 1) {
          compiledTrials.push(
            buildWaitTrial(
              {
                trial_id: `block_break_${blockIndex}`,
                condition: "block_break",
                trial_index: block.conditions.length + blockIndex
              },
              blockId,
              "block_break",
              [
                (_snapshot: TrialSnapshot, runtime: RuntimeView) => {
                  const summary = summarizeBlock(
                    runtime.getReducedRows(),
                    blockId,
                    Math.round(controller.current_points)
                  );
                  return stimBank.get_and_format("block_break", {
                    block_num: blockIndex + 1,
                    total_blocks: totalBlocks,
                    points_end: summary.points_end,
                    block_net_signed: summary.net_sum_signed,
                    quality_rate: summary.quality_rate,
                    win_rate: summary.win_rate,
                    mean_bet_pct: summary.mean_bet_pct,
                    mean_color_rt_ms: summary.mean_color_rt_ms,
                    mean_bet_rt_ms: summary.mean_bet_rt_ms,
                    color_timeout_count: summary.color_timeout_count,
                    bet_timeout_count: summary.bet_timeout_count,
                    delay_aversion_signed: summary.delay_aversion_signed
                  });
                }
              ]
            )
          );
        }
      }

      compiledTrials.push(
        buildWaitTrial(
          {
            trial_id: "goodbye",
            condition: "goodbye",
            trial_index: Number(settings.total_trials ?? 0)
          },
          null,
          "goodbye",
          [
            (_snapshot: TrialSnapshot, runtime: RuntimeView) => {
              const summary = summarizeOverall(
                runtime.getReducedRows(),
                Math.round(controller.current_points)
              );
              return stimBank.get_and_format("good_bye", {
                total_trials: summary.total_trials,
                points_end: summary.points_end,
                net_total_signed: summary.net_sum_signed,
                quality_rate: summary.quality_rate,
                win_rate: summary.win_rate,
                mean_bet_pct: summary.mean_bet_pct,
                ascending_mean_bet: summary.ascending_mean_bet,
                descending_mean_bet: summary.descending_mean_bet,
                delay_aversion_signed: summary.delay_aversion_signed,
                mean_color_rt_ms: summary.mean_color_rt_ms,
                mean_bet_rt_ms: summary.mean_bet_rt_ms,
                color_timeout_count: summary.color_timeout_count,
                bet_timeout_count: summary.bet_timeout_count
              });
            }
          ]
        )
      );

      return compiledTrials;
    }
  });
}

export async function main(root: HTMLElement): Promise<void> {
  await run(root);
}

export default main;


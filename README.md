# Cambridge Gambling Task

![Maturity: smoke_tested](https://img.shields.io/badge/Maturity-smoke_tested-16a34a?style=flat-square&labelColor=111827)

| Field | Value |
|---|---|
| Name | Cambridge Gambling Task |
| Version | 0.1.0 |
| URL / Repository | https://github.com/TaskBeacon/H000029-cambridge-gambling |
| Short Description | Browser-native preview of the Cambridge Gambling Task aligned to the local Python canonical task. |
| Created By | TaskBeacon |
| Date Updated | 2026-03-19 |
| Modality | Behavior |
| Language | Chinese |
| Voice Name | zh-CN-YunyangNeural (voice disabled by default) |

## 1. Task Overview

This browser preview mirrors the canonical `T000029-cambridge-gambling` task contract: participants judge the more likely box color in a 10-box display, then choose a bet percentage on the same trial. The web task keeps the same block order semantics, timeout policy, and reduced-trial meaning as the local Python task.

The browser layer differs only in runtime packaging and deployment. The task repo stays source-only and is refreshed by the shared `psyflow-web` runner through the `notify-psyflow-web` workflow.

## 2. Task Flow

### Block-Level Flow

| Step | Description |
|---|---|
| 1. Block context | The controller sets the block-level bet order (`ascending` or `descending`) and maintains the current point total. |
| 2. Trial execution | Each trial samples a box ratio, majority-color side, and token outcome probability from the canonical controller policy. |
| 3. Block summary | Reports score, quality-of-decision, win rate, mean bet, RTs, timeout counts, and delay-aversion proxy. |
| 4. Task summary | Final metrics compare ascending versus descending bet behavior. |

### Trial-Level Flow

| Step | Description |
|---|---|
| Fixation | Short jittered fixation (`+`) from `timing.fixation_duration`. |
| Color choice | Show 10 red/blue boxes + ratio text; participant chooses `F=红` or `J=蓝`. |
| Bet choice | Show five bet options (5/25/50/75/95) ordered by block context; participant selects with `1-5`. |
| Feedback | Reveal token color, applied stake, point delta, and updated score. |
| ITI | Short jittered fixation before the next trial from `timing.iti_duration`. |

### Controller Logic

| Component | Description |
|---|---|
| Ratio sampler | Samples one pair from `[[9,1],[8,2],[7,3],[6,4]]` each trial. |
| Outcome sampler | Token color is sampled by visible probability (`P(red)=red_boxes/10`). |
| Bet order | `ascending` uses `[5,25,50,75,95]`; `descending` reverses the order. |
| Score update | `bet_amount = round(points_before * bet_percent / 100)`; win adds, loss subtracts. |
| Timeout policy | Color timeout -> no bet and no score change; bet timeout -> auto-select last displayed percentage. |

### Runtime Context Phases

| Phase Label | Meaning |
|---|---|
| `fixation` | Inter-stage fixation. |
| `color_choice` | Explicit probability judgment stage. |
| `bet_choice` | Percentage betting stage. |
| `feedback` | Outcome/score update display. |
| `iti` | Inter-trial interval fixation. |

## 3. Configuration Summary

### a. Subject Info

| Field | Meaning |
|---|---|
| `subject_id` | 3-digit participant identifier. |

### b. Window Settings

| Parameter | Value |
|---|---|
| `size` | `[1280, 720]` |
| `units` | `pix` |
| `screen` | `0` |
| `bg_color` | `black` |
| `fullscreen` | `false` |
| `monitor_width_cm` | `35.5` |
| `monitor_distance_cm` | `60` |

### c. Stimuli

| Name | Type | Description |
|---|---|---|
| `trial_prompt`, `score_text`, `ratio_text`, `color_key_hint` | text | Color-choice stage envelope with explicit ratio and key mapping. |
| `box_token_template` | rect | Ten red/blue boxes generated per trial from sampled ratio and side assignment. |
| `bet_prompt`, `bet_key_hint` | text | Bet-choice instruction and key legend. |
| `bet_option_template` | text | Five on-screen bet options mapped to keys `1-5` in block-specific order. |
| `feedback_outcome`, `feedback_auto_bet`, `feedback_color_timeout` | text | Outcome and timeout-specific feedback messages. |
| `fixation`, `block_break`, `good_bye`, `instruction_text` | text | Shared trial separators and task envelope screens. |

### d. Timing

| Phase | Duration |
|---|---|
| fixation | jittered (`0.3-0.6 s` human) |
| color choice | `3.0 s` deadline |
| bet choice | `3.5 s` deadline |
| feedback | `1.0 s` |
| ITI | jittered (`0.3-0.6 s` human) |

### e. Triggers

| Trigger | Code | Description |
|---|---:|---|
| `choice_onset` | 30 | Color-choice screen onset |
| `choice_red` / `choice_blue` | 31 / 32 | Color response events |
| `color_timeout` | 33 | No color response |
| `bet_onset` | 40 | Bet-choice screen onset |
| `bet_key_1..5` | 41..45 | Bet key responses |
| `bet_timeout` | 46 | No bet response |
| `feedback_onset` | 50 | Outcome screen onset |

## 4. Methods (for academic publication)

Participants completed an explicit-risk gambling paradigm in which probabilities were represented by visible red/blue box ratios (total = 10). On each trial, participants first selected the color judged most likely to hide a token, then selected a stake as a percentage of current points.

The browser preview preserves the same bet-order context (`ascending` vs `descending`) and the same CGT summary logic as the canonical Python task. Differences are limited to the web runtime shell and the shared-runner deployment path.

All phases are instrumented with phase-level triggers and trial context metadata, enabling synchronized behavioral analyses across browser preview, QA, and simulation modes.


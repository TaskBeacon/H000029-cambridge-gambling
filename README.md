# H000029 Cambridge Gambling Task

HTML/browser preview of Cambridge Gambling Task built on `psyflow-web`.
The trial procedure, controller rules, block order semantics, timeout policy, and summary metrics are aligned to local `T000029-cambridge-gambling`.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/controller.ts`: ratio sampling and score update controller
- `src/run_trial.ts`: trial stage logic
- `src/utils.ts`: block/overall summary helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000029-cambridge-gambling
```


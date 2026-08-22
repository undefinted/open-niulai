# Growth Experiments

The campaign is defined in `experiments/campaign.json`. Seven content packs can be rebuilt deterministically:

```bash
python scripts/build_campaign.py
```

## Evidence Rule

`experiments/events.csv` starts with a header and no observations. Record only metrics copied from a real platform analytics view. Never add sample or estimated values to the production event file.

Record a snapshot:

```bash
python scripts/growth_tracker.py record \
  --campaign-id mao-lai \
  --platform douyin \
  --variant poster_hard_cut \
  --post-url "https://..." \
  --impressions 1000 \
  --three-second-views 600 \
  --completions 200 \
  --comments 30 \
  --shares 25
```

Create a report from the latest snapshot for each post:

```bash
python scripts/growth_tracker.py report
```

The report computes three-second retention, completion, engagement, comment, share, repository-click, and production-continuation rates. A zero denominator returns `null`, not a misleading zero-percent conclusion.

## Experiment Discipline

- Change one opening/CTA/topic variable at a time.
- Use the thresholds in `campaign.json`; do not call a winner before minimum impressions.
- Compare posts on the same platform and similar publication windows.
- Preserve losing variants and raw snapshots for audit.
- Treat comments and stars as secondary. The north star is whether viewers export a project or create an external work.

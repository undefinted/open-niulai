# Growth Playbook

Read this when launching the project or optimizing generated work for sharing.

Positioning: `你输入一个东西，它真的来了。`

Show outcomes before features. Each launch demo should pair a polished poster, a broken footage frame, a 5-second clip or production prompt, and publishing copy.

Prioritize subjects with existing emotion: pets for reach; clients, bosses, code and resumes for identity sharing; stocks and AI for topical reach. End with `下一个你想看谁来？` so every output seeds the next prompt.

Default publishing fields: short post title, cover text under 10 Chinese characters, one first-comment question, and 3-5 relevant tags. Avoid explaining the joke, long lore, too many characters, or polish that removes the sincere-broken contrast.

Measure export/copy/continuation rate and external creations. Stars and impressions are supporting metrics, not proof that the production workflow works.

For the public project repository, use `experiments/campaign.json` as the seven-demo and A/B source of truth. Run `scripts/build_campaign.py` to rebuild content packs and `scripts/growth_tracker.py` to record real platform snapshots. Never place sample or estimated metrics in the production event file. Respect minimum impressions before choosing a winner; zero exposure means `insufficient_data`, not failure.
